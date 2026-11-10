/**
 * HTML extraction for the Content_Check rules (task 9.1, Requirements 3.5, 3.6).
 *
 * `extractPage(path, html)` turns one built page into a `RenderedPage`:
 *
 *  - `visibleText`: the text a visitor can meet. It includes `<noscript>` and
 *    `<template>` content (the Angle_Viewer moves template frames into view once
 *    JS runs) and excludes `<script>`, `<style>`, `<head>` and `<title>`.
 *    Inline elements (`<em>`, `<strong>`, `<span>`, `<a>` ...) add no separator,
 *    so `skin-<em>friendly</em>` reads `skin-friendly` and `made <em>in</em>
 *    Bangladesh` reads `made in Bangladesh`. Block elements and `<br>` add one
 *    space, so `<p>a</p><p>b</p>` reads `a b`. ASCII whitespace runs collapse to
 *    one space; non-breaking spaces and other Unicode characters stay as written.
 *  - `altTexts`: every non-empty `alt` attribute, including those inside
 *    `<template>` and `<noscript>`.
 *  - `metaTexts`: `<title>`, every `<meta content>` (including `og:*`), every
 *    string value in JSON-LD, every `aria-label` and every `title` attribute.
 *  - `factIds`: every `data-fact-id`, in document order, first occurrence only.
 *  - `factSpans`: for every element with the class `fact`, the character range it
 *    covers in `visibleText`. `factSpanContaining` maps an offset range to the
 *    nearest (innermost) `.fact` ancestor.
 *  - `channelTexts`: the non-visible texts with the channel each came from, so a
 *    rule can say where a match was found.
 *
 * `path` is the page's location in `dist` with a leading slash, for example
 * `/index.html`. Pure: no file access.
 */
import { HTMLElement, NodeType, parse, TextNode, type Node } from 'node-html-parser';

/** Where a non-visible text came from. */
export type TextChannel = 'alt' | 'title' | 'title-attr' | 'meta' | 'og' | 'json-ld' | 'aria-label';

export interface ChannelText {
  channel: TextChannel;
  text: string;
  /** True when the carrying element sits inside a `<template>` (alt, aria-label and title attributes). */
  inTemplate: boolean;
}

/** The range of `visibleText` covered by one `.fact` element. `end` is exclusive. */
export interface FactSpan {
  start: number;
  end: number;
  /** The element's `data-fact-id`, or null when it has none. */
  factId: string | null;
}

/**
 * The range of `visibleText` covered by one `<time datetime="...">` element.
 * `end` is exclusive. CC-09 uses it to accept a year that is the machine-readable
 * date the element itself declares.
 */
export interface TimeSpan {
  start: number;
  end: number;
  /** The element's `datetime` attribute, trimmed. */
  datetime: string;
}

/** The range of `visibleText` covered by one element marked `data-composition`. `end` is exclusive. */
export interface CompositionSpan {
  start: number;
  end: number;
}

export interface RenderedPage {
  /** Dist-relative path with a leading slash, for example `/index.html`. */
  path: string;
  /** The page source as built. */
  html: string;
  visibleText: string;
  /** Non-empty `alt` values, in document order (includes `<template>` and `<noscript>`). */
  altTexts: string[];
  /** `<title>`, `<meta content>`, `og:*`, JSON-LD strings, `aria-label` and `title` attribute values. */
  metaTexts: string[];
  /** `data-fact-id` values in document order, without repeats. */
  factIds: string[];
  /** One entry per `.fact` element, in document order. */
  factSpans: FactSpan[];
  /** One entry per `<time>` element that has a non-empty `datetime`, in document order. */
  timeSpans: TimeSpan[];
  /** One entry per element carrying `data-composition` (the Fabric_Notes composition value). */
  compositionSpans: CompositionSpan[];
  /** Every alt and metaTexts entry with its channel. */
  channelTexts: ChannelText[];
}

/** Elements that never contribute visible text. */
const SKIPPED = new Set(['script', 'style', 'head', 'title']);

/** Text-level elements: they do not separate words. Everything else is treated as a block. */
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'img',
  'input', 'ins', 'kbd', 'label', 'mark', 'q', 's', 'samp', 'small', 'span', 'strike', 'strong',
  'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr',
]);

class TextBuilder {
  private parts: string[] = [];
  private len = 0;
  /** True at the start and after a separator, so no second space is added. */
  private atBreak = true;

  get length(): number {
    return this.len;
  }

  addText(raw: string): void {
    let s = raw.replace(/[ \t\n\r\f]+/g, ' ');
    if (this.atBreak && s.startsWith(' ')) s = s.slice(1);
    if (s === '') return;
    this.parts.push(s);
    this.len += s.length;
    this.atBreak = s.endsWith(' ');
  }

  ensureBreak(): void {
    if (this.atBreak) return;
    this.parts.push(' ');
    this.len += 1;
    this.atBreak = true;
  }

  /** The finished text, without a trailing space. */
  text(): string {
    return this.parts.join('').replace(/ +$/, '');
  }
}

function tagOf(el: HTMLElement): string {
  return (el.rawTagName ?? '').toLowerCase();
}

function hasFactClass(el: HTMLElement): boolean {
  return /(?:^|\s)fact(?:\s|$)/.test(el.getAttribute('class') ?? '');
}

