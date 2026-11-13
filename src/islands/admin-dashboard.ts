/**
 * /admin dashboard island — an internal tool, not part of the public site bundle/budget.
 *
 * Gate: the admin passphrase is kept in `sessionStorage` only (cleared when the tab closes) and
 * sent as `Authorization: Bearer <passphrase>` to `GET /api/admin/stats.json`, which checks it
 * against `ADMIN_BEARER_SECRET` server-side (functions/_shared/admin-auth.ts). This file trusts
 * nothing about the value itself — the server either accepts or rejects it.
 *
 * Charts are Apache ECharts, imported via the tree-shaken `echarts/core` entry point (only the
 * chart/component types actually used below) and loaded dynamically, only after a successful
 * unlock — nobody pays for the chart library just to see the passphrase screen. Tables are still
 * built with createElement + textContent, never innerHTML: comments and emails are real
 * user-submitted free text, so they are never parsed as markup.
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
  weaveLabels: Record<string, string>;
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

interface Trend {
  current: number;
  previous: number;
  pct: number | null;
}

interface StatsBody {
  ok: true;
  generatedAt: string;
  range: { from: string; to: string };
  totals: {
    feedbackResponses: Trend;
    feedbackComments: Trend;
    emailSignups: Trend;
    frustrationSubmissions: Trend;
  };
  series: { days: string[]; feedback: number[]; comments: number[]; signups: number[] };
  concepts: ConceptStats[];
  weaveBreakdown: {
    conceptId: string;
    weaveId: string;
    label: string;
    responses: number;
    verdictCounts: Record<string, number>;
    changeCounts: Record<string, number>;
    priorityCounts: Record<string, number>;
  }[];
  comments: { conceptId: string; verdict: string; comment: string; weave: string | null; updatedAt: string }[];
  otherTextEntries: { conceptId: string; verdict: string; otherText: string; weave: string | null; updatedAt: string }[];
  signups: {
    email: string | null;
    phone: string | null;
    size: string | null;
    linked: boolean;
    mlSync: string;
    createdAt: string;
  }[];
}

// A small, on-brand categorical palette for chart series — not the fabric Palette_Colour swatch
// colours (those answer a different question, "which fabric colour"), just enough distinct,
// readable tones for a handful of chart categories.
const CHART_COLORS = ['#6f8a5a', '#b5714f', '#c9a26a', '#52607e', '#8a8578', '#9aa7c9'];

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

async function fetchStats(token: string, range?: { from: string; to: string }): Promise<StatsBody> {
  const url = new URL('/api/admin/stats.json', window.location.origin);
  if (range) {
    url.searchParams.set('from', range.from);
    url.searchParams.set('to', range.to);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) throw new Error('wrong_passphrase');
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as StatsBody;
}

function labelled(labels: Record<string, string>, key: string): string {
  return labels[key] ?? key;
}

/** '—' for a Concept with no weave variants (every `weave` on its rows is null); the real
 * label otherwise, so the mens-cotton-shirt rows read "Micro-Dobby" / "Cotton Slub". */
function weaveCell(labels: Labels, weave: string | null): string {
  return weave === null ? '—' : labelled(labels.weaveLabels, weave);
}

/** Sums one `Record<string, number>` per Concept into one combined record, in a given key order. */
function sumAcrossConcepts(concepts: ConceptStats[], pick: (c: ConceptStats) => Record<string, number>, order: string[]): [string, number][] {
  const totals: Record<string, number> = {};
  for (const key of order) totals[key] = 0;
  for (const c of concepts) {
    const counts = pick(c);
    for (const [key, n] of Object.entries(counts)) totals[key] = (totals[key] ?? 0) + n;
  }
  return order.map((k) => [k, totals[k] ?? 0]);
}

/** Price bands aggregated by their human LABEL, not raw id — different Concepts use different
 * id namespaces/boundaries for their own price bands, so summing by id would silently mix
 * unrelated bands together. Summing by label only combines bands that are actually the same
 * price range in different Concepts (or keeps them separate when the labels genuinely differ). */
