/**
 * /admin dashboard island — an internal tool, not part of the public site bundle/budget.
 *
 * Gate: the admin passphrase is kept in `sessionStorage` only (cleared when the tab closes) and
 * sent as `Authorization: Bearer <passphrase>` to `GET /api/admin/stats.json`, which checks it
 * against `ADMIN_BEARER_SECRET` server-side (functions/_shared/admin-auth.ts). This file trusts
 * nothing about the value itself — the server either accepts or rejects it.
 *
 * Every element is built with createElement + textContent, never innerHTML: comments and emails
 * are real user-submitted free text, so they are never parsed as markup (same convention as
 * `results-island.ts`, which this file's bar charts reuse the CSS classes of).
 */

const TOKEN_KEY = 'moolresha_admin_token';

interface Labels {
  conceptOrder: string[];
  conceptNames: Record<string, string>;
  verdictLabels: Record<string, string>;
  changeLabels: Record<string, string>;
  colourLabels: Record<string, string>;
  priorityLabels: Record<string, string>;
  priceBandLabels: Record<string, Record<string, string>>;
}

interface ConceptStats {
  conceptId: string;
  responses: number;
  verdictCounts: Record<string, number>;
  changeCounts: Record<string, number>;
  colourCounts: Record<string, number>;
  priceBandCounts: Record<string, number>;
  priceSkipCount: number;
  priorityCounts: Record<string, number>;
}

interface StatsBody {
  ok: true;
  generatedAt: string;
  totals: {
    feedbackResponses: number;
    feedbackComments: number;
    emailSignups: number;
    frustrationSubmissions: number;
  };
  concepts: ConceptStats[];
  comments: { conceptId: string; verdict: string; comment: string; updatedAt: string }[];
  signups: {
    email: string | null;
    phone: string | null;
    size: string | null;
    linked: boolean;
    mlSync: string;
    createdAt: string;
  }[];
}

function el(tag: string, text?: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}

function readLabels(): Labels | null {
  const node = document.getElementById('admin-labels');
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent) as Labels;
  } catch {
    return null;
  }
}

function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sessionStorage unavailable (private mode etc.) — the fetch still works for this page
    // load, it just won't survive a refresh.
  }
}

function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // see setToken
  }
}

