/**
 * Feedback island: the Concept forms (`form[data-feedback-form]`) and the frustration
 * form (`form[data-frustration-form]`). Markup hooks are listed in
 * src/components/launch/ConceptFeedbackForm.astro and FrustrationForm.astro.
 * It also hides and reveals each Concept's Market_Price_Context (decision logic in
 * ./market-reveal.ts). No third-party code, no cookies.
 * Requirements 7.2-7.4, 9.3, 9.9, 9.10, 9.12, 9.16-9.19, 10.2, 14.3, 21.5, 22.2.
 */
import { CHANGE_CHIPS, FRUSTRATION_CHIPS, PRIORITY_CHIPS, type ConceptId } from '../content/config/allow-lists';
import { ANON_ID_KEY, getAnonId, resetAnonIdMemory, safeLocalStorage } from './anon-id';
import { post } from './api-client';
import { ANSWERED_KEY, nextAnswered, parseAnswered, serialiseAnswered, shouldReveal, type PriceAnswer } from './market-reveal';
import { createTurnstile } from './turnstile-loader';
import { safeSessionStorage } from './utm';

export const MSG_NO_TOKEN = 'Feedback is temporarily unavailable.';
const MSG_SAVED = 'Thank you. Your answer is saved.';
const MSG_REVEALED = " Similar pieces' prices are now shown below.";
const MSG_NEED_VERDICT = 'Please choose whether you would wear it.';
const MSG_NEED_CHIP = 'Please tick at least one option.';

/** Concept ids whose price question was answered or skipped, kept when storage throws. */
let memoryAnswered = new Set<ConceptId>();

/** Test helper: forget the in-memory answered set. */
export function resetFeedbackIslandMemory(): void {
  memoryAnswered = new Set();
}

const started = new WeakSet<Element>();
const marketDone = new WeakSet<Element>();

function readAnswered(): Set<ConceptId> {
  const all = new Set(memoryAnswered);
  for (const st of [safeSessionStorage(), safeLocalStorage()]) {
    try {
      parseAnswered(st?.getItem(ANSWERED_KEY) ?? null).forEach((id) => all.add(id));
    } catch {
      // Unreadable storage: the in-memory set still counts.
    }
  }
  return all;
}

function writeAnswered(set: Set<ConceptId>): void {
  memoryAnswered = set;
  const raw = serialiseAnswered(set);
  for (const st of [safeSessionStorage(), safeLocalStorage()]) {
    try {
      st?.setItem(ANSWERED_KEY, raw);
    } catch {
      // Blocked or full: the in-memory set keeps the reveal working.
    }
  }
}

function marketCard(id: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('details.market-context[data-market-for]')).find(
    (el) => el.dataset.marketFor === id,
  );
}

/** Shows the card and opens it. Returns false when it was already shown. */
function reveal(el: HTMLElement): boolean {
  const was = el.dataset.reveal === 'shown';
  el.removeAttribute('hidden');
  el.dataset.reveal = 'shown';
  el.setAttribute('open', '');
  return !was;
}

function syncMarket(scope: ParentNode): void {
  const answered = readAnswered();
  scope.querySelectorAll<HTMLElement>('details.market-context[data-market-for]').forEach((el) => {
    if (marketDone.has(el)) return;
    marketDone.add(el);
    if (shouldReveal(el.dataset.marketFor as ConceptId, answered)) {
      reveal(el);
    } else if (el.dataset.reveal !== 'shown') {
      el.setAttribute('hidden', '');
      el.dataset.reveal = 'hidden';
    }
  });
}

function picked(form: HTMLElement, name: string): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)).filter((i) => i.checked).map((i) => i.value);
}

const inOrder = (all: readonly string[], got: string[]): string[] => all.filter((x) => got.includes(x));

function clearAnonId(): void {
  resetAnonIdMemory();
  try {
    safeLocalStorage()?.removeItem(ANON_ID_KEY);
  } catch {
    // Blocked storage: the memory reset above is enough.
  }
}

