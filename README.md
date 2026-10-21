# hol4da

`edshol/p3demoapac` をベースにした **da.live 版** Edge Delivery Services (EDS) プロジェクト。
コンテンツソースを Adobe AEM author (crosswalk) から **da.live** に切り替えています。

## Environments
- da.live (authoring): https://da.live/#/edshol/hol4da
- Preview: https://main--hol4da--edshol.aem.page/
- Live:    https://main--hol4da--edshol.aem.live/

## Content source
`fstab.yaml` は da.live のコンテンツストアをマウントします。

```yaml
mountpoints:
  /:
    url: https://content.da.live/edshol/hol4da/
    type: markup
```

## ブロック
p3demoapac から継承したブロック（コードは無改変）:
`columns`（`col-red` / `col-hero` バリアント）, `tabs`, `cards`, `hero`, `quote`, `fragment`, `header`, `footer`。

## サンプルコンテンツ
`content/hol/news/hol12-otouto-to-aem-2.html` — da.live にそのまま取り込める記事ページ。
`columns (col-red)` ヒーロー → `bg-gray, text-center` セクション見出し → `tabs`（3タブ）→ エピローグ、で構成。
画像は `content/hol/news/assets/` にあり、da.live 上の同じパスへアップロードして使います。

## セットアップ手順（da.live）
1. このコードを GitHub `edshol/hol4da` に push する
2. リポジトリに [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) を追加
3. [da.live](https://da.live/#/edshol/hol4da) で `hol/news/hol12-otouto-to-aem-2` を作成し、
   `content/hol/news/hol12-otouto-to-aem-2.html` の中身を貼り付け / 取り込み
4. `content/hol/news/assets/` の画像を da.live の同じパスにアップロード
5. da.live で Preview → Publish

## ローカル開発
```sh
npm i
npm install -g @adobe/aem-cli
aem up        # http://localhost:3000
npm run lint
```
