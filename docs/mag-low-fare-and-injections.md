# MAG: Low Fare Destinations ブロック / Overrides / Injections（hol4da 組み込み版）

## 1. 動画から読み取った現行フロー（AEM 6.5 / Page Editor）

※ 動画の音声トラックは無音だったため、画面内容のみから整理しています。

1. ホーム（`/content/mh/my/en/home`, `/sg/en/home` …）は、マーケットごとの Experience Fragment
   `/content/experience-fragments/mh/<market>/en/site/low-fare-destination/master` を参照している。
2. XF 内の **Low Fare Destination Tiles** コンポーネントのダイアログ：
   - Type: `varient 2 (3 tiles)`、APP Title: `Explore our top destinations from`（＋出発地の都市名を付加）
   - Hide in Desktop / Hide in Mobile
   - multi-list「Origin」(max 5): Origin Airport Code (`KUL`), Origin City Name (`Kuala Lumpur`)
     - multi-list「Destination」(max 15): Destination Name, Destination Airport Code (`NRT`), Portrait 画像, Landscape 画像
   - 都市名と価格（`MYR 2,733`）はサーバー HTML には含まれず、クライアント JS（運賃 API）が後から埋めている。
3. **Script executor** コンポーネント（「HTML and Javascript」テキストエリア＋Hide in Desktop/Mobile）を XF に追加すると、
   その XF を参照する全ページで任意の JS が走る。動画では追加直後にタイルの価格表示が消えていた。
   → 「XF を publish するだけで、複数ページの要素を即座に書き換える」ための仕組み。

## 2. EDS Block: `blocks/low-fare-destinations`

| AEM ダイアログ | EDS |
|---|---|
| Type (variant 1 / 2) | ブロックオプション `variant-1` / `variant-2`（デフォルト） |
| Hide in Desktop / Mobile | ブロックオプション `hide-desktop` / `hide-mobile` |
| APP Title | `Title` 行（出発地の都市名を自動付加） |
| Origin × Destination の二重 multi-list | 1 行 = 1 目的地（先頭セルに出発地コード）。ブロックが出発地ごとにまとめる |
| Portrait / Landscape 画像 | `<picture>` にまとめ、900px 以上で Landscape を使う |
| 価格（JS 取得） | `Fare API` 行またはページメタデータ `low-fare-api` の URL テンプレートで非同期取得（sessionStorage に 30 分キャッシュ） |

### オーサリング例（ドキュメントベース）

| Low Fare Destinations (variant-2) | | | | | | |
|---|---|---|---|---|---|---|
| Title | Explore our top destinations from | | | | | |
| Fare API | https://api.example.com/fares?from={origin}&to={destination} | | | | | |
| View all | [View all](/my/en/plan-trip/destinations) | | | | | |
| KUL | Kuala Lumpur | Tokyo | NRT | (画像) | (画像) | /my/en/.../flights-to-tokyo |
| KUL | Kuala Lumpur | Alor Setar | AOR | (画像) | (画像) | ... |
| SIN | Singapore | Kuala Lumpur | KUL | (画像) | (画像) | ... |

このリポジトリ（hol4da）は DA（Document Authoring）なので、上の表をそのまま DA のドキュメントに書きます。Universal Editor 用のモデル定義は mag-eds-block 側の `_low-fare-destinations.json` にあります。

**出発地の決め方:** `?origin=` → Cookie（`Origin cookie` 行またはメタデータ `low-fare-origin-cookie` で名前を指定）→ ページメタデータ `origin` → 最初に書かれた出発地。
マーケット別ページ（my/sg…）は、現行の XF と同様に EDS の **fragment** を `/fragments/<market>/low-fare-destination` などに置いて参照する構成をおすすめします。

**要確認（TODO）:** MAG 運賃 API の実 URL とレスポンス形式。現在のアダプタは `{price, currency}` か `{data:{price, currency}}` を想定しています（`fetchFare()` 内）。


## 3. 「任意ページの要素を即座に変更したい」を EDS でどう実現するか

用途に応じて、2つの仕組みを使い分けます。

| | ① Overrides（`/overrides.json`） | ② Injections（`/injections.json`） |
|---|---|---|
| 書くもの | 表（セレクタと決まった操作） | **JavaScript** |
| 使うとき | 非表示・文言差し替えなど | JS でしかできない変更 |
| 書ける人 | 通常のオーサー | **権限を与えた人だけ** |
| 実装 | `scripts/overrides.js` | `scripts/injections.js` |

どちらも、シートを publish するとシートのキャッシュがパージされ、次のページ表示から反映されます（ページの再 publish は不要）。
まずは ① で済ませ、JS が必要なときだけ ② を使う運用にしてください。

### ① Overrides（宣言的）

