// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.moolresha.com',
  // Static-first. The three interactions (like/comment/subscribe) will call a
  // thin serverless layer (Cloudflare Pages Functions) — not part of the static build.
  trailingSlash: 'never',
});
