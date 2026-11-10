# Implementation Plan: launch-feedback-website

## Overview

This plan builds the launch feedback website in the separate `moolresha-web` repo at `/Users/srathore/code/frontend/moolresha-web` (Astro + MDX + TypeScript, Cloudflare Pages, Pages Functions, D1). All paths below are relative to that repo. Do not add that repo to this workspace.

The order is test-driven and incremental:

1. Shared constants, content schemas and pure libraries, each with its property tests.
2. The Concept image pipeline and the Angle_Viewer state module.
3. The static page sections, which render without JavaScript.
4. The Content_Check rules, the JS budget, the link check and the launch gate, wired into `npm run build`.
5. The D1 schema, the shared Function helpers and the API endpoints.
6. The client islands (feedback with price skip and market reveal, Priority_Chips, Angle_Viewer, interest, results, events).
7. Deletion tooling, CI, end-to-end, accessibility and performance checks.

Constraints that apply to every task:

- No brand names anywhere on rendered pages. No MoolResha price and no ₹ cost totals. The price question is answered only by a ₹500-step Price_Band or "Skip this question". No health claims. The founder stays anonymous ("MoolResha studio, Indore").
- Concept images may be missing. Every task must work with the Image_Placeholder until the founder drops files into `src/assets/concepts/<concept-id>/01-front … 08-on-model`. A non-launch build only warns; only a `PUBLIC_LAUNCH=true` build fails on missing files.
- Open items (GST on co-ord sets, retention periods, repo privacy for the market-scan evidence trail, Price_Layers copy, rate-limit numbers) do not block any task. Use the design's proposed values as editable config or placeholder copy, marked `⚠️ confirm`.
- Never run `curl`, `wget` or any command that downloads from the internet inside scripts or tests. Test fixtures (for example PNGs for the image loader) are generated in-process. Package installation is a normal `npm install` that the developer runs.
- Tests run with `vitest --run` (never watch mode). Property tests use fast-check through `@fast-check/vitest`, at least 100 runs each, tagged `// Feature: launch-feedback-website, Property N: <title>`.

## Tasks

- [x] 1. Set up tooling, shared constants and test scaffolding
  - [x] 1.1 Add dev dependencies and test configuration
    - Add `vitest`, `fast-check`, `@fast-check/vitest`, `zod`, `node-html-parser`, `better-sqlite3`, `happy-dom`, `tsx`, `@playwright/test`, `@axe-core/playwright`, `@lhci/cli` and `wrangler` to `package.json` (developer runs `npm install`)
    - Create `vitest.config.ts` with `environment: 'node'` by default and a `happy-dom` environment for `tests/islands/**`
    - Create `tests/properties/`, `tests/unit/`, `tests/islands/`, `tests/build/`, `tests/integration/`, `tests/e2e/` and `tests/generators/`
    - Set `package.json` scripts: `build` (`tsx scripts/gen-allow-lists.ts && astro build && tsx scripts/content-check.ts && tsx scripts/js-budget.ts && tsx scripts/link-check.ts`, with `launch-gate.ts` added in task 10), `test` (`vitest --run`), `check` (`astro check && tsc --noEmit -p functions`)
    - Add `functions/tsconfig.json` for the Pages Functions
    - _Requirements: 20.2, 21.1_

  - [x] 1.2 Create the single-source allow-lists and view names
    - Create `src/content/config/allow-lists.ts` (no Astro imports) with `CONCEPT_IDS`, `VERDICTS`, `CHANGE_CHIPS`, `PALETTE`, `FRUSTRATION_CHIPS`, `SIZES`, `EVENTS_CLIENT`, `EVENTS_SERVER`, `SECTIONS`, `PRIORITY_CHIPS`, `PRIORITY_LABELS` and their derived types
    - Create `src/lib/concept-views.ts` with `TURN_VIEWS`, `TAB_VIEWS`, `VIEW_BASES`, `VIEW_NAMES` and the `ViewBase`, `TurnView`, `TabView` types
    - _Requirements: 8A.1, 8A.2, 8B.2, 9.1, 9.2, 9.4, 9.18, 10.1, 12.11, 14.6_

  - [x] 1.3 Create the shared generator module skeleton
    - Create `tests/generators/index.ts` exporting arbitraries built from `allow-lists.ts` (`conceptId()`, `verdict()`, `chipSubset()`, `nastyString()`); later tasks add their generators here
    - _Requirements: 14.6_

