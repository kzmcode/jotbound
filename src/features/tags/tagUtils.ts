import { normalizeText } from '../../lib/text';
import { LIMITS, type TagCategory } from '../../types/models';

export function normalizeTagName(name: string): string {
  return normalizeText(name).slice(0, LIMITS.tagNameMax);
}

export type TagLike = { id: string; name: string; normalizedName: string; category: TagCategory };

/**
 * 新しいタグ名と既存タグを比べ、同一（正規化後に一致）と類似（一方が他方を含む）を返す。
 * 既存タグの優先利用を促すために使う（要件 FR-TAG）。
 */
export function findSimilarTags<T extends TagLike>(tags: readonly T[], name: string, category: TagCategory) {
  const key = normalizeTagName(name);
  const sameCategory = tags.filter((t) => t.category === category);
  if (!key) return { same: undefined, similar: [] as T[] };
  const same = sameCategory.find((t) => t.normalizedName === key);
  const similar = sameCategory.filter(
    (t) => t !== same && (t.normalizedName.includes(key) || key.includes(t.normalizedName)),
  );
  return { same, similar };
}

/** 推奨数（要件: テーマ 0〜3、活用先 0〜2）。上限ではなく目安として表示する。 */
export const RECOMMENDED_TAGS: Record<TagCategory, number> = { topic: 3, usage: 2 };
