/**
 * fast-check generators for the Price_Layers subtree (used by Property 14 and
 * the CC-08 unit tests).
 *
 * `rupeeAmount()` yields one rupee amount as written on a page: the `₹`, `Rs`,
 * `Rs.` or `INR` marker in any case, glued or spaced, with Indian grouping,
 * western grouping or none, with or without decimals.
 *
 * `priceLayersSubtree()` yields the HTML of a `[data-section=price-layers]`
 * subtree: the nine layers with safe text, the launch promise and the GST fact
 * (`data-fact-id="gst-cliff-2025"`), plus zero to four amounts inserted by tag
 * (placement, channel, nesting). It also returns what a correct CC-08 check
 * must report: the amounts that lie outside the GST fact.
 */
import fc from 'fast-check';

export const GST_FACT_ID = 'gst-cliff-2025';

export const LAYER_IDS = [
  'fabric',
  'making',
  'finishing',
  'packaging',
  'shipping',
  'rto_returns',
  'platform_payment_fees',
  'gst',
  'margin',
] as const;

export const PLACEMENTS = [
  'layer-name',
  'layer-explanation',
  'promise',
  'gst-fact',
  'other-fact',
] as const;
export type AmountPlacement = (typeof PLACEMENTS)[number];

export const AMOUNT_CHANNELS = ['text', 'alt', 'title', 'aria-label'] as const;
export type AmountChannel = (typeof AMOUNT_CHANNELS)[number];

/**
 * `none` = directly in the layer `<li>` or paragraph; `strong` and `span` wrap the
 * amount; `split` cuts the amount in two with an inline element (`₹<em>2,500</em>`).
 */
export const NESTINGS = ['none', 'strong', 'span', 'split'] as const;
export type AmountNesting = (typeof NESTINGS)[number];

/* ---------- Amounts ---------- */

const MARKERS = ['₹', 'Rs', 'Rs.', 'rs.', 'RS', 'INR', 'inr', 'Inr'] as const;

