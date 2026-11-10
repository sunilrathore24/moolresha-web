/**
 * Story and quality rules for the Content_Check (task 9.15).
 * Requirements 8C.6 to 8C.9, 8C.12, 11A.7, 11A.8.
 *
 *  - CC-17 restricted phrases: an occurrence of any `word-rules.yaml#restrictedPhrases`
 *    entry is allowed only wholly inside a `.fact` whose registry entry has a `source`
 *    (labels FACT, INDUSTRY CLAIM, BRAND CLAIM). Checked in the visible text (phrases
 *    split by inline elements, line breaks or NBSP still match) and in every other
 *    channel (alt, title, meta, og, JSON-LD, aria-label, title attribute). The
 *    other channels have no fact exemption.
 *  - CC-18 quality labels: `checkQualityCard` per Concept (every issue except the
 *    exact-spec and range issues, which CC-19 reports), plus the rendered card on
 *    `/index.html`.
 *  - CC-19 exact spec: the exact-spec and range issues from `checkQualityCard` on the
 *    Quality_Row texts, plus a `findSpecValues` check of the Fabric_Notes `weight`.
 *  - CC-20 health terms: `word-rules.yaml#healthTerms` match everywhere, including
 *    `<template>` content and inside `.fact`, with all hyphen, space, zero-width and
 *    case variants. Names the page, the term and the channel.
 *
 * Rendered Quality_Card markup assumed by CC-18 (design.md, "Quality_Card"; task 8.5
 * must produce it):
 *
 *   [data-concept-id]                  the Concept_Card; its value is the Concept id.
 *                                      Fallback: the card's `aria-labelledby="qc-<concept-id>"`.
 *     [data-quality-card]              one per Concept on `/index.html`.
 *       [data-quality-row="<row id>"]  seven rows, ids in the order of QUALITY_ROWS
 *                                      (fibre, yarn, fabric, on_your_skin, shrinkage,
 *                                      after_a_year, care).
 *         [data-quality-label]         the stored label: FACT, Target or WeWillTest. Must
 *                                      equal the Concept data.
 *         .q-label                     the visible label of a Target / WeWillTest row
 *                                      ("Target", "We'll test").
 *         [data-claim-label]           the visible label of a FACT row (the ClaimLabel
 *                                      tag, text "FACT"); it doubles as the Quality_Label.
 *                                      A row must hold exactly one `.q-label` or
 *                                      `[data-claim-label]` element, and its text must be
 *                                      the visible text for the row's label.
 *         row text                     a Target row contains "Target spec, to be confirmed
 *                                      with our mill".
 *       a[href="#how-we-check"]        link inside the card.
 *   #how-we-check                      an element with this id on the same page.
 *
 * Rules are not registered here; `index.ts` does that.
 */
import { parse, type HTMLElement } from 'node-html-parser';
import {
  QUALITY_LABEL_TEXT,
  QUALITY_ROWS,
  QUALITY_ROW_NAMES,
  type ConceptData,
  type QualityRowId,
} from '../concept-schema';
import type { FactEntry } from '../fact-schema';
import { checkQualityCard, findSpecValues, type QualityIssue } from '../quality-card';
import { findHealthTerms, findPhrase } from '../text-match';
import { factSpanContaining, type RenderedPage } from './html';
import type { CheckContext, Rule, Violation } from './types';

/** The exact note a Target row must show (Requirement 8C.4). */
export const TARGET_NOTE = 'Target spec, to be confirmed with our mill';

/* ---------- Shared helpers ---------- */

type Located = { channel: string; text: string };

/** Where non-visible text came from, as a short phrase for messages. */
function channelName(channel: string, inTemplate: boolean): string {
  const name = channel === 'alt' ? 'alt text' : channel === 'aria-label' ? 'aria-label' : channel === 'title-attr' ? 'title attribute' : channel;
  return inTemplate ? `${name} (inside <template>)` : name;
}

/** Every text on a page with the channel it came from, visible text first. */
function pageTexts(page: RenderedPage): Located[] {
  return [
    { channel: 'visible text', text: page.visibleText },
    ...page.channelTexts.map((c) => ({ channel: channelName(c.channel, c.inTemplate), text: c.text })),
  ];
}

function factsById(ctx: CheckContext): Map<string, FactEntry> {
  return new Map(ctx.facts.map((f) => [f.id, f]));
}

/* ---------- CC-17 ---------- */

/**
 * NFKC so full-width and compatibility forms match. The visible text is only
 * normalised when its length does not change, because fact spans are offsets
 * into the text as built.
 */
function matchable(text: string, keepLength: boolean): string {
  const n = text.normalize('NFKC');
  return keepLength && n.length !== text.length ? text : n;
}

