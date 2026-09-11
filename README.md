# app-air-sched

**air-sched —— 航空便スケジュール管理の appview。** 便名・区間・時刻・運航曜日の
スケジュール登録、空港スロットの要求と割当、コードシェア登録を扱う面である。
`etzhayyim/root` の `60-apps/etzhayyim-project-air-sched` からの抽出物で、
**2026-08-18 に appview を TypeScript/Svelte から ClojureScript へ移行した**
（`docs/adr/0001`）。数字はすべて `scripts/verify-docs-claims.cljs` が tree から
再計算して検査する。

## deploy されるものは、いま読んでいるソースである

```
src/air_sched/route.cljc    判断（どの handler が答えるか）  ← 純 .cljc、テスト対象
src/air_sched/view.cljc     ページ（jp-go-dds の hiccup）    ← 純 .cljc、テスト対象
src/air_sched/worker.cljs   Request/Response に触る唯一の層
        ↓ shadow-cljs :target :esm
dist/worker.js              ← wrangler.jsonc の "main" が指すもの
```

移行前は `main` が `svelte/.svelte-kit/cloudflare/_worker.js` を指していた。
**そのファイルは tree に無い**（`git ls-files | grep -c svelte-kit` → 0）。
そして読み手が最初に開く `src/app.ts`（76 行）は**どこからも参照されていな
かった** —— tree 全体の grep で、docs の散文以外に参照は 0 件。root の
`package.json` は `tsc --noEmit` を宣言していたが、root に `tsconfig.json` は
無かった。いまは `main` が指す bundle が上のソースからコンパイルされたもので、
検証器が **shadow の出力先と wrangler の `main` と export の ns 名の 3 つが
噛み合っていること**を検査する。

判断を `.cljc` に置いてあるのは、ブラウザもビルドも無しにテストするためであり、
ingress capability が qualify した時に **最初に `.kotoba` へ移る部分**だからで
ある（入口を当面 cljs に置くのは ADR-2606290000 の判断）。

## 公開ルート

| METHOD | PATH | 何をするか |
|---|---|---|
| GET | `/` | この appview の説明ページ |
| GET | `/health` | 生存確認。deploy された面が答えることを外から確かめられる |
| POST | `/xrpc/:nsid` | XRPC を MCP router へ中継する |
| OPTIONS | `/xrpc/*` | CORS preflight |

**この表の出所は `air-sched.route/routes` で、ページもそこから描く。** 移行前の
ページは summary object を literal で埋め込んでおり、隣の `wrangler.jsonc` を
見なかった（抽出直後は `Routes 0`、`vars` 空と表示していた。手で 2 と 8 に直され
たが生成器は無く、route を足せばまたずれる状態だった）。いまは route 表を渡す側が
持ち、ページは描くだけなので、両者がずれる余地が無い。

`/xrpc/` は**空の nsid だけ 400**。`/xrpc/a/b` は移行前の SvelteKit rest
parameter `[...path]` と同じく**そのまま転送する** —— 1 セグメントに絞るのは
移行ではなく方針変更なので、この commit では行わない。

## `kotoba/` は appview ではない —— 移行の対象外として残してある

この repository には **appview 以外の TypeScript が 5 本ある**。`kotoba/`
（`@etzhayyim/air-sched-kotoba`、7 ファイル）は AT PDS 上のレジストリ実装
（`registry.ts` 287 行 / `types.ts` 259 行 / 5 tests）で、**appview とは無関係**
である。測ってからそう判断した:

| 問い | 測定 |
|---|---|
| どれかの bundle に入るか | **入らない**。`svelte/` も `src/app.ts` も import していない（実測 0 件） |
| 依存は解決するか | **する**。`@etzhayyim/sdk` `12314a0c` と `@etzhayyim/sdk-mock` `c857ff9b` は `git fetch <url> <sha>` が `type=commit` で取得できる |
| 移行が置き換えるものか | **違う**。置き換えたのは deploy される Worker であって、この domain library ではない |

