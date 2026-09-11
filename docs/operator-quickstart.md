# operator-quickstart — app-air-sched

**この repo で今日実際にできることを、踏める形で上から書く。** 所要 5 分。
Cloudflare のアカウントは要らない（deploy だけが要る。§7）。

出力はすべて 2026-08-18 に実際に walk した結果である。walk していない箇所は
その旨を書く（§6）。

**この文書は移行と同時に書き直した。** 以前の版は「`wrangler.jsonc` の `main` は
SvelteKit のビルド、`src/app.ts` は deploy されない」という測定を記録していた。
その状態は `docs/adr/0001` の移行で解消したので、記述も差し替えてある。

## 0. 前提

| 要るもの | 確認 | この walk で使った版 |
|---|---|---|
| git | `git --version` | 2.51.0 |
| nbb | `npx --yes nbb --version` | v1.4.208 |
| clojure | `clojure --version` | ビルド時のみ |

環境の罠（この family 共通、`app-air-crew` §0 が詳しい）:

1. **remote は `origin` ではない** —— west が org 名で付けるので `cloud-itonami`。
2. **`error: could not read IPC response` は fsmonitor daemon** であって
   コマンドの失敗ではない。`-c core.fsmonitor=false` で黙る。
3. **`/tmp` の一時ファイル名を共有しない** —— このワークスペースでは同型の移行が
   並行して走る。実測 2026-08-18: `/tmp/worker.bak` に退避した本 repo の
   `worker.cljs` が、別 repo（`app-air-ffp`）を移行していた並行セッションの
   同名ファイルで**上書きされ**、復元したら `(ns air-ffp.worker)` が入っていた。
   ビルドが `Resource does not have expected namespace / Expected: air-sched.worker
   / Actual: air-ffp.worker` で落ちて気づいた。退避先はセッション固有の
   ディレクトリにする。

## 1. 取得して、書いてあることが本当か検査する

```bash
git clone git@github.com:cloud-itonami/app-air-sched.git
cd app-air-sched
REPO=$PWD
npx --yes kbb --backend sci scripts/verify-docs-claims.cljk .
```

末尾が `OK` なら README の数値・存在・不在は tree と一致している。
**exit 2（UNDETERMINED）は 0 ではない** —— tree を読み切れなかったという別の
答えで、「検査して問題なし」と混ぜない。

実際の出力:

```
SCANNED	25
PASS	tracked-files	expected=25	actual=25
PASS	preserved-bytes	expected=32646	actual=32646
PASS	preserved-files-unchanged	expected=[]	actual=[]
PASS	removed-by-migration-absent	expected=[]	actual=[]
PASS	svelte-artifacts	expected=0	actual=0
PASS	appview-ts-files	expected=0	actual=0
PASS	appview-canonical-files	expected=4	actual=4
PASS	kotoba-files	expected=7	actual=7
PASS	wrangler-main	expected="dist/worker.js"	actual="dist/worker.js"
PASS	declared-vars	expected=8	actual=8
PASS	declared-routes	expected=2	actual=2
PASS	no-stale-assets-binding	expected=true	actual=true
PASS	sveltekit-compat-flags	expected=0	actual=0
PASS	shadow-builds-that-main	expected=true	actual=true
PASS	warnings-as-errors-under-compiler-options	expected=true	actual=true
PASS	no-warnings-as-errors-in-build-options	expected=nil	actual=nil
PASS	page-renders-route-table	expected=true	actual=true
PASS	adr-count-at-least-one	expected=true	actual=true
PASS	adrs-read-as-edn	expected=[]	actual=[]
OK	every claim in README.md and docs/operator-quickstart.md holds
```

この検査には移行の不変条件が入っている: appview の TypeScript が戻っていないこと
（撤去した 9 パスの不在 + `.ts` の総数）、`wrangler.jsonc` の `main` が shadow の
出力先を指していること、ページが route 表から描かれていること、`kotoba/` が
7 ファイルのままであること、そして **`:warnings-as-errors` が `:compiler-options`
の下に在ること**（§4.6）。

### 1.5 この検証器が落ちることを、10 通りの壊し方で見た（2026-08-18）

