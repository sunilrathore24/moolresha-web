# moolresha-web

The **MoolResha** website — _Closer to the Root._

An education-first, static, visually rich textile-knowledge platform that helps people become more informed clothing buyers. Built one shippable increment at a time.

> Governed by the skill + docs in the `frontend-basics/ourbrand/` folder of the companion repo:
> `moolresha-website-skill/SKILL.md` (build roadmap), `moolresha-content-philosophy.md` (content north star), `website-traffic-and-trust-strategy.md` (the why).

## Stack

- **Astro + MDX + TypeScript** — static-first, minimal client JS.
- **Cloudflare Pages** — hosting + auto-deploy on push. Preview deploys on PRs.
- **Cloudflare Pages Functions + KV/D1** — the thin dynamic layer for the three interactions (like / comment / subscribe) only.
- **MailerLite** — newsletter (double opt-in, real sending).
- **GA4 + Google Search Console** — analytics + search.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # production build → dist/
npm run preview  # preview the build
```

## Principles

- One shippable increment per run; the site stays buildable and deployable always.
- Education-first, never a storefront. Facts must be true and sourceable.
- Static-first; only like/comment/subscribe touch the dynamic layer.
- Every open API endpoint is rate-limited + bot-protected (see `docs/rate-limiting.md`).

## Build order

See `SKILL.md` §4 in the companion repo. Foundation → findable/measurable → interactions → fill the library.
