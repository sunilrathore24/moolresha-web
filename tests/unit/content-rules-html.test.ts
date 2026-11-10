import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exitCodeFor, formatViolation, main, runRules } from '../../scripts/content-check';
import { extractPage, factSpanAt, factSpanContaining } from '../../src/lib/content-rules/html';
import { RULES } from '../../src/lib/content-rules/index';
import type { CheckContext, Rule, Violation } from '../../src/lib/content-rules/types';
import { renderedPage } from '../generators/rendered-page';

const page = (body: string, head = '') =>
  extractPage('/index.html', `<!doctype html><html><head>${head}</head><body>${body}</body></html>`);

describe('extractPage: visible text', () => {
  it('includes noscript and template content', () => {
    const p = page(
      '<p>shown</p><noscript><p>no js text</p></noscript><template><p>template text</p></template>',
    );
    expect(p.visibleText).toContain('shown');
    expect(p.visibleText).toContain('no js text');
    expect(p.visibleText).toContain('template text');
  });

  it('excludes script, style, head and title text', () => {
    const p = page('<p>kept</p><script>var secret = 1;</script><style>.a{color:red}</style>', '<title>Page title</title>');
    expect(p.visibleText).toBe('kept');
    expect(p.visibleText).not.toContain('secret');
    expect(p.visibleText).not.toContain('color');
    expect(p.visibleText).not.toContain('Page title');
  });

  it('flattens inline elements so words and phrases are not split', () => {
    expect(page('<p>skin-<em>friendly</em></p>').visibleText).toBe('skin-friendly');
    expect(page('<p>made <em>in</em> Bangladesh</p>').visibleText).toBe('made in Bangladesh');
    expect(page('<p>less <strong>GST</strong></p>').visibleText).toBe('less GST');
    expect(page('<p>ab<span>cd</span>ef</p>').visibleText).toBe('abcdef');
  });

  it('separates block elements and line breaks with one space', () => {
    expect(page('<p>one</p><p>two</p>').visibleText).toBe('one two');
    expect(page('<div>one<br>two</div>').visibleText).toBe('one two');
  });

  it('collapses whitespace runs, keeps NBSP, and decodes entities', () => {
    const p = page('<p>a \n\t  b&nbsp;c &amp; d</p>');
    expect(p.visibleText).toBe('a b\u00a0c & d');
  });
});

describe('extractPage: alt, metadata and channels', () => {
  it('collects alt texts including those inside template and noscript', () => {
    const p = page(
      '<img alt="plain alt"><template><img alt="template alt"></template><noscript><img alt="noscript alt"></noscript><img alt="">',
    );
    expect(p.altTexts).toEqual(['plain alt', 'template alt', 'noscript alt']);
    const inTemplate = p.channelTexts.filter((c) => c.inTemplate).map((c) => c.text);
    expect(inTemplate).toEqual(['template alt']);
  });

  it('collects title, meta, og, JSON-LD and aria-label texts', () => {
    const p = page(
      '<button aria-label="Previous view">x</button><a href="#a" title="Tip text">y</a>',
      '<title>Doc title &amp; more</title>' +
        '<meta name="description" content="Meta description">' +
        '<meta property="og:title" content="OG title">' +
        '<script type="application/ld+json">{"@type":"Thing","name":"LD name","nested":{"list":["LD item"]}}</script>',
    );
    expect(p.metaTexts).toEqual(
      expect.arrayContaining([
        'Doc title & more',
        'Meta description',
        'OG title',
        'LD name',
        'LD item',
        'Previous view',
        'Tip text',
      ]),
    );
    const channels = Object.fromEntries(p.channelTexts.map((c) => [c.text, c.channel]));
    expect(channels['OG title']).toBe('og');
    expect(channels['Meta description']).toBe('meta');
    expect(channels['LD name']).toBe('json-ld');
    expect(channels['Previous view']).toBe('aria-label');
    expect(channels['Doc title & more']).toBe('title');
    // JSON-LD keys and the type value are not copy, but string values are scanned.
    expect(p.visibleText).not.toContain('LD name');
  });

  it('scans invalid JSON-LD as text instead of skipping it', () => {
    const p = page('<p>x</p>', '<script type="application/ld+json">{not json made in Bangladesh</script>');
    expect(p.metaTexts.join(' ')).toContain('made in Bangladesh');
  });

  it('lists data-fact-id values in order without repeats', () => {
    const p = page(
      '<span class="fact" data-fact-id="b-fact">B</span><span class="fact" data-fact-id="a-fact">A</span><span class="fact" data-fact-id="b-fact">B</span>',
    );
    expect(p.factIds).toEqual(['b-fact', 'a-fact']);
  });
});