function priceBandsByLabel(concepts: ConceptStats[], priceBandLabels: Labels['priceBandLabels']): [string, number][] {
  const totals = new Map<string, number>();
  for (const c of concepts) {
    const bandLabels = priceBandLabels[c.conceptId] ?? {};
    for (const [bandId, n] of Object.entries(c.priceBandCounts)) {
      const label = bandLabels[bandId] ?? bandId;
      totals.set(label, (totals.get(label) ?? 0) + n);
    }
    if (c.priceSkipCount > 0) totals.set('No answer', (totals.get('No answer') ?? 0) + c.priceSkipCount);
  }
  return [...totals.entries()];
}

// ---------------------------------------------------------------------------
// Totals tiles
// ---------------------------------------------------------------------------

const TOTAL_TILES: { key: keyof StatsBody['totals']; label: string }[] = [
  { key: 'feedbackResponses', label: 'Feedback responses' },
  { key: 'feedbackComments', label: 'Comments left' },
  { key: 'emailSignups', label: 'Email / WhatsApp signups' },
  { key: 'frustrationSubmissions', label: 'Opinion-form submissions' },
];

function trendNode(t: Trend): HTMLElement {
  if (t.pct === null) return el('span', t.current > 0 ? 'New' : '—', 'admin-tile-trend admin-tile-trend-flat');
  if (t.pct === 0) return el('span', 'No change', 'admin-tile-trend admin-tile-trend-flat');
  const up = t.pct > 0;
  const arrow = up ? '▲' : '▼';
  return el('span', `${arrow} ${Math.abs(t.pct)}%`, `admin-tile-trend ${up ? 'admin-tile-trend-up' : 'admin-tile-trend-down'}`);
}

function renderTotals(root: HTMLElement, totals: StatsBody['totals']): void {
  root.replaceChildren(
    ...TOTAL_TILES.map(({ key, label }) => {
      const tile = el('div', undefined, 'admin-tile');
      tile.append(el('span', String(totals[key].current), 'admin-tile-value'), el('span', label, 'admin-tile-label'), trendNode(totals[key]));
      return tile;
    }),
  );
}

// ---------------------------------------------------------------------------
// Tables (unchanged convention: createElement + textContent, never innerHTML)
// ---------------------------------------------------------------------------

function renderComments(root: HTMLElement, comments: StatsBody['comments'], labels: Labels): void {
  if (comments.length === 0) {
    root.replaceChildren(el('p', 'No comments in this range.', 'admin-empty'));
    return;
  }
  const wrap = el('div', undefined, 'admin-table-wrap');
  const table = el('table', undefined, 'admin-table');
  const thead = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', 'Concept'), el('th', 'Weave'), el('th', 'Verdict'), el('th', 'Comment'), el('th', 'Updated'));
  thead.appendChild(headRow);
  const tbody = el('tbody');
  for (const c of comments) {
    const row = el('tr');
    row.append(
      el('td', labelled(labels.conceptNames, c.conceptId)),
      el('td', weaveCell(labels, c.weave)),
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

/** Same shape as `renderComments`, for the "What would you change?" question's "Other" free-text
 * box — a separate field (`otherText`), previously collected but never shown in this dashboard. */
function renderOtherText(root: HTMLElement, entries: StatsBody['otherTextEntries'], labels: Labels): void {
  if (entries.length === 0) {
    root.replaceChildren(el('p', 'No "Other" entries in this range.', 'admin-empty'));
    return;
  }
  const wrap = el('div', undefined, 'admin-table-wrap');
  const table = el('table', undefined, 'admin-table');
  const thead = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', 'Concept'), el('th', 'Weave'), el('th', 'Verdict'), el('th', 'Text'), el('th', 'Updated'));
  thead.appendChild(headRow);
  const tbody = el('tbody');
  for (const e of entries) {
    const row = el('tr');
    row.append(
      el('td', labelled(labels.conceptNames, e.conceptId)),
      el('td', weaveCell(labels, e.weave)),
      el('td', labelled(labels.verdictLabels, e.verdict)),
      el('td', e.otherText),
      el('td', new Date(e.updatedAt).toLocaleString()),
    );
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  root.replaceChildren(wrap);
}

function renderSignups(root: HTMLElement, signups: StatsBody['signups']): void {
  if (signups.length === 0) {
    root.replaceChildren(el('p', 'No signups in this range.', 'admin-empty'));
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
// Charts
// ---------------------------------------------------------------------------

type EChartsNamespace = typeof import('echarts/core');
type EChartsInstance = ReturnType<EChartsNamespace['init']>;

async function loadEcharts(): Promise<EChartsNamespace> {
  const [core, charts, components, renderers] = await Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers'),
  ]);
  core.use([
    charts.PieChart,
    charts.BarChart,
    charts.LineChart,
    components.TooltipComponent,
    components.LegendComponent,
    components.GridComponent,
    renderers.CanvasRenderer,
  ]);
  return core;
}

function donutOption(entries: [string, number][]): Record<string, unknown> {
  const data = entries.filter(([, n]) => n > 0).map(([name, value], i) => ({ name, value, itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] } }));
  const total = data.reduce((sum, d) => sum + (d.value as number), 0);
  return {
    color: CHART_COLORS,
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'pie',
        radius: ['55%', '80%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: 'center',
          formatter: () => `{a|${total}}\n{b|Total}`,
          rich: { a: { fontSize: 22, fontWeight: 700, lineHeight: 26 }, b: { fontSize: 12, color: '#8a8578' } },
        },
        emphasis: { label: { show: true } },
        data: data.length > 0 ? data : [{ name: 'No data', value: 1, itemStyle: { color: '#e5d9c9' } }],
      },
    ],
  };
}

