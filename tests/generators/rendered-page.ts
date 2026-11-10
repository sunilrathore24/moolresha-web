/**
 * fast-check generator for rendered pages (used by the Content_Check properties:
 * 11, 18, 19, 20, 32 and 46 and others).
 *
 * `renderedPage()` builds HTML from a fixed safe vocabulary (no brand names, no
 * restricted words, no digits, no health terms), so a page with no insertion is
 * clean for every rule. An optional `Insertion` puts a chosen string into a
 * chosen channel: visible text, text inside a `<template>`, `alt` (also inside
 * `<template>`), `<title>`, `<meta content>`, an `og:*` meta, JSON-LD,
 * `aria-label`, inside or outside a `.fact`. The result carries the built
 * `RenderedPage` (via `extractPage`) and the insertion, so a property can check
 * which page and which text a rule must name.
 *
 * Inline splits and fact straddles cut the inserted text at a random character
 * position (`splitAt`), so `skin-<em>friendly</em>`, `made <em>in</em> Bangladesh`
 * and `sus<em>tainable</em>` are all produced. A straddle puts the part before the
 * cut inside a `.fact` and the part after it outside.
 */
import fc from 'fast-check';
import { extractPage, type RenderedPage } from '../../src/lib/content-rules/html';

export const INSERTION_CHANNELS = [
  'text',
  'template-text',
  'alt',
  'template-alt',
  'title',
  'meta',
  'og',
  'json-ld',
  'aria-label',
] as const;
export type InsertionChannel = (typeof INSERTION_CHANNELS)[number];

/** Where the inserted text sits. Only meaningful for the `text` channel. */
export const INSERTION_PLACEMENTS = ['outside', 'fact', 'fact-straddle'] as const;
export type InsertionPlacement = (typeof INSERTION_PLACEMENTS)[number];

export const SPLIT_TAGS = ['em', 'strong', 'span'] as const;
export type SplitTag = (typeof SPLIT_TAGS)[number];

/** The `data-fact-id` of the `.fact` element the generator writes for the `fact` and `fact-straddle` placements. */
export const GEN_FACT_ID = 'gen-fact-a';

export interface Insertion {
  /** The text to insert, exactly as given. */
  text: string;
  channel: InsertionChannel;
  /** `outside` = not in a `.fact`; `fact` = wholly inside one; `fact-straddle` = starts inside, ends outside. */
  placement: InsertionPlacement;
  /** Split the inserted text at one character position with an inline element (`made <em>in Bangladesh</em>`). */
  inlineSplit: boolean;
  /** Seeds the cut position for an inline split and for a straddle. */
  splitAt: number;
  splitTag: SplitTag;
}

export interface GeneratedPage {
  page: RenderedPage;
  /** Present when an insertion was generated. */
  insertion?: Insertion;
}

/** Safe words: plain lower-case, none appear in any rule list. */
export const SAFE_WORDS = [
  'cotton', 'shirt', 'fabric', 'weave', 'thread', 'field', 'journey', 'cloth', 'plain', 'soft',
  'folded', 'stitch', 'seam', 'collar', 'sleeve', 'pocket', 'loom', 'yarn', 'dye', 'label',
] as const;

const safeSentence = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 2, maxLength: 6 })
  .map((ws) => ws.join(' '));

const safePath = fc
  .array(fc.constantFrom('about', 'privacy', 'journal', 'article', 'x'), { minLength: 0, maxLength: 2 })
  .map((segs) => (segs.length === 0 ? '/index.html' : `/${segs.join('/')}/index.html`));

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A cut position strictly inside `text` (never inside a surrogate pair). Text shorter than 2 characters is not cut. */
export function cutIndex(text: string, splitAt: number): number {
  if (text.length < 2) return text.length;
  let c = 1 + (splitAt % (text.length - 1));
  const before = text.charCodeAt(c - 1);
  if (before >= 0xd800 && before <= 0xdbff && c < text.length) c += 1;
  return c;
}

