/**
 * fast-check generator for the Concepts section (CC-16, Property 33).
 *
 * `conceptCards()` builds one to five valid Concept_Cards. `mutatedConceptCards()`
 * applies one tagged mutation to one card and returns the affected Concept id.
 *
 * Card markup (the assumption documented in structure-rules.ts):
 *   <article data-concept-card data-concept-id="ID"> ... Angle_Viewer (also has
 *   data-concept-id) ... <fieldset data-price-question> ... </fieldset>
 *   <details class="market-context" data-market-for="ID"> <summary> ... </article>
 */
import fc from 'fast-check';
import { CONCEPT_IDS, type ConceptId } from '../../src/content/config/allow-lists';
import { extractPage, type RenderedPage } from '../../src/lib/content-rules/html';

export const MARKET_SUMMARY = 'See what similar pieces cost';

export const CARD_MUTATIONS = [
  'zero-contexts',
  'two-contexts',
  'wrong-id',
  'before-price',
  'div-not-details',
  'open',
  'wrong-summary',
  'missing-summary',
  'outside-card',
] as const;
export type CardMutation = (typeof CARD_MUTATIONS)[number];

interface CardSpec {
  id: ConceptId;
  /** Id written in `data-market-for` on the first context. */
  marketFor: string;
  contexts: 0 | 1 | 2;
  before: boolean;
  tag: 'details' | 'div';
  open: boolean;
  summary: string | null;
  outside: boolean;
}

export interface GeneratedCards {
  /** Card ids in document order. */
  ids: ConceptId[];
  /** The built page, path `/index.html`. */
  page: RenderedPage;
  html: string;
  /** Set on mutated output. */
  mutation?: CardMutation;
  /** The card the mutation was applied to. */
  mutatedId?: ConceptId;
}

function validSpec(id: ConceptId): CardSpec {
  return { id, marketFor: id, contexts: 1, before: false, tag: 'details', open: false, summary: MARKET_SUMMARY, outside: false };
}

function contextHtml(spec: CardSpec): string {
  const open = spec.open ? ' open' : '';
  const summary = spec.summary === null ? '' : `<summary>${spec.summary}</summary>`;
  return (
    `<${spec.tag} class="market-context" data-market-for="${spec.marketFor}" data-reveal="pending"${open}>` +
    `${summary}<p>Prices vary within every brand and change often.</p></${spec.tag}>`
  );
}

function cardHtml(spec: CardSpec): string {
  const ctx = spec.contexts === 0 ? '' : contextHtml(spec).repeat(spec.contexts);
  const price =
    `<form><fieldset data-price-question><legend>What would you pay?</legend>` +
    `<label><input type="radio" name="p" value="a"> Under 1,000</label></fieldset></form>`;
  return (
    `<article data-concept-card data-concept-id="${spec.id}"><h3>${spec.id}</h3>` +
    `<div class="angle-viewer" data-angle-viewer data-concept-id="${spec.id}"></div>` +
    (spec.before ? ctx + price : price + ctx) +
    `</article>`
  );
}

function pageHtml(specs: CardSpec[]): string {
  const outside = specs.filter((s) => s.outside).map((s) => contextHtml({ ...s, contexts: 1 }));
  return (
    `<!doctype html><html lang="en"><head><title>Safe page</title></head><body><main>` +
    `<section data-section="concepts">${specs.map(cardHtml).join('')}</section>` +
    outside.map((o) => `<section data-section="why">${o}</section>`).join('') +
    `</main></body></html>`
  );
}

function build(specs: CardSpec[], mutation?: CardMutation, mutatedId?: ConceptId): GeneratedCards {
  const html = pageHtml(specs);
  return { ids: specs.map((s) => s.id), page: extractPage('/index.html', html), html, mutation, mutatedId };
}

const idsArb = fc.shuffledSubarray([...CONCEPT_IDS], { minLength: 1, maxLength: CONCEPT_IDS.length });

/**
 * The market summary with extra whitespace between and around its words (spaces, tabs,
 * line breaks). CC-16 compares it after whitespace normalisation, so every variant is valid.
 */
const summaryVariant: fc.Arbitrary<string> = fc
  .array(
    fc
      .array(fc.constantFrom(' ', '\t', '\n', '\r\n'), { minLength: 1, maxLength: 3 })
      .map((a) => a.join('')),
    { minLength: 6, maxLength: 6 },
  )
  .map((seps) => {
    const words = MARKET_SUMMARY.split(' ');
    const inner = words.map((w, i) => (i === 0 ? w : `${seps[i - 1]}${w}`)).join('');
    return `${seps[4]!.slice(0, 1)}${inner}${seps[5]!.slice(0, 1)}`;
  });

/** One to five valid cards, in random order. Each card's summary text varies in whitespace. */
export function conceptCards(): fc.Arbitrary<GeneratedCards> {
  return fc
    .tuple(idsArb, fc.array(summaryVariant, { minLength: 5, maxLength: 5 }))
    .map(([ids, summaries]) => build(ids.map((id, i) => ({ ...validSpec(id), summary: summaries[i]! }))));
}

function applyMutation(spec: CardSpec, mutation: CardMutation, other: ConceptId): CardSpec {
  switch (mutation) {
    case 'zero-contexts':
      return { ...spec, contexts: 0 };
    case 'two-contexts':
      return { ...spec, contexts: 2 };
    case 'wrong-id':
      return { ...spec, marketFor: other };
    case 'before-price':
      return { ...spec, before: true };
    case 'div-not-details':
      return { ...spec, tag: 'div' };
    case 'open':
      return { ...spec, open: true };
    case 'wrong-summary':
      return { ...spec, summary: 'Show me the prices' };
    case 'missing-summary':
      return { ...spec, summary: null };
    case 'outside-card':
      return { ...spec, contexts: 0, outside: true };
  }
}

/** One to five cards where exactly one card carries one tagged mutation. */
export function mutatedConceptCards(
  mutations: readonly CardMutation[] = CARD_MUTATIONS,
): fc.Arbitrary<GeneratedCards> {
  return fc
    .tuple(idsArb, fc.constantFrom(...mutations), fc.nat())
    .map(([ids, mutation, pick]) => {
      const target = ids[pick % ids.length]!;
      const other = CONCEPT_IDS.find((c) => c !== target)!;
      const specs = ids.map((id) => (id === target ? applyMutation(validSpec(id), mutation, other) : validSpec(id)));
      // A mutation that does not touch the summary leaves the whitespace-free text in place.
      return build(specs, mutation, target);
    });
}
