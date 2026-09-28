import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

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

export const collections = { articles };