| 壊したもの | 赤くなった claim |
|---|---|
| 撤去した `src/app.ts` が戻る | `removed-by-migration-absent` + `appview-ts-files` |
| TypeScript が**別名**で入る（`src/newthing.ts`） | `appview-ts-files`（撤去リストには無い名前でも捕まる） |
| `:warnings-as-errors` を `:build-options` へ移す | `warnings-as-errors-under-compiler-options` + `no-warnings-as-errors-in-build-options` |
| `main` を SvelteKit 出力に戻す | `wrangler-main` + `shadow-builds-that-main` |
| `kotoba/` にファイルが増える | `kotoba-files` |
| `.svelte` ファイルが戻る | `svelte-artifacts` |
| `compatibility_flags` が戻る | `sveltekit-compat-flags` |
| 継承ファイル（`kotoba/src/types.ts`）を 1 バイト編集 | `preserved-bytes` + `preserved-files-unchanged` |
| view が route 表でなく固定値を描く | `page-renders-route-table` |
| ADR の EDN を壊す（3 通り） | `adrs-read-as-edn` |

**3 番目が、この検証器を grep で書けない理由である。** キーを `:build-options` へ
動かしても `grep -c warnings-as-errors shadow-cljs.edn` は **3 のまま**（説明コメントに
出てくる）で、grep ベースの検査は緑のままになる。検証器は EDN として読んで
`[:builds :worker :compiler-options :warnings-as-errors]` を見る。

**最後の 1 つは、書いた直後は落ちなかった。** `:adrs-read-as-edn` の初版は
`(reader/read-string s)` を直接呼んでおり、**read-string は最初の 1 form を読んで
後ろを黙って捨てる** —— ADR の末尾に `{:unbalanced "` を足しても緑だった。
ファイル全体を `[ … ]` で包んで読ませ、top-level form が 1 つであること・vector で
あること・各要素が `:adr/id` を持つ map であることまで見る形に直し、3 通りの
壊し方（末尾のゴミ / 2 つ目の整形式 form / tx-data 内部の未終端文字列）すべてで
赤くなることを確認した。**「落ちない検査」は自分の書いたものにも出る。**

## 2. テストを走らせる（ビルド不要・ブラウザ不要）

判断（`route.cljc`）と描画（`view.cljc`）は純 `.cljc` なので、nbb だけで回る。

```bash
K=~/github/com-junkawasaki/orgs/kotoba-lang
CP="src:test:$K/jp-go-digital-design-system/src:$K/html/src:$K/css/src"
cat > /tmp/run.cljs <<'EOF'
(require '[cljs.test :refer [run-tests]] 'air-sched.route-test)
(run-tests 'air-sched.route-test)
EOF
npx --yes kbb --backend sci --classpath "$CP" /tmp/run.cljs
```

実際の出力:

```
Testing air-sched.route-test

Ran 5 tests containing 22 assertions.
0 failures, 0 errors.
```

何を固定しているか: `/xrpc/` は**空の nsid だけ** 400 にする（`/xrpc/a/b` は移行前の
rest parameter `[...path]` と同じく転送する。1 セグメントに絞るのは移行ではなく
方針変更）、MCP router の URL 解決（空白だけの設定は未設定として扱う）、
`result` / `structuredContent` の剥がし方、そして**ページが route 表から描かれること**
（固定値を焼いていたら落ちる）。

**落ちることを見た**（2026-08-18）:

| 壊したもの | 出力 |
|---|---|
| `/xrpc/a/b` を 400 に絞る | `FAIL in (dispatch-xrpc)` … `expected: (= {:action :xrpc, :nsid "a/b"} …)` → 1 failures |
| `view` の `:rows` を固定 1 行に | `FAIL in (page-shows-the-real-routes)` `/health がページに出ていない` → 2 failures |

## 3. ページを描画して採点する

