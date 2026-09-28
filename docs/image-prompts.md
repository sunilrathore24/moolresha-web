# MoolResha Website — Image Generation Prompts (Gemini)

Prompts to generate every decorative image on the site, in the MoolResha brand
visual style (adapted from the social skill's Brand Visual DNA §5.1).

## How to use

1. Generate each image in **Gemini** (or any image model) using the full prompt below.
2. Save it with the **exact filename** given, as **`.webp`** (or `.jpg`/`.png` — but
   update the extension in the page if you don't use `.webp`).
3. Drop the files into **`moolresha-web/public/images/`**.
4. They appear on the site automatically at `/images/<filename>` — no code change
   needed (the pages already reference these paths).

## Key differences from the carousel prompts

- **NO text is rendered into these images.** All headings/copy are real HTML on top
  of or beside the photo. So there is no `RENDER TEXT ON IMAGE` block here.
- **Leave generous negative space** in the heroes (a calm, low-detail area) so the
  HTML headline stays legible over the photo.
- **Web aspect ratios:** heroes are landscape **3:2** (≈1800×1200); fibre cards are
  square **1:1** (≈1200×1200). Export optimised (WebP, < ~250 KB each ideally).

## Image list

| # | Filename | Used on | Aspect | Purpose |
|---|----------|---------|--------|---------|
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

Each prompt is fully self-contained and repeats this block, so you can copy any one
prompt straight into Gemini with nothing to assemble.

---

### 1. `home-hero.webp` — Homepage hero (3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy or over-stylized. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, soft clay/terracotta, muted sage green, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural morning daylight from one side, gentle long shadows, golden diffused light.
TEXTURE: emphasise natural fibre texture — visible weave, slubs, raw edges, folded cloth, grain of wood.
MOOD: quiet, curious, authentic, rooted. "Closer to the root."
COMPOSITION: a neatly stacked pile of folded natural linen and cotton garments in beige/cream/oat tones resting on a pale oak surface, positioned to the RIGHT of frame; the LEFT third is calm empty background (soft-focus wall / open table) kept clear as negative space for a headline.
CAMERA: full-frame look, 50mm, shallow depth of field, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no faces, no neon colours, no heavy vignette, no clutter, no plastic gradients.
ASPECT RATIO: 3:2 landscape (1800 x 1200 px).
```

---

### 2. `fibre-linen.webp` — Linen fibre card (1:1)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, muted sage green, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle shadows, morning diffused light.
TEXTURE: strong emphasis on natural linen weave — visible slubs, irregular threads, raw edge of the cloth.
MOOD: quiet, authentic, rooted.
COMPOSITION: a folded swatch of natural undyed linen fabric with a few dried blue-green flax stems resting on top, centred, top-down flat-lay on a warm oat surface.
CAMERA: full-frame macro look, 85mm, shallow depth of field on the weave, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
ASPECT RATIO: 1:1 square (1200 x 1200 px).
```

---

### 3. `fibre-cotton.webp` — Cotton fibre card (1:1)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, off-white, soft beige, muted sage green. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle shadows, morning diffused light.
TEXTURE: emphasise soft cotton fibre — a fluffy raw cotton boll and a smooth folded cotton swatch, fine cloth texture.
MOOD: quiet, authentic, rooted.
COMPOSITION: an open raw cotton boll on its dried branch resting beside a neatly folded cream cotton fabric swatch, centred, top-down flat-lay on a warm oat surface.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
ASPECT RATIO: 1:1 square (1200 x 1200 px).
```

---

### 4. `fibre-blends.webp` — Blends card (1:1)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, soft clay, muted sage green, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle shadows, morning diffused light.
TEXTURE: contrast two cloths — a textured slubby linen and a smoother softer cotton — so the difference in weave is visible.
MOOD: quiet, curious, authentic.
COMPOSITION: two folded fabric swatches partly overlapping — one textured natural linen, one smooth cream cotton — centred, top-down flat-lay on a warm oat surface, showing where they meet.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
ASPECT RATIO: 1:1 square (1200 x 1200 px).
```

---

### 5. `hub-fibre-stories.webp` — Fibre Stories hub hero (3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, muted sage green, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural morning daylight, low mist, gentle golden light.
TEXTURE: emphasise the flax plant and natural fibre — delicate stems, plant matter, soil grain.
MOOD: quiet, curious, rooted. "Closer to the root."
COMPOSITION: a field of flax plants in soft blue-green bloom stretching toward the horizon at dawn, with the sky occupying the top third as calm negative space for a headline; subject weighted to the lower-right.
CAMERA: full-frame look, 50mm, wider depth of field for the landscape, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no logos, no people, no neon colours, no heavy vignette, no clutter.
ASPECT RATIO: 3:2 landscape (1800 x 1200 px).
```

---

### 6. `hub-fabric-school.webp` — Fabric School hub hero (3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, undyed flax beige, raw umber, off-white. Low saturation, warm neutral tones.
LIGHT: soft raking natural daylight from one side to reveal the weave, gentle shadows.
TEXTURE: extreme emphasis on the woven structure of natural fabric — individual threads, warp and weft, slubs.
MOOD: quiet, precise, curious.
COMPOSITION: a macro close-up of natural linen fabric weave filling the right two-thirds of the frame, with a softly blurred calmer area on the LEFT kept as negative space for a headline; a wooden spool or loose thread resting at the edge.
CAMERA: full-frame macro look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
ASPECT RATIO: 3:2 landscape (1800 x 1200 px).
```

---

### 7. `hub-comparisons.webp` — Comparisons hub hero (3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, natural linen cream, warm oat, soft clay, muted sage green, off-white. Low saturation, warm neutral tones.
LIGHT: soft even natural daylight, gentle shadows.
TEXTURE: show two distinct cloth textures side by side — a slubby textured linen and a smoother cotton — so the contrast is clear.
MOOD: quiet, curious, balanced.
COMPOSITION: two folded fabric swatches laid side by side on a pale oak surface, top-down — textured linen on one side, smooth cotton on the other, meeting near centre; some calm empty table surface at the top as negative space for a headline.
CAMERA: full-frame look, 50mm, medium depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no hands, no neon colours, no clutter.
ASPECT RATIO: 3:2 landscape (1800 x 1200 px).
```

---

### 8. `hub-shopping-guides.webp` — Guides hub hero (3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, undyed flax beige, soft clay, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural window light behind the fabric, so the weave is backlit and readable.
TEXTURE: emphasise the fabric being examined — weave density visible as light passes through.
MOOD: quiet, attentive, curious.
COMPOSITION: a pair of hands holding up a piece of natural linen fabric toward a soft-lit window to inspect the weave, positioned to the right; the LEFT side is softly blurred bright window light kept as negative space for a headline. Hands natural and relaxed, no distortion.
CAMERA: full-frame look, 50mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no faces, no distorted hands, no neon colours, no clutter.
ASPECT RATIO: 3:2 landscape (1800 x 1200 px).
```

---

### 9. `about-hero.webp` — About page hero (3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: undyed flax beige, warm oat, raw umber, muted sage green, natural linen cream, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural daylight, gentle golden shadows.
TEXTURE: raw natural fibre — a loose bundle of undyed flax/linen fibre strands, fine and organic.
MOOD: quiet, honest, rooted. "Closer to the root."
COMPOSITION: two open hands gently cradling a loose bundle of raw undyed flax fibre, centred slightly right, with a calm softly-blurred earthy background on the left as negative space for a headline. Hands natural, no distortion.
CAMERA: full-frame look, 85mm, shallow depth of field, fine natural grain, no HDR.
NEGATIVE: no text, no lettering, no watermark, no logos, no faces, no distorted hands, no neon colours, no clutter.
ASPECT RATIO: 3:2 landscape (1800 x 1200 px).
```

---

### 10. `article-linen-shirt-hero.webp` — Linen-shirt article hero (3:2)

```
STYLE: Editorial, natural, grounded, documentary-meets-minimal. Premium but honest, not glossy. Earthy and calm.
PALETTE: natural linen cream, warm oat, undyed flax beige, soft clay, off-white. Low saturation, warm neutral tones.
LIGHT: soft natural side daylight, gentle shadows revealing the fabric's texture and folds.
TEXTURE: strong emphasis on a natural linen shirt — visible weave, slubs, natural relaxed wrinkles, button and collar detail.
MOOD: quiet, tactile, honest.
COMPOSITION: a close detail of a folded or draped natural cream linen shirt showing the collar, a button, and the weave, resting on a pale oak surface; the upper area kept as calm negative space for a headline.
CAMERA: full-frame look, 85mm, shallow depth of field on the weave and button, fine natural grain, no HDR, no plastic sheen.
NEGATIVE: no text, no lettering, no watermark, no logos, no faces, no distorted hands, no neon colours, no heavy vignette, no clutter.
ASPECT RATIO: 3:2 landscape (1800 x 1200 px).
```

---

## After you add the images

Nothing else to do — the pages already point at these paths. If you use a different
extension than `.webp`, tell me and I'll update the `<img>` references. If any image
comes out with unwanted text baked in, regenerate (the NEGATIVE line forbids it).
