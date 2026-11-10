import { describe, expect, it } from 'vitest';
import { cc05, cc06, effectiveBlocklist } from '../../src/lib/content-rules/brand-rules';
import { extractPage } from '../../src/lib/content-rules/html';
import type { CheckContext } from '../../src/lib/content-rules/types';

const html = (body: string, head = '') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

interface Ev {
  brand: string;
  url: string;
}

function ctx(opts: {
  blocklist?: string[];
  evidence?: Ev[];
  pages?: { path: string; html: string }[];
  files?: { path: string; text: string }[];
}): CheckContext {
  const evidence = (opts.evidence ?? []).map((e) => ({ ...e, price: 1000, seen: '2026-01-01' }));
  return {
    blocklist: opts.blocklist ?? [],
    marketScans: evidence.length > 0 ? [{ id: 'scan-1', evidence }] : [],
    pages: (opts.pages ?? []).map((p) => extractPage(p.path, p.html)),
    distFiles: opts.files ?? [],
  } as unknown as CheckContext;
}

const onePage = (body: string, head = '', evidence: Ev[] = [], blocklist: string[] = ['Brand A']) =>
  ctx({ blocklist, evidence, pages: [{ path: '/index.html', html: html(body, head) }] });

describe('CC-05 effective blocklist', () => {
  it('merges the blocklist with evidence brands and drops MoolResha', () => {
    const c = ctx({
      blocklist: ['Brand A', 'MoolResha', 'moolresha'],
      evidence: [
        { brand: 'Placeholder Brand 1', url: 'https://example.test/a' },
        { brand: 'MOOLRESHA.', url: 'https://example.test/b' },
        { brand: 'Brand A', url: 'https://example.test/c' },
      ],
    });
    expect(effectiveBlocklist(c)).toEqual(['Brand A', 'Placeholder Brand 1']);
  });
});

describe('CC-05 brand-blocklist', () => {
  it('passes a clean page', () => {
    expect(cc05(onePage('<p>Similar pieces from popular brands online and in malls.</p>'))).toEqual([]);
  });

  it('catches a blocklist brand in visible text, naming page, brand and channel', () => {
    const v = cc05(onePage('<p>We admire Brand A shirts.</p>'));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-05', target: '/index.html' });
    expect(v[0].detail).toContain('Brand A');
    expect(v[0].detail).toContain('visible text');
  });

  it('catches an evidence brand that is not on the blocklist', () => {
    const c = onePage('<p>Try Placeholder Brand 1 today.</p>', '', [
      { brand: 'Placeholder Brand 1', url: 'https://example.test/x' },
    ]);
    const v = cc05(c);
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain('Placeholder Brand 1');
  });

  const channels: [string, string, string, string][] = [
    ['alt', '<img src="a.png" alt="A Brand A shirt">', '', 'alt'],
    ['alt inside template', '<template><img src="a.png" alt="A Brand A shirt"></template>', '', 'alt (template)'],
    ['title', '<p>x</p>', '<title>Brand A review</title>', 'title'],
    ['meta', '<p>x</p>', '<meta name="description" content="About Brand A">', 'meta'],
    ['og', '<p>x</p>', '<meta property="og:title" content="Brand A">', 'og'],
    [
      'json-ld',
      '<p>x</p>',
      '<script type="application/ld+json">{"@type":"Thing","name":"Brand A"}</script>',
      'json-ld',
    ],
    ['aria-label', '<button aria-label="Brand A">Go</button>', '', 'aria-label'],
  ];

  for (const [name, body, head, channel] of channels) {
    it(`catches a blocklist brand in ${name}`, () => {
      const v = cc05(onePage(body, head));
      const hit = v.find((x) => x.detail.includes(`in ${channel}`));
      expect(hit, JSON.stringify(v)).toBeDefined();
      expect(hit?.detail).toContain('Brand A');
    });

    it(`catches an evidence brand in ${name}`, () => {
      const swap = (s: string) => s.replace(/Brand A/g, 'Placeholder Brand 1');
      const c = onePage(swap(body), swap(head), [{ brand: 'Placeholder Brand 1', url: 'https://example.test/x' }], []);
      const hit = cc05(c).find((x) => x.detail.includes(`in ${channel}`));
      expect(hit, name).toBeDefined();
      expect(hit?.detail).toContain('Placeholder Brand 1');
    });
  }

  it('matches folding variants: "H&M" matches "h m" and "H & M"', () => {
    for (const text of ['h m', 'H & M', 'H&M', 'h-m', 'H\u00A0&\u00A0M']) {
      const v = cc05(onePage(`<p>Seen at ${text} stores</p>`, '', [], ['H&M']));
      expect(v, text).toHaveLength(1);
    }
  });

  it('matches case-insensitively and across inline elements', () => {
    expect(cc05(onePage('<p>BRAND <em>a</em></p>'))).toHaveLength(1);
    expect(cc05(onePage('<p>brand\n   a</p>'))).toHaveLength(1);
  });

  it('respects word boundaries: no match inside a longer word', () => {
    expect(cc05(onePage('<p>Brand Abc and XBrand A and Brand Ability</p>'))).toEqual([]);
    expect(cc05(onePage('<p>Brand A.</p>'))).toHaveLength(1);
  });

  it('never flags MoolResha, even when it is in the list or evidence', () => {
    const c = onePage(
      '<p>MoolResha, Moolresha and MOOLRESHA studio</p><img alt="MoolResha logo" src="a.png">',
      '<title>MoolResha</title>',
      [{ brand: 'MoolResha', url: 'https://example.test/m' }],
      ['MoolResha', 'MOOLRESHA.'],
    );
    expect(cc05(c)).toEqual([]);
  });

  it('reports each page and channel once per brand and names the page', () => {
    const c = ctx({
      blocklist: ['Brand A'],
      pages: [
        { path: '/a.html', html: html('<p>Brand A and Brand A again</p>') },
        { path: '/b.html', html: html('<p>clean</p>') },
        { path: '/c.html', html: html('<p>Brand A</p>') },
      ],
    });
    const v = cc05(c);
    expect(v.map((x) => x.target)).toEqual(['/a.html', '/c.html']);
  });

  it('does nothing when the effective blocklist is empty', () => {
    expect(cc05(onePage('<p>Brand A</p>', '', [], []))).toEqual([]);
  });
});

