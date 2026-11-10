import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { Concept } from "./lib/concept-schema";
import { Fact } from "./lib/fact-schema";
import { MarketScan } from "./lib/market-scan-schema";
import { PriceLayers, Story } from "./lib/price-layers-schema";

/**
 * Article collection — the typed frontmatter schema from SKILL.md §6.2.
 * Every article is a consumer-decision piece mapped to a content pillar (A–J)
 * and a pillarCluster for topical-authority internal linking.
 */

const PILLARS = [
  "A", // Read the label
  "B", // Understand the material
  "C", // Compare
  "D", // Match
  "E", // Judge quality
  "F", // Wash & longevity
  "G", // Sustainability
  "H", // Shopping intelligence
  "I", // Myths & misconceptions
  "J", // Root to garment
] as const;

const CATEGORIES = [
  "Fibre Stories",
  "Fabric School",
  "Comparisons",
  "Shopping Intelligence",
] as const;

const LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;

const articles = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/articles" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pillar: z.enum(PILLARS),
      pillarCluster: z.string(), // e.g. "linen", "cotton" — groups a journey
      category: z.enum(CATEGORIES), // maps to a nav hub
      level: z.enum(LEVELS),
      consumerQuestion: z.string(),
      shoppingDecision: z.string(),
      consumerTakeaway: z.string(),
      description: z.string(),
      heroImage: image().optional(),
      // Public-folder hero (path under /images) — used when the photo lives in
      // public/images rather than as an imported collection asset.
      heroImagePublic: z.string().optional(),
      heroImageAlt: z.string().optional(),
      heroVideo: z.string().optional(),
      publishedDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      readingTime: z.string().optional(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      relatedSlugs: z.array(z.string()).default([]),
      faq: z
        .array(z.object({ q: z.string(), a: z.string() }))
        .default([]),
      // Fact-check trail (philosophy §9). Label each FACT vs CLAIM.
      sources: z
        .array(
          z.union([
            z.string(),
            z.object({
              claim: z.string(),
              status: z.enum([
                "FACT",
                "INDUSTRY CLAIM",
                "BRAND CLAIM",
                "MoolResha interpretation",
              ]),
              source: z.string().optional(),
              verify: z.boolean().default(false),
            }),
          ]),
        )
        .default([]),
    }),
});

/**
 * Fact_Registry (Requirement 3). One YAML file per Fact in src/content/facts/.
 * The schema lives in src/lib/fact-schema.ts (no Astro imports) so Vitest and
 * the Content_Check script reuse it. The entry id is the file name.
 */
const facts = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/facts" }),
  schema: Fact,
});

/**
 * Concepts (Requirements 8, 8A.13, 8C, 9.7). One YAML file per Concept in
 * src/content/concepts/. The schema lives in src/lib/concept-schema.ts (no Astro
 * imports) so Vitest and the Content_Check script reuse it. The entry id is the
 * file name, which must equal the `id` field.
 */
const concepts = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/concepts" }),
  schema: Concept,
});

/**
 * Market_Price_Context (Requirements 7.1, 7.6, 7.7, 7.9, 7.10). One YAML file per
 * Concept in src/content/market-scans/, with a private evidence trail. Pages get
 * only `toPublicMarketScan(scan)` from src/lib/market-scan.ts.
 */
const marketScans = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/market-scans" }),
  schema: MarketScan,
});

/** Price_Layers (Requirements 6.1-6.4): one file, no amounts. */
const priceLayers = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/price-layers" }),
  schema: PriceLayers,
});

/** Lead_Message and Aim_Statement copy (Requirements 4.7, 5.5, 11A.1): one file. */
const story = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/story" }),
  schema: Story,
});

export const collections = {
  articles,
  facts,
  concepts,
  "market-scans": marketScans,
  "price-layers": priceLayers,
  story,
};