export const cc17: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  const facts = factsById(ctx);
  const sourced = (id: string): boolean => {
    const f = facts.get(id);
    return f !== undefined && 'source' in f && Boolean(f.source);
  };

  for (const page of ctx.pages) {
    for (const phrase of ctx.wordRules.restrictedPhrases) {
      // Visible text: allowed wholly inside a sourced fact.
      const visible = matchable(page.visibleText, true);
      for (const m of findPhrase(visible, phrase)) {
        const span = factSpanContaining(page, m.start, m.end);
        if (span && span.factId && sourced(span.factId)) continue;
        let where = 'outside any fact';
        if (span) {
          where = !span.factId
            ? 'inside a fact element with no data-fact-id'
            : facts.has(span.factId)
              ? `inside fact "${span.factId}", which has no source`
              : `inside unknown fact "${span.factId}"`;
        }
        out.push({
          rule: 'CC-17',
          target: page.path,
          detail: `restricted phrase "${phrase}" found in visible text ${where}: "${visible.slice(m.start, m.end)}"`,
        });
      }
      // Other channels: no exemption.
      for (const c of page.channelTexts) {
        const text = matchable(c.text, false);
        for (const m of findPhrase(text, phrase)) {
          out.push({
            rule: 'CC-17',
            target: page.path,
            detail: `restricted phrase "${phrase}" found in ${channelName(c.channel, c.inTemplate)}: "${text.slice(m.start, m.end)}"`,
          });
        }
      }
    }
  }
  return out;
};

/* ---------- CC-18 ---------- */

/** Issues CC-19 reports. */
const SPEC_KINDS: ReadonlySet<QualityIssue['kind']> = new Set(['exact_spec_without_fact', 'range_not_target']);

function rowLabel(row: QualityRowId): string {
  return `row "${row}" (${QUALITY_ROW_NAMES[row]})`;
}

function describeIssue(i: QualityIssue): string {
  switch (i.kind) {
    case 'rows':
      return `quality card: ${i.detail}`;
    case 'missing_label':
      return `${rowLabel(i.row)} has no known Quality_Label`;
    case 'fact_missing':
      return `${rowLabel(i.row)} is a FACT row with no factId, or a factId that is not in the Fact_Registry`;
    case 'fact_not_fact_label':
      return `${rowLabel(i.row)} either names a registry entry that is not labelled FACT, or carries a factId without being a FACT row`;
    case 'fact_incomplete':
      return `${rowLabel(i.row)} names a FACT entry that is incomplete (fails CC-01)`;
    case 'test_missing':
      return `${rowLabel(i.row)} is a We'll test row without both what is tested and what is published`;
    case 'exact_spec_without_fact':
      return `${rowLabel(i.row)} shows exact value "${i.value}" without a FACT row backed by a FACT entry`;
    case 'range_not_target':
      return `${rowLabel(i.row)} shows range "${i.value}" but is not a Target or FACT row`;
  }
}

const norm = (s: string): string => s.replace(/\s+/gu, ' ').replace(/[\u2018\u2019]/g, "'").trim();

function conceptIdOfCard(card: HTMLElement): string | undefined {
  for (let p = card.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) {
    const id = p.getAttribute?.('data-concept-id');
    if (id) return id;
  }
  const lb = card.getAttribute('aria-labelledby') ?? '';
  return lb.startsWith('qc-') ? lb.slice(3) : undefined;
}

