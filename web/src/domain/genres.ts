/* 観点表の定義。ジャンルを増やすときは GENRES に定義を足す。
   (旧版 index.html の定義をそのまま移したもの) */

export type NodeType = "text" | "list" | "choice" | "multi" | "group" | "error" | "logic" | "elements" | "events";

export interface QNode {
  id: string;
  q: string;
  label: string;
  type: NodeType;
  children?: QNode[];
  refChildren?: QNode[];
  branches?: Record<string, QNode[]>;
  options?: string[];
  ph?: string;
  numbered?: boolean;
  optional?: boolean;
  always?: boolean;
  noHas?: boolean;
  src?: string;
}

export interface Section { key: string; title: string; lead?: string; nodes: QNode[] }

export interface Heads {
  story: string; ac: string; func: string; nonfunc: string; other: string;
  deps: string; refs: string; leadNew: string; leadMod: string;
  /* 処理の流れの形式(flow)で使う見出しと定型文 */
  flowSuffix: string; flowTitle: string; notes: string; branch: string;
  call: string; impact: string; okCase: string;
}

export interface Genre {
  name: string;
  noun?: string;
  example?: string;
  srcLabel?: string;
  func?: QNode[];
  nonfunc?: QNode[];
  modOnly?: QNode[];
  storyLabel?: string;
  storyHint?: string;
  sections?: Section[];
  heads?: Partial<Heads>;
  flow?: boolean;   /* 処理の流れの形式。観点表(func など)を持たない */
}

export const MISSING = "【未記入】";
export const NEW = "新規作成", MOD = "既存改修";
export const ERR_KINDS = ["エラーモーダル", "エラー画面", "その他"];
const q = (id: string, text: string, label: string, extra?: Partial<QNode>): QNode => Object.assign({ id, q: text, label, type: "text" as const }, extra || {});
const err = (id: string, text: string, label: string): QNode => ({ id, q: text, label, type: "error" });
const group = (id: string, text: string, label: string, children: QNode[], refChildren?: QNode[]): QNode =>
  refChildren ? { id, q: text, label, type: "group", children, refChildren } : { id, q: text, label, type: "group", children };
const list = (id: string, text: string, label: string, ph: string, children?: QNode[]): QNode =>
  children ? { id, q: text, label, type: "list", ph, children } : { id, q: text, label, type: "list", ph };
export const REF = "原典を参照して省略する";
const SRC_LABEL = "原典(IF・API仕様書)";
export const LOGIC_SRC = "原典(設計書・仕様書)";
const SCREEN_SRC = "原典(画面設計書・デザイン)";
export const HAS = "ある", HAS_NOT = "ない";
export const EL_KINDS = ["表示", "入力", "ボタン"];

/* 原典を参照する場合にも残す問い */
const REQ_FMT = err("req_fmt", "形式エラーの場合は？", "形式エラーの場合");
const REQ_MISS = err("req_miss", "必須の項目の値がない場合は？", "必須項目の値がない場合");
const RES_FMT = err("res_fmt", "形式エラーの場合は？", "形式エラーの場合");
const RES_MISS = err("res_miss", "必須の項目の値がない場合は？", "必須項目の値がない場合");