- [x] 2. Build the Fact_Registry and core content schemas
  - [x] 2.1 Define the Fact schema and fact helpers
    - In `src/content.config.ts`, add the `facts` collection with the `Fact` discriminated union (`FACT`, `INDUSTRY CLAIM`, `BRAND CLAIM` with `source`; `MoolResha estimate` with `assumptions`; `MoolResha market scan` with `methodNote`), plus `strength`, `lastChecked`, `verifyFlag`, `substantiates`, `mill`, `certification`, `section`
    - Create `src/lib/facts.ts` with `getFact(id)` (throws at build time on an unknown id) and a pure `factViewModel(entry)` that returns the label, id, and Source_Link / assumptions / method note according to the label
    - Seed `src/content/facts/gst-cliff-2025.yaml` (PIB, September 2025, 5% up to ₹2,500 and 18% above) and placeholder entries for each journey stop, money breakdown, why and trends, marked `verifyFlag: true` where sources are not yet confirmed
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.6_

  - [ ]* 2.2 Write property test for fact rendering
    - **Property 15: Fact rendering carries the right label and evidence**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.8, 7.6**

  - [x] 2.3 Implement Price_Band schema, labels and contiguity validation
    - Add the `PriceBand` discriminated union (`under`, `range`, `over`) to the concept schema
    - Create `src/lib/price-bands.ts` with `validatePriceBands(bands): BandError[]` per the design rules, `bandLabel(band)` using `Intl.NumberFormat('en-IN')` ("Under ₹1,000", "₹1,500–1,999", "₹3,000+") and band-id helpers
    - Add `tests/generators/price-ladder.ts` with `priceLadder()` and `mutateLadder()`
    - _Requirements: 9.5, 9.7, 9.8_

  - [ ]* 2.4 Write property test for Price_Band contiguity
    - **Property 1: Price-band contiguity validation**
    - **Validates: Requirements 9.8**

  - [x] 2.5 Define the Concept schema with views, Fabric_Notes and Quality_Card shape
    - Add the `concepts` collection: `id`, `order`, `featured`, `name`, `laterProduct`, `views` (`ConceptViews` with `kind` and all eight `alt` entries), `quality` (`QualityCard` of seven `QualityRow`s with the `superRefine` rules), `fabricNotes` (composition summing to 100, optional `yarnQuality` with `factId`), `priceBands`, `marketScanId`, `colours`
    - Export `QUALITY_ROWS`, `QUALITY_ROW_NAMES`, `QUALITY_LABELS`
    - Create `src/lib/coord-composition.ts` with `isValidCoordComposition(parts)` (100% cotton, or cotton plus 10–20% linen summing to 100)
    - Seed the five Concept YAML files under `src/content/concepts/` with the Requirement 9.7 Price_Band tables (₹500 steps), placeholder Fabric_Notes and Quality_Card rows (`Target` ranges and `WeWillTest` rows, no exact GSM or yarn count, no "combed"/"long-staple"), and eight alt texts per Concept that name the Concept and the view
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8A.13, 8C.1, 8C.2, 8C.4, 8C.5, 8C.6, 9.7_

  - [ ]* 2.6 Write property test for the co-ord composition rule
    - **Property 21: Co-ord composition rule**
    - **Validates: Requirements 8.5**

  - [ ]* 2.7 Write unit tests for the seeded Concept content
    - All five configured Price_Band tables pass `validatePriceBands`
    - Every alt text contains the Concept name and the `VIEW_NAMES` view name (case-insensitive)
    - Exactly five Concepts, `mens-cotton-shirt` first and `featured: true`, `mens-linen-shirt` has `laterProduct: true`
    - _Requirements: 8.1, 8A.13, 9.7_

  - [x] 2.8 Define Market_Price_Context, Price_Layers, Story and word-rules schemas
    - Add the `market-scans` collection with `MethodNote`, private `evidence[]` and the four refinements (range order, listings count = evidence rows, prices within range, dates within window)
    - Create `toPublicMarketScan(scan)` in `src/lib/market-scan.ts` returning only the range, Claim_Label and method note
    - Add the `price-layers` collection (nine `PRICE_LAYER_IDS` in order, one-line explanations, literal launch promise, `gstFactId: gst-cliff-2025`) and seed `price-layers.yaml` with placeholder explanations marked `⚠️ founder copy`
    - Add the `story` collection with literal `leadMessage`, `aimLabel`, `aimStatement` and seed `story.yaml`
    - Add `src/content/config/word-rules.yaml` (`restricted`, `superlatives`, `numericAllow`, `restrictedPhrases`, `healthTerms` including the five required terms plus proposed `hypo-allergenic`) and `brand-blocklist.yaml`, both schema-validated
    - Seed one market-scan YAML per Concept with placeholder ranges and evidence (`⚠️ confirm repo privacy` comment)
    - _Requirements: 4.7, 5.5, 6.1, 6.2, 6.3, 6.4, 7.1, 7.6, 7.7, 7.9, 7.10, 8C.11, 11A.1, 11A.6_

  - [ ]* 2.9 Write property test for market-scan public projection
    - **Property 12: Market-scan evidence never reaches the public projection**
    - **Validates: Requirements 7.6, 7.7, 7.10**

  - [ ]* 2.10 Write property test for market-scan internal consistency
    - **Property 13: Market-scan internal consistency**
    - **Validates: Requirements 7.7, 7.9**

  - [x] 2.11 Generate the Price_Band allow-list for the server
    - Create `scripts/gen-allow-lists.ts` that reads the concepts YAML and writes `src/content/config/allow-lists.generated.ts` with `PRICE_BAND_IDS: Record<ConceptId, readonly string[]>`
    - Commit a `.gitignore` entry or a checked-in generated file per repo convention
    - _Requirements: 9.5, 9.14, 14.6_

- [x] 3. Implement text matching and Quality_Card checks
  - [x] 3.1 Implement the shared text matchers
    - Create `src/lib/text-match.ts` with `normaliseForMatch`, `phrasePattern`, `findPhrase` (whitespace runs, line breaks and NBSP match one space), `HYPHENS`, `foldForHealthMatch` (NFKC, lower case, strip zero-width), `healthTermPattern` and `findHealthTerms`
    - Add brand-name normalisation (`foldForBrandMatch`: NFKC, lower case, punctuation to space, whitespace collapsed, word boundaries)
    - _Requirements: 7.12, 8C.12, 11A.8_

  - [x] 3.2 Implement Quality_Card checks
    - Create `src/lib/quality-card.ts` with `checkQualityCard(rows: unknown[], facts)` returning `QualityIssue[]` that name the row, and `findSpecValues(text)` for GSM and yarn counts (single values and ranges, `40/1` as a single count)
    - Add `tests/generators/quality-rows.ts` with `qualityRows()` and its tagged mutations
    - _Requirements: 8C.1, 8C.2, 8C.3, 8C.5, 8C.6, 8C.7, 8C.8_

  - [ ]* 3.3 Write property test for Quality_Card checks
    - **Property 44: Quality_Card checks accept exactly the valid cards and name the row**
    - **Validates: Requirements 8C.1, 8C.2, 8C.3, 8C.5, 8C.8**

  - [ ]* 3.4 Write property test for exact spec values
    - **Property 45: Exact yarn counts and GSM need a FACT; ranges need a Target**
    - **Validates: Requirements 8C.6, 8C.7**

  - [ ]* 3.5 Write unit tests for the seeded Quality_Cards and word rules
    - Every seeded Quality_Card passes `checkQualityCard` against the real Fact_Registry
    - `word-rules.yaml#healthTerms` contains the five required entries; `restrictedPhrases` contains the three required entries
    - _Requirements: 8C.1–8C.5, 8C.11, 11A.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Build the Concept image pipeline
  - [x] 5.1 Implement the pure image resolver
    - Create `src/lib/concept-image-resolver.ts` with `resolveConceptImages(images, allPaths, conceptIds, mode)` per the design rules: exact lower-case match on the eight base names and `.png`/`.jpg`/`.webp`; duplicates are errors in every mode; missing views become `placeholder` with a warning in `dev` and an error in `public-launch`; unrecognised paths and non-Concept folders are warnings only; deterministic, sorted output
    - Add `tests/generators/concept-image-paths.ts` with `conceptImagePaths()`
    - _Requirements: 8B.1, 8B.2, 8B.3, 8B.5, 8B.6, 8B.7, 8B.8_

  - [ ]* 5.2 Write property test for resolver views and placeholders
    - **Property 41: The image resolver always yields eight views, with placeholders exactly where files are missing**
    - **Validates: Requirements 8B.1, 8B.2, 8B.3, 8B.5**

  - [ ]* 5.3 Write property test for resolver messages by mode
    - **Property 42: Resolver messages depend on the mode as specified**
    - **Validates: Requirements 8B.6, 8B.7, 8B.8**

  - [ ]* 5.4 Write property test for resolver determinism
    - **Property 43: Resolver output is deterministic**
    - **Validates: Requirements 8B.3, 8B.6, 8B.7, 8B.8**

  - [x] 5.5 Implement the Astro image loader and loading helper
    - Create `src/lib/concept-images.ts` using `import.meta.glob` (eager images plus keys-only listing), mode from `PUBLIC_LAUNCH`, printing warnings and throwing one combined error
    - Create `src/lib/image-loading.ts` with `loadingFor({ conceptIndex, view, slot, firstCardAboveFold })`
    - Create `src/assets/concepts/<concept-id>/` folders for all five Concepts with a `.gitkeep` only (images arrive later)
    - _Requirements: 8A.14, 8B.1, 8B.3, 8B.6, 8B.7, 20.3_

  - [ ]* 5.6 Write property test for image loading attributes
    - **Property 40: Only a first card's front view above the fold loads eagerly**
    - **Validates: Requirements 8A.14, 20.3**

  - [x] 5.7 Create image components
    - Create `src/components/launch/ConceptViewImage.astro` (Astro `<Picture>`, `formats={['avif','webp']}`, `fallbackFormat="webp"`, stage widths `[360, 540, 720, 1080, 1440]`, grid widths `[180, 360]`, `draggable="false"`, `decoding="async"`, `loading` from `loadingFor`)
    - Create `ImagePlaceholder.astro` (`role="img"`, label "Image coming soon: {Concept name}, {view name} view", visible "Image coming soon", neutral tokens, Concept frame aspect ratio or 4:5, no Render_Label)
    - Create `RenderLabel.astro` with the text "AI design render, not a photo of a finished garment"
    - _Requirements: 8A.12, 8A.13, 8B.4, 8B.9, 20.3_

  - [ ]* 5.8 Write the image loader build fixture test
    - `tests/build/concept-images.test.ts`: create a temp project with `fs.mkdtemp`, generate small PNGs in-process with Sharp (no download), run `astro build` with `PUBLIC_LAUNCH` unset and `true`, assert exit codes and messages for a missing view, a duplicate base name, an unrecognised name, and a complete set (served images AVIF/WebP with width and height); delete the temp folder afterwards
    - _Requirements: 8B.1–8B.8_

