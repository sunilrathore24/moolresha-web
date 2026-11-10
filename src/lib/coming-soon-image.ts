/**
 * The optional "Design coming soon" graphic shown in place of a Concept's missing
 * photography (Requirement 8B.9). Vite-glob-based like concept-images.ts, so it is purely
 * additive: `Image_Placeholder.astro` falls back to a plain text box until someone adds
 * `src/assets/placeholders/design-coming-soon.<ext>` (png, jpg, jpeg or webp) — then this
 * picks it up automatically, no code change needed.
 */
import type { ImageMetadata } from 'astro';

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/placeholders/design-coming-soon.{png,jpg,jpeg,webp}',
  { eager: true },
);

/** Undefined until the file above exists; callers must keep a text-only fallback. */
export const comingSoonImage: ImageMetadata | undefined = Object.values(modules)[0]?.default;