function indianGroup(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${s.slice(-3)}`;
}

function westernGroup(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One rupee amount, exactly as it would appear in copy. */
export function rupeeAmount(): fc.Arbitrary<string> {
  return fc
    .record({
      marker: fc.constantFrom(...MARKERS),
      space: fc.constantFrom('', ' '),
      value: fc.integer({ min: 0, max: 5_000_000 }),
      grouping: fc.constantFrom('indian', 'western', 'none'),
      decimals: fc.option(fc.integer({ min: 0, max: 99 }), { nil: undefined }),
    })
    .map(({ marker, space, value, grouping, decimals }) => {
      const digits =
        grouping === 'indian' ? indianGroup(value) : grouping === 'western' ? westernGroup(value) : String(value);
      const frac = decimals === undefined ? '' : `.${String(decimals).padStart(2, '0')}`;
      return `${marker}${space}${digits}${frac}`;
    });
}

/* ---------- Subtree ---------- */

const SAFE_WORDS = [
  'cloth', 'thread', 'loom', 'seam', 'cutting', 'sewing', 'checking', 'bags', 'boxes', 'carriers',
  'returns', 'fees', 'tax', 'cost', 'plain', 'weave', 'yarn', 'tailors', 'time', 'pays', 'for',
] as const;

const safeText = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 2, maxLength: 6 })
  .map((ws) => ws.join(' '));

export interface PlacedAmount {
  amount: string;
  placement: AmountPlacement;
  channel: AmountChannel;
  nesting: AmountNesting;
  /** True when the amount lies inside the GST fact element. */
  inGst: boolean;
  /** Index of the layer the amount sits in (layer placements) or 0. */
  layer: number;
}

export interface GeneratedSubtree {
  /** The `[data-section=price-layers]` subtree as an HTML string. */
  html: string;
  inserted: PlacedAmount[];
  /** The matched texts a correct check reports, in no particular order. */
  expectedOutside: string[];
}

interface Slot {
  names: string[];
  explanations: string[];
  promise: string;
  gst: string;
  other: string;
  /** Attribute-carrying images placed per location. */
  layerImgs: string[][];
  promiseImgs: string[];
  gstImgs: string[];
  otherImgs: string[];
}

function wrap(text: string, nesting: AmountNesting): string {
  if (nesting === 'none') return text;
  if (nesting === 'split') {
    const cut = Math.max(1, Math.floor(text.length / 2));
    return `${text.slice(0, cut)}<em>${text.slice(cut)}</em>`;
  }
  return `<${nesting}>${text}</${nesting}>`;
}

function img(channel: Exclude<AmountChannel, 'text'>, amount: string): string {
  return `<img src="/x.png" ${channel}="note ${amount} end">`;
}

function build(names: string[], explanations: string[], promise: string, gst: string, other: string, placed: PlacedAmount[]): string {
  const slot: Slot = {
    names: [...names],
    explanations: [...explanations],
    promise,
    gst,
    other,
    layerImgs: names.map(() => []),
    promiseImgs: [],
    gstImgs: [],
    otherImgs: [],
  };
  for (const p of placed) {
    const textual = p.channel === 'text';
    const piece = textual ? ` ${wrap(p.amount, p.nesting)} more` : '';
    switch (p.placement) {
      case 'layer-name':
        if (textual) slot.names[p.layer] += piece;
        else (slot.layerImgs[p.layer] as string[]).push(img(p.channel as Exclude<AmountChannel, 'text'>, p.amount));
        break;
      case 'layer-explanation':
        if (textual) slot.explanations[p.layer] += piece;
        else (slot.layerImgs[p.layer] as string[]).push(img(p.channel as Exclude<AmountChannel, 'text'>, p.amount));
        break;
      case 'promise':
        if (textual) slot.promise += piece;
        else slot.promiseImgs.push(img(p.channel as Exclude<AmountChannel, 'text'>, p.amount));
        break;
      case 'gst-fact':
        if (textual) slot.gst += piece;
        else slot.gstImgs.push(img(p.channel as Exclude<AmountChannel, 'text'>, p.amount));
        break;
      case 'other-fact':
        if (textual) slot.other += piece;
        else slot.otherImgs.push(img(p.channel as Exclude<AmountChannel, 'text'>, p.amount));
        break;
    }
  }

  const items = LAYER_IDS.map(
    (id, i) =>
      `<li data-layer="${id}"><strong>${slot.names[i]}</strong> <span>${slot.explanations[i]}</span>${(slot.layerImgs[i] as string[]).join('')}</li>`,
  ).join('');
  return (
    `<section data-section="price-layers" aria-labelledby="price-layers-h">` +
    `<h2 id="price-layers-h">What goes into a price</h2>` +
    `<ol class="price-layers">${items}</ol>` +
    `<p class="launch-promise">${slot.promise}${slot.promiseImgs.join('')}</p>` +
    `<p><span class="fact" data-fact-id="${GST_FACT_ID}">${slot.gst}${slot.gstImgs.join('')}</span></p>` +
    `<p><span class="fact" data-fact-id="other-fact">${slot.other}${slot.otherImgs.join('')}</span></p>` +
    `</section>`
  );
}

/**
 * A Price_Layers subtree with 0 to 4 amounts inserted by tag. With no
 * insertion it holds no amount at all (the GST fact text here is safe words,
 * so a clean subtree has nothing to flag).
 */
export function priceLayersSubtree(maxAmounts = 4): fc.Arbitrary<GeneratedSubtree> {
  const placed = fc.record({
    amount: rupeeAmount(),
    placement: fc.constantFrom(...PLACEMENTS),
    channel: fc.constantFrom(...AMOUNT_CHANNELS),
    nesting: fc.constantFrom(...NESTINGS),
    layer: fc.integer({ min: 0, max: LAYER_IDS.length - 1 }),
  });
  return fc
    .record({
      names: fc.array(safeText, { minLength: LAYER_IDS.length, maxLength: LAYER_IDS.length }),
      explanations: fc.array(safeText, { minLength: LAYER_IDS.length, maxLength: LAYER_IDS.length }),
      promise: safeText,
      gst: safeText,
      other: safeText,
      amounts: fc.array(placed, { minLength: 0, maxLength: maxAmounts }),
    })
    .map(({ names, explanations, promise, gst, other, amounts }) => {
      const inserted: PlacedAmount[] = amounts.map((a) => ({
        ...a,
        inGst: a.placement === 'gst-fact',
        layer: a.placement === 'layer-name' || a.placement === 'layer-explanation' ? a.layer : 0,
      }));
      return {
        html: build(names, explanations, promise, gst, other, inserted),
        inserted,
        expectedOutside: inserted.filter((p) => !p.inGst).map((p) => p.amount),
      };
    });
}