function insideTemplate(el: HTMLElement): boolean {
  for (let p = el.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) {
    if (tagOf(p) === 'template') return true;
  }
  return false;
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (value.trim() !== '') out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

/** Builds the `RenderedPage` for one built HTML page. */
export function extractPage(path: string, html: string): RenderedPage {
  // node-html-parser reads `<!doctype html>` as a text node, so drop it before parsing.
  const root = parse(html.replace(/<!doctype[^>]*>/gi, ''), { blockTextElements: { script: true, style: true } });

  // --- visible text and fact spans -----------------------------------------
  const builder = new TextBuilder();
  const rawSpans: FactSpan[] = [];
  const rawTimeSpans: TimeSpan[] = [];
  const rawCompositionSpans: CompositionSpan[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      builder.addText((node as TextNode).text);
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = tagOf(el);
    if (SKIPPED.has(tag)) return;

    const inline = INLINE.has(tag);
    if (!inline) builder.ensureBreak();
    const span: FactSpan | null = hasFactClass(el)
      ? { start: builder.length, end: builder.length, factId: el.getAttribute('data-fact-id') || null }
      : null;
    if (span) rawSpans.push(span);
    const datetime = tag === 'time' ? (el.getAttribute('datetime') ?? '').trim() : '';
    const timeSpan: TimeSpan | null =
      datetime !== '' ? { start: builder.length, end: builder.length, datetime } : null;
    if (timeSpan) rawTimeSpans.push(timeSpan);
    const compositionSpan: CompositionSpan | null =
      el.hasAttribute('data-composition') ? { start: builder.length, end: builder.length } : null;
    if (compositionSpan) rawCompositionSpans.push(compositionSpan);
    for (const child of el.childNodes) walk(child);
    if (span) span.end = builder.length;
    if (timeSpan) timeSpan.end = builder.length;
    if (compositionSpan) compositionSpan.end = builder.length;
    if (!inline) builder.ensureBreak();
  };
  walk(root);

  const visibleText = builder.text();
  const factSpans = rawSpans.map((s) => {
    // Drop a trailing separator that belongs to the block around the fact, not the fact.
    let start = Math.min(s.start, visibleText.length);
    let end = Math.min(s.end, visibleText.length);
    while (start < end && visibleText[start] === ' ') start += 1;
    while (end > start && visibleText[end - 1] === ' ') end -= 1;
    return { start, end, factId: s.factId };
  });
  const compositionSpans = rawCompositionSpans.map((s) => ({
    start: Math.min(s.start, visibleText.length),
    end: Math.min(s.end, visibleText.length),
  }));
  const timeSpans = rawTimeSpans.map((s) => {
    let start = Math.min(s.start, visibleText.length);
    let end = Math.min(s.end, visibleText.length);
    while (start < end && visibleText[start] === ' ') start += 1;
    while (end > start && visibleText[end - 1] === ' ') end -= 1;
    return { start, end, datetime: s.datetime };
  });

  // --- attribute and metadata channels --------------------------------------
  const channelTexts: ChannelText[] = [];
  const push = (channel: TextChannel, text: string | undefined, el: HTMLElement | null): void => {
    const t = (text ?? '').trim();
    if (t === '') return;
    channelTexts.push({ channel, text: t, inTemplate: el ? insideTemplate(el) : false });
  };

  for (const el of root.querySelectorAll('[alt]')) push('alt', el.getAttribute('alt'), el);

  for (const el of root.querySelectorAll('title')) push('title', el.textContent, null);

  for (const el of root.querySelectorAll('meta')) {
    const content = el.getAttribute('content');
    if (content === undefined) continue;
    const key = (el.getAttribute('property') ?? el.getAttribute('name') ?? '').toLowerCase();
    push(key.startsWith('og:') ? 'og' : 'meta', content, null);
  }

  for (const el of root.querySelectorAll('script')) {
    if (!/ld\+json/i.test(el.getAttribute('type') ?? '')) continue;
    const raw = el.rawText;
    const strings: string[] = [];
    try {
      collectStrings(JSON.parse(raw), strings);
    } catch {
      strings.push(raw); // not valid JSON: scan it as text rather than skip it
    }
    for (const s of strings) push('json-ld', s, null);
  }

  for (const el of root.querySelectorAll('[aria-label]')) push('aria-label', el.getAttribute('aria-label'), el);
  for (const el of root.querySelectorAll('[title]')) push('title-attr', el.getAttribute('title'), el);

  const factIds: string[] = [];
  for (const el of root.querySelectorAll('[data-fact-id]')) {
    const id = el.getAttribute('data-fact-id');
    if (id && !factIds.includes(id)) factIds.push(id);
  }

  return {
    path,
    html,
    visibleText,
    altTexts: channelTexts.filter((c) => c.channel === 'alt').map((c) => c.text),
    metaTexts: channelTexts.filter((c) => c.channel !== 'alt').map((c) => c.text),
    factIds,
    factSpans,
    timeSpans,
    compositionSpans,
    channelTexts,
  };
}

/**
 * The innermost `.fact` span that wholly contains `[start, end)` of `visibleText`,
 * or undefined when the range is outside every fact or straddles a fact boundary.
 */
export function factSpanContaining(page: RenderedPage, start: number, end: number): FactSpan | undefined {
  let best: FactSpan | undefined;
  for (const span of page.factSpans) {
    if (span.start <= start && end <= span.end && (!best || span.end - span.start <= best.end - best.start)) {
      best = span;
    }
  }
  return best;
}

/** The nearest `.fact` ancestor of the character at `offset` in `visibleText`, if any. */
export function factSpanAt(page: RenderedPage, offset: number): FactSpan | undefined {
  return factSpanContaining(page, offset, offset + 1);
}
