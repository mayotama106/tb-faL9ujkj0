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
  /* 実装チケットで使う見出しと定型文 */
  flowSuffix: string; flowTitle: string; notes: string; branch: string;
  call: string; impact: string; okCase: string;
  scope: string; scopeIn: string; scopeOut: string;
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
  impl?: boolean;   /* 実装チケット。部品を組み合わせて作り、観点表(func など)を持たない */
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