| Path | Exclude | Selector | Action | Value | Device | Start | End |
|---|---|---|---|---|---|---|---|
| /my/en/* | | .low-fare-destinations .lfd-price | hide | | all | | |
| /sg/en/home | | .hero h1 | text | Time for Malaysia | | 2026-11-20T00:00:00+08:00 | 2026-11-30T23:59:59+08:00 |

Action: `hide` / `show` / `text` / `html`（script・on*・javascript: は除去） / `attr` / `add-class` / `remove-class` / `remove`

### ② Injections（オーサーが書く JS）

#### JS は1か所に集約
- オーサーが書く JS は **`/injections` というスプレッドシート1つだけ**に置きます。
- ローダー（`scripts/injections.js`）は `/injections.json` 以外から JS を読みません。ページやブロックに JS を埋め込む手段は用意していません。

#### シートの形式（シート名 `helix-scripts`、任意で `helix-settings`）

| ID | Enabled | Path | Exclude | Device | Timing | Start | End | Script | Owner | Ticket | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| INJ-001 | TRUE | /my/en/* | | all | lazy | | 2026-12-31T23:59:59+08:00 | (下の例) | web-team | MAG-123 | 運賃表示の緊急修正 |

```js
// Script 列の例：ブロック描画後に要素を待ってから変更する
const block = await inject.waitFor('.low-fare-destinations');
if (block) {
  block.querySelectorAll('.lfd-price').forEach((p) => { p.textContent = ''; });
  inject.log('prices cleared');
}
```

- `Enabled` は **TRUE と書いた行だけ**動きます（空欄はオフ）。
- `Timing`：`eager`（すぐ）／`lazy`（全ブロックの描画後、既定）／`delayed`（ページ読み込みのあと）。
- Script は async 関数の中で動くので、`await` が使えます。`inject.waitFor(selector)` で要素が出てくるまで待ち、`inject.log()` でログを出せます。
- 実行時の安全策：
  - 1つの JS が失敗しても、ほかの JS とページは止まりません（構文エラーも、その行だけが動かないで済みます）。
  - DevTools には `injections/INJ-001.js` という名前で表示されます。
  - 実行結果は `mag:injection` イベント（done / error / not-started）で取れます。

#### 権限管理（誰が書けるか）
1. **ドキュメントの権限（DA）：** シートは DA の `https://da.live/#/edshol/hol4da/injections` に置きます。DA の組織設定（`https://da.live/config#/edshol/` の permissions）で、`/injections` への write を特定のグループだけに許可します。ほかのページを編集できる人でも、JS は書けません。※設定の書式は DA のドキュメントで確認してください。
2. **publish の権限：** EDS のアクセス設定（admin のロール設定）で、preview / publish できるユーザーを制限します。※パス単位で制限できるかは要確認。
3. **プレビューで確認：** `.page`（preview）では preview 版のシートが読まれるので、publish 前に preview 環境で動作を確認できます。

#### 履歴（いつ・誰が・何を変えたか）
- **誰が編集したか：** DA のバージョン履歴（シートを開いて Versions パネル）
- **誰がいつ publish したか：** EDS admin のログ（preview / publish の操作ログ）。※取得方法は要確認。
- **何が変わったか（JS の差分）：** `.github/workflows/injections-snapshot.yml` が15分ごとに live の `/injections.json` を取得し、`injections-history/scripts/<ID>.js` として Git にコミットします。JS の変更が Git の diff で読めます。
  - 設定：リポジトリ変数 `LIVE_ORIGIN` = `https://main--hol4da--edshol.aem.live`
  - GitHub の schedule は既定ブランチ（main）でのみ動くため、main にマージされてから有効になります。

#### 緊急停止
- 全体を止める：`helix-settings` シートの `enabled` を `FALSE` にして publish
- 1件だけ止める：その行の `Enabled` を `FALSE`
- 特定ページで止める：ページメタデータ `injections: off`
- 調査時に止める：URL に `?injections=off` を付ける

### scripts.js への組み込み

```js
// scripts/scripts.js
import { loadOverrides } from './overrides.js';
import { loadInjections, runInjections } from './injections.js';

async function loadEager(doc) {
  loadOverrides();          // await しない（hide 用 CSS を早く入れる）
  loadInjections();         // シートの取得だけ先に始める
  runInjections('eager');
  // ...既存処理
}

async function loadLazy(doc) {
  // ...既存処理（loadSections など）の最後に
  runInjections('lazy');
}

function loadDelayed() {
  window.setTimeout(() => {
    runInjections('delayed');
    import('./delayed.js');
  }, 3000);
}
```

### CSP について
hol4da の `head.html` には現在 CSP が入っていません。将来、boilerplate 標準の CSP（`nonce` + `strict-dynamic`）を入れても動くよう、ページの nonce を引き継いで `<script>` を挿入しています。`eval` / `new Function` は使っていません。

## 4. ローカルでの確認方法

```sh
aem up --html-folder drafts   # drafts/*.html をローカルのテストページとして配信
```

- `drafts/`、ルートの `/injections.json`、`/overrides.json` にテスト用データを置けば、DA に触らずに確認できます（いずれも Git には含めません）。
- 確認済みの項目：ブロックの表示と価格の後埋め、`?origin=SIN` での出発地切り替え、overrides の文言差し替え、injection の lazy / delayed 実行、`Enabled=FALSE` の除外、実行時エラーと構文エラーで後続の JS が止まらないこと、`?injections=off` での停止。
