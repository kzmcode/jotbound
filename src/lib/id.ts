const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Firestore の自動IDと同じ形式（20文字の英数字）を端末の暗号論的乱数で生成する */
export function newDocId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  // 256 は 62 で割り切れないため、偏りを避けて 248 未満のみ使う
  let id = '';
  for (const b of bytes) {
    if (b < 248) id += CHARS[b % 62];
  }
  return id.length === 20 ? id : (id + newDocId()).slice(0, 20);
}
