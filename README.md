# moolresha-web

The **MoolResha** website — _Closer to the Root._

An education-first, static, visually rich textile-knowledge platform that helps people become more informed clothing buyers. Built one shippable increment at a time.

> Governed by the skill + docs in the `frontend-basics/ourbrand/` folder of the companion repo:
> `moolresha-website-skill/SKILL.md` (build roadmap), `moolresha-content-philosophy.md` (content north star), `website-traffic-and-trust-strategy.md` (the why).

## Stack

- **Astro + MDX + TypeScript** — static-first, minimal client JS.
- **Cloudflare Pages** — hosting + auto-deploy on push. Preview deploys on PRs.
- **Cloudflare Pages Functions + D1** — the thin dynamic layer: Concept feedback, frustrations, interest sign-ups, event counts and cached results.
- **MailerLite** — email sign-ups (double opt-in).
- **Cloudflare Web Analytics + Google Search Console** — analytics + search. Cloudflare Web
  Analytics is cookieless and needs no code change here: enable it for the zone in the
  Cloudflare dashboard. (Not GA4 — chosen so the site adds no new data processor beyond
  Cloudflare, which the Privacy_Notice already discloses.)
- First-party, privacy-conscious usage counts also exist in-app: `/api/events` (anonymous
  day/event/Concept/section/UTM counts, no IP/UA/PII) and `/api/results` (the public, cached
  aggregate feeding "What others have said so far"). `/api/admin/export/*.csv` gives raw
  aggregate/feedback CSV pulls behind `ADMIN_BEARER_SECRET` + Cloudflare Access.

## Local development

```bash
npm install
npm run dev          # Astro dev server (Astro's default port is 4321)
npm test             # vitest --run
npm run check        # astro check + tsc --noEmit -p functions
npm run build:local  # dist/ without content-check or the launch gate
npm run build        # full build, as Cloudflare Pages runs it
npm run preview      # preview the build
```

### Build commands

- `build:local` runs `gen-allow-lists`, `astro build`, `js-budget` and `link-check`.
- `build` runs the same steps plus `content-check` and `launch-gate`. `content-check` fails when a published page references a fact marked `UNVERIFIED` or `verifyFlag: true` (rule CC-02). The placeholder facts in `src/content/facts/` are marked that way, so use `build:local` until they are replaced with sourced facts.
- `launch-gate` does nothing unless `PUBLIC_LAUNCH=true`.

### Environment files

- `.env` (gitignored): set `PUBLIC_TURNSTILE_SITE_KEY`. Astro reads it for the browser Turnstile widget. See `.env.example`.
- `.dev.vars` (gitignored): copy `.dev.vars.example` and fill in the Pages Function secrets (`TURNSTILE_SECRET`, `MAILERLITE_API_KEY`, `ML_GROUP_ID`, `ADMIN_BEARER_SECRET`, `IDENTITY_SALT_SEED`, optional `PREVIEW_ORIGIN`). It is read by `wrangler pages dev`, not by `astro dev`. In production these are Cloudflare secrets and variables. `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` (Cloudflare Access for the admin exports) are also read by the functions but are not in the example file.

### Placeholder images

Concept images go in `src/assets/concepts/<concept-id>/`. In a normal build a missing image shows a placeholder and prints a warning. With `PUBLIC_LAUNCH=true`, a missing image fails the build, and `launch-gate` also fails while the lawyer-review or on-model-review lines in `docs/launch-checklist.md` have no `YYYY-MM-DD` date.

## Principles

- One shippable increment per run; the site stays buildable and deployable always.
- Education-first, never a storefront. Facts must be true and sourceable.
- Static-first; only the `/api/*` feedback, interest, events and results endpoints touch the dynamic layer.
- Every open API endpoint is rate-limited + bot-protected (see `docs/rate-limiting.md`).

## Build order

See `SKILL.md` §4 in the companion repo. Foundation → findable/measurable → interactions → fill the library.
