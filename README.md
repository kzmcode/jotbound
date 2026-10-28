# Jotbound

読書中の気づきを**声で記録する**読書メモアプリ（PWA）です。

本を読みながら話すと、AI（Gemini 3.5 Flash-Lite）が書名・ページ・引用・コメント・タグを取り出します。内容は**自分で確認・修正してから**保存します。

各利用者が**自分の Firebase プロジェクト**に導入して使います。無料の Spark プランの範囲で動き、共通のサーバー・データベース・AI キーはありません。

## できること

- **声で記録:** ホームの丸ボタンを押して話すだけ（最長2分）。保存するまでの録音は端末内にだけ残ります。
- **AI が下書き:** 文字起こしと、書名・ページ・引用・コメント・タグ候補・活用状態を取り出し、確認画面に入れます。保存ボタンを押すまで、メモはできません。
- **本棚:** 書名で検索（Google Books）するか、手入力で登録します。書影付きで並び、読書状態（未読・読書中・読了）をその場で切り替えられます。
- **メモ:** 手入力・編集・削除。引用・コメント・書名・タグを横断して検索し、タグ・活用状態・日付で絞り込みます。
- **バックアップ:** JSON で書き出し、別のプロジェクトにもそのまま戻せます。Markdown で書き出すこともできます（メモ単位・本単位・全体）。
- **使いやすさ:** ライト・ダーク（OS に合わせるか、手動で選ぶ）。スマートフォンとパソコンに対応し、ホーム画面に追加してアプリとして使えます。

## 導入

```sh
npm install
npx firebase login
npm run setup      # プロジェクト・ウェブアプリ・設定ファイル・Firestore を自動で準備
npm run deploy     # 公開（https://<プロジェクトID>.web.app）
```

この間に、Google ログイン・App Check・AI Logic の設定を Firebase コンソールで行います。手順は **[docs/SETUP_JA.md](docs/SETUP_JA.md)** にまとめています（30〜40分ほど）。

- **費用:** 支払い情報の登録は必要ありません。Spark プランのまま使い、Cloud Billing を紐付けないでください。
- **「無料」の意味:** 各サービスの無料枠の範囲内で、という意味です。端末や通信の費用は含まず、無制限に使えることも保証しません。無料枠の上限やモデルの提供条件は変わることがあります。

## 構成

| 役割 | 使うもの |
| --- | --- |
| 画面 | React ＋ Vite ＋ TypeScript ＋ Tailwind CSS（PWA） |
| 配信 | Firebase Hosting |
| ログイン | Firebase Authentication（Google） |
| データ | Cloud Firestore（Security Rules で本人・所有者だけに限定） |
| AI | Firebase AI Logic → Gemini Developer API（`gemini-3.5-flash-lite`） |
| 不正利用の対策 | Firebase App Check（reCAPTCHA Enterprise） |

Cloud Functions・Cloud Storage・有料の検索サービスは使いません。

## セキュリティと、不正利用についての制約

- **秘密の値はアプリに入れていません:**
  - Firebase の Web 設定値（API キーなど）は、公開されても問題のない識別子です。アクセスの可否は Security Rules と App Check で決まります。
  - Gemini の API キーやサービスアカウント鍵は、アプリに含めません。
- **AI の利用を特定の1人に完全には限定できません:**
  - Firebase Authentication と App Check だけでは、AI の利用を特定の UID だけに完全に限定できるとは限りません。
  - Google アカウントでの新規ログインは、画面で隠しても防げません。
- **対策:**
  - Firestore のデータは、所有者 UID の限定（`npm run owner:set`）で自分だけのものにします。
  - AI Logic は、認証済みユーザー限定モード・App Check・ユーザーごとのレート制限で不正利用を抑えます。