function initForm(form: HTMLFormElement, isConcept: boolean): void {
  const conceptId = form.dataset.conceptId as ConceptId | undefined;
  if (isConcept && !conceptId) return;
  const key = `mr_form_${isConcept ? conceptId : 'frustration'}`;
  const path = isConcept ? '/api/feedback' : '/api/frustration';
  const live = form.querySelector<HTMLElement>('[data-live-region]');
  const submitBtn = form.querySelector<HTMLElement>('[data-submit]');
  // Progressive disclosure (2026-11): every question after "Would you wear this design?",
  // plus the comment field and submit bar, lives inside this wrapper and starts `hidden` in
  // the markup. `refresh()` below reveals it once a verdict exists — including right after
  // `restore()` checks a saved verdict radio back in from a previous session.
  const progressive = form.querySelector<HTMLElement>('[data-progressive]');
  const otherField = form.querySelector<HTMLElement>('[data-other-field]');
  const otherBox = form.querySelector<HTMLInputElement>('input[type="checkbox"][value="other"]');
  const skipBtn = form.querySelector<HTMLElement>('button[data-price-skip]');
  const ts = createTurnstile(form);
  let skipped = false;
  let busy = false;

  const say = (text: string): void => {
    if (live) live.textContent = text;
  };
  const text = (): string => form.querySelector<HTMLInputElement>('input[name="otherText"]')?.value.trim() ?? '';
  const comment = (): string => form.querySelector<HTMLInputElement>('input[name="comment"]')?.value.trim() ?? '';
  // Only present at all for a Concept with weave variants (ConceptFeedbackForm.astro's
  // `weaveIds` prop) — kept in sync with whichever weave tab is open by the page that renders
  // this form, not by this island.
  const weave = (): string => form.querySelector<HTMLInputElement>('input[name="weave"]')?.value.trim() ?? '';

  // Redesign (2026-11): live "N/250" counter next to the general comment field. Plain
  // presentational update, no save/validate side effects (collect() re-reads the input value).
  const commentInput = form.querySelector<HTMLInputElement>('input[name="comment"]');
  const commentCounter = form.querySelector<HTMLElement>('[data-comment-count]');
  const updateCommentCounter = (): void => {
    if (commentCounter && commentInput) commentCounter.textContent = String(commentInput.value.length);
  };
  commentInput?.addEventListener('input', updateCommentCounter);

  function setSkip(on: boolean): void {
    skipped = on;
    skipBtn?.setAttribute('aria-pressed', String(on));
    if (on) form.querySelectorAll<HTMLInputElement>('input[name="priceBandId"]').forEach((r) => (r.checked = false));
  }

  function refresh(): void {
    const on = !!otherBox?.checked;
    if (otherField) otherField.hidden = !on;
    otherBox?.setAttribute('aria-expanded', String(on));
    const ready = isConcept ? picked(form, 'verdict').length > 0 : picked(form, 'chips').length > 0;
    submitBtn?.setAttribute('aria-disabled', String(!ready));
    if (isConcept && ready && progressive?.hidden) progressive.hidden = false;
  }

  function save(): void {
    const fields: Record<string, string[]> = {};
    form.querySelectorAll<HTMLInputElement>('input[name]').forEach((i) => {
      const v = i.type === 'radio' || i.type === 'checkbox' ? (i.checked ? i.value : null) : i.value || null;
      if (v !== null) (fields[i.name] ??= []).push(v);
    });
    try {
      safeSessionStorage()?.setItem(key, JSON.stringify({ fields, skipped }));
    } catch {
      // Blocked or full: selections simply are not restored after a reload.
    }
  }

  function restore(): void {
    try {
      const saved = JSON.parse(safeSessionStorage()?.getItem(key) ?? 'null') as {
        fields?: Record<string, unknown>;
        skipped?: unknown;
      } | null;
      if (!saved || typeof saved.fields !== 'object' || saved.fields === null) return;
      form.querySelectorAll<HTMLInputElement>('input[name]').forEach((i) => {
        const vals = saved.fields?.[i.name];
        if (!Array.isArray(vals)) return;
        if (i.type === 'radio' || i.type === 'checkbox') i.checked = vals.includes(i.value);
        // 250, not 200: the longest single-line field now is the comment field (250), not
        // otherText (200) — each input's own `maxlength` attribute still enforces its real cap.
        else if (typeof vals[0] === 'string') i.value = vals[0].slice(0, 250);
      });
      if (saved.skipped === true && picked(form, 'priceBandId').length === 0) setSkip(true);
      updateCommentCounter();
    } catch {
      // Bad JSON or blocked storage: start with an empty form.
    }
  }

  /** Every checked `colour` input, with its `data-design-label` when it has one (only the
   * design-variant checkboxes do — see ConceptFeedbackForm.astro's "Which design..." question;
   * a real colour radio never has more than one checked, so this is a no-op there). */
  function colourSelections(): { value: string; label: string | null }[] {
    return Array.from(form.querySelectorAll<HTMLInputElement>('input[name="colour"]'))
      .filter((i) => i.checked)
      .map((i) => ({ value: i.value, label: i.dataset.designLabel ?? null }));
  }

  function collect(): Record<string, unknown> {
    if (!isConcept) {
      const chips = inOrder(FRUSTRATION_CHIPS, picked(form, 'chips'));
      return { chips, ...(chips.includes('other') && text() ? { otherText: text() } : {}) };
    }
    const changes = inOrder(CHANGE_CHIPS, picked(form, 'changes'));
    // `name="colour"` only ever submits ONE real value (no backend change) — when the
    // design-variant checkboxes let someone pick more than one, the rest are folded into the
    // comment by label instead of silently dropped.
    const colourPicks = colourSelections();
    const colour = colourPicks[0]?.value;
    const extraDesignLabels = colourPicks
      .slice(1)
      .map((p) => p.label)
      .filter((l): l is string => l !== null);
    const baseComment = comment();
    // 250, not an import of feedback-form.ts's COMMENT_MAX_LENGTH: that module pulls in zod
    // (via price-bands.ts) for the Astro component side, which this island must not bundle.
    // Keep this in sync with COMMENT_MAX_LENGTH by hand if that ever changes.
    const fullComment =
      extraDesignLabels.length > 0
        ? [baseComment, `Also liked: ${extraDesignLabels.join(', ')}`].filter(Boolean).join(' — ').slice(0, 250)
        : baseComment;
    const band = picked(form, 'priceBandId')[0];
    return {
      conceptId,
      verdict: picked(form, 'verdict')[0],
      changes,
      priorities: inOrder(PRIORITY_CHIPS, picked(form, 'priorities')),
      ...(changes.includes('other') && text() ? { otherText: text() } : {}),
      ...(fullComment ? { comment: fullComment } : {}),
      ...(colour ? { colour } : {}),
      ...(weave() ? { weave: weave() } : {}),
      ...(band ? { priceBandId: band } : skipped ? { priceSkipped: true } : {}),
    };
  }

  async function submit(): Promise<void> {
    if (busy) return;
    if (submitBtn?.getAttribute('aria-disabled') === 'true') return say(isConcept ? MSG_NEED_VERDICT : MSG_NEED_CHIP);
    busy = true;
    try {
      const fields = collect();
      const run = async () => {
        const token = await ts.token();
        return token === null ? null : post<unknown>(path, { anonId: getAnonId(), ...fields, turnstileToken: token });
      };
      const codeOf = (r: Awaited<ReturnType<typeof run>>): string | undefined =>
        r && !r.ok && r.kind === 'http' ? r.code : undefined;

      let res = await run();
      if (codeOf(res) === 'bot_check_failed') {
        ts.reset();
        res = await run();
      }
      if (codeOf(res) === 'invalid_anon_id') {
        clearAnonId();
        res = await run();
      }
      if (!res) return say(MSG_NO_TOKEN);
      if (!res.ok) return say(res.message);

      let message = MSG_SAVED;
      if (isConcept) {
        const price: PriceAnswer = fields.priceBandId ? 'band' : fields.priceSkipped ? 'skip' : 'none';
        const next = nextAnswered(readAnswered(), { conceptId: conceptId as ConceptId, ok: true, price });
        if (price !== 'none') {
          writeAnswered(next);
          const card = marketCard(conceptId as string);
          if (card && reveal(card)) message += MSG_REVEALED;
        }
      }
      say(message);
    } finally {
      busy = false;
      save();
    }
  }

  restore();
  refresh();
  submitBtn?.removeAttribute('hidden');

  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'priceBandId' && t.checked) setSkip(false);
    refresh();
    save();
  });
  form.addEventListener('input', save);
  skipBtn?.addEventListener('click', () => {
    setSkip(!skipped);
    save();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit();
  });
}

/** Starts every feedback and frustration form under `scope`. Safe to call again. */
export function initFeedbackForms(scope: ParentNode = document): void {
  syncMarket(scope);
  const run = (selector: string, isConcept: boolean): void =>
    scope.querySelectorAll<HTMLFormElement>(selector).forEach((form) => {
      if (started.has(form)) return;
      started.add(form);
      initForm(form, isConcept);
    });
  run('form[data-feedback-form]', true);
  run('form[data-frustration-form]', false);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initFeedbackForms(), { once: true });
  else initFeedbackForms();
}
