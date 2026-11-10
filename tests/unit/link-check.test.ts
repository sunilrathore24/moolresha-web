import { describe, expect, it } from 'vitest';
import {
  collectAnchors,
  findBrokenLinks,
  formatBrokenLinks,
  pageUrlPath,
  type Page,
} from '../../scripts/link-check';

const page = (path: string, body: string): Page => ({
  path,
  html: `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`,
});

const site: Page[] = [
  page(
    'index.html',
    `<a href="/about">About</a><a href="/privacy#data">Data</a><a href="#concepts">Concepts</a>
     <section id="concepts"><h2 id="top-h">x</h2></section>`,
  ),
  page('about/index.html', '<a href="/">Home</a><a href="../privacy">Privacy</a><a href="/about#who">Who</a><h2 id="who">Who</h2>'),
  page('privacy/index.html', '<h2 id="data">Data</h2><a name="legacy"></a>'),
];

describe('pageUrlPath', () => {
  it('maps dist files to served paths', () => {
    expect(pageUrlPath('index.html')).toBe('/');
    expect(pageUrlPath('about/index.html')).toBe('/about');
    expect(pageUrlPath('article/buying-a-linen-shirt/index.html')).toBe('/article/buying-a-linen-shirt');
    expect(pageUrlPath('404.html')).toBe('/404.html');
  });
});

describe('collectAnchors', () => {
  it('collects ids and a[name]', () => {
    const anchors = collectAnchors('<div id="a"></div><a name="b"></a><p name="not-an-anchor"></p>');
    expect([...anchors].sort()).toEqual(['a', 'b']);
  });
});

describe('findBrokenLinks', () => {
  it('returns nothing when every link resolves to a file and anchor', () => {
    expect(findBrokenLinks(site)).toEqual([]);
  });

  it('reports a missing page with the source page', () => {
    const broken = findBrokenLinks([...site, page('x/index.html', '<a href="/nope">n</a>')]);
    expect(broken).toEqual([{ source: 'x/index.html', href: '/nope', reason: 'missing-file', target: '/nope' }]);
  });

  it('reports a missing anchor on an existing target page', () => {
    const broken = findBrokenLinks([
      ...site,
      page('y/index.html', '<a href="/privacy#nothing">a</a><a href="#nowhere">b</a>'),
    ]);
    expect(broken).toEqual([
      { source: 'y/index.html', href: '#nowhere', reason: 'missing-anchor', target: 'y/index.html' },
      { source: 'y/index.html', href: '/privacy#nothing', reason: 'missing-anchor', target: 'privacy/index.html' },
      // sorted by code point: "#" sorts before "/"
    ]);
  });

  it('accepts a[name] anchors and percent-encoded fragments', () => {
    const pages = [
      page('index.html', '<a href="/p#legacy">a</a><a href="/p#caf%C3%A9">b</a>'),
      page('p/index.html', '<a name="legacy"></a><h2 id="café">c</h2>'),
    ];
    expect(findBrokenLinks(pages)).toEqual([]);
  });

  it('resolves relative links against the served URL (no trailing slash)', () => {
    // /article/post is served from article/post/index.html, so "../about" is /about.
    const pages = [
      page('index.html', ''),
      page('about/index.html', ''),
      page('article/post/index.html', '<a href="../about">ok</a><a href="./other">bad</a>'),
    ];
    expect(findBrokenLinks(pages)).toEqual([
      { source: 'article/post/index.html', href: './other', reason: 'missing-file', target: '/article/other' },
    ]);
  });

  it('resolves links to non-HTML files from the asset list', () => {
    const pages = [page('index.html', '<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/_astro/a.css"><a href="/files/x.pdf">x</a>')];
    expect(findBrokenLinks(pages, ['favicon.svg', '_astro/a.css'])).toEqual([
      { source: 'index.html', href: '/files/x.pdf', reason: 'missing-file', target: '/files/x.pdf' },
    ]);
  });

  it('ignores external, mailto, tel and javascript links, and empty or top fragments', () => {
    const pages = [
      page(
        'index.html',
        `<a href="https://example.com/missing">e</a><a href="//cdn.example.com/x">p</a>
         <a href="mailto:hello@example.com">m</a><a href="tel:+911234567890">t</a>
         <a href="javascript:void(0)">j</a><a href="#">h</a><a href="#top">top</a><a href="">empty</a>
         <link rel="canonical" href="https://www.moolresha.com/">`,
      ),
    ];
    expect(findBrokenLinks(pages)).toEqual([]);
  });

  it('lists broken links from several pages, sorted by source then href', () => {
    const pages = [
      page('b/index.html', '<a href="/z">z</a><a href="/q">q</a>'),
      page('a/index.html', '<a href="/m">m</a>'),
    ];
    const broken = findBrokenLinks(pages);
    expect(broken.map((b) => `${b.source} ${b.href}`)).toEqual(['a/index.html /m', 'b/index.html /q', 'b/index.html /z']);
  });

  it('resolves a query string to the same file', () => {
    expect(findBrokenLinks([page('index.html', '<a href="/about?ref=x">a</a>'), page('about/index.html', '')])).toEqual([]);
  });
});

describe('formatBrokenLinks', () => {
  it('names each broken link with its source page', () => {
    const text = formatBrokenLinks(
      [{ source: 'index.html', href: '/nope', reason: 'missing-file', target: '/nope' }],
      3,
    );
    expect(text).toContain('1 broken internal link');
    expect(text).toContain('index.html: href="/nope"');
  });

  it('reports OK when there are none', () => {
    expect(formatBrokenLinks([], 3)).toContain('OK');
  });
});
