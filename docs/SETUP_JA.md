# 導入手順

Jotbound を自分の Firebase プロジェクトに導入して、`https://<プロジェクトID>.web.app` で使えるようにするまでの手順です。

- **所要時間:** 30〜40分ほど
- **費用:** 支払い情報の登録は必要ありません。Firebase は無料の **Spark プラン**のまま使います。途中で請求先アカウントの紐付けやプランのアップグレードを求められても、**紐付けないでください**。
- **自動化:** コマンドでできる手順は `npm run setup` がまとめて行います。コンソール（ブラウザ）でしかできない設定だけを手作業で行います。

> コンソールの画面の表記は変わることがあります（2026-10 時点の内容です）。

## 全体の流れ

| # | 手順 | 方法 |
| --- | --- | --- |
| 1 | 準備（Node.js・取得・インストール） | コマンド |
| 2 | Firebase CLI にログイン | コマンド |
| 3 | プロジェクト・ウェブアプリ・Firestore・設定ファイル | **`npm run setup`（自動）** |
| 4 | Google ログインを有効にする | コンソール |
| 5 | PWA・iPhone 用のログイン設定 | コンソール |
| 6 | App Check（不正利用の対策。AI 解析に必須） | コンソール ＋ `npm run setup` |
| 7 | Firebase AI Logic（AI 解析） | コンソール |
| 8 | 公開 | **`npm run deploy`（自動）** |
| 9 | データを自分だけに限定する | **`npm run owner:set` ＋ `npm run deploy:rules`（自動）** |
| 10 | 書名検索を使う（任意） | コンソール ＋ `npm run setup` |
| 11 | Firebase の API キーを制限する（推奨） | コンソール |

---

## 1. 準備

