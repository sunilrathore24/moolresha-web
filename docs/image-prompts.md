# MoolResha Website — Image Generation Prompts (Gemini)

Prompts to generate every decorative image on the site, in the MoolResha brand
visual style (adapted from the social skill's Brand Visual DNA §5.1).

## How to use

1. Generate each image using a prompt below.
2. Make sure there is **no visible AI watermark** — see the next section for how.
3. Save the file with the **exact filename** given, as **`.webp`**
   (or `.jpg`/`.png` — but tell me if you don't use `.webp` and I'll update the refs).
4. Drop the files into **`moolresha-web/public/images/`**.
5. They appear on the site automatically at `/images/<filename>` — no code change.

## Removing the Gemini AI watermark (IMPORTANT — read this)

Gemini stamps a small **"sparkle" AI badge in the bottom-right corner** of the
image **after** it's generated. It is an overlay applied on top — so **no prompt
instruction can move or remove it** (a white strip, aspect-ratio change, or
"no watermark" negative prompt won't work; the badge just lands on top anyway).

Use one of these instead, best first:

1. **Generate in Google AI Studio** (aistudio.google.com) — its image output
   does **not** carry the visible sparkle badge. This is Google's own tool and
   the cleanest route. (An invisible provenance signal, SynthID, stays embedded
   either way — that's expected and fine; it isn't visible on the page.)
2. **Google AI Ultra** subscription — also returns images without the visible badge.
3. **If you can only use the watermarked Gemini app — crop the bottom strip.**
   The badge sits at the bottom-right, so every prompt below is sized **60px
   taller** and asks Gemini to keep the **bottom edge low-detail** with the
   **subject kept away from the bottom**. You then crop off the bottom ~60px,
   which removes the badge while losing almost none of the real photo.

| Final size (after any crop) | Generate at | If cropping, crop off |
|---|---|---|
| 1800 × 1200 (3:2 hero) | 1800 × 1260 | bottom 60px |
| 1200 × 1200 (1:1 card) | 1200 × 1260 | bottom 60px |

> If you use AI Studio (option 1) you don't need to crop at all — just export at
> the final size. The extra 60px only matters if you're cropping a badge off.

## Key differences from the carousel prompts

- **NO text is rendered into these images.** All headings/copy are real HTML.
  So there is no `RENDER TEXT ON IMAGE` block.
- **Leave generous negative space** in the heroes so the HTML headline stays legible.
- **Web aspect ratios**; keep the bottom edge low-detail so a badge crop is lossless.

## Image list

| # | Filename | Used on | Final aspect | Purpose |
|---|----------|---------|--------------|---------|
| 1 | `home-hero.webp` | Homepage hero | 3:2 | Main brand hero |
| 2 | `fibre-linen.webp` | Homepage "Explore fibres" card | 1:1 | Linen card |
| 3 | `fibre-cotton.webp` | Homepage "Explore fibres" card | 1:1 | Cotton card |
| 4 | `fibre-blends.webp` | Homepage "Explore fibres" card | 1:1 | Blends card |
| 5 | `hub-fibre-stories.webp` | Fibre Stories hub hero | 3:2 | Flax → fabric |
| 6 | `hub-fabric-school.webp` | Fabric School hub hero | 3:2 | Weave/thread macro |
| 7 | `hub-comparisons.webp` | Comparisons hub hero | 3:2 | Two fabrics side by side |
| 8 | `hub-shopping-guides.webp` | Guides hub hero | 3:2 | Checking fabric in light |
| 9 | `about-hero.webp` | About page hero | 3:2 | Raw fibre in hands |
| 10 | `article-linen-shirt-hero.webp` | Linen-shirt article hero | 3:2 | Linen shirt detail |

---

## The shared Brand Visual DNA (baked into every prompt below)

Each prompt is fully self-contained — copy any one straight into Gemini with
nothing to assemble. The final line of every prompt is the white crop-strip
instruction.

---

### 1. `home-hero.webp` — Homepage hero (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, soft clay/terracotta, muted sage green, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural morning daylight from one side, gentle long shadows, golden diffused light.
TEXTURE: emphasise natural fibre texture — visible weave, slubs, raw edges, folded cloth, grain of wood.
MOOD: quiet, curious, authentic, rooted. "Closer to the root."
COMPOSITION: a neatly stacked pile of folded natural linen and cotton garments in beige/cream/oat tones resting on a pale oak surface, positioned to the RIGHT of frame; the LEFT third is calm empty background (soft-focus wall / open table) kept clear as negative space for a headline.
CAMERA: full-frame look, 50mm, shallow depth of field, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no faces, no neon colours, no heavy vignette, no clutter, no plastic gradients.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain surface or soft shadow) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 2. `fibre-linen.webp` — Linen fibre card (final 1:1)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, muted sage green, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle shadows, morning diffused light.
TEXTURE: strong emphasis on natural linen weave — visible slubs, irregular threads, raw edge of the cloth.
MOOD: quiet, authentic, rooted.
COMPOSITION: a folded swatch of natural undyed linen fabric with a few dried blue-green flax stems resting on top, centred, top-down flat-lay on a warm oat surface.
CAMERA: full-frame macro look, 85mm, shallow depth of field on the weave, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1200 x 1260 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (plain surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1200 px (1:1). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1200 px.
```

---

### 3. `fibre-cotton.webp` — Cotton fibre card (final 1:1)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, off-white, soft beige, muted sage green. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle shadows, morning diffused light.
TEXTURE: emphasise soft cotton fibre — a fluffy raw cotton boll and a smooth folded cotton swatch, fine cloth texture.
MOOD: quiet, authentic, rooted.
COMPOSITION: an open raw cotton boll on its dried branch resting beside a neatly folded cream cotton fabric swatch, centred, top-down flat-lay on a warm oat surface.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1200 x 1260 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (plain surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1200 px (1:1). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1200 px.
```

---

### 4. `fibre-blends.webp` — Blends card (final 1:1)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, soft clay, muted sage green, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle shadows, morning diffused light.
TEXTURE: contrast two cloths — a textured slubby linen and a smoother softer cotton — so the difference in weave is visible.
MOOD: quiet, curious, authentic.
COMPOSITION: two folded fabric swatches partly overlapping — one textured natural linen, one smooth cream cotton — centred, top-down flat-lay on a warm oat surface, showing where they meet.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1200 x 1260 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (plain surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1200 px (1:1). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1200 px.
```

---

### 5. `hub-fibre-stories.webp` — Fibre Stories hub hero (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, muted sage green, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural morning daylight, low mist, gentle golden light.
TEXTURE: emphasise the flax plant and natural fibre — delicate stems, plant matter, soil grain.
MOOD: quiet, curious, rooted. "Closer to the root."
COMPOSITION: a field of flax plants in soft blue-green bloom stretching toward the horizon at dawn, with the sky occupying the top third as calm negative space for a headline; subject weighted to the lower-right.
CAMERA: full-frame look, 50mm, wider depth of field for the landscape, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no logos, no people, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (soft foreground/blur) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 6. `hub-fabric-school.webp` — Fabric School hub hero (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, undyed flax beige, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft raking natural daylight from one side to reveal the weave, gentle shadows.
TEXTURE: extreme emphasis on the woven structure of natural fabric — individual threads, warp and weft, slubs.
MOOD: quiet, precise, curious.
COMPOSITION: a macro close-up of natural linen fabric weave filling the right two-thirds of the frame, with a softly blurred calmer area on the LEFT kept as negative space for a headline; a wooden spool or loose thread resting at the edge.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (soft blur) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 7. `hub-comparisons.webp` — Comparisons hub hero (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, soft clay, muted sage green, off-white. Low saturation, warm neutral tones.
LIGHT: soft even natural daylight, gentle shadows.
TEXTURE: show two distinct cloth textures side by side — a slubby textured linen and a smoother cotton — so the contrast is clear.
MOOD: quiet, curious, balanced.
COMPOSITION: two folded fabric swatches laid side by side on a pale oak surface, top-down — textured linen on one side, smooth cotton on the other, meeting near centre; some calm empty table surface at the top as negative space for a headline.
CAMERA: full-frame look, 50mm, medium depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain table surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 8. `hub-shopping-guides.webp` — Guides hub hero (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, undyed flax beige, soft clay, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural window light behind the fabric, so the weave is backlit and readable.
TEXTURE: emphasise the fabric being examined — weave density visible as light passes through.
MOOD: quiet, attentive, curious.
COMPOSITION: a pair of hands holding up a piece of natural linen fabric toward a soft-lit window to inspect the weave, positioned to the right; the LEFT side is softly blurred bright window light kept as negative space for a headline. Hands natural and relaxed, no distortion.
CAMERA: full-frame look, 50mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no faces, no distorted hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (soft blur) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 9. `about-hero.webp` — About page hero (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, warm oat, raw umber, muted sage green, natural linen cream, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle golden shadows.
TEXTURE: raw natural fibre — a loose bundle of undyed flax/linen fibre strands, fine and organic.
MOOD: quiet, honest, rooted. "Closer to the root."
COMPOSITION: two open hands gently cradling a loose bundle of raw undyed flax fibre, centred slightly right, with a calm softly-blurred earthy background on the left as negative space for a headline. Hands natural, no distortion.
CAMERA: full-frame look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no faces, no distorted hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain oak surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 10. `article-linen-shirt-hero.webp` — Linen-shirt article hero (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, undyed flax beige, soft clay, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural side daylight, gentle shadows revealing the fabric's texture and folds.
TEXTURE: strong emphasis on a natural linen shirt — visible weave, slubs, natural relaxed wrinkles, button and collar detail.
MOOD: quiet, tactile, honest.
COMPOSITION: a close detail of a folded or draped natural cream linen shirt showing the collar, a button, and the weave, resting on a pale oak surface; the upper area kept as calm negative space for a headline.
CAMERA: full-frame look, 85mm, shallow depth of field on the weave and button, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no logos, no faces, no distorted hands, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain oak surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

## Redesign additions — new hero/section shots + 4 concept photography sets (#11 onward)

> Generate **one image per prompt**. Do **not** generate all images in this section together. Generate only the next **5** images, stop, and get the user's verification/approval on those 5 before generating the next batch of 5. Repeat until all images are done.

This section was drafted after checking the untracked `asset/` folder (singular) for
existing real photography first, so it does **not** repeat anything that already
exists. See "Already covered — skipped" below before generating anything.

**Save destinations differ from the table above:**

- **#11–#12** go into **`public/images/`**, exactly like items 1–10 above.
- **#13–#32** go into **`src/assets/concepts/<concept-id>/meadow/<filename>`** —
  the exact path is given in each heading below. Once a file lands at that exact
  path (same filename as the real `mens-cotton-shirt` photography:
  `01-front.png`, `05-back.png`, `07-fabric-closeup.png`, `08-on-model.png`,
  `material-card.png`), the site's colour-aware image resolver
  (`src/lib/concept-image-resolver.ts`) picks it up automatically — no code change.

### Already covered — skipped, not drafted here

- **All `mens-cotton-shirt` product photography, every colourway** (front/back/
  on-model/fabric close-ups/embroidery close-ups/Material Passport tags) already
  exists as real photography at `asset/textured shirt/<colour>/*.png` for all six
  colourways (meadow sage, natural flax, desert clay, coastal slate blue, ivory
  mist, light graphite), and the Meadow Sage, flax, clay, graphite and
  indigo_dusk/chalk_white sets are already placed at
  `src/assets/concepts/mens-cotton-shirt/<colour>/`. Nothing to generate.
- **Embroidery macro close-ups** — real ones already exist per colourway, e.g.
  `asset/textured shirt/desert clay/Terracotta Shirt with Infinity Wave Embroidery-5.png`,
  `asset/textured shirt/coastal slate blue/Teal Woven Shirt with Infinity Embroidery-6.png`,
  `asset/textured shirt/natural flax/Embroidered Waves on Natural Flax-5.png`. Nothing to generate.
- **Homepage hero carousel "Design Principles" / fabric-weave mood macro (3:2)** —
  `asset/textured shirt/meadow sage/Magnified Sage Green Fabric Weave-5.png` is
  already a clean 1536 × 1024 px (exactly 3:2) editorial macro of Meadow Sage
  weave under a magnifying glass — on-brand and good enough as-is. **No prompt
  needed.** Just copy it in and convert/rename, e.g. to
  `public/images/home-hero-fabric-macro.webp`.
- The top-level `asset/MoolResha ... Storyboard*.png` files were checked too —
  they're moodboard/brand-brief compositions (useful for confirming palette and
  font pairing, already in the codebase), not standalone croppable site assets.
  None of them contain an isolated "five shirts on hangers" shot or a clean
  faceless forearm/skin shot, which is why #11 and #12 below still need prompts.

### Additional canvas sizes used in this section

(3:2 and 1:1 are unchanged from the table near the top of this file.)

| Final size (after any crop) | Generate at | If cropping, crop off |
|---|---|---|
| 1200 × 1500 (4:5 portrait) | 1200 × 1560 | bottom 60px |
| 1200 × 1600 (3:4 card) | 1200 × 1660 | bottom 60px |

### Image list (continuing the numbering above)

| # | Filename / path | Used on | Final aspect | Purpose |
|---|----------|---------|--------------|---------|
| 11 | `home-hero-shirts.webp` | Homepage hero carousel slide | 3:2 | Five shirts on hangers, Meadow Sage in front |
| 12 | `why-fabric-skin-feel.webp` | WhyThisFabric section support shot | 4:5 | Forearm/wrist, fabric draped, no face |
| 13 | `src/assets/concepts/mens-cotton-linen-shirt/meadow/01-front.png` | Concept gallery — front | 4:5 | Cotton-linen shirt, on a hanger |
| 14 | `src/assets/concepts/mens-cotton-linen-shirt/meadow/05-back.png` | Concept gallery — back | 4:5 | Cotton-linen shirt, on a hanger |
| 15 | `src/assets/concepts/mens-cotton-linen-shirt/meadow/07-fabric-closeup.png` | Concept gallery — fabric close-up | 3:2 | Plain weave, light slub macro |
| 16 | `src/assets/concepts/mens-cotton-linen-shirt/meadow/08-on-model.png` | Concept gallery — on model | 4:5 | Worn, cropped at the chin |
| 17 | `src/assets/concepts/mens-cotton-linen-shirt/meadow/material-card.png` | Concept gallery — Material Passport | 3:4 | Fabric spec tag |
| 18 | `src/assets/concepts/mens-linen-shirt/meadow/01-front.png` | Concept gallery — front | 4:5 | 100% linen shirt, on a hanger |
| 19 | `src/assets/concepts/mens-linen-shirt/meadow/05-back.png` | Concept gallery — back | 4:5 | 100% linen shirt, on a hanger |
| 20 | `src/assets/concepts/mens-linen-shirt/meadow/07-fabric-closeup.png` | Concept gallery — fabric close-up | 3:2 | Open plain weave, slub macro |
| 21 | `src/assets/concepts/mens-linen-shirt/meadow/08-on-model.png` | Concept gallery — on model | 4:5 | Worn, cropped at the chin |
| 22 | `src/assets/concepts/mens-linen-shirt/meadow/material-card.png` | Concept gallery — Material Passport | 3:4 | Fabric spec tag |
| 23 | `src/assets/concepts/mens-relaxed-pant/meadow/01-front.png` | Concept gallery — front | 4:5 | Relaxed cotton pant, on a hanger |
| 24 | `src/assets/concepts/mens-relaxed-pant/meadow/05-back.png` | Concept gallery — back | 4:5 | Relaxed cotton pant, on a hanger |
| 25 | `src/assets/concepts/mens-relaxed-pant/meadow/07-fabric-closeup.png` | Concept gallery — fabric close-up | 3:2 | Cotton twill macro |
| 26 | `src/assets/concepts/mens-relaxed-pant/meadow/08-on-model.png` | Concept gallery — on model | 4:5 | Worn, cropped at waist/below knee |
| 27 | `src/assets/concepts/mens-relaxed-pant/meadow/material-card.png` | Concept gallery — Material Passport | 3:4 | Fabric spec tag |
| 28 | `src/assets/concepts/womens-coord-set/meadow/01-front.png` | Concept gallery — front | 4:5 | Co-ord set, on a hanger |
| 29 | `src/assets/concepts/womens-coord-set/meadow/05-back.png` | Concept gallery — back | 4:5 | Co-ord set, on a hanger |
| 30 | `src/assets/concepts/womens-coord-set/meadow/07-fabric-closeup.png` | Concept gallery — fabric close-up | 3:2 | Plain cotton weave macro |
| 31 | `src/assets/concepts/womens-coord-set/meadow/08-on-model.png` | Concept gallery — on model | 4:5 | Worn, cropped at the chin |
| 32 | `src/assets/concepts/womens-coord-set/meadow/material-card.png` | Concept gallery — Material Passport | 3:4 | Fabric spec tag |

A note on the Material Passport cards (#17, #22, #27, #32): unlike every other
prompt in this file, these **do** render text on the image — like the social
skill's carousel prompts, not like the decorative hero/hub images above. Each
one includes a `RENDER TEXT ON IMAGE` block with the exact copy to render,
mirroring the real card already shipped at
`asset/textured shirt/meadow sage/Meadow Sage Material Passport Tag.png`.

---

## Batch 1 — hero carousel slide + WhyThisFabric support shot (2 images)

### 11. `home-hero-shirts.webp` — Homepage hero carousel slide (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green leading the frame, with undyed flax beige, soft clay/terracotta, dusty coastal blue, and ivory mist as the supporting colours behind it; warm oat background. Low saturation, warm neutral tones throughout.
LIGHT: soft natural daylight from one side, gentle long shadows, warm diffused studio light.
TEXTURE: five button-front shirts on simple wooden hangers, each a different natural woven cotton fabric with its own subtle weave and slub, collars and buttons crisp and clean.
MOOD: quiet, confident, considered. "Closer to the root."
COMPOSITION: five shirts on wooden hangers in a loose row with slight depth staggering; the Meadow Sage shirt is largest, sharpest, and hangs in front and slightly higher/closer to camera than the rest; behind and to the sides, softly staggered and a little out of focus, hang shirts in Natural Flax, Desert Clay, Coastal Slate Blue, and Ivory Mist — five shirts total, each clearly a different natural tone; the hangers are suspended against a plain warm oat wall, with calm negative space in the upper third for a headline.
CAMERA: full-frame look, 50mm, shallow depth of field centred on the Meadow Sage shirt in front, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logos, no people, no faces, no neon colours, no heavy vignette, no clutter, no plastic gradients, no more or fewer than five shirts.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain wall/soft shadow) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 12. `why-fabric-skin-feel.webp` — WhyThisFabric section support shot (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: muted sage green fabric, warm skin tone, undyed flax beige, warm oat, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural daylight from one side, gentle shadows, warm and close.
TEXTURE: a natural woven cotton fabric draped loosely across a forearm and wrist, visible weave and slub against the fine texture of skin and fine hair.
MOOD: quiet, tactile, intimate without being precious. "How it feels, not just how it looks."
COMPOSITION: a close crop of a forearm and wrist resting on a pale oak surface, with a swatch of muted sage green woven cotton fabric draped loosely across the forearm so both the fabric and the skin underneath are clearly visible; the hand is relaxed, fingers loosely curled, no jewellery, no nail polish; the frame is cropped above the elbow and below the fingertips so no face, shoulder or torso is visible; calm empty space at the top of the frame for a caption.
CAMERA: full-frame macro look, 85mm, shallow depth of field on the point where fabric meets skin, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no face, no jewellery, no nail polish, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (plain oak surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

## Batch 2 — `mens-cotton-linen-shirt`, Meadow Sage (5 images)

60/40 cotton-linen blend, plain weave with a light slub texture, light weight
(target ~120–150 gsm), dry and textured hand feel that relaxes with washing.
Silhouette: camp collar, relaxed straight body, short sleeves, plain button
placket, no chest pocket.

### 13. `src/assets/concepts/mens-cotton-linen-shirt/meadow/01-front.png` — front, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm — the same visual language as the rest of the MoolResha site, applied to a studio product shot.
PALETTE: muted sage green (Meadow Sage) garment against a warm oat/putty seamless backdrop, with soft ivory buttons. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: a 60/40 cotton-linen blend in a plain weave with a light slub texture — slightly irregular threads catching the light, a soft airy drape with a little more structure than pure linen.
MOOD: quiet, honest, considered. A shirt presented plainly, letting the cloth speak for itself.
COMPOSITION: a men's cotton-linen blend shirt in Meadow Sage hanging face-on on a simple wooden hanger against a plain warm oat seamless backdrop, centred in frame; camp collar open, relaxed straight body, short sleeves, a plain button placket fully visible, no chest pocket; the hanger hook is visible at the top with calm empty space around it.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole garment is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 14. `src/assets/concepts/mens-cotton-linen-shirt/meadow/05-back.png` — back, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment against a warm oat/putty seamless backdrop. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: the same 60/40 cotton-linen blend, plain weave with a light slub texture, visible across the back panel and yoke.
MOOD: quiet, honest, considered.
COMPOSITION: the same men's cotton-linen blend shirt in Meadow Sage, rotated to show the back, hanging on the same simple wooden hanger against the plain warm oat seamless backdrop, centred in frame; plain yoke, even curved hem, short sleeves, no branding visible on the back.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole garment is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 15. `src/assets/concepts/mens-cotton-linen-shirt/meadow/07-fabric-closeup.png` — fabric close-up (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) fabric, softly blurred warm oat surface behind it. Low saturation, warm neutral tones.
LIGHT: soft raking natural daylight from one side to reveal the weave, gentle shadows.
TEXTURE: extreme close-up of a 60/40 cotton-linen blend in a plain weave with a light slub texture — slightly irregular threads, a little more texture than smooth cotton but less open than pure linen.
MOOD: quiet, precise, curious — matching the brand's existing Fabric School close-ups.
COMPOSITION: a macro close-up of the folded Meadow Sage cotton-linen fabric filling most of the frame, a soft fold or two for depth, resting on a pale oak surface at the lower edge; calm negative space at the top for a caption.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain oak surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 16. `src/assets/concepts/mens-cotton-linen-shirt/meadow/08-on-model.png` — on model, cropped at the chin (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment, warm neutral softly blurred background with a hint of greenery. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, outdoor-adjacent studio setting, gentle directional light with soft shadows.
TEXTURE: the 60/40 cotton-linen blend's light slub texture visible across the chest and shoulders as the model moves naturally.
MOOD: quiet, relaxed, easy to wear.
COMPOSITION: a model wearing the Meadow Sage cotton-linen shirt, top button open, untucked, cropped at the chin so no face is visible; relaxed, natural stance, one hand loosely in a pocket; softly blurred warm neutral background with a hint of greenery to one side.
CAMERA: full-frame look, 85mm, shallow depth of field on the garment, fine natural grain, no HDR.
NEGATIVE: no face, no text, no lettering, no watermark, no extra logos beyond a small subtle chest emblem, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (soft blur) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 17. `src/assets/concepts/mens-cotton-linen-shirt/meadow/material-card.png` — Material Passport tag (final 3:4)

```
STYLE: Editorial product-tag graphic, clean and minimal, same warm-neutral brand world as the rest of the site. Premium but honest, not glossy.
PALETTE: warm ivory/cream card stock, deep muted green ink for text and icons, a muted sage green colour swatch dot; resting on folded Meadow Sage cotton-linen fabric. Low saturation, warm neutral tones.
LIGHT: soft, even studio daylight, gentle shadow under the card so it reads as a physical hang-tag.
TEXTURE: a die-cut hang-tag with a reinforced hole at the top, resting on the folded cotton-linen fabric so the weave is softly visible underneath and around the card's edges.
MOOD: quiet, precise, trustworthy — a specification card, not an ad.
COMPOSITION: a single rounded-rectangle hang-tag with a punched hole at the top centred in the upper two-thirds of the frame, resting diagonally on folded Meadow Sage cotton-linen fabric that fills the background; the card is large enough that all text is clearly legible.
RENDER TEXT ON IMAGE (exact copy, clean sans/serif mix, dark green ink):
  - Top: a small wave-glyph mark above the wordmark "moolresha"
  - Below the wordmark, small caps: "COTTON-LINEN SHIRT"
  - A thin horizontal rule
  - Heading: "Material Passport"
  - Row 1 (small cotton-boll icon): "Fabric" / "60% Cotton, 40% Linen"
  - Row 2 (small grid-weave icon): "Weave" / "Plain Weave, Light Slub"
  - Row 3 (small stacked-layers icon): "Weight" / "120–150 GSM"
  - Row 4 (small wave-line icon): "Feel" / "Dry, Textured, Relaxes with Washing"
  - Row 5 (small filled-circle icon in muted sage green): "Colour" / "Meadow Sage"
  - A thin horizontal rule
  - Footer, small italic: "All specifications are design targets, to be confirmed with our mill."
CAMERA: full-frame macro-product look, 85mm, shallow depth of field keeping the card sharp and the fabric behind it softly out of focus, fine natural grain, no HDR.
NEGATIVE: no AI watermark/sparkle badge, no extra logos beyond the ones specified above, no misspelled or garbled text, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1660 px. Keep the card centred/upper and the BOTTOM edge calm and low-detail (soft-focus fabric) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1600 px (3:4). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1600 px.
```

---

## Batch 3 — `mens-linen-shirt`, Meadow Sage (5 images)

100% linen, plain weave with a visible slub texture, light-to-mid weight
(target ~120–160 gsm), dry and textured hand feel that softens with washing.
Silhouette: relaxed collar, plain button placket, long sleeves meant to be
rolled, no chest pocket.

### 18. `src/assets/concepts/mens-linen-shirt/meadow/01-front.png` — front, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment against a warm oat/putty seamless backdrop, with soft ivory buttons. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: 100% linen in a plain weave with a visible slub texture — noticeably more open and irregular than cotton, with linen's characteristic dry, slightly crisp surface.
MOOD: quiet, honest, considered. A shirt presented plainly, letting the cloth speak for itself.
COMPOSITION: a men's 100% linen shirt in Meadow Sage hanging face-on on a simple wooden hanger against a plain warm oat seamless backdrop, centred in frame; relaxed collar, plain button placket fully visible, long sleeves, no chest pocket; the hanger hook is visible at the top with calm empty space around it.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole garment is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 19. `src/assets/concepts/mens-linen-shirt/meadow/05-back.png` — back, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment against a warm oat/putty seamless backdrop. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: the same 100% linen plain weave with a visible slub texture, across the back panel and yoke.
MOOD: quiet, honest, considered.
COMPOSITION: the same men's 100% linen shirt in Meadow Sage, rotated to show the back, hanging on the same simple wooden hanger against the plain warm oat seamless backdrop, centred in frame; plain yoke, even hem, long sleeves, no branding visible on the back.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole garment is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 20. `src/assets/concepts/mens-linen-shirt/meadow/07-fabric-closeup.png` — fabric close-up (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) fabric, softly blurred warm oat surface behind it. Low saturation, warm neutral tones.
LIGHT: soft raking natural daylight from one side to reveal the weave, gentle shadows.
TEXTURE: extreme close-up of 100% linen in an open plain weave with a visible slub texture — looser, more irregular threads than cotton, with linen's characteristic dry sheen.
MOOD: quiet, precise, curious — matching the brand's existing Fabric School close-ups.
COMPOSITION: a macro close-up of the folded Meadow Sage linen fabric filling most of the frame, a soft fold or two for depth, resting on a pale oak surface at the lower edge; calm negative space at the top for a caption.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain oak surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 21. `src/assets/concepts/mens-linen-shirt/meadow/08-on-model.png` — on model, cropped at the chin, sleeves rolled twice (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment, warm neutral softly blurred background with a hint of greenery. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, outdoor-adjacent studio setting, gentle directional light with soft shadows.
TEXTURE: 100% linen's visible slub texture across the chest and rolled sleeves, with linen's characteristic soft, relaxed wrinkles.
MOOD: quiet, relaxed, easy to wear.
COMPOSITION: a model wearing the Meadow Sage linen shirt, untucked, sleeves rolled twice to just above the elbow, cropped at the chin so no face is visible; relaxed, natural stance; softly blurred warm neutral background with a hint of greenery to one side.
CAMERA: full-frame look, 85mm, shallow depth of field on the garment, fine natural grain, no HDR.
NEGATIVE: no face, no text, no lettering, no watermark, no extra logos beyond a small subtle chest emblem, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (soft blur) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 22. `src/assets/concepts/mens-linen-shirt/meadow/material-card.png` — Material Passport tag (final 3:4)

```
STYLE: Editorial product-tag graphic, clean and minimal, same warm-neutral brand world as the rest of the site. Premium but honest, not glossy.
PALETTE: warm ivory/cream card stock, deep muted green ink for text and icons, a muted sage green colour swatch dot; resting on folded Meadow Sage linen fabric. Low saturation, warm neutral tones.
LIGHT: soft, even studio daylight, gentle shadow under the card so it reads as a physical hang-tag.
TEXTURE: a die-cut hang-tag with a reinforced hole at the top, resting on the folded linen fabric so the open weave is softly visible underneath and around the card's edges.
MOOD: quiet, precise, trustworthy — a specification card, not an ad.
COMPOSITION: a single rounded-rectangle hang-tag with a punched hole at the top centred in the upper two-thirds of the frame, resting diagonally on folded Meadow Sage linen fabric that fills the background; the card is large enough that all text is clearly legible.
RENDER TEXT ON IMAGE (exact copy, clean sans/serif mix, dark green ink):
  - Top: a small wave-glyph mark above the wordmark "moolresha"
  - Below the wordmark, small caps: "LINEN SHIRT"
  - A thin horizontal rule
  - Heading: "Material Passport"
  - Row 1 (small flax-flower icon): "Fabric" / "100% Linen"
  - Row 2 (small grid-weave icon): "Weave" / "Plain Weave, Visible Slub"
  - Row 3 (small stacked-layers icon): "Weight" / "120–160 GSM"
  - Row 4 (small wave-line icon): "Feel" / "Dry, Airy, Softens with Washing"
  - Row 5 (small filled-circle icon in muted sage green): "Colour" / "Meadow Sage"
  - A thin horizontal rule
  - Footer, small italic: "All specifications are design targets, to be confirmed with our mill."
CAMERA: full-frame macro-product look, 85mm, shallow depth of field keeping the card sharp and the fabric behind it softly out of focus, fine natural grain, no HDR.
NEGATIVE: no AI watermark/sparkle badge, no extra logos beyond the ones specified above, no misspelled or garbled text, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1660 px. Keep the card centred/upper and the BOTTOM edge calm and low-detail (soft-focus fabric) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1600 px (3:4). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1600 px.
```

---

## Batch 4 — `mens-relaxed-pant`, Meadow Sage (5 images)

100% cotton, cotton twill weave, mid weight (target ~160–200 gsm), smooth and
slightly firm hand feel that eases with wear. Silhouette: flat waistband, side
pockets, a single back pocket, a straight relaxed leg. This concept is a
**pant**, not a shirt — compose accordingly.

### 23. `src/assets/concepts/mens-relaxed-pant/meadow/01-front.png` — front, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment against a warm oat/putty seamless backdrop. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: 100% cotton twill — a tight, even diagonal rib weave, smoother and slightly firmer than a plain weave, with a subtle sheen along the diagonal lines.
MOOD: quiet, honest, considered. A pant presented plainly, letting the cloth speak for itself.
COMPOSITION: a men's relaxed cotton pant in Meadow Sage hanging on a clip-style wooden hanger against a plain warm oat seamless backdrop, centred in frame, full length visible; flat waistband, side pocket openings visible at the hips, a straight relaxed leg; the hanger clips and hook are visible at the top with calm empty space around them.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole garment is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 24. `src/assets/concepts/mens-relaxed-pant/meadow/05-back.png` — back, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment against a warm oat/putty seamless backdrop. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: the same 100% cotton twill diagonal rib weave, visible across the back waistband and pocket.
MOOD: quiet, honest, considered.
COMPOSITION: the same men's relaxed cotton pant in Meadow Sage, rotated to show the back, hanging on the same clip-style wooden hanger against the plain warm oat seamless backdrop, centred in frame, full length visible; waistband, a single back pocket, an even straight hem.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole garment is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 25. `src/assets/concepts/mens-relaxed-pant/meadow/07-fabric-closeup.png` — fabric close-up (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) fabric, softly blurred warm oat surface behind it. Low saturation, warm neutral tones.
LIGHT: soft raking natural daylight from one side to reveal the weave, gentle shadows.
TEXTURE: extreme close-up of a 100% cotton twill weave — even, tight diagonal ribs catching the light, denser and smoother than a plain weave.
MOOD: quiet, precise, curious — matching the brand's existing Fabric School close-ups.
COMPOSITION: a macro close-up of the folded Meadow Sage cotton twill fabric filling most of the frame, the diagonal rib clearly readable, a soft fold or two for depth, resting on a pale oak surface at the lower edge; calm negative space at the top for a caption.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain oak surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 26. `src/assets/concepts/mens-relaxed-pant/meadow/08-on-model.png` — on model, cropped at the waist and below the knee (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garment, a plain untucked neutral shirt layered above it, warm neutral softly blurred background with a hint of greenery. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, outdoor-adjacent studio setting, gentle directional light with soft shadows.
TEXTURE: the cotton twill's diagonal rib visible across the thigh as the model stands at ease.
MOOD: quiet, relaxed, easy to wear.
COMPOSITION: a model wearing the Meadow Sage relaxed cotton pant with a plain untucked neutral shirt layered above it, framed from the waist down to just below the knee so no face, chest or feet are visible; relaxed, natural stance, one hand resting loosely at the side; softly blurred warm neutral background with a hint of greenery to one side.
CAMERA: full-frame look, 85mm, shallow depth of field on the garment, fine natural grain, no HDR.
NEGATIVE: no face, no text, no lettering, no watermark, no logos, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (soft blur) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 27. `src/assets/concepts/mens-relaxed-pant/meadow/material-card.png` — Material Passport tag (final 3:4)

```
STYLE: Editorial product-tag graphic, clean and minimal, same warm-neutral brand world as the rest of the site. Premium but honest, not glossy.
PALETTE: warm ivory/cream card stock, deep muted green ink for text and icons, a muted sage green colour swatch dot; resting on folded Meadow Sage cotton twill fabric. Low saturation, warm neutral tones.
LIGHT: soft, even studio daylight, gentle shadow under the card so it reads as a physical hang-tag.
TEXTURE: a die-cut hang-tag with a reinforced hole at the top, resting on the folded twill fabric so the diagonal rib is softly visible underneath and around the card's edges.
MOOD: quiet, precise, trustworthy — a specification card, not an ad.
COMPOSITION: a single rounded-rectangle hang-tag with a punched hole at the top centred in the upper two-thirds of the frame, resting diagonally on folded Meadow Sage cotton twill fabric that fills the background; the card is large enough that all text is clearly legible.
RENDER TEXT ON IMAGE (exact copy, clean sans/serif mix, dark green ink):
  - Top: a small wave-glyph mark above the wordmark "moolresha"
  - Below the wordmark, small caps: "RELAXED PANT"
  - A thin horizontal rule
  - Heading: "Material Passport"
  - Row 1 (small cotton-boll icon): "Fabric" / "100% Cotton"
  - Row 2 (small diagonal-twill icon): "Weave" / "Cotton Twill"
  - Row 3 (small stacked-layers icon): "Weight" / "160–200 GSM"
  - Row 4 (small wave-line icon): "Feel" / "Smooth, Slightly Firm, Eases with Wear"
  - Row 5 (small filled-circle icon in muted sage green): "Colour" / "Meadow Sage"
  - A thin horizontal rule
  - Footer, small italic: "All specifications are design targets, to be confirmed with our mill."
CAMERA: full-frame macro-product look, 85mm, shallow depth of field keeping the card sharp and the fabric behind it softly out of focus, fine natural grain, no HDR.
NEGATIVE: no AI watermark/sparkle badge, no extra logos beyond the ones specified above, no misspelled or garbled text, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1660 px. Keep the card centred/upper and the BOTTOM edge calm and low-detail (soft-focus fabric) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1600 px (3:4). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1600 px.
```

---

## Batch 5 — `womens-coord-set`, Meadow Sage (5 images)

100% cotton (placeholder composition, to be confirmed), plain weave, light-to-mid
weight (target ~120–150 gsm), smooth and soft hand feel with an easy drape. This
concept is a **two-piece set** — a relaxed shirt-style top and a matching
straight pant — compose both pieces together in every shot.

### 28. `src/assets/concepts/womens-coord-set/meadow/01-front.png` — front, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garments against a warm oat/putty seamless backdrop, with soft ivory buttons. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: 100% cotton in a plain weave — smooth, even, tightly spun threads with a soft matte finish, consistent across both pieces.
MOOD: quiet, honest, considered. A set presented plainly, letting the cloth speak for itself.
COMPOSITION: a women's relaxed cotton co-ord set in Meadow Sage on a single wooden hanger against a plain warm oat seamless backdrop, centred in frame — a relaxed shirt-style top on the hanger with the matching straight pant clipped and hanging just below it so both pieces are fully visible as one set; the hanger hook is visible at the top with calm empty space around it.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole set is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 29. `src/assets/concepts/womens-coord-set/meadow/05-back.png` — back, on a hanger (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal product photography. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garments against a warm oat/putty seamless backdrop. Low saturation, warm neutral tones throughout.
LIGHT: soft, even studio daylight, gentle fill, true-to-fabric colour, no harsh shadows.
TEXTURE: the same 100% cotton plain weave, smooth and even, across both pieces' back panels.
MOOD: quiet, honest, considered.
COMPOSITION: the same women's relaxed cotton co-ord set in Meadow Sage, rotated to show the back, on the same wooden hanger against the plain warm oat seamless backdrop, centred in frame — the top's plain back yoke above, the pant's even hem below, both pieces fully visible as one set.
CAMERA: full-frame studio-product look, 85mm, even depth of field so the whole set is sharp, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no visible brand logo, no people, no hands, no mannequin body, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail (plain backdrop) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 30. `src/assets/concepts/womens-coord-set/meadow/07-fabric-closeup.png` — fabric close-up (final 3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) fabric, softly blurred warm oat surface behind it. Low saturation, warm neutral tones.
LIGHT: soft raking natural daylight from one side to reveal the weave, gentle shadows.
TEXTURE: extreme close-up of a 100% cotton plain weave — smooth, even, tightly spun threads with a soft matte finish, the simplest and cleanest weave of the four new concepts.
MOOD: quiet, precise, curious — matching the brand's existing Fabric School close-ups.
COMPOSITION: a macro close-up of the folded Meadow Sage cotton fabric filling most of the frame, a soft fold or two for depth, resting on a pale oak surface at the lower edge; calm negative space at the top for a caption.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1800 x 1260 px (very close to 3:2). Keep the SUBJECT in the upper/central area and the BOTTOM edge calm and low-detail (plain oak surface) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1800 x 1200 px (3:2). If generating in Google AI Studio (no visible badge), simply export at 1800 x 1200 px.
```

---

### 31. `src/assets/concepts/womens-coord-set/meadow/08-on-model.png` — on model, cropped at the chin (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: muted sage green (Meadow Sage) garments, warm neutral softly blurred background with a hint of greenery. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, outdoor-adjacent studio setting, gentle directional light with soft shadows.
TEXTURE: the cotton plain weave's smooth, even surface visible across the top as the model moves naturally, the top untucked over the pant.
MOOD: quiet, relaxed, easy to wear.
COMPOSITION: a female model wearing the Meadow Sage cotton co-ord set, top untucked over the pant, cropped at the chin so no face is visible; relaxed, natural stance; softly blurred warm neutral background with a hint of greenery to one side.
CAMERA: full-frame look, 85mm, shallow depth of field on the garments, fine natural grain, no HDR.
NEGATIVE: no face, no text, no lettering, no watermark, no extra logos beyond a small subtle emblem, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1560 px. Keep the SUBJECT centred/upper and the BOTTOM edge calm and low-detail (soft blur) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1500 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1500 px.
```

---

### 32. `src/assets/concepts/womens-coord-set/meadow/material-card.png` — Material Passport tag (final 3:4)

```
STYLE: Editorial product-tag graphic, clean and minimal, same warm-neutral brand world as the rest of the site. Premium but honest, not glossy.
PALETTE: warm ivory/cream card stock, deep muted green ink for text and icons, a muted sage green colour swatch dot; resting on folded Meadow Sage cotton fabric. Low saturation, warm neutral tones.
LIGHT: soft, even studio daylight, gentle shadow under the card so it reads as a physical hang-tag.
TEXTURE: a die-cut hang-tag with a reinforced hole at the top, resting on the folded cotton fabric so the smooth plain weave is softly visible underneath and around the card's edges.
MOOD: quiet, precise, trustworthy — a specification card, not an ad.
COMPOSITION: a single rounded-rectangle hang-tag with a punched hole at the top centred in the upper two-thirds of the frame, resting diagonally on folded Meadow Sage cotton fabric that fills the background; the card is large enough that all text is clearly legible.
RENDER TEXT ON IMAGE (exact copy, clean sans/serif mix, dark green ink):
  - Top: a small wave-glyph mark above the wordmark "moolresha"
  - Below the wordmark, small caps: "CO-ORD SET"
  - A thin horizontal rule
  - Heading: "Material Passport"
  - Row 1 (small cotton-boll icon): "Fabric" / "100% Cotton (composition to be confirmed)"
  - Row 2 (small grid-weave icon): "Weave" / "Plain Weave"
  - Row 3 (small stacked-layers icon): "Weight" / "120–150 GSM"
  - Row 4 (small wave-line icon): "Feel" / "Smooth, Soft, Easy Drape"
  - Row 5 (small filled-circle icon in muted sage green): "Colour" / "Meadow Sage"
  - A thin horizontal rule
  - Footer, small italic: "All specifications are design targets, to be confirmed with our mill."
CAMERA: full-frame macro-product look, 85mm, shallow depth of field keeping the card sharp and the fabric behind it softly out of focus, fine natural grain, no HDR.
NEGATIVE: no AI watermark/sparkle badge, no extra logos beyond the ones specified above, no misspelled or garbled text, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1200 x 1660 px. Keep the card centred/upper and the BOTTOM edge calm and low-detail (soft-focus fabric) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1600 px (3:4). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1600 px.
```

---

## Batch 6 — Design Lab + "Share Your Opinion" redesign (2026-11, 2 images)

Both sections were implemented first with the image areas kept **plain** (no background
photo — a flat colour panel / nothing), per the user's request to see the design land before
generating anything. The two prompts below are the only new images the redesign needs:

- **#33 is DONE (2026-11-12)** — the user generated this one and saved it to
  `asset/share_your_opinion_background.png`; it's now at
  `src/assets/banner/share-your-opinion.png` and wired into `ConceptFeedbackForm.astro`'s
  `<header class="cff-head">` as a full banner background (not the small 72×72 thumbnail this
  prompt originally described — the user's actual photo turned out wide with its own built-in
  calm left-side negative space, so the whole header became a banner with "Share Your Opinion"
  + the intro paragraph sitting over that calm area, `object-position: right center` keeping
  the fabric rolls + cotton visible on the right). Prompt kept below for the record, in case it
  ever needs regenerating.
- **#34 is still optional**, not a gap — the Design Lab featured card (`DesignIndexCard.astro`'s
  `featured` overlay) already renders real photography (the existing `mens-cotton-shirt`
  hanging-shirt shot) with text overlaid on a dark scrim, and that already looks finished. The
  user's reference mockup for this card used a more styled lifestyle shot (shirt + flowers/
  leaves) instead of a plain product photo. #34 drafts that richer version in case you want to
  swap it in later; skip it if the current card is good enough.

### 33. `feedback-head-art.webp` — "Share Your Opinion" header thumbnail (final 1:1)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: muted sage green, undyed flax beige, soft clay/terracotta, warm oat background. Low saturation, warm neutral tones.
LIGHT: soft even natural daylight, flat-lay lighting with gentle shadow.
TEXTURE: three or four small rolled fabric swatches — one sage green plain weave, one flax-beige slub, one clay-toned twill — their cut edges and weave texture clearly visible at the roll ends.
MOOD: quiet, tactile, inviting — "your opinion on real fabric," not a form icon.
COMPOSITION: a tight, square, top-down flat-lay of 3-4 small rolled fabric swatches in different natural tones, loosely fanned out and slightly overlapping, resting on a plain warm-ivory surface, filling almost the entire frame with a little calm negative space in one corner.
CAMERA: full-frame macro look, 85mm, even focus across the rolls, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
CANVAS: generate at 1200 x 1260 px. Keep the SUBJECT centred and the BOTTOM edge calm and low-detail so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1200 x 1200 px (1:1). If generating in Google AI Studio (no visible badge), simply export at 1200 x 1200 px.
```

---

### 34. `design-lab-featured-lifestyle.webp` — OPTIONAL upgrade for the featured Design Lab card (final 4:5)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm, lifestyle rather than flat product shot.
PALETTE: muted sage green (Meadow Sage) shirt, soft greenery and a few dried/fresh flower stems in dusty clay and ivory tones, warm oat wall. Low saturation, warm neutral tones.
LIGHT: soft natural daylight from one side, gentle warm shadows, late-afternoon feel.
TEXTURE: the fine diamond micro-dobby weave of the shirt visible up close against the softer texture of leaves and petals, natural wooden hanger.
MOOD: quiet, considered, a little romantic without being precious — a styled moment, not a catalogue photo.
COMPOSITION: the Meadow Sage cotton shirt hanging on a natural wooden hanger against a plain warm-ivory wall, with a small loose arrangement of greenery and a few flower stems tucked near the hanger's neck/shoulder so they rest gently against the collar and upper chest; generous calm negative space in the lower third of the frame for overlaid text (eyebrow/headline/CTA added separately in code, not in the image).
CAMERA: full-frame look, 50mm, shallow depth of field on the collar and embroidery, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no logos, no people, no faces, no neon colours, no heavy vignette, no clutter.
CANVAS: generate at 1536 x 1980 px. Keep the SUBJECT in the upper two-thirds and the BOTTOM edge calm and low-detail (soft shadow/plain wall) so the final 60px can be cropped off cleanly if needed. Final target after an optional bottom-60px crop is 1536 x 1920 px (4:5). If generating in Google AI Studio (no visible badge), simply export at 1536 x 1920 px.
```

---

## After you add the images

Nothing else to do — the pages already point at these paths. If you use a different
extension than `.webp`, tell me and I'll update the references.

Reminder on the watermark: the surest clean route is **Google AI Studio**
(aistudio.google.com), whose image output has no visible sparkle badge — then no
cropping is needed. Only crop the bottom strip if you used the watermarked Gemini app.
```