- [x] 6. Build the Angle_Viewer
  - [x] 6.1 Implement the pure Angle_Viewer state module
    - Create `src/islands/angle-viewer-state.ts` with `ViewerState`, `INITIAL`, `next`, `prev`, `goto`, `toggleTab`, `shown`, `canPrev`, `canNext`, `positionText`, `hintView`, `dragOutcome`, `keyOutcome` (clamping, tabs never move `turn`)
    - Add `tests/generators/viewer-actions.ts` with `viewerActions()` and `reachableState()`
    - _Requirements: 8A.1, 8A.2, 8A.3, 8A.4, 8A.5, 8A.6, 8A.7, 8A.10_

  - [ ]* 6.2 Write property test for the turn axis
    - **Property 36: Angle_Viewer turn axis clamps and follows the Turn_View order**
    - **Validates: Requirements 8A.1, 8A.4, 8A.6, 8A.7**

  - [ ]* 6.3 Write property test for tabs
    - **Property 37: Angle_Viewer tabs never move the remembered turn**
    - **Validates: Requirements 8A.2**

  - [ ]* 6.4 Write property test for drag and key direction
    - **Property 38: Drag and key direction rules**
    - **Validates: Requirements 8A.3, 8A.5**

  - [ ]* 6.5 Write property test for position text
    - **Property 39: Position text names the view and its place**
    - **Validates: Requirements 8A.10**

  - [x] 6.6 Create the server-rendered Angle_Viewer component
    - Create `src/components/launch/AngleViewer.astro` per the design markup: focusable stage (`role="group"`, `tabindex="0"`, `aria-label` naming the arrow keys) with frame 01, hidden position indicator and controls (Previous view, Next view, and the "Inside", "Fabric close-up", "On a model" `aria-pressed` buttons), frames 02–08 inside an inert `<template>`, and a visible `.av-grid` of all eight views with view names and the Render_Label when `kind: render`
    - Use `ConceptViewImage` or `ImagePlaceholder` per resolved view
    - Add CSS: `touch-action: pan-y` on the stage, `.av-frame { transition: opacity 250ms ease }`, `transition: none` under `prefers-reduced-motion: reduce`, visible focus styles, `aria-disabled` styling
    - _Requirements: 8A.1, 8A.2, 8A.8, 8A.9, 8A.11, 8A.12, 8A.16, 21.2, 21.6_

  - [x] 6.7 Implement the Angle_Viewer island
    - Create `src/islands/angle-viewer-island.ts`: clone template frames, hide the grid, reveal controls; one `render(prev, next)` function driving `data-current`, `aria-disabled`, `aria-pressed` and the live region; buttons, ArrowLeft/ArrowRight with `preventDefault` only for those keys; pointer drag and swipe with `setPointerCapture`, `pointercancel` handling and `threshold = max(24, 0.08 × stage width)`; tab toggles; crossfade with `decode()` capped at 300 ms and `transitionend` or 300 ms fallback; hover hint only under `(hover: hover)`; reduced-motion instant swaps with a media-query listener; neighbour prefetch on first interaction
    - Load it from `AngleViewer.astro` with a module `<script>`; no third-party library
    - _Requirements: 8A.2, 8A.3, 8A.4, 8A.5, 8A.6, 8A.7, 8A.8, 8A.9, 8A.10, 8A.15_

  - [ ]* 6.8 Write happy-dom tests for the Angle_Viewer island
    - Start-up state, Next/Previous clamping with focus kept, arrow keys, the three tab buttons, live region text, reduced-motion and hover-hint behaviour, and the no-JS markup (grid of eight in order with Render_Label, controls hidden, template images not loaded)
    - _Requirements: 8A.2, 8A.4–8A.12_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Build the static page sections
  - [x] 8.1 Create fact rendering components
    - Create `FactText.astro` (`<span class="fact" data-fact-id>` with text, label and evidence from `factViewModel`), `ClaimLabel.astro`, `SourceLink.astro` (`rel="noopener noreferrer"`, `target="_blank"`, visually hidden "(opens in a new tab)") and `LastUpdated.astro` (latest `lastChecked` among a section's facts)
    - _Requirements: 1.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 21.2_

  - [x] 8.2 Create the hero, research notice, header and hub-page handling
    - Create `Hero.astro` (wordmark, one headline, one supporting line, one real fabric photograph with `fetchpriority="high"`, one CTA `<a href="#concepts">`) and `ResearchNotice.astro` ("A research project, not a shop")
    - Limit header links to in-page anchors, Journal and Privacy; add `noindex` to the four Hub_Pages and filter them from `@astrojs/sitemap`
    - Self-host fonts with `font-display: swap`; use only existing tokens in `src/styles/tokens.css`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 2.4, 20.5_

  - [x] 8.3 Create the cotton journey and Aim_Statement
    - Create `CottonJourney.astro` and `JourneyStop.astro`: an `<ol>` of eight `<details open>` stops (field, ginning, spinning, weaving, processing, stitching, warehousing and distribution, retail), each with at least one `FactText`, plus `LastUpdated`
    - Create `AimStatement.astro` rendering `<p class="aim" data-aim><strong>Our aim</strong> …</p>` from `story.yaml` directly after the `</ol>`, outside any `.fact`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 11A.2_

  - [x] 8.4 Create the money breakdown and Price_Layers sections
    - Create `MoneyBreakdown.astro`: Lead_Message as the `<h2>`, CSS-only bar chart with visible value labels, equivalent `<table>`, labelled as a European example with Source_Link; any worker share via `FactText`
    - Create `PriceLayers.astro`: `<ol>` of the nine layers with names and one-line explanations, the launch promise, and `<FactText id="gst-cliff-2025" />`; no amounts, percentages, subtotals or totals
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 21.4_

  - [x] 8.5 Create Fabric_Notes, Quality_Card and How we check
    - Create `FabricNotes.astro` (composition with %, yarn quality only when `yarnQuality.factId` exists, weave, weight, hand feel, softness, care)
    - Create `QualityCard.astro` per the design markup: seven rows in order, one visible label each, `FACT` rows via `FactText`, `Target` rows with the range and "Target spec, to be confirmed with our mill", `We'll test` rows with "What we'll test: … What we'll publish: …", and a link to `#how-we-check`
    - Create `HowWeCheck.astro` (`<section id="how-we-check">`) with draft plain-language copy for `FACT`, `Target` and `We'll test`
    - _Requirements: 8.3, 8.4, 8.8, 8C.1, 8C.2, 8C.3, 8C.4, 8C.5, 8C.6, 8C.9, 8C.10, 21.4_

  - [x] 8.6 Create the Concept feedback form with price skip and Priority_Chips
    - Create `ConceptFeedbackForm.astro` as a real `<form method="post" action="/api/feedback">`: verdict radio group ("Would wear", "Maybe", "Not for me"); Change_Chip checkboxes with a hidden "other" text field (`maxlength="200"`); Palette_Colour radio swatches with text names; "What matters most to you?" `<fieldset>` of six Priority_Chip checkboxes labelled from `PRIORITY_LABELS`; `fieldset[data-price-question]` with the exact question wording, Price_Band radios labelled by `bandLabel`, and a `<button type="button" aria-pressed="false">Skip this question</button>`; hidden submit button, `<noscript>` note and a `role="status"` live region
    - No free-text or numeric price input, and no buy, add to cart, pre-order or launch-price wording
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.9, 9.11, 9.12, 9.18, 21.3, 21.4_

  - [x] 8.7 Create the Market_Price_Context and assemble the Concept_Card
    - Create `MarketPriceContext.astro` rendering `<details class="market-context" data-market-for data-reveal="pending">` with the summary "See what similar pieces cost", the range as a `.fact` ("Similar pieces from popular brands online and in malls: about ₹X–Y") with the `MoolResha market scan` label and method note, and "Prices vary within every brand and change often."; it receives only `toPublicMarketScan(scan)`
    - Create `ConceptCard.astro` in this order: name and "Concept, not for sale", `AngleViewer`, `FabricNotes`, `QualityCard`, `ConceptFeedbackForm`, `MarketPriceContext`
    - Create `ConceptsSection.astro` (cotton shirt first, full width; `firstCardAboveFold = false`; `HowWeCheck` after the last card)
    - _Requirements: 2.2, 7.1, 7.5, 7.6, 7.7, 7.8, 7.10, 7.13, 8.1, 8.2, 8.6, 8.7, 8.8_

  - [x] 8.8 Create the why, trends, frustration, interest, results and footer sections
    - Create `WhyItMatters.astro` and `Trends.astro` / `TrendCard.astro` (three to five cards, one `FactText` each)
    - Create `FrustrationForm.astro` (checkbox group of the eight Frustration_Chips, hidden "other" field, `<noscript>` note, live region)
    - Create `InterestForm.astro` (notice before fields with a Privacy_Notice link and `NOTICE_VERSION`; optional email, WhatsApp and size fields; separate unticked email, WhatsApp and link consents; 18+ confirmation; field-level error slots)
    - Create `ResultsView.astro` ("Results load here" placeholder plus `<noscript>` link)
    - Extend `Footer.astro` with "MoolResha studio, Indore", contact email, Privacy_Notice link, Grievance_Contact, "A research project, not a shop", Journal link, and an optional entity name and address from config
    - _Requirements: 10.1, 10.2, 11.1, 11.2, 12.1, 12.2, 12.3, 12.6, 12.11, 16.4, 19.1, 19.2, 19.4, 2.5_

  - [x] 8.9 Create the Privacy_Notice page
    - Create `src/content/config/privacy.yaml` (version, last-updated date, data-item table, processors, withdrawal, deletion, response times, Grievance_Contact), with retention periods and response times as placeholders marked `⚠️ founder and lawyer to confirm`
    - Create `src/pages/privacy.astro` and generate `NOTICE_VERSION` from `privacy.yaml#version`
    - _Requirements: 13.1, 13.2, 13.3, 13.7, 13.8_

  - [x] 8.10 Compose the Launch_Page
    - Update `src/pages/index.astro` to render the sections with `data-section` values in order: `hero, journey, money, price-layers, concepts, why, trends, frustration, interest, results, footer`
    - _Requirements: 2.1, 2.2, 2.3, 22.1_

  - [ ]* 8.11 Write unit tests against the built `dist/`
    - Section order, hero CTA anchor, hub `noindex` and sitemap exclusion, footer contents and Journal link
    - Concept_Card internal order, "Concept, not for sale", price question wording, Priority_Chip fieldset, skip button inside the price fieldset
    - `[data-aim]` is the next sibling of the journey `<ol>`, contains "Our aim" and has no `.fact` ancestor or descendant
    - Image_Placeholder markup for every Concept view while images are missing; every Concept image is lazy with `decoding="async"`; the hero is the only eager image
    - `NOTICE_VERSION` equals `privacy.yaml#version`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 4.7, 8.2, 8.8, 8B.5, 8B.9, 9.6, 9.18, 13.8, 19.1_

- [x] 9. Implement Content_Check rules
  - [x] 9.1 Create the Content_Check runner and HTML extraction
    - Create `src/lib/content-rules/types.ts` (`Violation`, `Rule`, `CheckContext`) and `src/lib/content-rules/html.ts` using `node-html-parser` to build `RenderedPage` (visible text including `<noscript>` and `<template>` content, excluding `<script>`/`<style>`; alt texts; title, meta, `og:*`, JSON-LD and `aria-label` texts; `data-fact-id`s; a character-offset map to the nearest `.fact` ancestor; flattened inline text)
    - Create `scripts/content-check.ts` that loads the collections with the same Zod schemas, reads `dist/**/*.html`, runs every rule, prints `[CC-xx] <target>: <detail>` for all violations and exits 1 if any
    - Add `tests/generators/rendered-page.ts` with `renderedPage()`
    - _Requirements: 3.5, 3.6_

  - [x] 9.2 Implement fact rules CC-01, CC-02 and CC-09
    - CC-01 fact completeness (names the entry), CC-02 unverified facts referenced by a published page, CC-09 free-standing `₹`, `%` or year-number text outside `.fact` and outside `fieldset[data-price-question]`, honouring `numericAllow`
    - _Requirements: 3.5, 3.6, 3.7, 5.6_

  - [ ]* 9.3 Write property test for incomplete facts
    - **Property 16: Incomplete fact entries fail with the entry named**
    - **Validates: Requirements 3.6**

  - [ ]* 9.4 Write property test for unverified facts
    - **Property 17: Unverified facts block publication only when referenced**
    - **Validates: Requirements 3.7**

  - [ ]* 9.5 Write property test for free-standing numeric claims
    - **Property 20: Free-standing numeric claims are flagged**
    - **Validates: Requirements 3.5, 5.6**

  - [x] 9.6 Implement word rules CC-03, CC-04, CC-10, CC-11 and CC-12
    - CC-03 greenwashing words only inside a substantiating `.fact`; CC-04 "European linen" only inside a `.fact` with `mill` or `certification`; CC-10 `!` and superlatives (with `data-quote` exemption for Journal quotes); CC-11 commerce words inside Concept_Cards and Price_Layers and Price_Band labels outside the price radio group; CC-12 yarn terms only with a fact (Fabric_Notes) or in a `FACT` Quality_Row
    - _Requirements: 1.6, 6.5, 8.4, 8.7, 9.11, 11.4, 11.5_

  - [ ]* 9.7 Write property test for restricted-word substantiation
    - **Property 18: Restricted terms require substantiation**
    - **Validates: Requirements 11.4, 11.5**

  - [ ]* 9.8 Write property test for tone and commerce terms
    - **Property 19: Forbidden tone and commerce terms are detected**
    - **Validates: Requirements 1.6, 6.5, 8.7, 9.11**

  - [x] 9.9 Implement brand rules CC-05 and CC-06
    - CC-05 builds the effective blocklist from `brand-blocklist.yaml` plus every market-scan `evidence[].brand`, removes "MoolResha", and matches visible text, alt (including `<template>`), title, meta, `og:*`, JSON-LD and `aria-label` with brand folding; CC-06 fails if any evidence brand or URL appears in any `dist` file, including JS and JSON
    - _Requirements: 7.10, 7.11, 7.12, 7.13_

  - [ ]* 9.10 Write property test for brand blocklist detection
    - **Property 11: Brand blocklist detection over rendered pages**
    - **Validates: Requirements 7.11, 7.12, 7.13**

  - [x] 9.11 Implement price rules CC-07 and CC-08
    - CC-07 runs `validatePriceBands` per Concept and names the Concept
    - CC-08: create `src/lib/content-rules/price-layers.ts` with `RUPEE_AMOUNT` and `findRupeeAmountsOutsideFact(section, 'gst-cliff-2025')` over visible text, `alt`, `title` and `aria-label` in `[data-section=price-layers]`; report the matched text
    - Add `tests/generators/price-layers-subtree.ts` with `priceLayersSubtree()` and `rupeeAmount()`
    - _Requirements: 6.3, 6.7, 9.8_

  - [ ]* 9.12 Write property test for Price_Layers amounts
    - **Property 14: Price_Layers amounts are allowed only inside the GST fact**
    - **Validates: Requirements 6.3, 6.7**

  - [x] 9.13 Implement structure rules CC-13, CC-14, CC-15 and CC-16
    - CC-13 co-ord composition via `isValidCoordComposition`; CC-14 the five Concepts with the cotton shirt first and featured; CC-15 exact `data-section` order on `/index.html`; CC-16 one collapsed `<details class="market-context">` per Concept_Card, matching `data-market-for`, after `fieldset[data-price-question]`, with the summary "See what similar pieces cost", and none outside a card
    - Add `tests/generators/concept-cards.ts` with `conceptCards()` and its mutations
    - _Requirements: 2.1, 2.2, 7.1, 7.5, 8.1, 8.5_

  - [ ]* 9.14 Write property test for market context placement
    - **Property 33: Each Concept_Card holds exactly one correctly placed, collapsed market context**
    - **Validates: Requirements 2.2, 7.1, 7.5**

  - [x] 9.15 Implement story and quality rules CC-17, CC-18, CC-19 and CC-20
    - CC-17 Restricted_Phrase_List occurrences allowed only wholly inside a `.fact` with a `source`, across all channels and inline splits
    - CC-18 runs `checkQualityCard` per Concept and checks the rendered card (one label per row, exact Target note text, `#how-we-check` link resolves)
    - CC-19 runs `findSpecValues` on Quality_Rows and the Fabric_Notes `weight`
    - CC-20 Health_Term_List matches everywhere including `<template>` content and inside `.fact`, naming the page, term and channel
    - Add `tests/generators/restricted-phrase.ts` and `tests/generators/health-term.ts`
    - _Requirements: 8C.6, 8C.7, 8C.8, 8C.9, 8C.12, 11A.7, 11A.8_

  - [ ]* 9.16 Write property test for restricted phrases
    - **Property 32: Restricted phrases are flagged unless wholly inside a sourced fact**
    - **Validates: Requirements 11A.6, 11A.7, 11A.8**

  - [ ]* 9.17 Write property test for health terms
    - **Property 46: Health terms are found in every variant, everywhere, and nowhere else**
    - **Validates: Requirements 8C.11, 8C.12**

  - [ ]* 9.18 Write unit tests for Content_Check on the real build
    - The built site passes every rule; `[data-section=price-layers]` contains ₹ amounts only inside `gst-cliff-2025`; the GST fact is `FACT`, links to PIB (September 2025) and states 5% and 18% either side of ₹2,500
    - _Requirements: 6.1–6.7, 8C.12_

- [x] 10. Add build budget, link and launch gates
  - [x] 10.1 Implement the JS budget and link checks
    - Create `scripts/js-budget.ts` (sum gzip size of first-party JS referenced by `dist/index.html`, print per-asset sizes including the Angle_Viewer chunk, fail above 40 KB)
    - Create `scripts/link-check.ts` (every internal `href` in `dist/**/*.html` resolves to a file or anchor; list broken links with source page)
    - _Requirements: 2.6, 8A.15, 20.2_

  - [x] 10.2 Implement the launch gate and checklist
    - Create `docs/launch-checklist.md` with records for the lawyer review date (Privacy_Notice, consent flow, Price_Layers copy, Market_Price_Context copy), the per-Concept on-model no-face review, the alt-text-against-image review and the free-tier limit re-check
    - Create `scripts/launch-gate.ts` that runs only when `PUBLIC_LAUNCH=true` and fails when the lawyer date or any Concept's on-model review is not recorded; add it to the `build` script
    - _Requirements: 8B.10, 19.5_

  - [ ]* 10.3 Write unit tests for the gates
    - `launch-gate.ts` fails without records and passes with them; `package.json` lists no 3D, 360° spin or carousel package
    - _Requirements: 8A.15, 8B.10, 19.5_

- [~] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass and `npm run build` succeeds with placeholder images (warnings only), ask the user if questions arise.

- [x] 12. Implement shared aggregation, chip-set and CSV libraries
  - [x] 12.1 Implement chip sets and aggregation
    - Create `src/lib/aggregate.ts` with `MIN_RESPONSES = 20`, `encodeChipSet`, `decodeChipSet`, `sumChipCounts`, `topChips` (all ties in allow-list order), `largestRemainderPercent` (integer arithmetic), `aggregateFeedback` (skips counted only in `priceSkipCount`) and `toPublicResult` (gate omits details below 20; `topPriceBandId` from band counts only; ties broken by configured order)
    - Add `feedbackRow()`, `priceAnswer()` and `prioritySet()` generators
    - _Requirements: 9.19, 16.1, 16.2, 16.3, 16.5, 16.6_

  - [ ]* 12.2 Write property test for chip-set encoding
    - **Property 35: Chip sets encode canonically and round-trip**
    - **Validates: Requirements 9.19, 17.2, 17.5**

  - [ ]* 12.3 Write property test for verdict percentages
    - **Property 2: Verdict percentages sum to 100**
    - **Validates: Requirements 16.5**

  - [ ]* 12.4 Write property test for public results
    - **Property 3: Public results respect the minimum-response gate and expose only aggregates**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.6**

  - [x] 12.5 Implement the CSV encoder and text escaping
    - Create `src/lib/csv.ts` with `neutraliseFormula` (`=`, `+`, `-`, `@`, tab, CR, and extra `'` for values already starting with `'`), `encodeField`, `encodeCsv` (CRLF), `parseCsv` (RFC 4180) and `denormalise`
    - Create `src/lib/text.ts` with `normaliseText` (NFC, strip control characters, trim), `escapeHtml` and `unescapeHtml`
    - _Requirements: 14.7, 17.4, 17.5_

  - [ ]* 12.6 Write property test for CSV round trip
    - **Property 5: CSV round trip**
    - **Validates: Requirements 17.2, 17.4, 17.5**

  - [ ]* 12.7 Write property test for formula neutralisation
    - **Property 6: Formula injection neutralisation**
    - **Validates: Requirements 17.4**

  - [ ]* 12.8 Write property test for free text handling
    - **Property 24: Free text is stored plainly and escaped on display**
    - **Validates: Requirements 14.7**

- [x] 13. Create the D1 schema and shared Function helpers
  - [x] 13.1 Write the D1 migration and SQLite test adapter
    - Create `migrations/0001_init.sql` with `concept_feedback` (including `priorities`, `price_band_id`, `price_skipped` and the skip-excludes-band CHECK), `frustration`, `interest`, `consents`, `event_counts` and `rate_limits` exactly as in the design
    - Create `functions/_shared/db.ts` with typed prepared-statement wrappers (feedback upsert, frustration upsert, interest batch, event increment, results queries, export queries); no string-built SQL
    - Create `tests/support/d1-sqlite.ts`, a `better-sqlite3` adapter with the D1 `prepare().bind().run()/all()/first()` and `batch()` shape that applies the migrations
    - Add `wrangler.toml` D1 binding `moolresha_feedback` with placeholder ids and no secrets
    - _Requirements: 9.13, 9.14, 9.15, 10.3, 12.8, 12.9, 18.4_

  - [x] 13.2 Implement origin, identity, responses and logging helpers
    - Create `functions/_shared/origin.ts` (`ALLOWED_ORIGINS`, `checkOrigin` returning 403), `identity.ts` (SHA-256 of IP, UA and HMAC daily salt from `IDENTITY_SALT_SEED`), `respond.ts` (`json`, `errorResponse`, CORS with `Vary: Origin`, `Cache-Control: no-store`), `log.ts` (drops `email`, `phone`, `ip`, `ua`, `anonId`, `token`, `text` keys and redacts values that look like emails, Indian mobiles or IP addresses) and `withErrorBoundary`
    - _Requirements: 14.5, 14.8, 14.9_

  - [ ]* 13.3 Write property test for log redaction
    - **Property 25: Logs never contain personal data**
    - **Validates: Requirements 14.9**

  - [x] 13.4 Implement the D1 fixed-window rate limiter
    - Create `functions/_shared/rate-limit.ts` with the `RateLimitStore` interface, a D1 store using the single `INSERT … ON CONFLICT … RETURNING count` statement, an in-memory store for tests, `windowStart`, `rateLimit(store, route, identity, nowSec)` with the per-route limits as config (values marked `⚠️ align with docs/rate-limiting.md`), Retry-After of at least 1 s, and opportunistic expiry cleanup
    - _Requirements: 14.1, 14.2, 18.5_

  - [ ]* 13.5 Write property test for the rate limiter
    - **Property 22: Fixed-window rate limiter**
    - **Validates: Requirements 14.1, 18.5**

  - [x] 13.6 Implement request validation schemas
    - Create `functions/_shared/schemas.ts` importing `allow-lists.ts` and `allow-lists.generated.ts`: `AnonId` (UUID v4), `Utm`, `Token`, `FreeText`, `FeedbackBody` (strict, `priorities` default `[]`, `priceBandId` per Concept, `priceSkipped: z.literal(true)`, band and skip mutually exclusive, duplicate checks, `otherText` only with `other`), `FrustrationBody`, `InterestBody` (email, `+91[6-9]` mobile after removing spaces and hyphens, sizes, consent and 18+ rules, `noticeVersion`, at least one field), `EventBody` (strict, no `anonId`)
    - Create `functions/_shared/validate.ts` mapping Zod errors to `400 invalid_request` / `consent_required` with field paths
    - Share the interest schema with the client island
    - Add `feedbackPayload()`, `mutatedPayload()`, `skipPayload()` and `interestPayload()` generators
    - _Requirements: 9.5, 9.12, 9.13, 9.14, 9.19, 10.2, 12.4, 12.5, 12.6, 12.10, 12.11, 14.6, 15.3, 18.4_

  - [ ]* 13.7 Write property test for allow-list validation
    - **Property 8: Allow-list validation rejects anything outside the allow-lists**
    - **Validates: Requirements 9.5, 9.12, 9.13, 9.14, 9.19, 10.2, 14.6, 15.3, 18.4**

  - [ ]* 13.8 Write property test for interest consent rules
    - **Property 9: Interest consent rules**
    - **Validates: Requirements 12.4, 12.5, 12.6, 12.10, 12.11**

  - [x] 13.9 Implement the Turnstile verifier and MailerLite client
    - Create `functions/_shared/turnstile.ts` (`verifyTurnstile(token, ip, env, fetchImpl)`; network failure, non-200 and hostname mismatch count as failure; logs `turnstile_unavailable`)
    - Create `functions/_shared/mailerlite.ts` (`POST /api/subscribers` with `status: "unconfirmed"`, `ML_GROUP_ID`, `fields.size`, no IP, 5 s timeout, injectable `fetchImpl`) and `forgetSubscriber(id)`
    - Secrets come only from `env`; add `.dev.vars.example` with empty placeholders
    - _Requirements: 12.7, 14.3, 14.4, 14.8_

  - [ ]* 13.10 Write unit tests for Turnstile and MailerLite clients with mocked fetch
    - Turnstile `success: false`, `timeout-or-duplicate`, hostname mismatch, network failure; MailerLite request shape and 200, 201, 422, 5xx handling
    - _Requirements: 12.7, 14.3, 14.4_

- [x] 14. Implement the API endpoints
  - [x] 14.1 Implement `POST /api/feedback` and `POST /api/frustration`
    - Create `functions/api/feedback.ts` and `functions/api/frustration.ts` with the shared pipeline in order: method (405), Origin (403), Content-Type (415 with the HTML "Feedback needs JavaScript turned on…" page for form posts), body cap 8 KB (413), rate limit (429 + Retry-After), validation (400), Turnstile (403), then the D1 upsert (`encodeChipSet` for `changes` and `priorities`, `price_skipped = 1` only for a skip) and the server-side `*_submitted` event; `503 storage_unavailable` on D1 errors
    - _Requirements: 9.13, 9.14, 9.15, 9.19, 10.3, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 18.3_

  - [ ]* 14.2 Write property test for upsert idempotence
    - **Property 7: Upsert idempotence (one row per Anonymous_ID × Concept)**
    - **Validates: Requirements 9.10, 9.15, 9.19, 10.3**

  - [ ]* 14.3 Write property test for rejected writes
    - **Property 23: Rejected writes store nothing**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.5**

  - [x] 14.4 Implement `POST /api/interest`
    - Create `functions/api/interest.ts`: same pipeline with a 16 KB cap; `409 notice_outdated` on version mismatch; D1 `batch()` storing email or phone only with their consent, `anon_id` only with link consent, one `consents` row per consent with `notice_version` and timestamp, and the `interest_submitted` event; then MailerLite for consented emails, setting `ml_sync` to `pending` or `failed` on error while still returning 200
    - _Requirements: 12.7, 12.8, 12.9, 14.3, 14.6_

  - [ ]* 14.5 Write property test for interest storage
    - **Property 10: Interest storage mirrors consents exactly**
    - **Validates: Requirements 12.7, 12.8, 12.9**

  - [x] 14.6 Implement `POST /api/events`
    - Create `functions/api/events.ts`: Origin check, rate limit, strict `EventBody`, day-level `event_counts` increment with `''` for empty keys, `204`; no Turnstile
    - _Requirements: 18.2, 18.3, 18.4, 18.5_

  - [ ]* 14.7 Write property test for event counts
    - **Property 28: Event counts match a model and hold no personal data**
    - **Validates: Requirements 18.3, 18.4**

  - [x] 14.8 Implement `GET /api/results`
    - Create `functions/api/results.ts`: Cache API under a fixed key with `Cache-Control: public, max-age=300`; on miss, rate limit, run the five `GROUP BY` queries, reshape with `sumChipCounts` into `ConceptAggregate`, apply `toPublicResult`, include `computedAt`; `503 results_unavailable` on D1 error
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 14.9 Implement the admin CSV exports
    - Create `functions/_shared/admin-auth.ts` (verify `Cf-Access-Jwt-Assertion` against JWKS with `ACCESS_AUD`, or constant-time compare `Authorization: Bearer <ADMIN_TOKEN>`; 401 missing, 403 invalid)
    - Create `functions/api/admin/export/feedback.csv.ts` (columns per design, no email or phone, paged in 1,000s) and `aggregate.csv.ts` (`concept_id, question, answer, count` from `aggregateFeedback`, one `priority` row per chip including zeros, `price_skip`/`skipped` separate from `price_band`)
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.6_

  - [ ]* 14.10 Write property test for aggregation consistency across paths
    - **Property 4: Aggregation consistency across paths**
    - **Validates: Requirements 16.1, 16.6, 17.2, 17.6**

  - [ ]* 14.11 Write property test for admin authentication
    - **Property 29: Admin export requires valid credentials**
    - **Validates: Requirements 17.1**

  - [ ]* 14.12 Write property test for contact-free exports
    - **Property 30: Exports contain no contact data**
    - **Validates: Requirements 17.3**

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement the client islands
  - [x] 16.1 Implement the Anonymous_ID and API client with UTM capture
    - Create `src/islands/anon-id.ts` (`getAnonId` with `crypto.randomUUID()`, UUID v4 check, `safeLocalStorage()` fallback to an in-memory ID)
    - Create `src/islands/utm.ts` (`parseUtm(search)`: lower-case, `^[a-z0-9._-]{1,64}$`, drop invalid values, ignore other parameters; store in `sessionStorage`)
    - Create `src/islands/api-client.ts` (`post<T>` with 10 s `AbortController` timeout, error-code to plain-language message map from the design, `{ ok: false, kind: 'network' }` on fetch rejection, attaches `utm`)
    - _Requirements: 15.1, 15.2, 18.2, 22.2_

  - [ ]* 16.2 Write property test for the Anonymous_ID
    - **Property 26: Anonymous_ID is a stable random UUID v4**
    - **Validates: Requirements 15.1, 15.2**

  - [ ]* 16.3 Write property test for UTM capture
    - **Property 27: UTM capture keeps only valid values**
    - **Validates: Requirements 18.2**

  - [x] 16.4 Implement the market reveal module
    - Create `src/islands/market-reveal.ts` with `parseAnswered`, `serialiseAnswered`, `nextAnswered` (adds the Concept only when `ok` and price is `band` or `skip`) and `shouldReveal`
    - Add `tests/generators/reveal-scenario.ts` with `revealScenario()`
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ]* 16.5 Write property test for market reveal
    - **Property 34: Market reveal follows stored price answers**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [x] 16.6 Implement the Turnstile loader and the feedback island
    - Create `src/islands/turnstile-loader.ts` (load the widget script on first form focus or change; fresh token per submission; reset and retry once on `bot_check_failed`; "Feedback is temporarily unavailable." after a 10 s load timeout)
    - Create `src/islands/feedback-island.ts` for Concept and frustration forms: reveal submit buttons; toggle the "other" field and `aria-expanded`; enable submit once a verdict is chosen; price state (skip clears the band and sets `aria-pressed="true"`, choosing a band sets it back to `false`; body carries `priceBandId`, `priceSkipped: true` or neither); `priorities` in allow-list order or `[]`; success and error messages in the live region with selections kept and saved to `sessionStorage`
    - Market reveal: on start-up hide each unanswered `.market-context` (`hidden`, `data-reveal="hidden"`), reveal and open those in `parseAnswered(session) ∪ parseAnswered(local)`; after a 200 with a band or skip, update both storages, reveal and open that card's range only, and append "Similar pieces' prices are now shown below." to the card's live region without moving focus
    - _Requirements: 7.2, 7.3, 7.4, 9.3, 9.9, 9.10, 9.12, 9.16, 9.17, 9.18, 9.19, 10.2, 14.3, 21.5, 22.2_

  - [ ]* 16.7 Write happy-dom tests for the feedback island and market reveal
    - "Other" toggle, verdict-only submit, skip/band state and request body, live region messages, selections kept after errors, error-code messages
    - Market reveal on start-up (empty storage hides all; stored id reveals that card only), after a band 200 and a skip 200 (only that card, both storages written, announcement, focus unchanged), no reveal after a no-price 200, 400, 429 or network error, reveal still works with both storages throwing, and the no-JS markup keeps each `<details>` present, closed and not hidden
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 9.3, 9.9, 9.10, 9.16, 9.17, 21.5_

  - [x] 16.8 Implement the interest, results and events islands
    - Create `src/islands/interest-island.ts` using the shared interest schema for field-level errors (`aria-describedby`, `aria-invalid`), consent and 18+ rules, `notice_outdated` reload prompt
    - Create `src/islands/results-island.ts` (fetch on `IntersectionObserver` with 200 px margin; text percentages; "Not enough responses yet"; "What matters most" line with tied chips joined as "… and … (tied)", omitted when empty; response count and last computed time; "Results unavailable right now" on failure; all values inserted as text)
    - Create `src/islands/events-island.ts` (`page_view`, `section_reached` once per section, `journal_click`; `sendBeacon` with `fetch keepalive` fallback)
    - _Requirements: 12.4, 12.5, 12.6, 12.10, 14.7, 16.1, 16.3, 16.4, 16.6, 18.3, 21.5, 22.3_

  - [ ]* 16.9 Write happy-dom tests for interest, results and events islands
    - Interest field errors and consent blocking; results rendering for enough, not enough, ties and failure; events sent once per section
    - _Requirements: 12.4, 12.5, 12.10, 16.3, 16.6, 18.3, 22.3_