```bash
K=~/github/com-junkawasaki/orgs/kotoba-lang
CP="src:$K/jp-go-digital-design-system/src:$K/html/src:$K/css/src"
cat > /tmp/render.cljs <<'EOF'
(require '["node:fs" :as fs] '[air-sched.view :as view] '[air-sched.route :as route])
(let [css (.readFileSync fs (str (.-DDS js/process.env) "/resources/jp_go_dds/dds.css") "utf8")]
  (.writeFileSync fs "/tmp/air-sched-page.html"
    (view/render {:css css :routes route/routes
                  :vars [:AGENTGATEWAY_MCP_ROUTER_URL :APP_CAPABILITIES :APP_DESCRIPTION
                         :APP_DISPLAY_NAME :APP_FRAMEWORK :APP_NANOID
                         :APP_PERFORMER_TYPE :APP_UI_TYPE]
                  :mcp-url "https://mcp.etzhayyim.com/xrpc/com.etzhayyim.mcp.message"}))
  (println "ok"))
EOF
DDS="$K/jp-go-digital-design-system" npx --yes kbb --backend sci --classpath "$CP" /tmp/render.cljs

cd $K/design-quality && npx --yes kbb --backend sci -m design-quality.cli score /tmp/air-sched-page.html --min 95
```

実際の出力（末尾）:

```
  100.00  /tmp/air-sched-page.html

aggregate: 100.00

axes scored: 10 (viewport, safe-area, dynamic-viewport, tap-targets, focus-visible,
                 reduced-motion, overflow-guard, color-scheme, responsive, semantics)
NOT scored: input-zoom, contrast — pass --extra-axes to include the optional ones
A pass says nothing about an axis that was not applied.

gate: aggregate 100.00 >= min 95.00 -> PASS
```

`--extra-axes` を付けた 12 軸でも **100.00 / PASS**。

**落ちることを見た**: レンダリング済み HTML から `<meta name=viewport>` を除いた
コピーを採点すると `90.74 < 95 -> FAIL`（exit 1）。PASS は exit 0。

**このスコアが言えることは少ない。** 同じ instrument は、デザインシステムを完全に
外したページにも 96.63 を出して `--min 95` を通す（app-ongakuka の実測）。
「デザインシステムが実際に入っている」と言えるのは §4.7 の smoke の 2 本目だけ。

## 4. bundle をビルドする

**高負荷ビルドは同時 1 本に制限されている**（superproject `CLAUDE.md` の
resource governor）。直接叩かず、必ず guard 経由で:

```bash
cd "$REPO"
node ~/github/com-junkawasaki/scripts/resource-guard.mjs run build -- \
  npx --yes amu compile --target wasm32-browser worker
ls -la dist/worker.js
```

lock を他セッションが持っていると **exit 2** で拒否される。**迂回しない** ——
`resource-guard: build is already running (pid=…)` はエラーではなく順番待ちで
ある（この walk では 1 回のビルドに最大 10 回の再試行を要した）。

実際の出力（末尾）:

```
[:worker] Build completed. (55 files, 12 compiled, 0 warnings, 25.19s)

$ ls -la dist/worker.js
-rw-r--r--  1 junkawasaki  wheel  245591  8 18 21:32 dist/worker.js
$ shasum -a 256 dist/worker.js
db6f3e6a8708d118b7bc8a99e5353aced7489303e226a1d2cbdcc3a09330a5eb  dist/worker.js
```

### 4.6 壊れた var はビルドを **落とす**（2026-08-18 実測）

`shadow-cljs.edn` の `:compiler-options` に `:warnings-as-errors true` を入れた。
入れる前は、存在しない var を参照しても shadow は **WARNING** を出して **exit 0**
し、最初のリクエストで `Cannot read properties of undefined` を投げる bundle を
書く ——「ビルドが通った」は検査ではない（**落ちようがない**）。

この repo で実際に落として確かめた。`src/air_sched/worker.cljs` の
`route/dispatch` を、存在しない `route/dispatch-nonexistent` に改名して再ビルド:

