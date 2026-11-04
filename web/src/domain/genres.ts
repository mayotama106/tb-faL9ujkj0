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
  shown?: Record<string, string>;   /* 選択肢の、本文での書き方 */
  optional?: boolean;
  always?: boolean;
  noHas?: boolean;
  src?: string;
}

export interface Section { key: string; title: string; lead?: string; nodes: QNode[] }

export interface Heads {
  story: string; ac: string; func: string; nonfunc: string; other: string;
  deps: string; refs: string; leadNew: string; leadMod: string;
  /* 実装チケットで使う見出しと定型文 */
  flowSuffix: string; flowTitle: string; notes: string; branch: string;
  call: string; impact: string; okCase: string;
  scope: string; scopeIn: string; scopeOut: string; feature: string; storyRefs: string;
  /* API呼び出しチケットで使う見出し */
  callFlow: string; callErr: string; callDone: string; callSpec: string;
  /* STチケットで使う見出し */
  overview: string; content: string; schedule: string; env: string; steps: string;
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
  storyPh?: string;
  sections?: Section[];
  heads?: Partial<Heads>;
  impl?: boolean;   /* 実装チケット。部品を組み合わせて作り、観点表(func など)を持たない */
  call?: boolean;   /* API呼び出しチケット。外部・他システムのAPIを呼び出す処理。観点表に沿って問う */
  st?: boolean;     /* STチケット。実施手順を部品で組み立て、受け入れ条件は手順から作る */
}

export const MISSING = "【未記入】";
export const NEW = "新規作成", MOD = "既存改修";
export const ERR_KINDS = ["エラーモーダル", "エラー画面", "その他"];
const q = (id: string, text: string, label: string, extra?: Partial<QNode>): QNode => Object.assign({ id, q: text, label, type: "text" as const }, extra || {});
const list = (id: string, text: string, label: string, ph: string, children?: QNode[]): QNode =>
  children ? { id, q: text, label, type: "list", ph, children } : { id, q: text, label, type: "list", ph };
export const REF = "原典を参照して省略する";
export const LOGIC_SRC = "原典(設計書・仕様書)";
export const HAS = "ある", HAS_NOT = "ない";
export const EL_KINDS = ["表示", "入力", "ボタン"];

/* ジャンル。実装チケットは部品(components.ts)を組み合わせて作る。バグチケットは観点表の形式 */
export const GENRES: Record<string, Genre> = {
  impl: {
    name: "実装チケット",
    impl: true,
    heads: { deps: "依存関係" }
  },
  call: {
    name: "API呼び出しチケット",
    call: true
  },
  /* エラーハンドリングの実装。どの処理の、どんな場合に、どう扱うかを問う。節の構成はバグチケットと同じ形式 */
  err: {
    name: "エラーハンドリングチケット",
    storyLabel: "概要",
    storyHint: "どの処理のエラーハンドリングか、一言で",
    storyPh: "例: 住所変更ボタン押下時の処理で、エラーになる場合のエラーハンドリングを実装する",
    sections: [
      { key: "case", title: "エラーになる場合", nodes: [
        q("e_target", "どの処理のエラーハンドリング？", "対象の処理", { ph: "例: 住所変更画面 / 住所変更ボタン押下" }),
        list("e_cases", "どんな場合にエラーになる？(1つずつ)", "エラーになる場合", "例: 郵便番号が7桁でない場合（郵便番号チェック）"),
        q("e_detect", "エラーをどう検知する？(例外、ステータスコード、戻り値など)", "検知の方法")
      ] },
      { key: "act", title: "エラー時の挙動", nodes: [
        { id: "e_notify", q: "利用者にどう知らせる？", label: "利用者への通知", type: "error" },
        q("e_state", "エラーのあと、データと画面はどうなる？(ロールバック、入力値の保持など)", "エラー後の状態"),
        { id: "e_retry", q: "利用者はやり直せる？", label: "やり直し", type: "choice", options: ["できる", "できない"],
          branches: { "できる": [q("e_retry_how", "どうやり直す？", "やり直しの方法")] } },
        q("e_alert", "監視・アラートは？(任意)", "監視・アラート", { optional: true })
      ] },
      { key: "ac", title: "受け入れ条件", lead: "エラーになる場合に、エラー時の挙動のとおりに処理されること", nodes: [
        list("e_check", "確認することは？", "確認項目", "例: 郵便番号を6桁で送信すると、エラーメッセージが表示される"),
        { id: "e_test", q: "異常系のテストは追加する？", label: "異常系のテスト", type: "choice",
          options: ["追加する", "追加しない"], shown: { "追加する": "あり", "追加しない": "なし" },
          branches: { "追加する": [q("e_test_what", "どのテストを追加する？", "追加するテスト")],
                      "追加しない": [q("e_test_why", "追加しない理由は？", "追加しない理由")] } }
      ] }
    ]
  },
  st: {
    name: "STチケット",
    st: true
  },
  /* 不具合の報告と修正。作成区分を持たず、節の構成が他のジャンルと異なる */
  bug: {
    name: "バグチケット",
    storyLabel: "概要",
    storyHint: "どんな不具合か、一言で",
    storyPh: "例: 住所2を空にして住所を変更すると、500エラーになる",
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
        { id: "b_wa", q: "回避策はある？", label: "回避策", type: "choice", options: ["ある", "ない"], shown: { "ある": "あり", "ない": "なし" },
          branches: { "ある": [q("b_wa_how", "どう回避する？", "回避の方法")] } }
      ] },
      { key: "cause", title: "原因", nodes: [
        { id: "b_cause", q: "原因は判明している？", label: "原因", type: "choice", options: ["判明している", "調査中"], shown: { "判明している": "判明" },
          branches: { "判明している": [list("b_fact", "確認済みの事実は？", "確認済みの事実", "事実")] } },
        q("b_guess", "推測していることは？(任意)", "推測", { optional: true })
      ] },
      { key: "ac", title: "受け入れ条件", lead: "再現手順を実行しても事象が起きず、期待動作どおりに動くこと", nodes: [
        list("b_check", "修正後に確認することは？", "修正後の確認項目", "確認すること"),
        q("b_side", "修正はどこに影響する？", "修正の影響範囲"),
        { id: "b_test", q: "再発を防ぐテストは追加する？", label: "再発防止のテスト", type: "choice",
          options: ["追加する", "追加しない"], shown: { "追加する": "あり", "追加しない": "なし" },
          branches: { "追加する": [q("b_test_what", "どのテストを追加する？", "追加するテスト")],
                      "追加しない": [q("b_test_why", "追加しない理由は？", "追加しない理由")] } }
      ] }
    ]
  }
};