describe('CC-06 evidence-not-rendered', () => {
  const evidence: Ev[] = [
    { brand: 'Placeholder Brand 1', url: 'https://shop.example-one.test/p/shirt-123?x=1' },
    { brand: 'Brand B', url: 'https://www.example-two.test/item/9' },
  ];

  it('passes clean HTML, JS, JSON and CSS files', () => {
    const v = cc06(
      ctx({
        evidence,
        files: [
          { path: '/index.html', text: html('<p>Popular brands online and in malls</p>') },
          { path: '/_astro/app.js', text: 'const a=1;fetch("/api/events");' },
          { path: '/data.json', text: '{"range":[1000,2000]}' },
          { path: '/_astro/app.css', text: 'body{margin:0}' },
        ],
      }),
    );
    expect(v).toEqual([]);
  });

  it('catches an evidence brand in a JS file and names the file', () => {
    const v = cc06(ctx({ evidence, files: [{ path: '/_astro/app.js', text: 'var n="Placeholder Brand 1";' }] }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-06', target: '/_astro/app.js' });
    expect(v[0].detail).toContain('Placeholder Brand 1');
  });

  it('catches an evidence brand in a JSON file', () => {
    const v = cc06(ctx({ evidence, files: [{ path: '/data.json', text: '{"brand":"brand b"}' }] }));
    expect(v).toHaveLength(1);
    expect(v[0].target).toBe('/data.json');
    expect(v[0].detail).toContain('Brand B');
  });

  it('catches an evidence URL in a JS file and reports the host, not the full URL', () => {
    const url = 'https://shop.example-one.test/p/shirt-123?x=1';
    const v = cc06(ctx({ evidence, files: [{ path: '/_astro/app.js', text: `var u="${url}";` }] }));
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain('shop.example-one.test');
    expect(v[0].detail).not.toContain('shirt-123');
    expect(v[0].detail).not.toContain('https://');
  });

  it('catches an evidence URL in a JSON file, including JSON-escaped slashes', () => {
    const v = cc06(
      ctx({
        evidence,
        files: [{ path: '/data.json', text: '{"u":"https:\\/\\/www.example-two.test\\/item\\/9"}' }],
      }),
    );
    expect(v).toHaveLength(1);
    expect(v[0].target).toBe('/data.json');
    expect(v[0].detail).toContain('example-two.test');
  });

  it('matches the host alone, ignoring a leading www', () => {
    const v = cc06(ctx({ evidence, files: [{ path: '/x.txt', text: 'see www.example-two.test for more' }] }));
    expect(v).toHaveLength(1);
  });

  it('does not match a host inside a longer host name', () => {
    const v = cc06(ctx({ evidence, files: [{ path: '/x.txt', text: 'notexample-two.test and example-two.testing' }] }));
    expect(v).toEqual([]);
  });

  it('catches a placeholder evidence host in client JS, and does not flag an unrelated example.com there', () => {
    const placeholder: Ev[] = [{ brand: 'Placeholder Brand 1', url: 'https://evidence.invalid/placeholder/x/1' }];
    const leaked = cc06(
      ctx({ evidence: placeholder, files: [{ path: '/_astro/app.js', text: 'var u="https://evidence.invalid/placeholder/x/1";' }] }),
    );
    expect(leaked).toHaveLength(1);
    expect(leaked[0]).toMatchObject({ rule: 'CC-06', target: '/_astro/app.js' });
    expect(leaked[0].detail).toContain('evidence.invalid');

    const hint = 'Enter a valid email address, such as name@example.com.';
    expect(cc06(ctx({ evidence: placeholder, files: [{ path: '/_astro/app.js', text: hint }] }))).toEqual([]);
  });

  it('still flags example.com in client JS when an evidence URL really uses that host', () => {
    const real: Ev[] = [{ brand: 'Brand B', url: 'https://example.com/item/9' }];
    const v = cc06(ctx({ evidence: real, files: [{ path: '/_astro/app.js', text: 'such as name@example.com.' }] }));
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain('example.com');
  });

  it('does not flag MoolResha evidence and ignores files with no evidence', () => {
    expect(
      cc06(
        ctx({
          evidence: [{ brand: 'MoolResha', url: 'https://example.test/m' }],
          files: [{ path: '/a.js', text: 'MoolResha' }],
        }),
      ).filter((x) => x.detail.includes('brand')),
    ).toEqual([]);
    expect(cc06(ctx({ files: [{ path: '/a.js', text: 'Brand A' }] }))).toEqual([]);
  });
});
