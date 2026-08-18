#!/usr/bin/env nbb
;; verify-docs-claims — re-derive every number README.md and docs/operator-quickstart.md
;; state, from the tree itself, and fail when the tree and the prose disagree.
;;
;; Before the cljs migration this repository's load-bearing claim was a GAP: the
;; Worker that would be deployed was a SvelteKit build output ABSENT from the tree,
;; while src/app.ts -- the file that reads like the application -- was in no bundle.
;; That gap is closed, so the claims now assert the CLOSURE, and they are written so
;; it cannot quietly come back: the appview TypeScript is asserted ABSENT BY NAME,
;; not merely absent from a byte total.
;;
;; It also PINS what the migration deliberately did NOT touch: kotoba/ is a
;; self-contained TypeScript domain library that is in no bundle here and that
;; nothing in the appview imports. It stays, and its file count is fixed here so it
;; cannot grow silently under cover of "the appview is cljs now".
;;
;; Usage:  nbb scripts/verify-docs-claims.cljs [<dir>]     (<dir> FIRST, default ".")
;; Exit:   0 every claim holds · 1 a claim is false · 2 could not answer

(require '["node:fs" :as fs]
         '["node:child_process" :as cp]
         '["node:crypto" :as crypto]
         '[cljs.reader :as reader]
         '[clojure.string :as str])

(def root (or (first (remove #(str/starts-with? % "--") *command-line-args*)) "."))

(def claims
  {:tracked-files 25
   :preserved-bytes 32646          ; the 12 inherited files still carried unchanged
   :svelte-artifacts 0             ; no .svelte / svelte.config / svelte-dir file survives
   :sveltekit-compat-flags 0       ; nodejs_compat / nodejs_als were adapter-cloudflare's
   :appview-ts-files 0             ; TypeScript outside kotoba/ (the appview's own)
   :appview-canonical-files 4      ; .cljs/.cljc outside scripts/
   :kotoba-files 7                 ; the domain library, pinned so it cannot grow silently
   :declared-vars 8
   :declared-routes 2
   :wrangler-main "dist/worker.js"
   :shadow-output-dir "dist"
   :shadow-export "air-sched.worker/handler"})

;; Inherited files this repository still carries BYTE-IDENTICAL, including the whole
;; of kotoba/. wrangler.jsonc is deliberately NOT in this set -- the migration changed
;; it (main, assets, compatibility_flags, APP_FRAMEWORK) and it is checked by content
;; below instead, so an intentional change and a stray one stay distinguishable.
(def preserved
  {"kotoba/package.json" "4a784166a54e16eaeb7e18756734c52a16be75ca497cb05657189c0d63680dfd"
   "kotoba/src/index.ts" "0d72aba5b3dc1591959d56ace040322662799d483dd1913490007c20cd440709"
   "kotoba/src/registry.ts" "f43a62c88163168267ca6c60580e3a65b54a3db2c6dcab33cccff0a68b99c48b"
   "kotoba/src/types.ts" "06685603c09200f1541431babc76896d5e267c00394eb23d2aa31901ee1049c7"
   "kotoba/test/air-sched.test.ts" "7a87d162cc616d888a4981cf7860cd9bd048741c19503804274afa2720846226"
   "kotoba/tsconfig.json" "95a429e51d6162cb7205b603f745e7604d93ffbb1ea6c346e5c6215a79ae541e"
   "kotoba/vitest.config.ts" "f82a551ef4da1c9cbf17985a3bee96eee450a3e4a46bff0d96c6150263121eff"
   "kotodama.jsonld" "584173a38041edcfabc83b910d3e5ca7127b80a055eb6a9ff161f863fe33ea51"
   "MIGRATION-TODO.md" "13489112c5d306946b8e3a1e63731aa1f4ace7e484df65714d4836f3e6bd07a0"
   "NOTICE" "9d3bd5678f857c647a465987cd8538580215416648991fd9de47e6dc648544f0"
   "README.edn" "6660a08d57f38ea02d064ee0d8252cda01de43ae8f376d5908492ba3f4dea435"
   "migration.edn" "44b30767d11d99badc1f92b2b0a761cb4a3140750582c123841269b1a654892c"})

;; What the migration REMOVED, by name. A byte total cannot say "the appview's
;; TypeScript is gone"; this can, and it fails if any of it comes back.
(def removed-by-migration
  ["src/app.ts"
   "package.json"
   "svelte/package.json"
   "svelte/src/app.html"
   "svelte/src/routes/+page.svelte"
   "svelte/src/routes/xrpc/[...path]/+server.ts"
   "svelte/svelte.config.js"
   "svelte/tsconfig.json"
   "svelte/vite.config.ts"])

(def undetermined (atom []))
(def failures (atom []))
(defn undet! [m] (swap! undetermined conj m))

(defn tracked-files []
  (try (->> (.execSync cp "git ls-files" #js {:cwd root :encoding "utf8"})
            str/split-lines (remove str/blank?) vec)
       (catch :default e (undet! (str "git ls-files failed: " (.-message e))) nil)))
(defn slurp* [rel] (try (.readFileSync fs (str root "/" rel) "utf8") (catch :default _ nil)))
(defn bytes-of [rel] (try (.-size (.statSync fs (str root "/" rel))) (catch :default _ nil)))
(defn sha256 [rel]
  (try (-> (.createHash crypto "sha256") (.update (.readFileSync fs (str root "/" rel))) (.digest "hex"))
       (catch :default _ nil)))
(defn strip-jsonc [s] (str/replace s #"(?m)^\s*//.*$" ""))

(defn check! [label expected actual]
  (let [ok (= expected actual)]
    (println (str (if ok "PASS" "FAIL") "\t" (name label)
                  "\texpected=" (pr-str expected) "\tactual=" (pr-str actual)))
    (when-not ok (swap! failures conj label))
    ok))

(let [files (tracked-files)]
  (when (nil? files) (println "UNDETERMINED\tcould not list tracked files") (js/process.exit 2))
  (println (str "SCANNED\t" (count files)))
  (when (zero? (count files)) (println "UNDETERMINED\tscanned 0 files") (js/process.exit 2))

  (let [sizes (into {} (map (juxt identity bytes-of)) files)]
    (when-let [bad (seq (keep (fn [[f s]] (when (nil? s) f)) sizes))]
      (undet! (str "tracked but unreadable: " (str/join ", " bad))))

    (check! :tracked-files (:tracked-files claims) (count files))
    (check! :preserved-bytes (:preserved-bytes claims)
            (reduce + 0 (keep #(get sizes %) (keys preserved))))
    (check! :preserved-files-unchanged []
            (vec (keep (fn [[f want]] (let [got (sha256 f)]
                                        (when-not (= want got) (str f " " (or got "MISSING")))))
                       preserved)))

    ;; the appview's TypeScript is gone, by name
    (check! :removed-by-migration-absent []
            (vec (filter #(some? (bytes-of %)) removed-by-migration)))

    ;; Svelte is gone and must not come back. removed-by-migration names the files
    ;; that were there; this catches a return under ANY name -- a new .svelte file,
    ;; a svelte.config, or a svelte/ directory.
    (check! :svelte-artifacts (:svelte-artifacts claims)
            (count (filter #(or (str/ends-with? % ".svelte")
                                (str/includes? % "svelte.config")
                                (str/includes? % "/svelte/")
                                (str/starts-with? % "svelte/"))
                           files)))

    ;; Language of the source, split the way the repository is actually split.
    ;; kotoba/ is NOT the appview: nothing here imports it, it is in no bundle, and
    ;; its two git dependencies resolve (both pinned SHAs fetch as type=commit,
    ;; measured 2026-08-18 with git -- the GitHub commits API answers 404 for
    ;; commits that exist, so it is not the instrument to use). It stays, and its
    ;; size is pinned so "the appview is cljs" cannot quietly become cover for
    ;; TypeScript growing here.
    (let [appview (remove #(or (str/starts-with? % "scripts/")
                               (str/starts-with? % "kotoba/"))
                          files)]
      (check! :appview-ts-files (:appview-ts-files claims)
              (count (filter #(str/ends-with? % ".ts") appview)))
      (check! :appview-canonical-files (:appview-canonical-files claims)
              (count (filter #(re-find #"\.(cljs|cljc|clj|kotoba)$" %) appview)))
      (check! :kotoba-files (:kotoba-files claims)
              (count (filter #(str/starts-with? % "kotoba/") files))))

    ;; the deployed bundle is built from the source in this tree
    (let [w (some-> (slurp* "wrangler.jsonc") strip-jsonc)
          sh-raw (slurp* "shadow-cljs.edn")]
      (if (or (nil? w) (nil? sh-raw))
        (undet! "wrangler.jsonc or shadow-cljs.edn unreadable")
        (let [j (js->clj (.parse js/JSON w) :keywordize-keys false)
              sh (try (reader/read-string sh-raw)
                      (catch :default e (undet! (str "shadow-cljs.edn unreadable as EDN: "
                                                     (.-message e))) nil))]
          (check! :wrangler-main (:wrangler-main claims) (get j "main"))
          (check! :declared-vars (:declared-vars claims) (count (get j "vars")))
          (check! :declared-routes (:declared-routes claims) (count (get j "routes")))
          ;; the old config served a SvelteKit client dir that no longer exists
          (check! :no-stale-assets-binding true (nil? (get j "assets")))
          (check! :sveltekit-compat-flags (:sveltekit-compat-flags claims)
                  (count (filter #{"nodejs_compat" "nodejs_als"}
                                 (or (get j "compatibility_flags") []))))
          (when sh
            (check! :shadow-builds-that-main true
                    (and (= (:shadow-output-dir claims)
                            (get-in sh [:builds :worker :output-dir]))
                         (= (:shadow-export claims)
                            (str (get-in sh [:builds :worker :modules :worker :exports 'default])))
                         (str/includes? (or (get j "main") "")
                                        (str (:shadow-output-dir claims) "/worker.js"))))
            ;; :warnings-as-errors, READ AS EDN. A green build is not a check unless
            ;; this is true AND in the right place: shadow reads
            ;; [:compiler-options :warnings-as-errors], and under :build-options the
            ;; key is silently ignored -- which is itself a check that cannot fail.
            ;; Grepping cannot tell those apart (the comment above contains both
            ;; strings), so this parses the file.
            (check! :warnings-as-errors-under-compiler-options true
                    (true? (get-in sh [:builds :worker :compiler-options :warnings-as-errors])))
            (check! :no-warnings-as-errors-in-build-options nil
                    (get-in sh [:builds :worker :build-options :warnings-as-errors]))))))

    ;; The page renders the route TABLE rather than a baked count -- the defect
    ;; ADR-0001 records was a hand-maintained summary object beside a wrangler
    ;; config it could not see. Asserted structurally (the view takes :routes, the
    ;; worker passes the real table) and NOT by forbidding a substring: a check a
    ;; comment can fail is a check about prose.
    (let [v (slurp* "src/air_sched/view.cljc")
          wk (slurp* "src/air_sched/worker.cljs")]
      (if (or (nil? v) (nil? wk))
        (undet! "view.cljc or worker.cljs unreadable")
        (check! :page-renders-route-table true
                (and (str/includes? v "[{:keys [routes vars mcp-url built-at]}]")
                     (str/includes? v "(route-rows routes)")
                     (str/includes? wk ":routes route/routes")))))

    ;; Every ADR is EDN tx-data that actually reads -- the WHOLE file.
    ;;
    ;; The first version of this check called (reader/read-string s) directly and
    ;; COULD NOT FAIL on a large family of corruptions: read-string consumes one
    ;; form and silently ignores everything after it. Measured 2026-08-18 --
    ;; appending `{:unbalanced "` to the ADR left this claim green. Wrapping the
    ;; file in a vector forces the reader through every byte, and the shape check
    ;; below says the form is tx-data rather than merely "some EDN value".
    (let [adrs (filter #(str/starts-with? % "docs/adr/") files)]
      (check! :adr-count-at-least-one true (pos? (count adrs)))
      (check! :adrs-read-as-edn []
              (vec (keep (fn [f]
                           (let [s (slurp* f)]
                             (if (nil? s)
                               (str f " unreadable")
                               (try
                                 (let [forms (reader/read-string (str "[\n" s "\n]"))]
                                   (cond
                                     (not= 1 (count forms))
                                     (str f " has " (count forms) " top-level forms (want exactly 1)")
                                     (not (vector? (first forms)))
                                     (str f " top-level form is not tx-data (a vector)")
                                     (not (every? #(and (map? %) (contains? % :adr/id)) (first forms)))
                                     (str f " tx-data entries must be maps with :adr/id")
                                     :else nil))
                                 (catch :default e (str f " " (.-message e)))))))
                         adrs))))))

(let [u @undetermined f @failures]
  (when (seq u)
    (doseq [m u] (println (str "UNDETERMINED\t" m)))
    (println "Refusing to report a pass: the tree could not be read completely.")
    (js/process.exit 2))
  (if (seq f)
    (do (println (str "FAILED\t" (count f) " claim(s): " (str/join ", " (map name f)))) (js/process.exit 1))
    (do (println "OK\tevery claim in README.md and docs/operator-quickstart.md holds") (js/process.exit 0))))