- **異常に気づいたとき:** 使用量が急に増えたら、Firebase コンソールで AI Logic を一時的に無効にし、App Check とレート制限を見直してください（[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)）。
- **リポジトリに入れないもの:**
  - `.env.local`（所有者 UID を含む）、`.firebaserc`、サービスアカウント JSON、個人の書誌・メモのデータは、コミットしないでください（`.gitignore` 済み）。
  - `npm run check:secrets` で、公開するファイルに秘密情報が混ざっていないかを確かめられます。`npm run deploy` でも自動で実行されます。

## データとプライバシー

- **音声:** 文字起こしと抽出のため、Firebase AI Logic を通じて Google（Gemini API）に送ります。
  - 送る前に説明を表示し、同意を得ます。同意しなくても、録音を聞きながら手入力で保存できます。
  - 音声をデータベースやクラウドストレージに保存することはありません。
  - 無料枠の Gemini API に送った内容は、Google のサービス改善に使われ、人が確認することがあります。機密情報や他人の個人情報は録音しないでください。
- **録音の下書き:** 端末内だけに保存し、録音したアカウントでログインしているときだけ表示します。ブラウザのデータを消すと失われます。

詳しくは [docs/PRIVACY.md](docs/PRIVACY.md) を参照してください。

## 記録した引用の扱い

- メモに記録した本の文章は、自分のための記録（私的使用）として扱ってください。
- **公開するとき:** ブログや SNS などに載せる場合は、出典（書名・著者・ページ）を明記し、自分の文章が主となる「引用」の範囲にとどめてください。本の大部分を書き写して公開しないでください。
- **授業などで使うとき:** 所属する機関のルールと著作権法の規定に従ってください。

## 開発

```sh
npm run dev        # 開発サーバー（AI 解析には App Check のデバッグトークンが必要。docs/SETUP_JA.md「開発する場合」）
```

| コマンド | 内容 |
| --- | --- |
| `npm run setup` | 導入の自動化（対話形式。何度実行しても安全） |
| `npm run doctor` | 設定の点検 |
| `npm run deploy` | 点検 → 秘密情報のチェック → Rules の生成 → ビルド → Hosting・Firestore のデプロイ |
| `npm run deploy:rules` | Security Rules とインデックスだけをデプロイ |
| `npm run owner:set -- <UID>` | アクセスできる所有者を限定（`.env.local` に保存。`--clear` で解除） |
| `npm run check:secrets` | 公開するファイルに秘密情報が混ざっていないかを調べる |
| `npm run build` | 型チェック＋本番ビルド |
| `npm run lint` | ESLint |
| `npm test` | Unit テスト（Vitest） |
| `npm run test:rules` | Security Rules テスト（Firestore Emulator。Java 21 以上） |
| `npm run test:e2e` | E2E テスト（Emulator ＋ Playwright。アクセシビリティ検査を含む。初回は `npx playwright install chromium`）。AI はモック |
| `npm run icons` | PWA アイコンの再生成 |

## 更新

```sh
git pull
npm install
npm run deploy
```

更新の前に、**設定 → データのバックアップ → JSON で書き出す** でバックアップを取っておくことをおすすめします。Firestore のデータ形式を変える更新では、移行の手順をリリースノートに書きます。

## ドキュメント

- [docs/SETUP_JA.md](docs/SETUP_JA.md) — 導入手順
- [docs/PRIVACY.md](docs/PRIVACY.md) — 送信・保存するデータ
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — うまくいかないとき（App Check・429・録音・ログイン・無料枠）

## ライセンス

MIT（自作コード）。外部のライブラリや書影などは、それぞれの提供元のライセンス・利用規約に従います。

- 書誌情報: [Google Books](https://developers.google.com/books/branding)。検索結果と本の詳細画面に、Google Books の書籍ページへのリンクを表示します。
- 書影: [Google Books](https://developers.google.com/books/terms) / [Open Library Covers](https://openlibrary.org/dev/docs/api/covers)。画像はアプリに同梱せず、提供元の URL を直接表示します。