/* ジャンルごとの観点表。ジャンルを増やすときは、ここに定義を足す。 */
export const GENRES: Record<string, Genre> = {
  api: {
    name: "API作成",
    noun: "API",
    example: "例: 振込先登録",
    srcLabel: SRC_LABEL,
    func: [
      q("trigger", "なにを起因に誰からいつ呼び出される？", "呼び出しの起因・呼び出し元・タイミング"),
      q("endpoint", "エンドポイントは？", "エンドポイント"),
      { id: "method", q: "APIのメソッドはPUT/GET/POST/DELETEのうちどれ？", label: "メソッド", type: "choice",
        options: ["GET", "POST", "PUT", "DELETE"],
        branches: {
          GET: [
            q("get_db", "どのDBにアクセスする？", "アクセス先DB"),
            q("get_cond", "検索対象の条件は？", "検索対象の条件", { children: [
              err("get_zero", "ヒット0件の場合はどうする？", "ヒット0件の場合") ] })
          ],
          POST: [
            q("post_db", "どのDBに保存する？", "保存先DB", { children: [
              err("post_dup", "同じリクエストが届いた際は？", "同じリクエストが届いた場合"),
              err("post_fail", "保存に失敗したときは？", "保存に失敗した場合") ] })
          ],
          PUT: [
            q("put_db", "どのDBにアクセスする？", "アクセス先DB"),
            q("put_cond", "更新対象の条件は？", "更新対象の条件", { children: [
              err("put_none", "対象が見つからない場合は？", "対象が見つからない場合"),
              err("put_part", "一部の対象で失敗した場合は？", "一部の対象で失敗した場合") ] })
          ],
          DELETE: [
            q("del_db", "どのDBにアクセスする？", "アクセス先DB"),
            q("del_cond", "削除対象の条件は？", "削除対象の条件", { children: [
              err("del_none", "対象が見つからない場合は？", "対象が見つからない場合"),
              err("del_cant", "削除できない場合は？", "削除できない場合") ] }),
            { id: "del_kind", q: "削除は論理削除か物理削除か", label: "削除方式", type: "choice",
              options: ["論理削除", "物理削除"] },
            q("del_rel", "紐づくデータはどうする？", "紐づくデータの扱い")
          ]
        } },
      group("req", "リクエストパラメータは何？", "リクエストパラメータ", [
        { id: "req_place", q: "パラメータ形式は？", label: "パラメータ形式", type: "multi",
          options: ["クエリ", "パス", "ボディ", "ヘッダ"] },
        list("req_items", "項目とそれぞれの型は？", "項目と型", "項目名: 型", [REQ_FMT]),
        list("req_need", "それぞれの項目は必須か任意か", "必須/任意", "項目名: 必須または任意", [REQ_MISS])
      ], [REQ_FMT, REQ_MISS]),
      { id: "logic", q: "API内で実装するロジックはある？", label: "ロジック", type: "logic" },
      group("res", "レスポンスの形式は？", "レスポンス", [
        group("res_ok", "正常な場合は？", "正常な場合", [
          list("res_items", "項目とそれぞれの型は？", "項目と型", "項目名: 型", [RES_FMT]),
          list("res_need", "それぞれの項目は必須か任意か", "必須/任意", "項目名: 必須または任意", [RES_MISS])
        ], [RES_FMT, RES_MISS]),
        err("res_ng", "異常の場合は？", "異常の場合")
      ])
    ],
    nonfunc: [
      q("nf_freq", "呼び出し頻度は？", "呼び出し頻度"),
      q("nf_timeout", "タイムアウトの時間は？", "タイムアウト時間"),
      q("nf_volume", "データ量の上限は？", "データ量の上限")
    ],
    /* 既存改修のときだけ問う項目。always は、既存改修でも未記入を表示する指定。 */
    modOnly: [
      q("mod_impact", "既存影響は？", "既存影響", { always: true }),
      q("mod_if", "IFの書き直しは必要？", "IFの書き直し要否", { always: true })
    ]
  },
  /* API作成から、API特有の項目(エンドポイント、メソッド、パラメータ形式)を除いた構成 */
  /* 処理の流れを工程で組み立て、受け入れ条件を処理の流れから作る形式(flow.ts) */
  logic: {
    name: "ロジック作成",
    flow: true,
    heads: { deps: "依存関係" }
  },
  screen: {
    name: "画面作成",
    noun: "画面",
    example: "例: 振込先登録",
    srcLabel: SCREEN_SRC,
    func: [
      q("screen_id", "画面IDは？", "画面ID"),
      q("from", "どこから遷移してくる？", "遷移元", { children: [
        q("from_data", "遷移元から引き継ぐデータは？", "遷移元から引き継ぐデータ") ] }),
      { id: "init", q: "初期表示で何をする？", label: "初期表示", type: "logic", noHas: true, src: SCREEN_SRC },
      { id: "el", q: "画面の要素は？", label: "画面の要素", type: "elements", src: SCREEN_SRC },
      { id: "events", q: "画面内で発火するイベントは？", label: "イベント", type: "events", src: SCREEN_SRC }
    ],
    nonfunc: [
      q("nf_env", "対応するブラウザと画面幅は？(任意)", "対応ブラウザ・画面幅", { optional: true })
    ],
    modOnly: [
      q("mod_impact", "既存影響は？", "既存影響", { always: true }),
      q("mod_doc", "画面設計書の書き直しは必要？", "画面設計書の書き直し要否", { always: true })
    ]
  },
  /* 不具合の報告と修正。作成区分を持たず、節の構成が他のジャンルと異なる */
  bug: {
    name: "バグチケット",
    storyLabel: "概要",
    storyHint: "どんな不具合か(一言で)",
    sections: [
      { key: "sym", title: "事象", nodes: [
        q("b_what", "何が起きている？", "事象"),
        q("b_expect", "本来はどうあるべき？", "期待動作"),
        Object.assign(list("b_steps", "再現手順は？", "再現手順", "手順"), { numbered: true }),
        q("b_env", "どの環境で起きた？(環境名、ビルド、発生日時)", "環境"),
        list("b_proof", "証跡は？(ログ、スクリーンショット、リクエストID)", "証跡", "証跡の場所やID"),
        { id: "b_freq", q: "どのくらいの頻度で起きる？", label: "発生頻度", type: "choice",
          options: ["毎回", "ときどき", "一度だけ"] },
        q("b_impact", "誰に、どの機能に影響する？", "影響範囲"),
        { id: "b_wa", q: "回避策はある？", label: "回避策", type: "choice", options: ["ある", "ない"],
          branches: { "ある": [q("b_wa_how", "どう回避する？", "回避の方法")] } }
      ] },
      { key: "cause", title: "原因", nodes: [
        { id: "b_cause", q: "原因は判明している？", label: "原因", type: "choice", options: ["判明している", "調査中"],
          branches: { "判明している": [list("b_fact", "確認済みの事実は？", "確認済みの事実", "事実")] } },
        q("b_guess", "推測していることは？(任意)", "推測", { optional: true })
      ] },
      { key: "ac", title: "受け入れ条件", lead: "再現手順を実行しても事象が起きず、期待動作どおりに動くこと", nodes: [
        list("b_check", "修正後に確認することは？", "修正後の確認項目", "確認すること"),
        q("b_side", "修正はどこに影響する？", "修正の影響範囲"),
        { id: "b_test", q: "再発を防ぐテストは追加する？", label: "再発防止のテスト", type: "choice",
          options: ["追加する", "追加しない"],
          branches: { "追加する": [q("b_test_what", "どのテストを追加する？", "追加するテスト")],
                      "追加しない": [q("b_test_why", "追加しない理由は？", "追加しない理由")] } }
      ] }
    ]
  }
};