function checkRenderedCards(ctx: CheckContext): Violation[] {
  const index = ctx.pages.find((p) => p.path === '/index.html');
  if (!index) return [];
  const out: Violation[] = [];
  const root = parse(index.html.replace(/<!doctype[^>]*>/gi, ''), {
    blockTextElements: { script: true, style: true },
  });
  const byId = new Map(ctx.concepts.map((c) => [c.id as string, c]));
  const hasHowWeCheck = root.querySelector('#how-we-check') !== null;
  const seen = new Set<string>();

  const cards = root.querySelectorAll('[data-quality-card]');
  cards.forEach((card, n) => {
    const id = conceptIdOfCard(card);
    const concept = id ? byId.get(id) : undefined;
    const name = id ?? `(card ${n + 1})`;
    const fail = (detail: string): void => {
      out.push({ rule: 'CC-18', target: name, detail: `rendered Quality_Card on ${index.path}: ${detail}` });
    };
    if (!id || !concept) {
      fail('card does not belong to a known Concept (no data-concept-id ancestor or qc-<concept-id> aria-labelledby)');
    } else if (seen.has(id)) {
      fail('Concept has more than one Quality_Card');
    }
    if (id) seen.add(id);

    const rows = card.querySelectorAll('[data-quality-row]');
    const ids = rows.map((r) => r.getAttribute('data-quality-row') ?? '');
    if (ids.join() !== QUALITY_ROWS.join()) {
      fail(`rows are [${ids.join(', ')}], expected [${QUALITY_ROWS.join(', ')}]`);
    }

    for (const r of rows) {
      const rid = r.getAttribute('data-quality-row') ?? '(no row id)';
      const label = r.getAttribute('data-quality-label') ?? '';
      const known = label in QUALITY_LABEL_TEXT;
      if (!known) fail(`row "${rid}" has data-quality-label "${label}", which is not a Quality_Label`);

      const labels = new Set<HTMLElement>([
        ...r.querySelectorAll('.q-label'),
        ...r.querySelectorAll('[data-claim-label]'),
      ]);
      if (labels.size !== 1) {
        fail(`row "${rid}" shows ${labels.size} visible labels, expected exactly one`);
      } else if (known) {
        const shown = norm([...labels][0]!.textContent);
        const want = QUALITY_LABEL_TEXT[label as keyof typeof QUALITY_LABEL_TEXT];
        if (shown !== want) fail(`row "${rid}" shows the label "${shown}", expected "${want}"`);
      }

      const dataRow = concept?.quality.find((q) => q.row === rid);
      if (dataRow && known && dataRow.label !== label) {
        fail(`row "${rid}" is rendered as ${label} but the Concept data says ${dataRow.label}`);
      }
      if (label === 'Target' && !norm(r.textContent).includes(TARGET_NOTE)) {
        fail(`row "${rid}" is a Target row without the note "${TARGET_NOTE}"`);
      }
    }

    if (!card.querySelectorAll('a').some((a) => a.getAttribute('href') === '#how-we-check')) {
      fail('no link to #how-we-check');
    } else if (!hasHowWeCheck) {
      fail('the #how-we-check link does not resolve: no element with id "how-we-check" on the page');
    }
  });

  for (const c of ctx.concepts) {
    if (!seen.has(c.id)) {
      out.push({ rule: 'CC-18', target: c.id, detail: `no Quality_Card rendered on ${index.path}` });
    }
  }
  return out;
}

export const cc18: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  const facts = factsById(ctx);
  for (const c of ctx.concepts) {
    for (const issue of checkQualityCard(c.quality as unknown[], facts)) {
      if (SPEC_KINDS.has(issue.kind)) continue; // CC-19
      out.push({ rule: 'CC-18', target: c.id, detail: describeIssue(issue) });
    }
  }
  out.push(...checkRenderedCards(ctx));
  return out;
};

/* ---------- CC-19 ---------- */

function weightIssues(c: ConceptData, facts: Map<string, FactEntry>): Violation[] {
  const out: Violation[] = [];
  const fabric = c.quality.find((r) => r.row === 'fabric');
  const entry = fabric?.factId ? facts.get(fabric.factId) : undefined;
  const backed = fabric?.label === 'FACT' && entry?.label === 'FACT';
  const mayShowRange = fabric?.label === 'Target' || fabric?.label === 'FACT';
  for (const spec of findSpecValues(c.fabricNotes.weight)) {
    if (!spec.isRange && !backed) {
      out.push({
        rule: 'CC-19',
        target: c.id,
        detail: `Fabric_Notes weight shows exact value "${spec.value}" without a FACT fabric row backed by a FACT entry`,
      });
    }
    if (spec.isRange && !mayShowRange) {
      out.push({
        rule: 'CC-19',
        target: c.id,
        detail: `Fabric_Notes weight shows range "${spec.value}" but the fabric row is not a Target or FACT row`,
      });
    }
  }
  return out;
}

export const cc19: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  const facts = factsById(ctx);
  for (const c of ctx.concepts) {
    for (const issue of checkQualityCard(c.quality as unknown[], facts)) {
      if (SPEC_KINDS.has(issue.kind)) out.push({ rule: 'CC-19', target: c.id, detail: describeIssue(issue) });
    }
    out.push(...weightIssues(c, facts));
  }
  return out;
};

/* ---------- CC-20 ---------- */

export const cc20: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  const terms = ctx.wordRules.healthTerms;
  for (const page of ctx.pages) {
    for (const { channel, text } of pageTexts(page)) {
      // Several listed terms can match the same span (for example "hypoallergenic" and
      // "hypo-allergenic"); report that span once and name every term.
      const bySpan = new Map<string, { start: number; end: number; terms: string[] }>();
      for (const m of findHealthTerms(text, terms)) {
        const key = `${m.start}:${m.end}`;
        const entry = bySpan.get(key) ?? { start: m.start, end: m.end, terms: [] };
        entry.terms.push(m.term);
        bySpan.set(key, entry);
      }
      if (bySpan.size === 0) continue;
      const folded = text.normalize('NFKC').toLowerCase().replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
      for (const s of bySpan.values()) {
        out.push({
          rule: 'CC-20',
          target: page.path,
          detail: `health term ${s.terms.map((t) => `"${t}"`).join(', ')} found in ${channel}: "${folded.slice(s.start, s.end)}"`,
        });
      }
    }
  }
  return out;
};