function horizontalBarOption(entries: [string, number][]): Record<string, unknown> {
  const sorted = [...entries].sort((a, b) => a[1] - b[1]); // ascending so the largest ends up on top visually
  return {
    color: CHART_COLORS,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 110, right: 24, top: 10, bottom: 10 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: sorted.map(([name]) => name) },
    series: [
      {
        type: 'bar',
        data: sorted.map(([, n]) => n),
        barMaxWidth: 20,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: CHART_COLORS[0] },
      },
    ],
  };
}

function verdictOption(concepts: ConceptStats[], labels: Labels): Record<string, unknown> {
  const ordered = labels.conceptOrder.map((id) => concepts.find((c) => c.conceptId === id)).filter((c): c is ConceptStats => c !== undefined);
  const verdictKeys = Object.keys(labels.verdictLabels);
  return {
    color: CHART_COLORS,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { fontSize: 12 } },
    grid: { left: 36, right: 16, top: 32, bottom: 48 },
    xAxis: {
      type: 'category',
      data: ordered.map((c) => labelled(labels.conceptNames, c.conceptId)),
      axisLabel: { interval: 0, rotate: 20, fontSize: 11 },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: verdictKeys.map((key, i) => ({
      name: labelled(labels.verdictLabels, key),
      type: 'bar',
      stack: 'verdict',
      barMaxWidth: 36,
      itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
      data: ordered.map((c) => c.verdictCounts[key] ?? 0),
    })),
  };
}

/** mens-cotton-shirt now collects feedback tagged by weave (Micro-Dobby / Cotton Slub) — these
 * are two separate entries a respondent can answer independently (see concept-weave-variants.ts
 * and the hidden `weave` field feedback-island.ts syncs to whichever tab is open), so they need
 * their own side-by-side comparison rather than being folded into the all-Concepts Verdict chart
 * above. One grouped/stacked bar per weave, same verdict-key stacking as `verdictOption`. */
function weaveVerdictOption(weaveBreakdown: StatsBody['weaveBreakdown'], labels: Labels): Record<string, unknown> {
  const verdictKeys = Object.keys(labels.verdictLabels);
  return {
    color: CHART_COLORS,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { fontSize: 12 } },
    grid: { left: 36, right: 16, top: 32, bottom: 32 },
    xAxis: {
      type: 'category',
      data: weaveBreakdown.map((w) => `${w.label} (${w.responses})`),
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: verdictKeys.map((key, i) => ({
      name: labelled(labels.verdictLabels, key),
      type: 'bar',
      stack: 'verdict',
      barMaxWidth: 60,
      itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
      data: weaveBreakdown.map((w) => w.verdictCounts[key] ?? 0),
    })),
  };
}