/** `head<tag>tail</tag>`: an inline element starting at a random position inside the text. */
export function splitHtml(text: string, splitAt: number, tag: SplitTag): string {
  const c = cutIndex(text, splitAt);
  return `${escapeHtml(text.slice(0, c))}<${tag}>${escapeHtml(text.slice(c))}</${tag}>`;
}

function buildHtml(sentences: string[], insertion: Insertion | undefined): string {
  const body = sentences.map((s) => `<p>${s}</p>`);
  let title = 'Safe page';
  let head = '';
  let bodyExtra = '';

  if (insertion) {
    const t = insertion.text;
    const textHtml = insertion.inlineSplit ? splitHtml(t, insertion.splitAt, insertion.splitTag) : escapeHtml(t);
    switch (insertion.channel) {
      case 'text':
        if (insertion.placement === 'outside') {
          body.push(`<p>${textHtml}</p>`);
        } else if (insertion.placement === 'fact') {
          body.push(`<p><span class="fact" data-fact-id="${GEN_FACT_ID}">before ${textHtml} after</span></p>`);
        } else {
          // Starts inside the fact, ends outside it.
          const c = cutIndex(t, insertion.splitAt);
          body.push(
            `<p><span class="fact" data-fact-id="${GEN_FACT_ID}">${escapeHtml(t.slice(0, c))}</span>${escapeHtml(t.slice(c))}</p>`,
          );
        }
        break;
      case 'template-text':
        bodyExtra += `<template><p>${textHtml}</p></template>`;
        break;
      case 'alt':
        bodyExtra += `<img src="/x.png" alt="${escapeHtml(t)}">`;
        break;
      case 'template-alt':
        bodyExtra += `<template><img src="/x.png" alt="${escapeHtml(t)}"></template>`;
        break;
      case 'title':
        title = escapeHtml(t);
        break;
      case 'meta':
        head += `<meta name="description" content="${escapeHtml(t)}">`;
        break;
      case 'og':
        head += `<meta property="og:description" content="${escapeHtml(t)}">`;
        break;
      case 'json-ld':
        head += `<script type="application/ld+json">${JSON.stringify({ '@type': 'WebPage', name: 'x', description: t }).replace(/</g, '\\u003c')}</script>`;
        break;
      case 'aria-label':
        bodyExtra += `<button type="button" aria-label="${escapeHtml(t)}">go</button>`;
        break;
    }
  }

  return (
    `<!doctype html><html lang="en"><head><title>${title}</title>${head}` +
    `<script>var safe = 1;</script><style>.x{color:red}</style></head>` +
    `<body><main>${body.join('')}${bodyExtra}</main></body></html>`
  );
}

/**
 * Generates a page. Pass `insert` to also insert a string (for example a brand
 * name, a restricted word or a health term variant) into a random channel and
 * placement. Pass `channels` or `placements` to narrow where it can go.
 */
export function renderedPage(
  options: {
    insert?: fc.Arbitrary<string>;
    channels?: readonly InsertionChannel[];
    placements?: readonly InsertionPlacement[];
  } = {},
): fc.Arbitrary<GeneratedPage> {
  const channels = options.channels ?? INSERTION_CHANNELS;
  const placements = options.placements ?? INSERTION_PLACEMENTS;
  const base = fc.record({
    path: safePath,
    sentences: fc.array(safeSentence, { minLength: 1, maxLength: 4 }),
  });
  const insertion: fc.Arbitrary<Insertion | undefined> = options.insert
    ? fc
        .record({
          text: options.insert,
          channel: fc.constantFrom(...channels),
          placement: fc.constantFrom(...placements),
          inlineSplit: fc.boolean(),
          splitAt: fc.nat(),
          splitTag: fc.constantFrom(...SPLIT_TAGS),
        })
        .map((i) => i as Insertion)
    : fc.constant(undefined);

  return fc.tuple(base, insertion).map(([b, ins]) => ({
    page: extractPage(b.path, buildHtml(b.sentences, ins)),
    insertion: ins,
  }));
}
