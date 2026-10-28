/** テキストをファイルとして保存させる（サーバーを経由せず、端末内で生成する） */
export function downloadText(fileName: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Safari はクリック直後に取り消すと保存に失敗することがあるため、少し待ってから解放する
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