describe('extractPage: .fact ancestor map', () => {
  const body =
    '<p>Outside text. <span class="fact" data-fact-id="f1">Inside <em>fact</em> one</span> Tail text.</p>' +
    '<p>Another <span class="fact" data-fact-id="f2">second <span class="fact" data-fact-id="inner">inner</span> fact</span>.</p>';
  const p = page(body);
  const at = (needle: string) => {
    const start = p.visibleText.indexOf(needle);
    expect(start).toBeGreaterThanOrEqual(0);
    return { start, end: start + needle.length };
  };

  it('maps offsets inside a fact to that fact and outside to nothing', () => {
    const inside = at('Inside fact one');
    expect(factSpanContaining(p, inside.start, inside.end)?.factId).toBe('f1');
    const outside = at('Outside text.');
    expect(factSpanContaining(p, outside.start, outside.end)).toBeUndefined();
    expect(factSpanAt(p, at('Tail').start)).toBeUndefined();
  });

  it('returns the nearest (innermost) .fact ancestor', () => {
    const inner = at('inner');
    expect(factSpanContaining(p, inner.start, inner.end)?.factId).toBe('inner');
    const second = at('second');
    expect(factSpanContaining(p, second.start, second.end)?.factId).toBe('f2');
  });

  it('does not report a range that straddles a fact boundary', () => {
    const start = p.visibleText.indexOf('one Tail');
    expect(factSpanContaining(p, start, start + 'one Tail'.length)).toBeUndefined();
  });

  it('spans start and end exactly on the fact text', () => {
    const span = p.factSpans.find((s) => s.factId === 'f1');
    expect(span && p.visibleText.slice(span.start, span.end)).toBe('Inside fact one');
  });
});

describe('extractPage: time and composition spans', () => {
  it('records <time datetime> ranges and ignores <time> without datetime', () => {
    const p = page('<p>On <time datetime="2026-11-07">7 Nov 2026</time> and <time>later</time>.</p>');
    expect(p.timeSpans).toHaveLength(1);
    const t = p.timeSpans[0];
    expect(t.datetime).toBe('2026-11-07');
    expect(p.visibleText.slice(t.start, t.end)).toBe('7 Nov 2026');
  });

  it('records [data-composition] ranges', () => {
    const p = page('<dl><dt>Composition</dt><dd data-composition>60% cotton, 40% linen</dd></dl>');
    expect(p.compositionSpans).toHaveLength(1);
    const c = p.compositionSpans[0];
    expect(p.visibleText.slice(c.start, c.end)).toBe('60% cotton, 40% linen');
  });
});

