# fitlog レシピ中継（GAS）

Notion の「DB_レシピリスト」を読み、fitlog の `Recipe` 形式（`src/types/index.ts`）で返す Web アプリです。
`listRecipes`（読み取り）と、recipe-db.json から移すための `importRecipes`（書き込み）に対応しています。

- Notion のトークンは GAS のスクリプトプロパティに置き、アプリには持たせません。
- アプリから届いた Google アクセストークンで Drive の `about` を呼び、`ALLOWED_EMAIL` のアカウントか確かめます（アプリの `drive.appdata` スコープのままで呼べます）。
- 結果は5分間キャッシュします。`refresh: true` を付けると Notion から読み直します。

## 呼び出し方

`POST <WebアプリURL>`。`Content-Type: text/plain` で送ると CORS のプリフライトが起きません。

```json
{ "action": "listRecipes", "token": "<Google アクセストークン>", "refresh": false }
```

応答（GAS は HTTP ステータスを変えられないので `ok` で判定します）:

```json
{ "ok": true, "data": { "version": 1, "recipes": [ ... ], "fetchedAt": "2026-10-27T00:00:00.000Z" } }
{ "ok": false, "error": "unauthorized" }
```

`importRecipes` は fitlog の `Recipe` の配列を受け取り、同じ料理名（空白・全角半角を無視）のページがあれば空の項目だけ埋め、なければ作ります。何度送っても重複しません。

```json
{ "action": "importRecipes", "token": "...", "recipes": [ { "id": "...", "name": "豚丼", ... } ] }
{ "ok": true, "data": { "results": [ { "id": "...", "status": "created", "notionId": "..." } ] } }
```

`status` は `created`・`updated`・`skipped`（埋める項目なし）・`failed`（`error` 付き）。Notion が 401/403 を返したときは全体を `ok: false` で止めます。主食（staple）は料理名から 丼・麺類・サンドイッチ・パン・ごはん に振り分け、冷凍可・下味冷凍可 以外のタグはメモに「タグ: …」で残します。

`error` は `unauthorized`（トークンなし・期限切れ）、`forbidden`（別アカウント）、`unknown action`、`notion 4xx: ...`、`script property ... is not set` のいずれかです。

## Notion の列と Recipe の対応

| Recipe | Notion | 備考 |
|---|---|---|
| `id` | ページID | |
| `name` | 料理名 | |
| `category` | カテゴリー | 弁当→bento、朝食→breakfast、主菜・お鍋→main、汁もの→soup、副菜→side、ごはん・丼・麺類・パン・サンドイッチ→staple、おやつ→snack。この順で最初に当たったもの。どれもなければ side |
| `tags` | 冷凍可・下味冷凍 | 「冷凍可」「下味冷凍可」 |
| `servings` | 人数 | 未入力なら `null` |
| `calories` `protein` `fat` `carbs` | kcal・たんぱく質・脂質・炭水化物 | 1食分。未入力なら `null` |
| `sodium` | 食塩相当量 | 未入力ならキーごと省く |
| `ingredients` | 分量 | 1行に「材料名｜量」 |
| `note` | メモ | |
| `sourceUrl` | URL | |
| `imageFileId` | fitlog画像ID | |
| `createdAt` `updatedAt` | 作成日時・最終更新日時 | |

`servings` と栄養値は `null` になることがあります。アプリ側で「栄養未登録」として扱ってください。

## セットアップ

1. **Notion のインテグレーションを作る**
   - https://www.notion.so/profile/integrations で「新しいインテグレーション」を作ります（種類：内部、機能：コンテンツを読み取る・更新する・挿入する）。
   - 表示されたシークレットを控えます。
   - Notion の「献立・レシピ管理」ページ右上の「…」→「接続」から、このインテグレーションを追加します。
2. **GAS プロジェクトを作る**
   - https://script.google.com で新しいプロジェクト（例：fitlog レシピ中継）を作ります。
   - `Code.gs` の中身を貼り付けます。
   - 「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示する」をオンにし、`appsscript.json` も置き換えます。
3. **スクリプトプロパティを設定する**（プロジェクトの設定 → スクリプト プロパティ）

   | プロパティ | 値 |
   |---|---|
   | `NOTION_TOKEN` | 手順1のシークレット |
   | `RECIPE_DB_ID` | `bf5bbbea39368289b4048128b30dd433` |
   | `ALLOWED_EMAIL` | fitlog にログインしている Google アカウント |

4. **動作確認**：エディタで `debugListRecipes` を実行します。初回は権限の承認が出ます。ログに `recipes: 68` と1件目の内容が出れば OK です。
5. **デプロイ**：「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」、次のユーザーとして実行「自分」、アクセスできるユーザー「全員」。
   - 発行された `https://script.google.com/macros/s/.../exec` の URL を控えます（手順3でアプリの環境変数に入れます）。
   - ブラウザでその URL を開き、`{"ok":true,"service":"fitlog-recipe-proxy"}` が出れば公開できています。
   - コードを直したときは「デプロイを管理」→ 編集 →「新バージョン」で更新すると、URL が変わりません。

「全員」に公開しても、正しい Google アカウントのトークンがない呼び出しは `forbidden` / `unauthorized` で断ります。
