# Requirements Document

## Introduction

MoolResha ("Closer to the Root") is an education-first Indian clothing brand in its research phase. It has no products for sale. This feature turns the existing Astro site (separate repo: `moolresha-web`, Astro 7 + MDX + TypeScript, static-first) into a launch website whose purpose is **feedback collection plus an optional interest list**. It is not a shop.

A visitor should learn something real about how a cotton shirt is made and priced, then give an opinion on five proposed designs and the price they would pay. Trust is built through calm design, sourced facts, honest labelling, a real contact and a clear privacy notice. The founder stays anonymous.

Planned infrastructure: Cloudflare Pages (static) + Pages Functions (write endpoints) + D1/KV (storage), Cloudflare Turnstile (bot check), MailerLite (double opt-in email), Cloudflare Web Analytics (cookieless). Rate limiting follows `moolresha-web/docs/rate-limiting.md`.

Sources of truth: `ourbrand/launch-website-research-and-plan.md` (the round-4 to round-8 decision logs override earlier sections; a later round overrides an earlier round where they differ, so round 8 overrides round 7 §R on 3D presentation, and round 7 §S, the Quality_Card, is approved by round 8) and `ourbrand/moolresha-content-philosophy.md` §9 (research integrity).

**Out of scope for v1:** AI virtual try-on, CLO 3D, Google `<model-viewer>` or any other live 3D viewer, frame-sequence 360° spins, comments, likes, commerce, checkout, prices shown as offers, MoolResha prices or ₹ cost totals, free-text or numeric price answers (including Van Westendorp-style pricing questions), referral rewards, founder name or face. The image generation prompts for each Concept and Concept_View are produced separately after the web build and are not part of this spec.

**Legal note:** the DPDP, CCPA and ASCI requirements below encode the research team's reading of the rules. The final copy and consent flow need review by a lawyer before public launch (Requirement 19).

## Glossary