async function fetchStats(token: string): Promise<StatsBody> {
  const res = await fetch('/api/admin/stats.json', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) throw new Error('wrong_passphrase');
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as StatsBody;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const TOTAL_TILES: { key: keyof StatsBody['totals']; label: string }[] = [
  { key: 'feedbackResponses', label: 'Feedback responses' },
  { key: 'feedbackComments', label: 'Comments left' },
  { key: 'emailSignups', label: 'Email / WhatsApp signups' },
  { key: 'frustrationSubmissions', label: 'Opinion-form submissions' },
];

function renderTotals(root: HTMLElement, totals: StatsBody['totals']): void {
  root.replaceChildren(
    ...TOTAL_TILES.map(({ key, label }) => {
      const tile = el('div', undefined, 'admin-tile');
      tile.append(el('span', String(totals[key]), 'admin-tile-value'), el('span', label, 'admin-tile-label'));
      return tile;
    }),
  );
}

/**
 * One bar-chart group, the same `.result-bar-*` markup/classes `results-island.ts` renders on
 * the public /your-voice results view (global.css already has the styles). Widths are
 * percent-of-the-largest-bar in THIS group, not percent-of-total: admin counts are small, raw
 * numbers, not the public, 20-response-gated percentages `/api/results` shows.
 */
function renderBarGroup(title: string, entries: [string, number][]): HTMLElement {
  const group = el('div', undefined, 'admin-chart-group');
  group.appendChild(el('h4', title));
  const shown = entries.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (shown.length === 0) {
    group.appendChild(el('p', 'No answers yet.', 'admin-empty'));
    return group;
  }
  const max = Math.max(...shown.map(([, n]) => n));
  const list = el('ul', undefined, 'result-bars');
  for (const [label, n] of shown) {
    const row = el('li', undefined, 'result-bar-row');
    row.appendChild(el('span', label, 'result-bar-label'));
    const track = el('span', undefined, 'result-bar-track');
    const fill = el('span', undefined, 'result-bar-fill');
    fill.style.width = `${Math.round((n / max) * 100)}%`;
    track.appendChild(fill);
    row.append(track, el('span', String(n), 'result-bar-value'));
    list.appendChild(row);
  }
  group.appendChild(list);
  return group;
}

function labelled(labels: Record<string, string>, key: string): string {
  return labels[key] ?? key;
}

function renderConcepts(root: HTMLElement, concepts: ConceptStats[], labels: Labels): void {
  const byId = new Map(concepts.map((c) => [c.conceptId, c]));
  const ordered = labels.conceptOrder.map((id) => byId.get(id)).filter((c): c is ConceptStats => c !== undefined);

  root.replaceChildren(
    ...ordered.map((c) => {
      const card = el('div', undefined, 'admin-concept-card');
      const title = `${labelled(labels.conceptNames, c.conceptId)} — ${c.responses} response${c.responses === 1 ? '' : 's'}`;
      card.appendChild(el('h3', title));

      const bandLabels = labels.priceBandLabels[c.conceptId] ?? {};
      const priceEntries: [string, number][] = Object.entries(c.priceBandCounts).map(
        ([id, n]) => [bandLabels[id] ?? id, n] as [string, number],
      );
      if (c.priceSkipCount > 0) priceEntries.push(['Skipped', c.priceSkipCount]);

      const grid = el('div', undefined, 'admin-chart-grid');
      grid.append(
        renderBarGroup('Verdict', Object.entries(c.verdictCounts).map(([k, n]) => [labelled(labels.verdictLabels, k), n])),
        renderBarGroup('Colour', Object.entries(c.colourCounts).map(([k, n]) => [labelled(labels.colourLabels, k), n])),
        renderBarGroup('Price band', priceEntries),
        renderBarGroup('Priorities', Object.entries(c.priorityCounts).map(([k, n]) => [labelled(labels.priorityLabels, k), n])),
        renderBarGroup(
          'What they would change',
          Object.entries(c.changeCounts).map(([k, n]) => [labelled(labels.changeLabels, k), n]),
        ),
      );
      card.appendChild(grid);
      return card;
    }),
  );
}

function renderComments(root: HTMLElement, comments: StatsBody['comments'], labels: Labels): void {
  if (comments.length === 0) {
    root.replaceChildren(el('p', 'No comments yet.', 'admin-empty'));
    return;
  }
  const wrap = el('div', undefined, 'admin-table-wrap');
  const table = el('table', undefined, 'admin-table');
  const thead = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', 'Concept'), el('th', 'Verdict'), el('th', 'Comment'), el('th', 'Updated'));
  thead.appendChild(headRow);
  const tbody = el('tbody');
  for (const c of comments) {
    const row = el('tr');
    row.append(
      el('td', labelled(labels.conceptNames, c.conceptId)),
      el('td', labelled(labels.verdictLabels, c.verdict)),
      el('td', c.comment),
      el('td', new Date(c.updatedAt).toLocaleString()),
    );
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  root.replaceChildren(wrap);
}

function renderSignups(root: HTMLElement, signups: StatsBody['signups']): void {
  if (signups.length === 0) {
    root.replaceChildren(el('p', 'No signups yet.', 'admin-empty'));
    return;
  }
  const wrap = el('div', undefined, 'admin-table-wrap');
  const table = el('table', undefined, 'admin-table');
  const thead = el('thead');
  const headRow = el('tr');
  headRow.append(
    el('th', 'Email'),
    el('th', 'Phone'),
    el('th', 'Size'),
    el('th', 'Linked'),
    el('th', 'Email status'),
    el('th', 'Created'),
  );
  thead.appendChild(headRow);
  const tbody = el('tbody');
  for (const s of signups) {
    const row = el('tr');
    row.append(
      el('td', s.email ?? '—'),
      el('td', s.phone ?? '—'),
      el('td', s.size ?? '—'),
      el('td', s.linked ? 'Yes' : 'No'),
      el('td', s.mlSync),
      el('td', new Date(s.createdAt).toLocaleString()),
    );
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  root.replaceChildren(wrap);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function initAdminDashboard(): void {
  const form = document.querySelector<HTMLFormElement>('[data-admin-unlock]');
  const status = document.querySelector<HTMLElement>('[data-admin-status]');
  const content = document.querySelector<HTMLElement>('[data-admin-content]');
  const totalsRoot = document.querySelector<HTMLElement>('[data-admin-totals]');
  const conceptsRoot = document.querySelector<HTMLElement>('[data-admin-concepts]');
  const commentsRoot = document.querySelector<HTMLElement>('[data-admin-comments]');
  const signupsRoot = document.querySelector<HTMLElement>('[data-admin-signups]');
  const refreshBtn = document.querySelector<HTMLButtonElement>('[data-admin-refresh]');
  const lockBtn = document.querySelector<HTMLButtonElement>('[data-admin-lock]');
  const labels = readLabels();

  if (!form || !status || !content || !totalsRoot || !conceptsRoot || !commentsRoot || !signupsRoot || !labels) {
    return;
  }

  // Delegated to a named function with non-null parameter types, rather than relying on the
  // guard above narrowing these `const`s inside nested closures (nested function declarations
  // and the async function below don't reliably keep that narrowing under strict null checks).
  wireUpDashboard(form, status, content, totalsRoot, conceptsRoot, commentsRoot, signupsRoot, refreshBtn, lockBtn, labels);
}

function wireUpDashboard(
  form: HTMLFormElement,
  status: HTMLElement,
  content: HTMLElement,
  totalsRoot: HTMLElement,
  conceptsRoot: HTMLElement,
  commentsRoot: HTMLElement,
  signupsRoot: HTMLElement,
  refreshBtn: HTMLButtonElement | null,
  lockBtn: HTMLButtonElement | null,
  labels: Labels,
): void {
  function setStatus(text: string): void {
    status.textContent = text;
  }

  async function unlockAndLoad(token: string): Promise<void> {
    setStatus('Loading…');
    try {
      const stats = await fetchStats(token);
      setToken(token);
      renderTotals(totalsRoot, stats.totals);
      renderConcepts(conceptsRoot, stats.concepts, labels);
      renderComments(commentsRoot, stats.comments, labels);
      renderSignups(signupsRoot, stats.signups);
      form.hidden = true;
      content.hidden = false;
      setStatus(`Updated ${new Date(stats.generatedAt).toLocaleTimeString()}.`);
    } catch (err) {
      clearToken();
      content.hidden = true;
      form.hidden = false;
      setStatus(
        err instanceof Error && err.message === 'wrong_passphrase'
          ? 'Wrong passphrase.'
          : 'Could not load the dashboard. Try again.',
      );
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector<HTMLInputElement>('#admin-secret');
    const value = input?.value.trim() ?? '';
    if (value === '') return;
    void unlockAndLoad(value);
  });

  refreshBtn?.addEventListener('click', () => {
    const token = getToken();
    if (token) void unlockAndLoad(token);
  });

  lockBtn?.addEventListener('click', () => {
    clearToken();
    content.hidden = true;
    form.hidden = false;
    setStatus('Locked.');
    const input = form.querySelector<HTMLInputElement>('#admin-secret');
    if (input) input.value = '';
  });

  const existing = getToken();
  if (existing) void unlockAndLoad(existing);
}