```
------ ERROR -------------------------------------------------------------------
 File: /private/tmp/app-air-sched-cljs/src/air_sched/worker.cljs:108:44
--------------------------------------------------------------------------------
 105 | (defn fetch-handler [req env _ctx]
 106 |   (let [url (js/URL. (.-url req))
 107 |         path (.-pathname url)
 108 |         {:keys [action nsid allow reason]} (route/dispatch-nonexistent (.-method req) path)]
--------------------------------------------------^-----------------------------
Use of undeclared Var air-sched.route/dispatch-nonexistent
{:warning :undeclared-var, :line 108, :column 45,
 :msg "Use of undeclared Var air-sched.route/dispatch-nonexistent",
 :shadow.build.compiler/warning-as-error true}
```

```
|               | exit | dist/worker.js sha256     | bytes  |
|---------------|------|---------------------------|--------|
| 改名前        | 0    | db6f3e6a…9330a5eb         | 245591 |
| 改名後        | 1    | db6f3e6a…9330a5eb（不変） | 245591 |
| 戻して再build | 0    | db6f3e6a…9330a5eb         | 245591 |
```

**落ちたビルドは bundle を出荷しない** —— sha256 が 1 バイトも動いていないことが
それを言っている。

キーは `:build-options` ではなく **`:compiler-options`** に置く。shadow が読むのは
`[:compiler-options :warnings-as-errors]` で、置き場所を間違えると**黙って無視される**
—— この option が防ぐはずの失敗（落ちようのない検査）そのものになる。
`scripts/verify-docs-claims.cljs` はこれを **EDN として読んで**確かめる:
grep では自分の説明コメントに当たるので、正しい置き場所と誤った置き場所を
区別できない。

## 4.7 ビルドした成果物を実際に叩く

ここが deploy されるものに触る唯一の検査である。

```bash
cd "$REPO" && npx --yes kbb --backend sci scripts/smoke-worker.cljk dist/worker.js
```

```
PASS	default export has fetch	expected=true	actual=true
PASS	GET / status	expected=200	actual=200
PASS	GET / is html	expected=true	actual=true
PASS	page advertises /health	expected=true	actual=true
PASS	page advertises /xrpc/:nsid	expected=true	actual=true
PASS	page shows a var key	expected=true	actual=true
PASS	page hides other var values	expected=false	actual=false
PASS	page shows the relay target it uses	expected=true	actual=true
PASS	page uses the design system components	expected=true	actual=true
PASS	page carries the stylesheet itself	expected=true	actual=true
PASS	GET /health status	expected=200	actual=200
PASS	health names its routes	expected=true	actual=true
PASS	POST /xrpc/ status	expected=400	actual=400
PASS	OPTIONS preflight	expected=204	actual=204
PASS	unknown path	expected=404	actual=404
PASS	wrong method	expected=405	actual=405
OK	the built bundle answers as the route table says   (exit 0)
```

**bundle が無ければ exit 2**（「判定できなかった」であって合格ではない）:

```
UNDETERMINED	no bundle at /private/tmp/app-air-sched-cljs/dist/worker.js
Refusing to report a pass: build it first (see docs/operator-quickstart.md S4).
```

### デザインシステムの検査を割った理由と、割れていることの実演

`dads-table` が在ることを 1 本で見る形は落ちない —— view が出す markup なので、
CSS が 1 バイトも入っていないページにも現れる。実測（このページ）:

| 探す文字列 | CSS 込み | CSS 無し |
|---|---|---|
| `dads-table` | 74 | **6** |
| `class="dads-table"` | 1 | **1** |
| `--color-primitive-blue` | 45 | **0** |

`(rc/inline "jp_go_dds/dds.css")` を `""` に置き換えて bundle を作り直したときの
smoke（**赤は 1 本だけ**）:

```
[:worker] Build completed. (55 files, 1 compiled, 0 warnings, 24.11s)
91f72b530dc301f65da02dd0420a9c43bc1856b53d9198ca6269209205ca9d60  dist/worker.js
   ↑ sha が動いた = 確かに別の bundle を測っている

...
PASS	page uses the design system components	expected=true	actual=true
FAIL	page carries the stylesheet itself	expected=true	actual=false
...
FAILED	1 check(s): page carries the stylesheet itself   (exit 1)

# 戻して再ビルドすると sha は db6f3e6a… に戻り、16 項目とも PASS
```

## 5. Workers ランタイム（workerd）で動かす

