type ActionCategory = { id: string; recommendation?: string; score?: number };

// Saved reports and Overall use the same filtering as category plans.
export function personalizedActionItems(category: ActionCategory): string[] {
  const skin = ["skin-age", "biological-age", "sun-damage"].includes(category.id);
  const seen = new Set<string>();
  return (category.recommendation ?? "").split(/(?<=[.!?])\s+|\n+/)
    .map(item => item.replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").trim())
    .filter(item => {
      if (item.length < 16) return false;
      // These are capture instructions, not improvements to the user's features.
      if (/\b(camera|lighting|photos?|photographs?|selfies?|scans?|retake|capture conditions|head angle)\b/i.test(item)) return false;
      if (/\b(potassium|supplements?|dehydrat\w*|crash diet|nasal slimming|chin tucks|shoulder decompression)\b/i.test(item)) return false;
      if (skin && /\b(debloat\w*|sodium|hydration|water intake|contour(?:ing)?|hair(?:style|cut)?|facial hair)\b/i.test(item)) return false;
      if (!skin && /\b(SPF|sunscreen|retino\w*)\b/i.test(item) && category.id !== "mouth") return false;
      const key = item.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 2);
}

export function buildCategoryActionPlan(category: ActionCategory) {
  const items = personalizedActionItems(category);
  const skin = ["skin-age", "biological-age", "sun-damage"].includes(category.id);
  const prevention = skin && !items.some(item => /\b(SPF|sunscreen)\b/i.test(item))
    ? "Apply broad-spectrum, water-resistant SPF 50+ sunscreen to exposed skin before going outdoors. Reapply every two hours outdoors and after swimming or sweating, following the label."
    : null;
  const focus = typeof category.score !== "number" || !Number.isFinite(category.score) ? null
    : category.score >= 8 ? "Maintain this strength; prioritize prevention and small refinements."
    : category.score >= 6 ? "Focus on the specific visible concern below, one change at a time."
    : "Prioritize this category’s supported cosmetic steps; the score alone does not identify a cause or treatment.";
  return { items, prevention, focus };
}