- [x] 17. Implement the deletion procedure tooling
  - [x] 17.1 Create the deletion script and procedure document
    - Create `scripts/delete-person.ts` that takes an email or phone, looks up the `interest` row and prints parameterised SQL for review (linked feedback and frustration, consents, interest) without running it, plus the MailerLite `forget` step
    - Create `docs/deletion-procedure.md` describing the verification, lookup, `wrangler d1 execute` run, MailerLite `forget`, log and reply steps, with response times marked `⚠️ lawyer to confirm`
    - _Requirements: 13.5, 13.6_

  - [ ]* 17.2 Write property test for deletion
    - **Property 31: Deletion removes one person and nobody else**
    - **Validates: Requirements 13.6**

- [x] 18. Add CI, integration, end-to-end, accessibility and performance checks
  - [x] 18.1 Configure CI
    - Create `.github/workflows/ci.yml` running `npm ci`, `npm run check`, `npm test`, `npm run build` and a secret scan (gitleaks or equivalent) on every pull request
    - _Requirements: 14.8, 20.2_

  - [ ]* 18.2 Write integration tests in the Functions runtime
    - Using Miniflare or `@cloudflare/vitest-pool-workers` with local D1: feedback posted twice gives one row and cached results; interest with Turnstile test keys and stubbed MailerLite; admin export with and without the bearer token
    - _Requirements: 9.15, 12.7, 16.4, 17.1_

  - [ ]* 18.3 Write Playwright end-to-end tests
    - JS disabled: all sections, Facts and Source_Links present; no-JS form notes; market `<details>` collapsed after the price question and opens with Enter; Angle_Viewer shows front view plus a grid of eight with names and Render_Label and no controls
    - JS enabled: market range hidden until a skip is submitted against a stubbed `/api/feedback`, then shown in the same card; mouse drag 120 px moves one view and 10 px does not; touch swipe at 360×640 moves one view; vertical swipe scrolls without turning; reduced motion runs no transitions
    - Widths 320, 360, 768, 1440 with no horizontal scroll; first-viewport content at 360×640; research notice within two screen heights
    - Keyboard pass with visible focus across every interactive control listed in Requirement 21.2; no `Set-Cookie` headers and no `document.cookie` writes
    - _Requirements: 1.1, 1.2, 1.3, 7.2, 7.3, 7.5, 8A.3, 8A.9, 8A.11, 8A.12, 18.1, 20.4, 21.2, 21.6, 22.1_

  - [ ]* 18.4 Add axe and Lighthouse checks
    - axe on `/`, `/privacy` and a Journal page with zero violations; token-pair contrast unit test; `lighthouserc.json` with mobile LCP ≤ 2.5 s, CLS ≤ 0.1 and a TBT budget; checks that fonts are self-hosted with `font-display: swap` and every `<img>` has width and height
    - _Requirements: 20.1, 20.3, 20.5, 21.1, 21.7_

- [~] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass and `npm run build` succeeds with placeholder images, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Core implementation tasks are never optional.
- Each task references requirement clauses for traceability. Each property test sub-task references one design property (1 to 46) and the clauses it validates.
- Checkpoints ensure incremental validation. A non-launch build must pass with every Concept_View showing the Image_Placeholder.
- Values that are still open (rate limits, retention periods, response times, GST on co-ord sets, Price_Layers copy, market-reveal announcement wording, hover-hint visual, the extra `hypo-allergenic` term, market-scan evidence privacy) are held in config or placeholder copy marked `⚠️ confirm` and do not block any task.
- Editorial and legal reviews (trade-off framing, no health claims in any wording, no overcharge implications, on-model no-face review, alt text against images, lawyer sign-off) are recorded in `docs/launch-checklist.md`; `launch-gate.ts` checks only that the records exist.
- Follow-up after the build, not a code task: write the ChatGPT image prompts for each Concept and Concept_View, using the alt text in each Concept YAML as the brief, then drop the files into `src/assets/concepts/<concept-id>/` with the eight fixed names and rebuild.