function seriesOption(series: StatsBody['series']): Record<string, unknown> {
  const fmt = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const lines: { key: keyof typeof series; name: string; color: string }[] = [
    { key: 'feedback', name: 'Feedback', color: CHART_COLORS[0] as string },
    { key: 'comments', name: 'Comments', color: CHART_COLORS[1] as string },
    { key: 'signups', name: 'Signups', color: CHART_COLORS[2] as string },
  ];
  return {
    color: lines.map((l) => l.color),
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { fontSize: 12 } },
    grid: { left: 36, right: 16, top: 32, bottom: 32 },
    xAxis: { type: 'category', data: series.days.map(fmt), boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    series: lines.map((l) => ({
      name: l.name,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2, color: l.color },
      itemStyle: { color: l.color },
      areaStyle: { color: l.color, opacity: 0.12 },
      data: series[l.key] as number[],
    })),
  };
}

const chartInstances = new Map<string, EChartsInstance>();
const chartObservers = new Map<string, ResizeObserver>();

function renderChart(echarts: EChartsNamespace, container: HTMLElement, key: string, option: Record<string, unknown>): void {
  let chart = chartInstances.get(key);
  if (!chart) {
    chart = echarts.init(container);
    chartInstances.set(key, chart);
    const observer = new ResizeObserver(() => chart?.resize());
    observer.observe(container);
    chartObservers.set(key, observer);
  }
  chart.setOption(option, true);
}