Node で bundle を import する smoke より強い検査。実際の Workers ランタイムで起こす。

```bash
cd "$REPO"
npx --yes wrangler@latest dev --local --port 8798 --ip 127.0.0.1
# 別シェルで
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:8798/
curl -s http://127.0.0.1:8798/health
```

実際の出力（wrangler 4.123.0、2026-08-18）:

```
200 text/html; charset=utf-8
{"ok":true,"app":"air-sched","runtime":"cljs","routes":["/","/health","/xrpc/:nsid"]}

POST /xrpc/                   -> 400
OPTIONS /xrpc/x               -> 204
POST /health                  -> 405
GET  /nope                    -> 404
POST /xrpc/com.etzhayyim.apps.airSched.registerSchedule
  -> {"error":"MCP router unreachable","detail":"internal error; reference = …",
      "url":"https://mcp.etzhayyim.com/xrpc/com.etzhayyim.mcp.message"}
```

GET `/` の body は 81,287 バイトで、`class="dads-table"` 1 件・
`--color-primitive-blue` 45 件・route 表の `/xrpc/:nsid` を含み、
env の値（`APP_UI_TYPE` の `yoro`）は 0 件だった。

**`compatibility_flags`（`nodejs_compat` / `nodejs_als`）はこの実測の後に撤去した。**
あれは SvelteKit の adapter-cloudflare が要求していたもので、cljs の `:esm` bundle
には要らない —— **憶測ではなく、flags を外した設定のまま workerd で全 route を
叩いて確かめてから**消している。上の出力はその状態のものである。

なお `wrangler dev` は毎回 `The module rule {"type":"CompiledWasm",…} does not have a
fallback` という WARNING を出す。これは抽出時から `wrangler.jsonc` に在る `rules`
ブロック由来で、移行とは無関係なので触っていない。

## 6. ここで walk していないもの

- **`kotoba/` の 5 tests** —— この repository で最も価値のある未実行の検査。
  依存は 2 つとも git URL で、npm 11.16 は入れ子 install を拒否する:

  ```bash
  cd kotoba && npm install
  #   npm error code EALLOWSCRIPTS
  #   npm error --allow-scripts is not allowed in project-scoped installs.
  ```

  **これは依存の不在ではない。** 両方の pin は実在する:

  ```bash
  git fetch https://github.com/etzhayyim/com-etzhayyim-sdk.git 12314a0cc5ac2feb49dd9789d5c002398acb6988
  git cat-file -t 12314a0cc5ac2feb49dd9789d5c002398acb6988   # commit
  git fetch https://github.com/etzhayyim/com-etzhayyim-sdk-mock.git c857ff9be5310bf433bfe1e8d3c0f677e213d667
  git cat-file -t c857ff9be5310bf433bfe1e8d3c0f677e213d667   # commit
  ```

  **`gh api repos/<org>/<repo>/commits/<sha>` は使わない** —— 実在する commit に
  404 を返す（このワークスペースで複数の agent が踏んでいる）。SHA の存在は
  git に訊く。
  `cloud-itonami/app-air-crew/docs/operator-quickstart.md` §5 が回避策を、§8 が
  その代償を記録している。ここでは**suite が通るとは主張しない**。
- **実 MCP router への中継** —— `mcp.etzhayyim.com` が解決しないので確かめられない。
  Worker は到達不能を **502** で返す（成功と同じ形に潰さない）。多段パス
  （`/xrpc/a/b`）の転送も同じ理由で smoke に入れていない —— 実 fetch になり、
  「いま NXDOMAIN であること」に寄りかかる検査になるため。判定は §2 の unit test。

## 7. deploy

```bash
cd "$REPO"
npx wrangler deploy
```

**ただし route が指すホストは解決しない**（`air-sched.etzhayyim.com` /
`a1rsch3d.etzhayyim.com` とも応答なし）。deploy が成功しても誰も到達できない。
`/xrpc/` の中継先 `mcp.etzhayyim.com` も同様なので、到達できたとしても中継は
**502 を返す**。

superproject の deploy guard は `origin/main` を含む checkout からの deploy しか
許さない点も併せて注意。**この移行では deploy していない。**
