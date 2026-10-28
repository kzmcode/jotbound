/**
 * 検索・照合用の文字列正規化。
 * NFKC で全角/半角を揃え、小文字化し、空白・記号を除き、カタカナをひらがなに寄せる。
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[!-/:-@[-`{-~、。・「」『』【】〔〕（）〈〉《》“”‘’…‥]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