async function renderCharts(stats: StatsBody, labels: Labels): Promise<void> {
  const echarts = await loadEcharts();
  const chartEls = document.querySelectorAll<HTMLElement>('[data-chart]');
  const byKey = new Map<string, HTMLElement>();
  chartEls.forEach((elNode) => {
    const key = elNode.dataset.chart;
    if (key) byKey.set(key, elNode);
  });

  const conceptEntries: [string, number][] = labels.conceptOrder
    .map((id) => stats.concepts.find((c) => c.conceptId === id))
    .filter((c): c is ConceptStats => c !== undefined)
    .map((c) => [labelled(labels.conceptNames, c.conceptId), c.responses]);

  const priorityOrder = Object.keys(labels.priorityLabels);
  const priorityEntries = sumAcrossConcepts(stats.concepts, (c) => c.priorityCounts, priorityOrder).map(
    ([k, n]) => [labelled(labels.priorityLabels, k), n] as [string, number],
  );

  const changeOrder = Object.keys(labels.changeLabels);
  const changeEntries = sumAcrossConcepts(stats.concepts, (c) => c.changeCounts, changeOrder).map(
    ([k, n]) => [labelled(labels.changeLabels, k), n] as [string, number],
  );

  const priceEntries = priceBandsByLabel(stats.concepts, labels.priceBandLabels);

  const conceptEl = byKey.get('concept');
  if (conceptEl) renderChart(echarts, conceptEl, 'concept', donutOption(conceptEntries));
  const verdictEl = byKey.get('verdict');
  if (verdictEl) renderChart(echarts, verdictEl, 'verdict', verdictOption(stats.concepts, labels));
  const prioritiesEl = byKey.get('priorities');
  if (prioritiesEl) renderChart(echarts, prioritiesEl, 'priorities', horizontalBarOption(priorityEntries));
  const changesEl = byKey.get('changes');
  if (changesEl) renderChart(echarts, changesEl, 'changes', horizontalBarOption(changeEntries));
  const seriesEl = byKey.get('series');
  if (seriesEl) renderChart(echarts, seriesEl, 'series', seriesOption(stats.series));
  const priceEl = byKey.get('price');
  if (priceEl) renderChart(echarts, priceEl, 'price', donutOption(priceEntries));

  // Hidden entirely (not just an empty chart) when no Concept has weave variants — today
  // mens-cotton-shirt always does, so this is always shown, but the guard keeps the dashboard
  // correct if that ever changes.
  const weaveCard = document.querySelector<HTMLElement>('[data-chart-card="weave"]');
  if (stats.weaveBreakdown.length > 0) {
    if (weaveCard) weaveCard.hidden = false;
    const weaveEl = byKey.get('weave');
    if (weaveEl) renderChart(echarts, weaveEl, 'weave', weaveVerdictOption(stats.weaveBreakdown, labels));
  } else if (weaveCard) {
    weaveCard.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function initAdminDashboard(): void {
  const form = document.querySelector<HTMLFormElement>('[data-admin-unlock]');
  const status = document.querySelector<HTMLElement>('[data-admin-status]');
  const content = document.querySelector<HTMLElement>('[data-admin-content]');
  const totalsRoot = document.querySelector<HTMLElement>('[data-admin-totals]');
  const commentsRoot = document.querySelector<HTMLElement>('[data-admin-comments]');
  const otherTextRoot = document.querySelector<HTMLElement>('[data-admin-other-text]');
  const signupsRoot = document.querySelector<HTMLElement>('[data-admin-signups]');
  const refreshBtn = document.querySelector<HTMLButtonElement>('[data-admin-refresh]');
  const lockBtn = document.querySelector<HTMLButtonElement>('[data-admin-lock]');
  const rangeForm = document.querySelector<HTMLFormElement>('[data-admin-range]');
  const rangeFrom = document.querySelector<HTMLInputElement>('[data-admin-range-from]');
  const rangeTo = document.querySelector<HTMLInputElement>('[data-admin-range-to]');
  const labels = readLabels();

  if (
    !form ||
    !status ||
    !content ||
    !totalsRoot ||
    !commentsRoot ||
    !otherTextRoot ||
    !signupsRoot ||
    !rangeForm ||
    !rangeFrom ||
    !rangeTo ||
    !labels
  ) {
    return;
  }

  wireUpDashboard(form, status, content, totalsRoot, commentsRoot, otherTextRoot, signupsRoot, refreshBtn, lockBtn, rangeForm, rangeFrom, rangeTo, labels);
}

function wireUpDashboard(
  form: HTMLFormElement,
  status: HTMLElement,
  content: HTMLElement,
  totalsRoot: HTMLElement,
  commentsRoot: HTMLElement,
  otherTextRoot: HTMLElement,
  signupsRoot: HTMLElement,
  refreshBtn: HTMLButtonElement | null,
  lockBtn: HTMLButtonElement | null,
  rangeForm: HTMLFormElement,
  rangeFrom: HTMLInputElement,
  rangeTo: HTMLInputElement,
  labels: Labels,
): void {
  function setStatus(text: string): void {
    status.textContent = text;
  }

  function currentRange(): { from: string; to: string } | undefined {
    return rangeFrom.value && rangeTo.value ? { from: rangeFrom.value, to: rangeTo.value } : undefined;
  }

  async function unlockAndLoad(token: string, range?: { from: string; to: string }): Promise<void> {
    setStatus('Loading…');
    try {
      const stats = await fetchStats(token, range);
      setToken(token);
      rangeFrom.value = stats.range.from;
      rangeTo.value = stats.range.to;
      rangeForm.hidden = false;
      renderTotals(totalsRoot, stats.totals);
      renderComments(commentsRoot, stats.comments, labels);
      renderOtherText(otherTextRoot, stats.otherTextEntries, labels);
      renderSignups(signupsRoot, stats.signups);
      // Unhide BEFORE initialising the charts: `echarts.init()` measures the container's real
      // layout box immediately, and a `hidden` ancestor measures as 0x0 — caught live via the
      // "Can't get DOM width or height" console warning on first unlock.
      form.hidden = true;
      content.hidden = false;
      await renderCharts(stats, labels);
      setStatus(`Updated ${new Date(stats.generatedAt).toLocaleTimeString()}.`);
    } catch (err) {
      clearToken();
      content.hidden = true;
      rangeForm.hidden = true;
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

  rangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = getToken();
    if (token) void unlockAndLoad(token, currentRange());
  });

  refreshBtn?.addEventListener('click', () => {
    const token = getToken();
    if (token) void unlockAndLoad(token, currentRange());
  });

  lockBtn?.addEventListener('click', () => {
    clearToken();
    content.hidden = true;
    rangeForm.hidden = true;
    form.hidden = false;
    setStatus('Locked.');
    const input = form.querySelector<HTMLInputElement>('#admin-secret');
    if (input) input.value = '';
  });

  const existing = getToken();
  if (existing) void unlockAndLoad(existing);
}
