# MoolResha Website — Image Generation Prompts (Gemini)

Prompts to generate every decorative image on the site, in the MoolResha brand
visual style (adapted from the social skill's Brand Visual DNA §5.1).

## How to use

1. Generate each image in **Gemini** using the full prompt below.
2. **Crop off the bottom 50px white strip** (see next section) — that removes
   Gemini's AI badge/icon cleanly. You're left with the exact target size.
3. Save the cropped file with the **exact filename** given, as **`.webp`**
   (or `.jpg`/`.png` — but tell me if you don't use `.webp` and I'll update the refs).
4. Drop the files into **`moolresha-web/public/images/`**.
5. They appear on the site automatically at `/images/<filename>` — no code change.

## The AI-badge crop strip (READ THIS)

Gemini stamps an **AI icon/watermark in the bottom-right corner** of every image.
To remove it without cutting into the photo, every prompt below asks Gemini to:

- **Extend the canvas height by 50px** and place a **solid white horizontal strip,
  50px tall, across the full width of the very bottom edge**, kept empty.
- The AI badge then lands on that white strip, so you **crop off the bottom 50px**
  and get a clean image at the exact target dimensions.

So each image is **generated 50px taller** than its final size:

| Final size (after crop) | Generate at | Crop off |
|---|---|---|
| 1800 × 1200 (3:2 hero) | **1800 × 1250** | bottom 50px |
| 1200 × 1200 (1:1 card) | **1200 × 1250** | bottom 50px |

> If Gemini still places the badge slightly above the strip, make the strip a
> little taller (e.g. 70px) and crop that much off — the goal is: badge sits on
> white, crop the white away.

## Key differences from the carousel prompts

- **NO text is rendered into these images.** All headings/copy are real HTML.
  So there is no `RENDER TEXT ON IMAGE` block — except the white crop strip.
- **Leave generous negative space** in the heroes so the HTML headline stays legible.
- **Web aspect ratios**, generated 50px taller for the crop strip (table above).

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
CANVAS + CROP STRIP: generate the image at 1800 x 1250 px. The photo fills the top 1800 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty (no photo, no text) so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1800 x 1200 px (3:2).
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
CANVAS + CROP STRIP: generate the image at 1200 x 1250 px. The photo fills the top 1200 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1200 x 1200 px (1:1).
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
CANVAS + CROP STRIP: generate the image at 1200 x 1250 px. The photo fills the top 1200 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1200 x 1200 px (1:1).
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
CANVAS + CROP STRIP: generate the image at 1200 x 1250 px. The photo fills the top 1200 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1200 x 1200 px (1:1).
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
CANVAS + CROP STRIP: generate the image at 1800 x 1250 px. The photo fills the top 1800 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1800 x 1200 px (3:2).
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
CANVAS + CROP STRIP: generate the image at 1800 x 1250 px. The photo fills the top 1800 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1800 x 1200 px (3:2).
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
CANVAS + CROP STRIP: generate the image at 1800 x 1250 px. The photo fills the top 1800 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1800 x 1200 px (3:2).
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
CANVAS + CROP STRIP: generate the image at 1800 x 1250 px. The photo fills the top 1800 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1800 x 1200 px (3:2).
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
CANVAS + CROP STRIP: generate the image at 1800 x 1250 px. The photo fills the top 1800 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1800 x 1200 px (3:2).
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
CANVAS + CROP STRIP: generate the image at 1800 x 1250 px. The photo fills the top 1800 x 1200 px. Add a SOLID PURE-WHITE horizontal strip, exactly 50px tall, spanning the full width along the very BOTTOM edge — keep it completely empty so an AI badge can sit on it and be cropped off. Final image after cropping the bottom 50px is 1800 x 1200 px (3:2).
```

---

## After you add the images

Nothing else to do — the pages already point at these paths. If you use a different
extension than `.webp`, tell me and I'll update the references. If the AI badge ever
lands above the white strip, increase the strip height and crop that much off.
```