**必要なもの**
- Google アカウント
- [Node.js](https://nodejs.org/) 24（`.nvmrc` に記載）。[nvm](https://github.com/nvm-sh/nvm) を使うと切り替えが簡単です
- （テストを実行する場合のみ）Java 21 以上

**取得とインストール**

GitHub の **Use this template** で自分のリポジトリを作るか、このリポジトリをクローンしてから:

```sh
cd jotbound
nvm use          # Node 24 に切り替え（nvm を使う場合）
npm install
```

## 2. Firebase CLI にログイン

```sh
npx firebase login
```

ブラウザが開くので、Firebase で使う Google アカウントでログインします。

## 3. `npm run setup`（自動）

```sh
npm run setup
```

質問に答えると、次を自動で行います。何度実行しても安全で、済んでいる手順は確認だけして進みます。

1. **ログインの確認:** どのアカウントで操作するかを確かめます
2. **プロジェクト:** 既存のプロジェクトを選ぶか、新しく作ります（`.firebaserc` に保存）
   - プロジェクト ID は全世界で一意です（例: `jotbound-yourname`）。公開 URL にもなります
3. **ウェブアプリ:** 登録し、Web 設定を `.env.local` に書き込みます
   - ログイン用のドメインは、PWA・iPhone で使えるよう `<プロジェクトID>.web.app` にします
4. **Firestore:** データベースを作ります
   - ロケーションは**後から変更できません**。日本で使うなら `asia-northeast1`（東京）がおすすめです
5. **キーの入力:** App Check のサイトキーと Google Books API キーを聞かれます。まだなければ Enter で飛ばし、手順 6・10 の後にもう一度 `npm run setup` を実行します
6. **Security Rules:** Firestore に反映します（ログインした本人のデータしか読み書きできない設定）

最後に、コンソールで行う手順 4〜7 の URL が表示されます。

## 4. Google ログインを有効にする

1. Firebase コンソール → **Authentication** → **始める**（初回のみ）
2. **Sign-in method** タブ → **Google** → **有効にする**
3. **プロジェクトのサポートメール**を選んで **保存**

## 5. PWA・iPhone 用のログイン設定

ホーム画面に追加したアプリ（PWA）ではポップアップを開けないため、Jotbound はログイン画面に移動して戻ってくる方式（リダイレクト）でログインします。そのために、戻り先の URL を登録します。

1. [Google Cloud コンソール → API とサービス → 認証情報](https://console.cloud.google.com/apis/credentials) を開き、上部でプロジェクトを選びます
2. **OAuth 2.0 クライアント ID** の **Web client (auto created by Google Service)** を開きます
3. **承認済みのリダイレクト URI** に次を追加して **保存** します（反映まで数分かかることがあります）

   ```
   https://<プロジェクトID>.web.app/__/auth/handler
   ```

> 背景: iPhone の Safari は他のサイトのデータ保存を制限するため、ログイン処理をアプリと同じドメインで行う必要があります（[公式のベストプラクティス](https://firebase.google.com/docs/auth/web/redirect-best-practices) の Option 1）。`npm run setup` がログイン用ドメインを `<プロジェクトID>.web.app` に設定済みです。

## 6. App Check（AI 解析に必須）

App Check は、正規のアプリ以外から AI を呼び出されないようにする仕組みです。Firebase AI Logic は **2026-11-02 から App Check が必須**です（[公式](https://firebase.google.com/docs/ai-logic/app-check)）。

**6-1. reCAPTCHA のキーを作る**

1. [Google Cloud コンソール → セキュリティ → reCAPTCHA](https://console.cloud.google.com/security/recaptcha) を開きます（API の有効化を求められたら有効にします）
2. **キーを作成** を押し、次のように入力します
   - **表示名:** `Jotbound Web`（自由）
   - **アプリケーションの種類:** ウェブ
   - **ドメイン:** `<プロジェクトID>.web.app` と `<プロジェクトID>.firebaseapp.com`
   - **`localhost` は追加しないでください**（誰でも自分の PC からアプリを動かして App Check を通れてしまいます）
   - **チェックボックス チャレンジ:** オフのまま
3. 作成後に表示される **キー ID**（`6L` で始まる文字列）を控えます

**6-2. App Check に登録する**

1. Firebase コンソール → **App Check** → **アプリ** タブ → ウェブアプリ
2. **reCAPTCHA Enterprise** を選びます（「Fraud Defense（旧称 reCAPTCHA Enterprise）」と表示されることがあります）
3. 6-1 のキー ID を貼り付けて **保存**

**6-3. キーをアプリに設定する**

```sh
npm run setup      # 「reCAPTCHA のキー ID」に 6-1 の値を入力
```

`.env.local` の `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` に直接書いても構いません。

> reCAPTCHA は、無料枠を超えた評価が課金の対象になり得ます。Cloud Billing を紐付けていなければ課金はされません。

## 7. Firebase AI Logic（AI 解析）

1. Firebase コンソール → **AI Logic** → **始める**
2. **Gemini Developer API** を選びます（Vertex AI は課金が必要なので選びません）
3. **Settings** で次を設定します
   - **Authenticated-users mode:** **Enforced**（ログインしていないリクエストを拒否）
   - **ユーザーごとのレート制限:** 低めがおすすめです（既定は毎分100回。個人利用なら毎分10回ほどで足ります）
4. App Check の **API** タブで、Firebase AI Logic が「適用済み」になっていることを確認します（新しいプロジェクトでは最初から適用済みです）

> 無料枠の Gemini API に送った内容は、Google のサービス改善に使われ、人が確認することがあります（[PRIVACY.md](PRIVACY.md)）。

## 8. 公開（自動）

```sh
npm run doctor     # 設定の点検（任意。deploy でも最初に実行されます）
npm run deploy
```

`deploy` は次を順に行います: 設定の点検 → 秘密情報のチェック → Security Rules の生成 → ビルド → Hosting と Firestore へのデプロイ。

公開されたら、`https://<プロジェクトID>.web.app` を開いて確かめます。

1. **Google でログイン** できる
2. **設定 → AI 解析 → AI 接続を確認** で「AI に接続できました」と表示される
3. （手順 10 をした場合）本を書名で検索できる
4. iPhone の Safari で 共有ボタン → **ホーム画面に追加** し、追加したアプリでもログイン・録音できる

うまくいかないときは [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を見てください。

## 9. データを自分だけに限定する（自動・推奨）

この時点では、ログインした Google アカウントは誰でも「自分用のデータ」を作れます（他人のデータは読めません）。自分だけが使えるようにします。

1. 公開したアプリにログインし、**設定 → アカウント → UID をコピー**
2. 次を実行します

```sh
npm run owner:set -- <コピーした UID>
npm run deploy:rules
```

UID は `.env.local` の `OWNER_UIDS` に保存され、デプロイのたびに Security Rules に差し込まれます（リポジトリの `firestore.rules` には書かれません）。複数人で使う場合は UID を空白区切りで並べます。解除は `npm run owner:set -- --clear` → `npm run deploy:rules` です。

## 10. 書名検索を使う（任意）

キーがなくても、本は手入力で登録できます。

1. [Books API のページ](https://console.cloud.google.com/apis/library/books.googleapis.com) で **有効にする**
2. [認証情報](https://console.cloud.google.com/apis/credentials) → **認証情報を作成** → **API キー**
3. 作成したキーを編集して制限します
   - **アプリケーションの制限:** ウェブサイト — `https://<プロジェクトID>.web.app/*`、`https://<プロジェクトID>.firebaseapp.com/*`、`http://localhost:5173/*`
   - **API の制限:** Books API のみ
4. `npm run setup` を実行してキーを入力し、`npm run deploy` で公開し直します

> 書影は Google Books、なければ Open Library、どちらもなければ書名入りの代わりの表紙を表示します。

## 11. Firebase の API キーを制限する（推奨）

Firebase の API キーは公開されても問題のない値ですが、他のサイトから使われないよう制限しておくと安心です。

1. [認証情報](https://console.cloud.google.com/apis/credentials) → **Browser key (auto created by Firebase)** を開きます
2. **アプリケーションの制限** を **ウェブサイト** にし、次を追加して保存します
   - `https://<プロジェクトID>.web.app/*`
   - `https://<プロジェクトID>.firebaseapp.com/*`
   - `http://localhost:5173/*`（開発する場合）

---

## 開発する場合

```sh
npm run dev
```

開発サーバー（`http://localhost:5173`）では reCAPTCHA が使えないため、AI 解析には **App Check のデバッグトークン**を使います。

1. `.env.local` で `VITE_APPCHECK_DEBUG=true` にして `npm run dev` を起動します
2. ブラウザの開発者ツールの **Console** に出る `App Check debug token: …` をコピーします
3. Firebase コンソール → **App Check** → **アプリ** → ウェブアプリの「⋮」→ **デバッグトークンを管理** で追加します

- デバッグトークンはパスワードと同じように扱い、公開しないでください。ブラウザごとに別のトークンが出ます
- 本番ビルドでは、この設定に関係なくデバッグは無効になります

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm test` | Unit テスト |
| `npm run test:rules` | Security Rules テスト（Firestore Emulator。Java 21 以上） |
| `npm run test:e2e` | E2E テスト（Emulator ＋ Playwright。初回は `npx playwright install chromium`）。実際の Firebase には接続しません |

## 更新とバックアップ

```sh
git pull          # テンプレートから作った場合は、元のリポジトリの変更を取り込む
npm install
npm run deploy
```

- 更新の前に、**設定 → データのバックアップ → JSON で書き出す** でバックアップを取っておくことをおすすめします。
- 別の Firebase プロジェクトに移るときは、新しいプロジェクトで手順 2〜9 を行ってから、**JSON から読み込む** で復元します。本・メモ・タグのつながりはそのまま戻ります。
- Firestore のデータ形式（`schemaVersion`）を変える更新では、移行の手順をリリースノートに書きます。

## コマンド一覧

| コマンド | 内容 |
| --- | --- |
| `npm run setup` | 導入の自動化（プロジェクト・ウェブアプリ・`.env.local`・Firestore・Rules・キーの入力） |
| `npm run doctor` | 設定の点検（足りない設定・食い違いを表示） |
| `npm run deploy` | 点検 → 秘密情報のチェック → Rules の生成 → ビルド → Hosting・Firestore のデプロイ |
| `npm run deploy:rules` | Security Rules とインデックスだけをデプロイ |
| `npm run owner:set -- <UID>` | 所有者を `.env.local` に保存（`--clear` で解除） |
| `npm run check:secrets` | 公開するファイルに秘密情報が混ざっていないかを調べる |
| `npm run icons` | PWA アイコンの再生成 |

> `npx firebase deploy` を直接実行すると、Security Rules が生成されていないためエラーになることがあります。必ず `npm run deploy` を使ってください。