- **Launch_Site**: The public MoolResha website built from the `moolresha-web` repo, including the launch page, Privacy_Notice page, Journal article pages and footer.
- **Launch_Page**: The single main page (the homepage) that holds all v1 content sections and feedback interactions.
- **Visitor**: Any person viewing the Launch_Site.
- **Admin**: The MoolResha operator who has authenticated access to exports and moderation. There is no public admin UI.
- **Concept**: One proposed garment design shown for feedback. Not for sale.
- **Concept_Card**: The Launch_Page component that presents one Concept with its Angle_Viewer, Fabric_Notes, Quality_Card, "Concept, not for sale" label and Concept_Feedback controls.
- **Concept_ID**: The fixed identifier of a Concept: `mens-cotton-shirt`, `mens-cotton-linen-shirt`, `mens-linen-shirt`, `mens-relaxed-pant` or `womens-coord-set`.
- **Concept_View**: One of the eight fixed images of a Concept, identified by number and name: 01 front, 02 front three-quarter, 03 side, 04 back three-quarter, 05 back (together the Turn_Views), 06 inside, 07 fabric close-up and 08 on a model (no face).
- **Turn_Views**: The ordered Concept_Views 01 to 05 that together give the effect of turning the garment from front to back.
- **Angle_Viewer**: The Concept_Card component that displays a Concept's Concept_Views, lets a Visitor move through the Turn_Views and opens the inside, fabric close-up and on-a-model views through tabs.
- **Concept_Image_Folder**: The folder `src/assets/concepts/<Concept_ID>/` in the `moolresha-web` repo that holds a Concept's Concept_View image files.
- **Image_Placeholder**: The neutral image shown in place of a missing Concept_View file, carrying the text "Image coming soon".
- **Render_Label**: The visible text "AI design render, not a photo of a finished garment".
- **Public_Launch_Build**: A Site_Build run with the environment variable `PUBLIC_LAUNCH` set to `true`.
- **Site_Build**: The Astro static build of the Launch_Site, including the Content_Check.
- **Quality_Card**: The Concept_Card component that summarises a Concept's quality in seven Quality_Rows.
- **Quality_Row**: One line of the Quality_Card, for one of: Fibre, Yarn, Fabric, On your skin, Shrinkage, After a year of washing, Care.
- **Quality_Label**: The visible status tag on a Quality_Row: `FACT` (a Fact_Registry entry with the Claim_Label `FACT` and a Source_Link), `Target` (MoolResha's intended specification, not yet verified) or `We'll test` (a promise to test the stated property and publish the results). Quality_Labels are separate from Claim_Labels; a `FACT` Quality_Label follows every rule that applies to the `FACT` Claim_Label.
- **Priority_Chip**: A selectable answer to "What matters most to you?" for a Concept: softness, no shrinking, colour that lasts, breathability, easy care, long life.
- **Health_Term_List**: The configured list of health-claim words that must not appear anywhere on the Launch_Site, initially "skin-friendly", "hypoallergenic", "anti-allergy", "chemical-free" and "non-toxic".
- **Fabric_Notes**: The structured description of a Concept's fabric: composition (with %), yarn quality, weave, weight, hand feel, softness and care.
- **Palette_Colour**: One of the five named colours: Flax, Clay, Meadow, Indigo Dusk, Chalk White.
- **Price_Band**: A predefined ₹ range a Visitor can choose in answer to the price question for a Concept. Each Concept has its own ordered set of Price_Bands (one open-ended lowest band "Under ₹X", closed bands "₹A–B", one open-ended top band "₹Y+"). The bands are MoolResha's interpretation, held in editable content configuration, and are answer options to a question, not offer prices. A single choice among Price_Bands is the only way to answer the price question.
- **Price_Skip**: A Visitor's explicit choice to skip the price question for a Concept, made through a dedicated skip control. A Price_Skip is recorded separately from leaving the price question unanswered.
- **Change_Chip**: A selectable reason in "what would you change": fit, fabric weight, colour, pockets, price, other.
- **Frustration_Chip**: A selectable answer to "your biggest clothing frustration" (multi-select).
- **Concept_Feedback**: One Visitor's answer set for one Concept: verdict (would wear / maybe / not for me), zero or more Change_Chips, optional Palette_Colour, zero or more Priority_Chips, and for the price question either one Price_Band, a Price_Skip or no answer.
- **Interest_Form**: The optional form for email, WhatsApp number, size and consents.
- **Anonymous_ID**: A random identifier generated for a Visitor's browser, not derived from any personal data, used to group that browser's submissions.
- **Feedback_API**: The set of server-side write endpoints (Pages Functions) that accept Concept_Feedback, frustration answers, Interest_Form submissions and event counts.
- **Submission_Store**: The server-side database (D1/KV) holding feedback, event counts and consent records.
- **Email_Provider**: MailerLite, which stores consented email addresses and sends double opt-in confirmation.
- **Rate_Limiter**: The component that limits write requests per client as specified in `docs/rate-limiting.md`.
- **Bot_Check**: Cloudflare Turnstile verification performed on submission.
- **Fact**: Any statement on the Launch_Site that asserts something checkable about the world: a number, date, price, origin, fibre property, process step, trend or study finding.
- **Claim_Label**: The visible status tag attached to a Fact: `FACT`, `INDUSTRY CLAIM`, `BRAND CLAIM`, `MoolResha estimate` or `MoolResha market scan`.
- **Source_Link**: A visible link next to a Fact pointing to the source that supports it, with source name and date.
- **Fact_Registry**: The typed content data (in the repo) holding every Fact with its text, Claim_Label, Source_Link, evidence strength and last-checked date.
- **Content_Check**: An automated build-time check over Fact_Registry and page content that fails the build when an integrity rule is broken. Its restricted-word checks cover the green-claim words (Requirement 11.4), "European linen" (Requirement 11.5), the Restricted_Phrase_List (Requirement 11A.7), the Brand_Blocklist (Requirement 7.12) and the Health_Term_List (Requirement 8C.12).
- **Fact_Element**: The rendered HTML element with the class `fact` that displays one Fact_Registry entry together with its Claim_Label and, where required, its Source_Link.
- **Price_Layers**: The ordered list of the layers that make up a garment's price (fabric, making, finishing, packaging, shipping, RTO/returns, platform and payment fees, GST, margin), each with a one-line plain-language explanation and no MoolResha ₹ amounts or totals.
- **Market_Price_Context**: For one Concept, the unnamed ₹ range of published prices for similar pieces from popular brands online and in malls, labelled `MoolResha market scan`. It is shown inside that Concept's Concept_Card only after the price question has been answered or skipped (Requirement 7), with a method note (number of listings, date range of the scan, channel types), and is backed by a brand-level evidence trail (brand, URL, price, date seen) held only in the Fact_Registry.
- **Lead_Message**: The sentence "Most of what you pay for a shirt goes to the layers between the field and you."
- **Aim_Statement**: The sentence "Our aim: grown, spun, woven and stitched in India, with every step shown." It states MoolResha's aim and is not a Fact.
- **Restricted_Phrase_List**: The editable configured list of words and phrases (initially including "made in Bangladesh", "instead of Bangladesh" and "less GST") that may appear on the Launch_Site only inside a Fact_Element with a Source_Link.
- **Brand_Blocklist**: The configured list of brand names that must not appear on the Launch_Site, merged at build time with every brand named in any Market_Price_Context evidence trail. MoolResha is not on the Brand_Blocklist.
- **Results_View**: The public display of live aggregate feedback results.
- **Admin_Export**: The authenticated export of feedback and aggregates as CSV.
- **Privacy_Notice**: The page and inline notice describing what data is collected, why, how long it is kept, how to withdraw consent, how to request deletion, and the grievance contact.
- **Grievance_Contact**: The named contact channel (email) for data-protection grievances, required under DPDP.
- **Event_Counter**: MoolResha's own server-side count of page events (section views, submissions, UTM source), stored without personal data.
- **UTM_Source**: The `utm_source`, `utm_medium` and `utm_campaign` values on the landing URL.
- **Journal**: The existing article system, reached by a footer link.
- **Hub_Pages**: The four existing empty hub pages (fibre-stories, fabric-school, comparisons, shopping-guides).

## Requirements

### Requirement 1: Purpose and first impression

**User Story:** As a Visitor, I want the first screen to look calm, real and trustworthy, so that I decide within moments that the site is worth my time.

#### Acceptance Criteria

1. THE Launch_Page SHALL show in the first mobile viewport (360×640 CSS px) the MoolResha wordmark, one headline, one supporting line, one real-texture fabric photograph and one primary call to action.
2. THE Launch_Page SHALL render the first viewport content from static HTML and CSS without waiting for client-side JavaScript, so that the first impression forms within the 50 ms judgement window described by Lindgaard et al. (2006).
3. THE Launch_Page SHALL display a statement that MoolResha is a research project and not a shop within the first two screen heights on mobile.
4. THE Launch_Site SHALL show no pop-ups, modal overlays, interstitials or auto-opening chat widgets.
5. THE Launch_Site SHALL use only the existing design tokens (earthy palette, editorial serif headings, readable sans-serif body) and generous white space, with body text line length between 45 and 75 characters.
6. THE Launch_Site SHALL present all copy in Indian English, in an objective, concise and understated tone, without exclamation marks or promotional superlatives such as "best", "premium", "luxury" or "amazing".
7. WHERE a section contains Facts, THE Launch_Page SHALL show a visible "last updated" date for that section.

### Requirement 2: Section structure and order

**User Story:** As a Visitor, I want a clear path from learning to giving my opinion, so that I understand the context before I'm asked anything.

#### Acceptance Criteria

1. THE Launch_Page SHALL present sections in this order: hero; cotton journey; where your money goes; Price_Layers; the five Concepts with Concept_Feedback (each Concept_Card holding its own Market_Price_Context, per Requirement 7); why transparency and natural fibres matter; trends; biggest clothing frustration; Interest_Form; Results_View; footer.
2. THE Launch_Page SHALL contain no standalone Market_Price_Context section outside the Concept_Cards.
3. THE Launch_Page SHALL provide an in-page link from the hero call to action to the Concepts section.
4. THE Launch_Site SHALL exclude Hub_Pages from the header navigation, the sitemap and search indexing (`noindex`).
5. THE Launch_Site SHALL keep the existing Journal article reachable through a "Journal" link in the footer.
6. THE Launch_Site SHALL contain no links that return HTTP 404 at build time.

### Requirement 3: Research integrity for every Fact

**User Story:** As a Visitor, I want every fact to show where it came from and how certain it is, so that I can trust and check what I read.

#### Acceptance Criteria

1. THE Launch_Site SHALL display a Claim_Label (`FACT`, `INDUSTRY CLAIM`, `BRAND CLAIM`, `MoolResha estimate` or `MoolResha market scan`) next to every Fact.
2. THE Launch_Site SHALL display a Source_Link with source name and date next to every Fact labelled `FACT`, `INDUSTRY CLAIM` or `BRAND CLAIM`.
3. WHERE a Fact is labelled `MoolResha estimate`, THE Launch_Site SHALL display the stated assumptions behind the estimate alongside the Fact.
4. WHERE a Fact is labelled `MoolResha market scan`, THE Launch_Site SHALL display the method note (number of listings, date range of the scan and channel types) alongside the Fact in place of a Source_Link.
5. THE Launch_Site SHALL render every Fact from the Fact_Registry rather than as free text in page copy.
6. IF a Fact_Registry entry lacks a Claim_Label, a Source_Link (for `FACT`, `INDUSTRY CLAIM` and `BRAND CLAIM` labels), stated assumptions (for `MoolResha estimate`), a method note (for `MoolResha market scan`) or a last-checked date, THEN THE Content_Check SHALL fail the build and name the entry.
7. IF a Fact_Registry entry has evidence strength `UNVERIFIED` or carries a `⚠️ verify` flag, THEN THE Content_Check SHALL fail the build when that entry is referenced by any published page.
8. THE Source_Link SHALL open the external source with `rel="noopener noreferrer"` and SHALL be reachable and operable by keyboard.
9. THE Launch_Site SHALL present comparisons and fabric facts as trade-offs and suitability for use, and SHALL avoid statements that a fibre, composition, weight, count, origin or price is automatically better (content philosophy §5).

### Requirement 4: Cotton journey from field to shirt

**User Story:** As a Visitor, I want to see the stages a cotton shirt passes through, so that I understand why a shirt costs what it does.

#### Acceptance Criteria

1. THE Launch_Page SHALL present the cotton journey as an ordered sequence of stops: cotton field, ginning, spinning, weaving, processing (dyeing and finishing), stitching, warehousing and distribution, and retail.
2. THE Launch_Page SHALL show at least one sourced Fact per journey stop.
3. THE Launch_Page SHALL present sourcing or stitching abroad as one possible step in the journey and SHALL present it as one factor among several in garment cost.
4. WHILE no named supplier region has been verified, THE Launch_Page SHALL describe cotton-growing regions in general terms backed by a Source_Link.
5. THE Launch_Page SHALL make every journey stop's Fact readable without hover, so that touch and keyboard users see the same content.
6. THE Launch_Site SHALL mention countries other than India only inside Fact_Elements labelled `FACT` with a Source_Link, stated in neutral journey terms such as yarn exports and garment imports, with no judgement words.
7. THE Launch_Page SHALL show the Aim_Statement directly after the last journey stop, visibly labelled "Our aim", and SHALL render the Aim_Statement outside any Fact_Element.

### Requirement 5: Where your money goes

**User Story:** As a Visitor, I want to see how a garment's retail price usually breaks down, so that I can judge prices more independently.

#### Acceptance Criteria

1. THE Launch_Page SHALL show the Clean Clothes Campaign / Statista retail price breakdown of a T-shirt as a labelled chart with the share for each component.
2. THE Launch_Page SHALL label that breakdown as a European example with its Source_Link and date.
3. THE Launch_Page SHALL provide a text equivalent (table or list) of the chart values.
4. THE Launch_Page SHALL present the general price build-up (materials, making, transport, brand, retail, taxes) as the main explanation of garment price, with sourcing abroad presented as one contributing factor.
5. THE Launch_Page SHALL show the Lead_Message as the heading of the where-your-money-goes section.
6. THE Launch_Page SHALL state farmer or worker share figures only as Fact_Registry Facts with a Claim_Label and Source_Link, such as the labelled European example's share to factory workers.

### Requirement 6: Price layers

**User Story:** As a Visitor, I want to see the layers that make up a garment's price explained plainly, so that the price question makes sense without being anchored to a MoolResha number.

#### Acceptance Criteria

1. THE Launch_Page SHALL show the Price_Layers in this order: fabric; making (cutting and stitching); finishing; packaging; shipping; RTO/returns; platform and payment fees; GST; margin.
2. THE Launch_Page SHALL show, for each layer in the Price_Layers, a one-line plain-language explanation of what that layer pays for.
3. THE Launch_Page SHALL show the Price_Layers without MoolResha ₹ amounts, percentages of a MoolResha price, subtotals or totals.
4. THE Launch_Page SHALL show, with the Price_Layers, the promise "When we launch, we'll publish the real cost breakdown of every piece."
5. THE Launch_Page SHALL show the Price_Layers without presenting any layer as an offer price, a buy price or a discount.
6. WHERE the Launch_Page shows GST context, THE Launch_Page SHALL show the GST context as a Fact labelled `FACT` with a Source_Link to PIB (September 2025), stating that readymade garments priced up to ₹2,500 per piece attract 5% GST and garments priced above ₹2,500 per piece attract 18% GST.
7. IF any ₹ amount appears in the rendered Price_Layers section outside the Fact_Element that holds the GST context Fact, THEN THE Content_Check SHALL fail the build and name the matched text.

### Requirement 7: Market price context

**User Story:** As a Visitor, I want to see roughly what similar pieces cost from popular brands online and in malls after I have given my own price answer, so that I can compare without my answer being anchored.

#### Acceptance Criteria

1. THE Concept_Card SHALL hold, for its Concept, one Market_Price_Context as an unnamed ₹ range in the form "Similar pieces from popular brands online and in malls: about ₹X–Y".
2. WHILE client-side JavaScript is running, THE Concept_Card SHALL keep its Market_Price_Context hidden until the Feedback_API has stored Concept_Feedback for that Concept that contains a Price_Band or a Price_Skip.
3. WHEN the Feedback_API stores Concept_Feedback for a Concept that contains a Price_Band or a Price_Skip, THE Concept_Card SHALL reveal that Concept's Market_Price_Context inside the same Concept_Card.
4. WHILE client-side JavaScript is running, WHEN a Visitor returns with an Anonymous_ID that already holds Concept_Feedback containing a Price_Band or a Price_Skip for a Concept, THE Concept_Card SHALL show that Concept's Market_Price_Context revealed.
5. IF client-side JavaScript is not running, THEN THE Concept_Card SHALL render the Market_Price_Context below the Concept_Feedback controls and after the price question, inside a collapsed `<details>` element whose `<summary>` reads "See what similar pieces cost".
6. THE Launch_Page SHALL label each Market_Price_Context with the Claim_Label `MoolResha market scan`.
7. THE Launch_Page SHALL show, with each Market_Price_Context, a method note stating the number of listings, the date range of the scan and the channel types (online marketplaces, brand sites, mall high-street).
8. THE Launch_Page SHALL show the note "Prices vary within every brand and change often." with the Market_Price_Context.
9. THE Fact_Registry SHALL hold, for each Market_Price_Context, the brand-level evidence trail: brand, URL, price and date seen for every listing counted.
10. THE Launch_Site SHALL exclude every field of the brand-level evidence trail from all rendered pages.
11. THE Content_Check SHALL add every brand named in any Market_Price_Context evidence trail to the Brand_Blocklist before checking pages.
12. IF any Brand_Blocklist entry appears in rendered page copy, image alt text or page metadata, THEN THE Content_Check SHALL fail the build and name the page and the matched entry.
13. THE Launch_Site SHALL refer to brands other than MoolResha only in general, unnamed terms such as "popular brands online and in malls".
14. THE Launch_Site SHALL make no estimate of any other brand's costs or margins.
15. THE Launch_Site SHALL make no statement that states or implies that any brand, or "other brands" in general, overcharge, price unfairly or make lower-quality products.

### Requirement 8: Concept presentation

**User Story:** As a Visitor, I want to see each proposed design with clear fabric notes, so that my opinion is based on real details.

#### Acceptance Criteria

1. THE Launch_Page SHALL show exactly these five Concepts, with the men's 100% cotton shirt presented first and visually largest: (1) men's 100% cotton shirt; (2) men's cotton-linen blend shirt; (3) men's 100% linen shirt, marked as a later product; (4) men's relaxed cotton pant; (5) women's relaxed cotton co-ord set.
2. THE Concept_Card SHALL display the label "Concept, not for sale" next to the Concept name.
3. THE Concept_Card SHALL display Fabric_Notes covering composition with percentages, yarn quality, weave, weight, hand feel, softness and care.
4. THE Concept_Card SHALL state yarn-quality terms such as "combed" or "long-staple" only when backed by a Fact_Registry entry, and otherwise SHALL omit the term.
5. THE Concept_Card for the women's co-ord set SHALL state the composition as either 100% cotton or a cotton-linen blend with the linen percentage stated (in the 10–20% range).
6. THE Concept_Card SHALL display the Concept's images through the Angle_Viewer (Requirement 8A), using the Concept_View files supplied under the convention in Requirement 8B.
7. THE Concept_Card SHALL contain no "buy", "add to cart", "pre-order" or price-as-offer elements.
8. THE Concept_Card SHALL display the Concept's Quality_Card (Requirement 8C) below the Fabric_Notes.

### Requirement 8A: Angle viewer

**User Story:** As a Visitor, I want to turn each design from front to back and look inside, at the fabric and at the garment on a body, so that I can judge the design as I would in a shop.

#### Acceptance Criteria

1. THE Angle_Viewer SHALL present the Turn_Views in this order: 01 front, 02 front three-quarter, 03 side, 04 back three-quarter, 05 back.
2. THE Angle_Viewer SHALL provide three tabs, labelled "Inside", "Fabric close-up" and "On a model", that show Concept_Views 06, 07 and 08 respectively.
3. WHEN a Visitor drags with a pointer or swipes horizontally across the Angle_Viewer image, THE Angle_Viewer SHALL move to the next or previous Turn_View in the direction of the drag or swipe.
4. THE Angle_Viewer SHALL provide "Previous view" and "Next view" buttons that move to the previous and next Turn_View.
5. WHILE the Angle_Viewer has keyboard focus, WHEN a Visitor presses the Left Arrow or Right Arrow key, THE Angle_Viewer SHALL move to the previous or next Turn_View.
6. WHEN the first or last Turn_View is shown, THE Angle_Viewer SHALL disable the "Previous view" or "Next view" button respectively and keep the current Turn_View shown on a further move in that direction.
7. WHERE the Visitor's device has a hover-capable pointer, WHEN the pointer rests over the Angle_Viewer image, THE Angle_Viewer SHALL show a visual hint of the next Turn_View without changing the current Concept_View.
8. WHEN the Angle_Viewer changes the shown Concept_View, THE Angle_Viewer SHALL crossfade from the previous Concept_View to the new Concept_View in 300 ms or less.
9. WHILE the Visitor's system requests reduced motion, THE Angle_Viewer SHALL switch between Concept_Views instantly without a crossfade or hover hint animation.
10. THE Angle_Viewer SHALL show, with the current Concept_View, a text position indicator naming the view (for example "Side, 3 of 5").
11. IF client-side JavaScript is not running, THEN THE Angle_Viewer SHALL show Concept_View 01 front followed by a list or grid of all eight Concept_Views, each with its view name.
12. WHILE a Concept_View image is an AI render, THE Angle_Viewer SHALL display the Render_Label visibly with that Concept_View, including with each image in the no-JavaScript list or grid.
13. THE Angle_Viewer SHALL give every Concept_View image alt text that names the Concept, the view and the visible details, such as "Men's 100% cotton shirt, back view, on a hanger, showing a plain yoke and box pleat".
14. THE Angle_Viewer SHALL load Concept_View 01 front of each Concept with the Concept_Card, and SHALL lazy-load Concept_Views 02 to 08 and any Concept_View 01 that is below the first viewport.
15. THE Angle_Viewer SHALL be built with the Launch_Site's own code, without any third-party 3D, 360° spin or carousel library, and SHALL fit within the JavaScript budget in Requirement 20.2.
16. THE Angle_Viewer SHALL display no fit maps, strain maps or size-fit claims.

### Requirement 8B: Concept image file convention

**User Story:** As the Admin, I want to drop each Concept's images into a folder under fixed names, so that I can add or replace images later without any code change.

#### Acceptance Criteria

1. THE Site_Build SHALL read each Concept's Concept_View files from that Concept's Concept_Image_Folder.
2. THE Site_Build SHALL recognise exactly these base file names, each with the extension `.png`, `.jpg` or `.webp`: `01-front`, `02-front-three-quarter`, `03-side`, `04-back-three-quarter`, `05-back`, `06-inside`, `07-fabric-closeup`, `08-on-model`.
3. WHEN a recognised Concept_View file is added to or replaced in a Concept_Image_Folder, THE Site_Build SHALL include that image in the Angle_Viewer on the next build without any change to source code or content configuration.
4. THE Site_Build SHALL convert every Concept_View file to AVIF or WebP in responsive sizes with explicit width and height (Requirement 20.3).
5. IF a recognised Concept_View file is missing from a Concept_Image_Folder, THEN THE Angle_Viewer SHALL show the Image_Placeholder in place of that Concept_View.
6. IF a recognised Concept_View file is missing and the Site_Build is not a Public_Launch_Build, THEN THE Site_Build SHALL print a warning naming the Concept_ID and the missing file and SHALL complete the build.
7. IF a recognised Concept_View file is missing and the Site_Build is a Public_Launch_Build, THEN THE Site_Build SHALL fail and name the Concept_ID and the missing file.
8. IF a Concept_Image_Folder holds more than one file with the same base file name, THEN THE Site_Build SHALL fail and name the conflicting files.
9. THE Image_Placeholder SHALL use the Launch_Site's neutral design tokens, keep the same frame size as the Concept's other Concept_Views and carry the alt text "Image coming soon" with the Concept name and view name.
10. THE launch checklist in the repository SHALL include an editorial review step confirming that no `08-on-model` image shows a face, and public launch SHALL proceed only after that step is recorded as done for every Concept. This check is a human review, not an automated check.

### Requirement 8C: Quality card

**User Story:** As a Visitor, I want a short, honest summary of each design's fibre, fabric and how it holds up, with what is proven kept apart from what is planned, so that I can judge quality without being misled.

#### Acceptance Criteria

1. THE Quality_Card SHALL show exactly seven Quality_Rows in this order: Fibre, Yarn, Fabric, On your skin, Shrinkage, After a year of washing, Care.
2. THE Quality_Card SHALL show each Quality_Row as one line of text with exactly one Quality_Label.
3. WHERE a Quality_Row carries the `FACT` Quality_Label, THE Quality_Card SHALL render that Quality_Row from a Fact_Registry entry with the Claim_Label `FACT` and show the entry's Source_Link (Requirement 3).
4. WHERE a Quality_Row carries the `Target` Quality_Label, THE Quality_Card SHALL show the visible note "Target spec, to be confirmed with our mill" with that Quality_Row.
5. WHERE a Quality_Row carries the `We'll test` Quality_Label, THE Quality_Card SHALL state what will be tested and what will be published, such as "We'll wash-test this and publish photos of colour, pilling and seams after repeated washes".
6. WHILE a Concept's yarn count or fabric weight (GSM) has not been confirmed by a Fact_Registry entry, THE Quality_Card SHALL show that yarn count or GSM only as a range carrying the `Target` Quality_Label.
7. IF a Quality_Row shows a single exact yarn count or GSM value without a `FACT` Quality_Label backed by a Fact_Registry entry, THEN THE Content_Check SHALL fail the build and name the Concept and the Quality_Row.
8. IF a Quality_Row lacks a Quality_Label, carries a `FACT` Quality_Label without a Fact_Registry entry that meets Requirement 3.6, or carries a `We'll test` Quality_Label without a stated test, THEN THE Content_Check SHALL fail the build and name the Concept and the Quality_Row.
9. THE Quality_Card SHALL show a "How we check this" link to a short section or page that explains the `FACT`, `Target` and `We'll test` Quality_Labels in plain language.
10. THE "On your skin" Quality_Row SHALL describe feel and comfort (for example hand feel and breathability) and SHALL make no health claim (Requirement 11.3).
11. THE content configuration SHALL hold the Health_Term_List as editable data, initially containing "skin-friendly", "hypoallergenic", "anti-allergy", "chemical-free" and "non-toxic".
12. IF a Health_Term_List entry appears in rendered page copy, image alt text or page metadata, THEN THE Content_Check SHALL fail the build and name the page and the matched term, matching case-insensitively and across whitespace, line breaks and hyphen variants.

### Requirement 9: Per-Concept feedback

**User Story:** As a Visitor, I want to say whether I'd wear each design, what I'd change, my colour and what I'd pay, so that MoolResha builds what people want.

#### Acceptance Criteria

1. THE Concept_Card SHALL offer a single-choice verdict: "Would wear", "Maybe", "Not for me".
2. THE Concept_Card SHALL offer multi-select Change_Chips: fit, fabric weight, colour, pockets, price, other.
3. WHEN a Visitor selects the "other" Change_Chip, THE Concept_Card SHALL show an optional free-text field limited to 200 characters.
4. THE Concept_Card SHALL offer a single-choice preferred Palette_Colour from Flax, Clay, Meadow, Indigo Dusk and Chalk White, with each swatch showing its colour name in text.
5. THE Concept_Card SHALL offer the price answer as a single choice among the Price_Bands configured in content data for that Concept, and SHALL offer no free-text or numeric price input.
6. THE Concept_Card SHALL ask the price question with the wording "If you knew exactly what went into it (fibre, yarn, fabric, stitching), what would you pay?"
7. THE content configuration SHALL hold these initial Price_Bands (MoolResha interpretation, editable, ₹500 steps):

   | Concept | Price_Bands |
   |---|---|
   | Men's 100% cotton shirt | Under ₹1,000 · ₹1,000–1,499 · ₹1,500–1,999 · ₹2,000–2,499 · ₹2,500–2,999 · ₹3,000+ |
   | Men's cotton-linen blend shirt | Under ₹1,500 · ₹1,500–1,999 · ₹2,000–2,499 · ₹2,500–2,999 · ₹3,000–3,499 · ₹3,500+ |
   | Men's 100% linen shirt | Under ₹2,000 · ₹2,000–2,499 · ₹2,500–2,999 · ₹3,000–3,499 · ₹3,500–3,999 · ₹4,000+ |
   | Men's relaxed cotton pant | Under ₹1,000 · ₹1,000–1,499 · ₹1,500–1,999 · ₹2,000–2,499 · ₹2,500–2,999 · ₹3,000+ |
   | Women's relaxed cotton co-ord set | Under ₹1,500 · ₹1,500–1,999 · ₹2,000–2,499 · ₹2,500–2,999 · ₹3,000–3,499 · ₹3,500–3,999 · ₹4,000+ |

8. IF a Concept's configured Price_Bands are not in ascending order, overlap, leave a gap, or do not have exactly one open-ended lowest band ("Under ₹X") and exactly one open-ended top band ("₹Y+"), THEN THE Content_Check SHALL fail the build and name the Concept. For this check, the upper bound of an "Under ₹X" band is ₹X (exclusive), and two adjacent bands are contiguous when the lower bound of the higher band equals the upper bound of the lower band or that upper bound plus ₹1. For example, "Under ₹1,000" followed by "₹1,000–1,499" is contiguous (₹1,000 equals the exclusive bound), and "₹1,000–1,499" followed by "₹1,500–1,999" is contiguous (₹1,499 plus ₹1 equals ₹1,500).
9. THE Concept_Card SHALL offer, with the price question, a skip control labelled "Skip this question", and WHEN a Visitor selects the skip control, THE Concept_Card SHALL clear any selected Price_Band and record a Price_Skip for that Concept.
10. WHEN a Visitor selects a Price_Band after selecting the skip control, THE Concept_Card SHALL replace the Price_Skip with the selected Price_Band.
11. THE Concept_Card SHALL present Price_Bands only as answer options to the price question, and SHALL display no Price_Band as an offer, buy, pre-order or launch price.
12. THE Concept_Card SHALL allow a Visitor to submit Concept_Feedback with only a verdict selected and all other fields empty.
13. WHEN a Visitor submits Concept_Feedback, THE Feedback_API SHALL store the Concept_Feedback against the Anonymous_ID and Concept identifier, without any email or phone number.
14. IF a Concept_Feedback request holds a price answer other than one configured Price_Band identifier for that Concept or a Price_Skip, or holds both a Price_Band and a Price_Skip, THEN THE Feedback_API SHALL reject the request with HTTP 400 and store nothing.
15. WHEN a Visitor submits Concept_Feedback for a Concept already answered from the same Anonymous_ID, THE Feedback_API SHALL replace the earlier answer, so that each Anonymous_ID holds at most one Concept_Feedback per Concept.
16. WHEN Concept_Feedback is stored, THE Concept_Card SHALL show a confirmation message within the card and keep the Visitor's selections visible.
17. IF the Feedback_API returns an error, THEN THE Concept_Card SHALL show a plain-language error message and keep the Visitor's selections for a retry.
18. THE Concept_Card SHALL ask the optional question "What matters most to you?" with multi-select Priority_Chips: softness, no shrinking, colour that lasts, breathability, easy care, long life.
19. WHEN a Visitor submits Concept_Feedback, THE Feedback_API SHALL store the selected Priority_Chips, or an empty set when none are selected, as part of that Concept_Feedback.

### Requirement 10: Biggest clothing frustration

**User Story:** As a Visitor, I want to tell MoolResha what annoys me most about clothes, so that the designs fix real problems.

#### Acceptance Criteria

1. THE Launch_Page SHALL offer multi-select Frustration_Chips including: goes see-through, shrinks, fades, poor fit, too hot, fake discounts, can't judge quality online, other.
2. WHEN a Visitor selects the "other" Frustration_Chip, THE Launch_Page SHALL show an optional free-text field limited to 200 characters.
3. WHEN a Visitor submits frustration answers, THE Feedback_API SHALL store the selected chips against the Anonymous_ID, replacing any earlier frustration answer from that Anonymous_ID.

### Requirement 11: Why transparency and natural fibres matter, and trends

**User Story:** As a Visitor, I want short, sourced explanations of why fabric transparency and natural fibres matter and what is trending, so that I learn something I can use in any shop.

#### Acceptance Criteria

1. THE Launch_Page SHALL explain the value of transparency and natural fibres in terms of softness, easy care and how long clothes last, with each Fact carrying a Claim_Label and Source_Link.
2. THE Launch_Page SHALL present between three and five trend cards, each with one sourced Fact.
3. THE Launch_Site SHALL make no claims that a fibre improves or harms health, and SHALL distinguish what research has detected from what research has proven when citing body-related studies.
4. THE Launch_Site SHALL use the words "sustainable", "eco", "eco-friendly", "green", "planet-friendly" or "conscious" only where a Fact_Registry entry substantiates the specific claim, and THE Content_Check SHALL fail the build when one of these words appears in page copy without a linked substantiating entry.
5. THE Launch_Site SHALL use the phrase "European linen" only where a Fact_Registry entry names the mill or certification, and THE Content_Check SHALL fail the build when the phrase appears without such an entry.

### Requirement 11A: Story framing

**User Story:** As a Visitor, I want the brand story told plainly and fairly, so that I trust what I read and don't feel pushed by political or national messaging.

#### Acceptance Criteria

1. THE Launch_Site SHALL use the Lead_Message as the main story message (placement in Requirement 5.5).
2. THE Launch_Site SHALL present the Aim_Statement only with a visible "Our aim" label and without a `FACT`, `INDUSTRY CLAIM` or `BRAND CLAIM` Claim_Label (placement in Requirement 4.7).
3. THE Launch_Site SHALL make no statement that imported clothing reduces India's GST or tax collection.
4. THE Launch_Site SHALL make no call for Visitors to choose Indian brands or products over brands or products from any named country.
5. THE Launch_Site SHALL mention other countries and farmer or worker share figures only as set out in Requirements 4.6 and 5.6.
6. THE content configuration SHALL hold the Restricted_Phrase_List as editable data, initially containing "made in Bangladesh", "instead of Bangladesh" and "less GST".
7. IF a Restricted_Phrase_List entry appears in rendered page copy, image alt text or page metadata outside a Fact_Element that has a Source_Link, THEN THE Content_Check SHALL fail the build and name the page and the matched phrase.
8. THE Content_Check SHALL match Restricted_Phrase_List entries case-insensitively and across whitespace and line breaks within the phrase.

### Requirement 12: Optional interest list (email, WhatsApp, size)

**User Story:** As a Visitor, I want to optionally leave my email, WhatsApp number and size, so that I hear what everyone said and what MoolResha decides.

#### Acceptance Criteria

1. THE Interest_Form SHALL mark email, WhatsApp number and size as optional, and THE Launch_Page SHALL accept Concept_Feedback and frustration answers from Visitors who never use the Interest_Form.
2. THE Interest_Form SHALL show, before the fields, a short notice stating what data is collected, the purpose (updates on results and launch), who processes it (Email_Provider), how long it is kept and how to withdraw, with a link to the Privacy_Notice.
3. THE Interest_Form SHALL present separate, unticked consent checkboxes for email updates and for WhatsApp updates.
4. IF a Visitor enters an email without ticking the email consent, THEN THE Interest_Form SHALL block submission and explain that consent is required to store the email.
5. IF a Visitor enters a WhatsApp number without ticking the WhatsApp consent, THEN THE Interest_Form SHALL block submission and explain that consent is required to store the number.
6. THE Interest_Form SHALL require the Visitor to confirm being 18 or older before storing an email or WhatsApp number.
7. WHEN a Visitor submits a consented email, THE Feedback_API SHALL send the email to the Email_Provider for double opt-in confirmation.
8. THE Feedback_API SHALL link an email or WhatsApp number to the Anonymous_ID's feedback only when the Visitor has ticked a separate, unticked consent to link them.
9. WHEN a consent is given, THE Submission_Store SHALL record the consent type, notice version and timestamp.
10. IF an email fails format validation or a WhatsApp number fails validation as an Indian mobile number (+91 followed by 10 digits starting 6–9), THEN THE Interest_Form SHALL show a field-level error message.
11. THE Interest_Form SHALL offer sizes from a fixed list (XS, S, M, L, XL, XXL) plus "prefer not to say".

### Requirement 13: Privacy, withdrawal, deletion and grievance (DPDP)

**User Story:** As a Visitor, I want to know what happens to my data and be able to withdraw or delete it, so that I stay in control.

#### Acceptance Criteria

1. THE Launch_Site SHALL publish a Privacy_Notice page in plain Indian English listing: each data item collected, the purpose of each, the processors used, the retention period, how to withdraw consent, how to request deletion, and the Grievance_Contact.
2. THE Launch_Site SHALL link the Privacy_Notice from the footer and from the Interest_Form notice.
3. THE Launch_Site SHALL collect only the data items listed in the Privacy_Notice.
4. THE Launch_Site SHALL use collected data only for the purposes listed in the Privacy_Notice.
5. WHEN a subscriber uses the unsubscribe link in any email, THE Email_Provider SHALL stop sending that subscriber emails.
6. WHEN the Admin receives a withdrawal or deletion request through the Grievance_Contact, THE Admin SHALL be able to delete that person's email, WhatsApp number, consent records and any linked data from the Submission_Store and the Email_Provider through a documented procedure.
7. THE Privacy_Notice SHALL state the time within which withdrawal, deletion and grievance requests are answered.
8. THE Privacy_Notice SHALL display a version number and last-updated date.

### Requirement 14: Write endpoint security

**User Story:** As the Admin, I want every write endpoint protected, so that bots and abuse cannot spoil the data or run up costs.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL limit every Feedback_API write endpoint using the limits and keys defined in `docs/rate-limiting.md`.
2. IF a client exceeds a rate limit, THEN THE Feedback_API SHALL respond with HTTP 429 and a `Retry-After` header, and SHALL store nothing from that request.
3. WHEN a Concept_Feedback, frustration or Interest_Form submission is received, THE Feedback_API SHALL verify the Bot_Check token server-side before storing anything.
4. IF the Bot_Check verification fails, THEN THE Feedback_API SHALL reject the request with HTTP 403 and store nothing.
5. IF a write request's `Origin` header does not match the Launch_Site's allowed origins, THEN THE Feedback_API SHALL reject the request with HTTP 403.
6. THE Feedback_API SHALL validate every field against an allow-list schema (known Concept identifiers, verdict values, Change_Chips, Palette_Colours, Priority_Chips, Price_Bands, Price_Skip, Frustration_Chips, sizes, length limits) and reject non-conforming requests with HTTP 400.
7. THE Feedback_API SHALL store free text as plain text and THE Launch_Site SHALL escape free text wherever free text is displayed.
8. THE Launch_Site SHALL load all secrets (Bot_Check secret, Email_Provider key, Admin credentials) from environment variables or Cloudflare secrets, and THE repository SHALL contain no secret values.
9. THE Feedback_API SHALL exclude email addresses, phone numbers and IP addresses from application logs.

### Requirement 15: Anonymous identifier

**User Story:** As a Visitor, I want my feedback to be anonymous by default, so that I can give an honest opinion without identifying myself.

#### Acceptance Criteria

1. THE Launch_Site SHALL generate the Anonymous_ID as a random value of at least 122 bits (for example a UUID v4) that is not derived from IP address, device data or personal data.
2. THE Launch_Site SHALL reuse the same Anonymous_ID for submissions from the same browser until the Visitor clears site storage.
3. IF the Anonymous_ID received by the Feedback_API is not in the expected format, THEN THE Feedback_API SHALL reject the request with HTTP 400.

### Requirement 16: Live aggregate results

**User Story:** As a Visitor, I want to see what others think, so that I feel part of something and have a reason to return.

#### Acceptance Criteria

1. THE Results_View SHALL show, per Concept, the percentage split of verdicts, the leading Palette_Colour, the most chosen Price_Band and, under the heading "What matters most", the most chosen Priority_Chip (subject to criterion 6).
2. THE Results_View SHALL show only aggregate counts and percentages, with no free text, Anonymous_IDs, emails or phone numbers.
3. WHILE a Concept has fewer than 20 Concept_Feedback responses, THE Results_View SHALL show "Not enough responses yet" for that Concept instead of percentages.
4. THE Results_View SHALL display the response count and the time the aggregate was last computed.
5. THE Results_View SHALL show verdict percentages for each Concept that sum to 100% within ±1 percentage point of rounding.
6. WHILE a Concept has 20 or more Concept_Feedback responses, THE Results_View SHALL show that Concept's most chosen Priority_Chip, and WHERE two or more Priority_Chips tie for most chosen, THE Results_View SHALL show every tied Priority_Chip.

### Requirement 17: Admin export

**User Story:** As the Admin, I want to export feedback and aggregates as CSV, so that I can analyse demand without exposing personal data publicly.

#### Acceptance Criteria

1. THE Admin_Export SHALL require Admin authentication and SHALL return HTTP 401 or 403 to unauthenticated requests.
2. THE Admin_Export SHALL provide a feedback CSV (one row per Concept_Feedback: Anonymous_ID, Concept, verdict, Change_Chips, Palette_Colour, Priority_Chips, Price_Band, Price_Skip flag, other-text, UTM_Source, timestamp) and an aggregate CSV (counts per Concept × answer, including a count for each Priority_Chip).
3. THE Admin_Export SHALL exclude email addresses and phone numbers from the feedback and aggregate CSVs.
4. THE Admin_Export SHALL encode CSV values per RFC 4180 and SHALL neutralise values that begin with `=`, `+`, `-` or `@` to prevent spreadsheet formula injection.
5. FOR ALL valid feedback records, exporting to CSV then parsing the CSV SHALL produce records equivalent to the originals (round-trip property).
6. THE aggregate CSV SHALL report, per Concept and answer, counts equal to the counts computed from the feedback CSV.

### Requirement 18: Analytics and UTM capture

**User Story:** As the Admin, I want to know where visitors come from and how far they get, without tracking people, so that I can improve the page.

#### Acceptance Criteria

1. THE Launch_Site SHALL use Cloudflare Web Analytics and SHALL set no analytics cookies, so that no cookie banner is needed.
2. WHEN a Visitor lands with UTM_Source parameters, THE Launch_Site SHALL attach the UTM_Source values to that visit's Event_Counter events and feedback submissions.
3. THE Event_Counter SHALL count these events: page view, section reached (journey, money, concepts, interest form), Concept_Feedback submitted, frustration submitted, Interest_Form submitted, Journal link clicked.
4. THE Event_Counter SHALL store only event name, Concept identifier where relevant, UTM_Source and a day-level date, with no Anonymous_ID, IP address or personal data.
5. THE Rate_Limiter SHALL apply to the Event_Counter endpoint.

### Requirement 19: Footer, contact and trust signals

**User Story:** As a Visitor, I want to know who runs the site and how to reach them, so that I can trust a brand without a public founder.

#### Acceptance Criteria

1. THE Launch_Site footer SHALL display "MoolResha studio, Indore", a contact email, a link to the Privacy_Notice, the Grievance_Contact, the statement "A research project, not a shop", and the Journal link.
2. THE Launch_Site SHALL display no founder name or founder face photograph.
3. THE Launch_Site SHALL use process, hands, fabric and sketch imagery for human presence.
4. WHERE a registered legal entity exists, THE footer SHALL display the registered entity name and address.
5. WHEN the Launch_Site is prepared for public launch, THE launch checklist in the repository SHALL record the date on which a lawyer reviewed the Privacy_Notice, consent flow, Price_Layers copy and Market_Price_Context copy, and public launch SHALL proceed only after that date is recorded. The launch checklist SHALL also include the on-model image review in Requirement 8B.10.

### Requirement 20: Mobile-first performance

**User Story:** As a Visitor on a mid-range phone in India, I want the page to load fast, so that I don't give up before it appears.

#### Acceptance Criteria

1. THE Launch_Page SHALL achieve Largest Contentful Paint of 2.5 s or less, Cumulative Layout Shift of 0.1 or less and Interaction to Next Paint of 200 ms or less in a Lighthouse mobile run with default throttling.
2. THE Launch_Page SHALL ship no more than 50 KB of compressed client-side JavaScript on first load.
3. THE Launch_Site SHALL serve images in AVIF or WebP with responsive sizes, explicit width and height, and lazy loading for images below the first viewport.
4. THE Launch_Page SHALL lay out correctly from 320 px to 1440 px viewport width without horizontal scrolling.
5. THE Launch_Site SHALL self-host fonts and load fonts without blocking first text render.

### Requirement 21: Accessibility (WCAG 2.1 AA)

**User Story:** As a Visitor who uses a keyboard, screen reader or reduced motion, I want to use every part of the site, so that I can learn and give feedback like anyone else.

#### Acceptance Criteria

1. THE Launch_Site SHALL meet WCAG 2.1 Level AA, verified by an automated audit (axe or Lighthouse) with zero violations and a manual keyboard pass.
2. THE Launch_Site SHALL make every interactive control (chips, swatches, verdicts, Price_Bands, the price skip control, Priority_Chips, the "See what similar pieces cost" `<details>` element, the Angle_Viewer buttons and tabs, the "How we check this" link, forms, journey stops, Source_Links) operable by keyboard with a visible focus indicator.
3. THE Launch_Site SHALL expose chip and swatch groups with correct roles and states (radio group for single choice, checkbox group for multi-select).
4. THE Launch_Site SHALL convey Palette_Colour and chart information by text in addition to colour.
5. WHEN a submission succeeds or fails, THE Launch_Site SHALL announce the result through an ARIA live region.
6. WHILE the Visitor's system requests reduced motion, THE Launch_Site SHALL disable non-essential animation and transitions.
7. THE Launch_Site SHALL provide text contrast of at least 4.5:1 for body text and 3:1 for large text and UI component boundaries.

### Requirement 22: Graceful operation without JavaScript or backend

**User Story:** As a Visitor on a weak connection, I want to read the content even if scripts fail, so that I still learn something.

#### Acceptance Criteria

1. IF client-side JavaScript fails to load, THEN THE Launch_Page SHALL still display all content sections, Facts, Source_Links and the footer.
2. IF the Feedback_API is unreachable, THEN THE Launch_Page SHALL show a message that feedback is temporarily unavailable and keep all content readable.
3. IF the Results_View data cannot be loaded, THEN THE Results_View SHALL show "Results unavailable right now" instead of empty or zero values.