**GitHub の commits API は実在する commit に 404 を返す**ので、SHA の存在確認は
git に訊いた（この罠は複数の agent が踏んでいる）。なお npm 11.16 は git 依存の
入れ子 install を `EALLOWSCRIPTS` で拒否するが、それは**ツールの方針**であって
依存の不在ではない —— この repository の 5 tests は今日も未実行のままである
（`docs/operator-quickstart.md` §6）。

移行の指示が「TypeScript を全部消す」であっても、これを消すのは移行ではなく破壊
である。**残し、ここで名指しし、検証器に file count 7 を固定した** ——「appview は
cljs になった」が TypeScript の静かな増殖の隠れ蓑にならないように。移すなら別の
決定で、依存する SDK の cljs の面が要る。

## いま在るもの — 25 ファイル

| 面 | ファイル |
|---|---|
| 判断・描画・edge | `src/air_sched/{route.cljc, view.cljc, worker.cljs}` |
| テスト | `test/air_sched/route_test.cljc`（5 tests / 22 assertions） |
| ビルド | `deps.edn` / `shadow-cljs.edn` / `.gitignore` |
| Worker 設定 | `wrangler.jsonc` |
| actor 記述子 | `kotodama.jsonld` |
| **domain library（appview ではない）** | `kotoba/`（7 ファイル、TypeScript 5 本） |
| 由来・権利・識別 | `NOTICE` / `README.edn` / `migration.edn` / `MIGRATION-TODO.md` |
| 検証 | `scripts/{smoke-worker.cljs, verify-docs-claims.cljs}` |
| 文書 | `README.md` / `docs/operator-quickstart.md` / `docs/adr/0001-*.edn` |

**appview の TypeScript は 0 本、正本言語（`.cljs`/`.cljc`）が 4 本。** 移行前は
appview 側が TypeScript 3 本 + Svelte 1 本、cljs 0 本だった。この 2 つの数は
検証器の claim なので、TS が戻れば落ちる —— 撤去したパスに戻る場合
（`removed-by-migration-absent`）も、別名で入る場合（`appview-ts-files`）も、
別々の claim が捕まえる。`kotoba/` の 5 本はこの数に含めない（上記）。

## ページが出す値・出さない値

env の**キー名**は出すが、値は出さない —— **中継先を除いて**。
`AGENTGATEWAY_MCP_ROUTER_URL` の値だけは、どこへ中継するかを運用者が見る
必要があるので意図的に表示する。

smoke はこれを**2 つの独立した印**で見る: 別の var に置いた sentinel が
出ていないこと、そして中継先の値が出ていること。片方だけだと「全部隠す」
実装も「全部出す」実装も通ってしまう。

## UI

基盤は `kotoba-lang/jp-go-digital-design-system`（デジタル庁デザインシステム）。
色・寸法は `--hig-*` トークン契約だけで書き、raw hex も px フォントサイズも
置かない。app 固有 CSS は 3 行。CSS は外部リクエストゼロの方針どおり
`shadow.resource/inline` で bundle に焼く。

決定論的 audit（`kotoba-lang/design-quality`）で **100.00 / 100（gate 95）**。
`--extra-axes` を付けた 12 軸でも 100.00。

**ただしこのスコアが言うことは少ない。** 同じ instrument は、デザインシステムを
完全に外したページにも 96.63 を出して `--min 95` を通す（app-ongakuka の実測）。
「デザインシステムが実際に入っている」と言えるのは、下の smoke の 2 本目だけである。

## デザインシステムの検査は 2 本ある

`dads-table` が在ることを 1 本で見る形は**落ちない検査**だった —— それは view が
出力する markup であって、CSS が 1 バイトも入っていないページにも現れる。
実測（このページ、2026-08-18）:

| 探す文字列 | CSS 込み | CSS 無し |
|---|---|---|
| `dads-table` | 74 | **6**（0 にならない） |
| `class="dads-table"` | 1 | **1**（変わらない） |
| `--color-primitive-blue` | 45 | **0** |