describe('renderedPage generator', () => {
  it('produces clean pages with no insertion and places an insertion in the chosen channel', () => {
    fc.assert(
      fc.property(renderedPage({ insert: fc.constant('zzprobe word') }), ({ page: p, insertion }) => {
        expect(insertion).toBeDefined();
        const everywhere = [p.visibleText, ...p.altTexts, ...p.metaTexts].join(' | ');
        expect(everywhere.replace(/\s+/g, ' ')).toContain('zzprobe');
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(renderedPage(), ({ page: p, insertion }) => {
        expect(insertion).toBeUndefined();
        expect(p.visibleText.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

/* ---------- runner ---------- */

const emptyCtx = {
  facts: [],
  concepts: [],
  marketScans: [],
  blocklist: [],
  pages: [],
  distFiles: [],
} as unknown as CheckContext;

const v = (rule: string, target: string, detail: string): Violation => ({ rule, target, detail });

describe('runRules and the exit code', () => {
  it('registers rules through a list that is empty until the rule tasks add theirs', () => {
    expect(Array.isArray(RULES)).toBe(true);
  });

  it('returns every violation from every rule, in rule order', () => {
    const ruleA: Rule = () => [v('CC-90', '/a.html', 'first'), v('CC-90', '/b.html', 'second')];
    const ruleB: Rule = () => [];
    const ruleC: Rule = () => [v('CC-91', 'mens-cotton-shirt', 'third')];
    const out = runRules(emptyCtx, [ruleA, ruleB, ruleC]);
    expect(out.map((x) => x.detail)).toEqual(['first', 'second', 'third']);
  });

  it('formats a violation as [CC-xx] target: detail', () => {
    expect(formatViolation(v('CC-05', '/index.html', 'brand "x" found'))).toBe('[CC-05] /index.html: brand "x" found');
  });

  it('exits 0 with no violations and 1 with any', () => {
    expect(exitCodeFor([])).toBe(0);
    expect(exitCodeFor([v('CC-90', 't', 'd')])).toBe(1);
  });

  it('reports a rule that throws and still runs the others', () => {
    const boom: Rule = function boomRule() {
      throw new Error('bad rule');
    };
    const ok: Rule = () => [v('CC-90', 't', 'still ran')];
    const out = runRules(emptyCtx, [boom, ok]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ rule: 'INTERNAL', target: 'boomRule' });
    expect(out[1]?.detail).toBe('still ran');
  });

  describe('main (CLI entry) against a temporary dist', () => {
    let dist: string;
    beforeAll(() => {
      dist = mkdtempSync(join(tmpdir(), 'content-check-dist-'));
      mkdirSync(join(dist, 'about'));
      writeFileSync(join(dist, 'index.html'), '<html><body><p>Home <em>page</em></p></body></html>');
      writeFileSync(join(dist, 'about', 'index.html'), '<html><body><p>About</p></body></html>');
      writeFileSync(join(dist, 'app.js'), 'console.log(1)');
      writeFileSync(join(dist, 'logo.png'), 'not text');
    });
    afterAll(() => rmSync(dist, { recursive: true, force: true }));

    it('prints every violation as [CC-xx] target: detail and exits 1', () => {
      const lines: string[] = [];
      const fake: Rule = () => [
        v('CC-90', '/one.html', 'alpha'),
        v('CC-90', '/two.html', 'beta'),
        v('CC-91', 'concept-x', 'gamma'),
      ];
      const code = main({ distDir: dist, rules: [fake], out: (l) => lines.push(l), err: (l) => lines.push(l) });
      expect(code).toBe(1);
      expect(lines).toEqual(
        expect.arrayContaining([
          '[CC-90] /one.html: alpha',
          '[CC-90] /two.html: beta',
          '[CC-91] concept-x: gamma',
        ]),
      );
    });

    it('hands the rules the extracted pages and the text files of dist', () => {
      let seen: CheckContext | undefined;
      const spy: Rule = (ctx) => {
        seen = ctx;
        return [];
      };
      main({ distDir: dist, rules: [spy], out: () => {}, err: () => {} });
      expect(seen?.pages.map((p) => p.path)).toEqual(['/about/index.html', '/index.html']);
      expect(seen?.pages.find((p) => p.path === '/index.html')?.visibleText).toBe('Home page');
      expect(seen?.distFiles.map((f) => f.path)).toEqual(['/about/index.html', '/app.js', '/index.html']);
      expect(seen?.facts.length).toBeGreaterThan(0);
      expect(seen?.concepts).toHaveLength(5);
      expect(seen?.wordRules.restrictedPhrases.length).toBeGreaterThan(0);
    });

    it('exits 0 when no rule reports a violation and the content loads cleanly', () => {
      const lines: string[] = [];
      const code = main({ distDir: dist, rules: [() => []], out: (l) => lines.push(l), err: (l) => lines.push(l) });
      expect(lines.join('\n')).toContain('no violations');
      expect(code).toBe(0);
    });

    it('fails with a clear message when dist is missing', () => {
      const lines: string[] = [];
      const code = main({ distDir: join(dist, 'missing'), rules: [], out: (l) => lines.push(l), err: (l) => lines.push(l) });
      expect(code).toBe(1);
      expect(lines.join('\n')).toContain('dist folder not found');
    });
  });
});
