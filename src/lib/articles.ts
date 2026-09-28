import { getCollection, type CollectionEntry } from "astro:content";

export type Article = CollectionEntry<"articles">;

/** Human-readable pillar names (philosophy §7). */
export const PILLAR_NAMES: Record<string, string> = {
  A: "Read the Label",
  B: "Understand the Material",
  C: "Compare",
  D: "Match",
  E: "Judge Quality",
  F: "Wash & Longevity",
  G: "Sustainability",
  H: "Shopping Intelligence",
  I: "Myths & Misconceptions",
  J: "Root to Garment",
};

/** Category (nav hub) → its URL path. */
export const CATEGORY_PATH: Record<string, string> = {
  "Fibre Stories": "/fibre-stories",
  "Fabric School": "/fabric-school",
  Comparisons: "/comparisons",
  "Shopping Intelligence": "/shopping-guides",
};

/** All published (non-draft) articles, newest first. */
export async function getPublishedArticles(): Promise<Article[]> {
  const all = await getCollection("articles", ({ data }) => !data.draft);
  return all.sort(
    (a, b) => b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf(),
  );
}

/** Published articles for one category (nav hub). */
export async function getArticlesByCategory(
  category: string,
): Promise<Article[]> {
  const all = await getPublishedArticles();
  return all.filter((a) => a.data.category === category);
}

/**
 * Resolve related articles for an article. Prefers explicit relatedSlugs
 * (in order), then fills from the same pillarCluster, up to `limit`.
 */
export async function getRelatedArticles(
  article: Article,
  limit = 3,
): Promise<Article[]> {
  const all = await getPublishedArticles();
  const byId = new Map(all.map((a) => [a.id, a]));

  const picked: Article[] = [];
  const seen = new Set<string>([article.id]);

  for (const slug of article.data.relatedSlugs) {
    const found = byId.get(slug);
    if (found && !seen.has(found.id)) {
      picked.push(found);
      seen.add(found.id);
    }
    if (picked.length >= limit) return picked;
  }

  for (const a of all) {
    if (picked.length >= limit) break;
    if (seen.has(a.id)) continue;
    if (a.data.pillarCluster === article.data.pillarCluster) {
      picked.push(a);
      seen.add(a.id);
    }
  }

  return picked;
}