だから 2 本に割った。**component を使ったか**（`class="dads-table"`）と、
**stylesheet が実際に入ったか**（`--color-primitive-blue`）は別の主張である。
`(rc/inline "jp_go_dds/dds.css")` を `""` にして bundle を作り直すと**後者だけが
赤くなる**ことを確認済み（`docs/operator-quickstart.md` §4.7）。

## 呼び先が 1 つも解決しない（移行では直らない）

| ホスト | 役割 | DNS（2026-08-18、`dig +short`） |
|---|---|---|
| `air-sched.etzhayyim.com` | 公開ホスト（wrangler の route） | **応答なし** |
| `a1rsch3d.etzhayyim.com` | 同（nanoid 側） | **応答なし** |
| `mcp.etzhayyim.com` | `/xrpc/:nsid` の中継先 | **応答なし** |
| `dispatcher.etzhayyim.com` | 移行前 `src/app.ts` の proxy 先 | **応答なし** |

deploy 先も中継先も、いま存在しない（`etzhayyim.com` 自体は解決する）。
`/xrpc/` は到達できなければ **502 を返す** —— 成功と同じ形で隠さない。

## 由来（custody）

`migration.edn` は出所を `etzhayyim/root` の tree `a9c9f11f` と宣言する。移行後の状態:

- 継承した 12 ファイル（32,646 バイト。`kotoba/` の 7 + `kotodama.jsonld` +
  `MIGRATION-TODO.md` + `NOTICE` + `README.edn` + `migration.edn`）は
  **いまも 1 バイトも変わっていない**（sha256 を検証器に固定）
- `wrangler.jsonc` は**意図的に変更**した（`main` の付け替え、消えた SvelteKit
  client を指す `assets` の撤去、`compatibility_flags` の撤去、`APP_FRAMEWORK` を
  `sveltekit-edge-bff` → `cljs-esm-worker`）
- appview の TypeScript/Svelte 9 ファイルは**移行で撤去**した。検証器はその 9 パスを
  名指しで「不在であること」を検査する —— byte 合計は「TS が消えた」と言えない

## 持ち越さなかったもの（黙って消していない）

移行前の `src/app.ts` にあってどこにも deploy されていなかった経路のうち、
次は**意図的に移していない**:

- **dispatcher proxy**（`/xrpc/com.etzhayyim.apps.airSched.*` → `dispatcher.etzhayyim.com`）
  —— 宛先が解決せず、必要な binding（`DISPATCHER_URL` / `DISPATCHER_INTERNAL_SECRET`）が
  `wrangler.jsonc` に 1 つも宣言されていない
- **`/_app/meta`** —— `/health` と同じ body を返す別名

**動かない経路を移植して「移行済み」と言わないため**である。必要になった時点で
`route.cljc` に足し、テストと binding を伴って戻す。

逆に **`/health` は追加した**（移植ではない）。移行前は `src/app.ts` に在ったが
deploy されておらず、`assets` の `not_found_handling: "none"` のせいで GET
`/health` は 404 だった。中継先も binding も要らない純粋な生存確認なので、
上の 2 つとは違って持ち越せる。

## 残っている欠陥（移行では直っていない）

1. **`MIGRATION-TODO.md` のチェックボックス 7 件が未チェック**のまま。憲章適合の
   手動レビューは未実施であるとその文書自身が書いている。
2. **`kotoba/` の 5 tests が未実行**（npm が git 依存の入れ子 install を拒否する）。
3. **`APP_CAPABILITIES` は 8 メソッド中の先頭 3 つだけ**を持つ（truncation）。
   欠けているのは `assignFleet` / `publishSchedule` / `assignGate` /
   `changeFrequency` / `registerCodeshare`。9 つの `app-air-*` すべてで同型
   （`cloud-itonami/app-air-mro/docs/operator-quickstart.md` §1 の測定）。
   この var は文書であって強制ではない —— メソッド一覧は MCP router 側にある。

## 検証

```bash
npx --yes kbb --backend sci scripts/verify-docs-claims.cljk .          # <dir> は先頭に置く
```

exit 0 = 全一致 / 1 = 食い違い / **2 = 判定できなかった**（0 と区別する）。
テストとビルドは `docs/operator-quickstart.md`。
