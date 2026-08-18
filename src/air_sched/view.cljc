(ns air-sched.view
  "この appview の説明ページ。純 hiccup。

  基盤は `jp-go-dds`(デジタル庁デザインシステム) —— superproject の
  skill `kotoba-uiux` が定める新規 UI の base。色・寸法は `--hig-*` トークン
  契約で書き、raw hex も px フォントサイズも置かない。

  **表示する事実は引数で受け取る。ページの中に焼かない。**
  これは装飾の都合ではなく、docs/adr/0001 が記録した欠陥そのものへの答えで
  ある —— 移行前のページは summary object を literal で持っており、隣の
  wrangler.jsonc が route 2・var 8 を宣言していることを自力では知らなかった
  （実際、抽出直後は `routeCount: 0` / `vars: []` と表示していた）。ここでは
  route 表と設定を渡す側が持ち、ページは描くだけなので、両者がずれる余地が
  無い。"
  (:require [jp-go-dds.core :as dds]
            [jp-go-dds.page :as page]
            [jp-go-dds.tokens :as tokens]
            [clojure.string :as str]))

(def app-css
  "app 固有の最小 CSS。`--hig-*` 契約だけを使う(bridge が DADS の上に再定義する)。
  DADS を base にした app の下には `shitsuke.hig` が居ないので、bridge が運んで
  いないトークンは何にも解決しない —— 使うのは運ばれている 71 個の中だけ。"
  (str/join
   "\n"
   [".as-lede { color: var(--hig-color-secondary-label); max-width: 42rem; }"
    ".as-note { color: var(--hig-color-secondary-label); font-size: var(--hig-text-footnote-font-size); }"
    ".as-mono { font-family: var(--hig-font-mono); }"]))

(defn- route-rows [routes]
  (mapv (fn [r]
          [(str/upper-case (name (:route/method r)))
           [:span {:class "as-mono"} (:route/path r)]
           (:route/doc r)])
        routes))

(defn body
  "opts:
   :routes    air-sched.route/routes（この Worker が実際に答えるもの）
   :vars      wrangler が渡した env のキー（**キー名だけ**。値は出さない）
   :mcp-url   XRPC の中継先（route/mcp-router-url の戻り値。**値そのものを出す**）
   :built-at  bundle のビルド時刻（不明なら nil）"
  [{:keys [routes vars mcp-url built-at]}]
  (dds/container
   (dds/section
    {}
    (dds/heading 1 "Air Schedule Management")
    [:p {:class "as-lede"}
     "航空便スケジュール（便名・区間・時刻・運航曜日）、空港スロット、"
     "コードシェアを扱う appview の公開面。登録と照会そのものは "
     "MCP router の先にあり、ここには無い —— この面が持つのは中継と説明である。"])

   (dds/section
    {:title "この面が答えるもの"}
    (dds/table {:caption "公開ルート"
                :headers ["METHOD" "PATH" "何をするか"]
                :rows (route-rows routes)})
    [:p {:class "as-note"}
     "この表は Worker の route 表そのものから描いている。ページに焼いた値では"
     "ないので、実際に答えるものと表示がずれない。"])

   (dds/section
    {:title "実行時の設定"}
    (if (seq vars)
      [:div (into [:p] (interpose " " (map (fn [k] (dds/chip-label (name k))) vars)))
       [:p {:class "as-note"}
        "キー名のみ。ただし下の中継先（"
        [:span {:class "as-mono"} "AGENTGATEWAY_MCP_ROUTER_URL"]
        "）だけは値そのものを出している —— どこへ中継するかは運用者が見る"
        "必要があるため。それ以外の値は出さない。"]]
      [:p {:class "as-note"} "env が渡されていない（ローカル描画）。"])
    [:p {:class "as-note"} "XRPC の中継先: "
     [:span {:class "as-mono"} mcp-url]])

   (dds/section
    {:title "現在地"}
    [:p {:class "as-lede"}
     "この appview は TypeScript/Svelte から ClojureScript へ移行済み。"
     "deploy される bundle は、いま読んでいるソースからコンパイルされたもので"
     "ある（docs/adr/0001）。"]
    (when built-at
      [:p {:class "as-note"} "bundle build: " built-at]))))

(defn render
  "完全な HTML 文書。`css` は呼び出し側が渡す(ライブラリは I/O を持たない)。"
  [{:keys [css] :as opts}]
  (page/->page
   {:title "Air Schedule Management — air-sched appview"
    :description "航空便スケジュール・空港スロット・コードシェアを扱う appview の公開面。"
    :lang "ja"
    :css css
    :app-css (str tokens/bridge-css "\n" app-css)}
   (body opts)))
