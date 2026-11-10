# Handoff: launch-feedback-website

Read this first, then requirements.md, design.md and tasks.md in this folder.

## Where we are
- Done: tasks 1.1, 1.2, 1.3, 2.1, 2.3 (tooling, allow-lists, generators, fact schema and seed facts, price bands). 70 tests pass.
- Next: task 2.5 (Concept schema, Quality_Card shape, five seeded Concept YAMLs), then continue in order in tasks.md.
- Optional tasks (marked `*`) are property tests. Write them next to the code they check.
- Check the `[x]` marks in tasks.md for the true state.

## Rules that always apply
- Never run curl, wget, httpie, aria2c, nc, scp/rsync from remote hosts, git clone of external repos, or any script that fetches from the internet. Never download or save web files. Plain `npm install` is fine. Ask the user before any network command.
- Tests: `npx vitest --run` only (never watch mode). Do not start long-running dev servers without need.
- No brand names on any rendered page. No MoolResha price and no rupee totals. Price is answered only by a Rs 500-step band or "Skip this question". No health claims ("skin-friendly", "hypoallergenic" and similar). Founder is anonymous: "MoolResha studio, Indore".
- Images are not ready yet. Everything must work with the Image_Placeholder. Only `PUBLIC_LAUNCH=true` builds fail on missing images.
- Open items (GST on co-ords, retention periods, repo privacy, Price_Layers copy, rate limits) are config or placeholder copy marked `confirm`. They do not block tasks.
- Facts must be sourced. Do not invent statistics or sources. Unverified facts get `verifyFlag: true`.

## Decisions made so far
- `SECTIONS` in allow-lists.ts is the four-value events list. `PAGE_SECTIONS` is the eleven-section page order (used by CC-15 and task 8.10).
- Over-band lower bound may equal the previous upper bound or that bound + 1 (per design contiguity rule).
- Fact placeholders use label `MoolResha estimate` with `verifyFlag: true`; CC-02 blocks them from published pages until verified.

## Not in this repo
- The market research and brand evidence trail is in the other workspace (`ourbrand/launch-website-research-and-plan.md`). It names brands, so it was not copied here. Confirm repo privacy before adding evidence.

## After the build
- Write ChatGPT image prompts: 8 views x 5 concepts, using each Concept YAML's alt text as the brief. File names: `src/assets/concepts/<concept-id>/01-front ... 08-on-model`.
- Test with a local build plus Chrome DevTools / Playwright MCP, then report results.
