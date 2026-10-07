/* 実装チケットの部品。チケットは部品を組み合わせて作る。
   部品は観点(欄)の並びで定義し、テンプレートの編集で欄の文言・並び・任意の指定を変えられる。

   部品の値: { _k, type, [欄のid]: 値 }
   欄の種類と値:
     text      文字列
     list      文字列の配列(1項目1入力欄)
     choice    文字列 / multi 文字列の配列
     group     子の欄を同じ部品の値に持つ見出し。ref なら [id]_ref(原典参照)と [id]_link を持つ
     error     ErrVal(エラーハンドリング)
     case      CaseVal(〇〇の場合の扱い: 文で書くか、エラーハンドリングにする)
     blocks    部品の配列(中の処理)
     rows      行の配列。行は fields の欄を持つ。ref なら group と同じ
     branches  条件分岐の場合の配列 { _k, cond, none, blocks } */

export type FieldKind = "text" | "list" | "choice" | "multi" | "group" | "error" | "case" | "blocks" | "rows" | "branches";

export interface FieldDef {
  id: string;
  q: string;          /* 入力画面の問い */
  label: string;      /* 本文での表記 */
  kind: FieldKind;
  ph?: string;
  options?: string[];
  optional?: boolean; /* 空なら本文に出さない */
  head?: boolean;     /* 部品(行)の見出し。本文の1行目になる */
  ac?: boolean;       /* 受け入れ条件での書き方。処理の流れには出さない */
  bare?: boolean;     /* 本文で「表記：」を付けず、値を行ごとに箇条書きにする */
  ref?: boolean;      /* 原典を参照して省略できる */
  fields?: FieldDef[];/* group の子、rows の列 */
  when?: { id: string; eq: string };  /* 同じ部品(行)の別の欄がこの値のときだけ使う */
  custom?: boolean;   /* テンプレートの編集で足した欄 */
}

export interface CompDef {
  type: string;
  name: string;        /* 部品の名前(ボタンと見出し) */
  container?: boolean; /* 入れ物(チケットの直下にだけ置け、本文で節になる) */
  suffix?: string;     /* 入れ物の節の見出しの末尾(〇〇API など) */
  group: string;       /* 追加ボタンの並び */
  hint?: string;
  acSuffix?: string;   /* 受け入れ条件の見出しの既定の末尾 */
  fields: FieldDef[];
}

export interface ErrVal { display?: string; status?: string; code?: string; message?: string; note?: string }
export interface CaseVal { mode?: "" | "text" | "error"; text?: string; err?: ErrVal }

export const DISPLAYS = ["全画面", "モーダル", "その他", "表示しない"];
export const NO_DISPLAY = "表示しない";
export const NA = "なし";   /* エラーの欄で、該当しないことを表す値 */
export const NONE = "何もしない";
export const GROUPS = ["入れ物", "データ操作", "処理"];

const t = (id: string, q: string, label: string, extra?: Partial<FieldDef>): FieldDef => ({ id, q, label, kind: "text", ...extra });
const head = (q: string, ph: string, label = "名前"): FieldDef => t("name", q, label, { head: true, ph });
const acField = (ph = "空なら見出しをそのまま使う"): FieldDef =>
  t("ac", "受け入れ条件での書き方は？(任意)", "受け入れ条件での書き方", { ac: true, optional: true, ph });
const cs = (id: string, q: string, label: string): FieldDef => ({ id, q, label, kind: "case" });
const ls = (id: string, q: string, label: string, ph?: string, extra?: Partial<FieldDef>): FieldDef => ({ id, q, label, kind: "list", ph, ...extra });
const blocks = (id: string, q: string, label: string, extra?: Partial<FieldDef>): FieldDef => ({ id, q, label, kind: "blocks", ...extra });

export const COMPONENTS: Record<string, CompDef> = {
  api: {
    type: "api", name: "API作成", container: true, suffix: "API", group: "入れ物",
    hint: "リクエストの形式・必須のチェックは、処理の流れに「チェック」を足して書く。",
    fields: [
      head("APIの名前は？", "例: ファイルアップロード", "API名"),
      { id: "method", q: "メソッドは？", label: "メソッド", kind: "choice", options: ["GET", "POST", "PUT", "DELETE"] },
      t("endpoint", "エンドポイントは？", "エンドポイント", { ph: "例: /account/applications/documents/:documentType" }),
      t("caller", "なにを起因に誰からいつ呼び出される？", "呼び出しの起因・呼び出し元・タイミング"),
      { id: "req", q: "リクエストパラメータは何？", label: "リクエストパラメータ", kind: "group", ref: true, fields: [
        { id: "req_place", q: "パラメータ形式は？", label: "パラメータ形式", kind: "multi", options: ["クエリ", "パス", "ボディ", "ヘッダ"] },
        ls("req_items", "項目とそれぞれの型は？", "項目と型", "項目名: 型"),
        ls("req_need", "それぞれの項目は必須か任意か", "必須/任意", "項目名: 必須または任意")
      ] },
      { id: "res", q: "正常な場合のレスポンスは？", label: "レスポンス(正常時)", kind: "group", ref: true, fields: [
        ls("res_items", "項目とそれぞれの型は？", "項目と型", "項目名: 型"),
        ls("res_need", "それぞれの項目は必須か任意か", "必須/任意", "項目名: 必須または任意")
      ] },
      blocks("flow", "API内の処理は？(部品を上から足す)", "処理の流れ")
    ]
  },
  screen: {
    type: "screen", name: "画面作成", container: true, suffix: "画面", group: "入れ物",
    fields: [
      head("画面の名前は？", "例: 振込先登録", "画面名"),
      t("screen_id", "画面IDは？", "画面ID"),
      t("from", "どこから遷移してくる？", "遷移元"),
      t("from_data", "遷移元から引き継ぐデータは？", "遷移元から引き継ぐデータ"),
      { id: "elements", q: "画面の要素は？(1つずつ足す)", label: "画面の要素", kind: "rows", ref: true, fields: [
        t("name", "要素の名前は？", "名前", { head: true }),
        { id: "kind", q: "種類は？", label: "種類", kind: "choice", options: ["表示", "入力", "ボタン"] },
        t("style", "スタイリングは？", "スタイリング"),
        t("type", "型、桁、必須か任意かは？", "型・桁・必須", { when: { id: "kind", eq: "入力" } }),
        { id: "bad", q: "入力が不正な場合は？", label: "{行}の入力が不正な場合", kind: "error", when: { id: "kind", eq: "入力" } },
        t("cond", "表示する条件、操作できる条件は？", "表示条件・操作条件")
      ] },
      blocks("init", "初期表示で何をする？(部品を上から足す)", "初期表示"),
      { id: "events", q: "画面内で発火するイベントは？(1つずつ足す)", label: "イベント", kind: "rows", ref: true, fields: [
        t("name", "イベントの名前は？", "名前", { head: true }),
        t("trig", "きっかけは？(クリック、入力、表示など)", "きっかけ"),
        blocks("steps", "処理は？(部品を上から足す)", "処理")
      ] },
      t("env", "対応するブラウザと画面幅は？(任意)", "対応ブラウザ・画面幅", { optional: true })
    ]
  },
  db: {
    type: "db", name: "DB作成", container: true, suffix: "テーブル", group: "入れ物",
    fields: [
      head("テーブル名は？", "例: 書類", "テーブル名"),
      t("purpose", "何を保存する？(用途)", "用途"),
      { id: "columns", q: "カラムは？(1つずつ足す)", label: "カラム", kind: "rows", fields: [
        t("name", "カラム名は？", "カラム名", { head: true }),
        t("type", "型と桁は？", "型・桁"),
        { id: "need", q: "必須か任意か", label: "必須/任意", kind: "choice", options: ["必須", "任意"] },
        t("def", "初期値は？(任意)", "初期値", { optional: true }),
        t("note", "説明は？(任意)", "説明", { optional: true })
      ] },
      t("pk", "主キーは？", "主キー"),
      t("index", "インデックス・一意制約は？(任意)", "インデックス・一意制約", { optional: true }),
      t("migrate", "既存データの移行は？(改修の場合)", "既存データの移行", { optional: true })
    ]
  },
  check: {
    type: "check", name: "チェック", group: "処理", acSuffix: "がされていること",
    fields: [
      head("チェック群の名前は？", "例: アップロードファイルの業務チェック"),
      acField("例: ミドルウェアでバリデーションチェックがされていること / 空なら「〇〇がされていること」"),
      { id: "items", q: "チェックは？(1つずつ足す)", label: "チェック", kind: "rows", bare: true, fields: [
        t("name", "チェック名は？", "チェック名", { head: true, ph: "例: ０バイトファイルチェック" }),
        t("detail", "詳細は？(任意)", "詳細", { optional: true, bare: true, ph: "例: 拡張子が「.pdf」かどうか" }),
        { id: "err", q: "引っかかった場合は？", label: "{行}に引っかかる場合", kind: "error" }
      ] }
    ]
  },
  get: {
    type: "get", name: "取得", group: "データ操作",
    fields: [
      head("何を取得する？", "例: Xをキーにステータスを取得"),
      t("target", "どのDB(テーブル)から？", "取得元"),
      t("cond", "取得の条件(キー)は？", "条件"),
      cs("zero", "0件の場合は？", "0件の場合"),
      acField()
    ]
  },
  create: {
    type: "create", name: "登録", group: "データ操作",
    fields: [
      head("何を登録する？", "例: アップロードした書類の情報を登録"),
      t("target", "どのDB(テーブル)に保存する？", "保存先"),
      ls("items", "保存する項目は？", "保存する項目"),
      cs("dup", "同じリクエストが届いた場合は？", "同じリクエストが届いた場合"),
      cs("fail", "保存に失敗した場合は？", "保存に失敗した場合"),
      acField()
    ]
  },
  update: {
    type: "update", name: "更新", group: "データ操作",
    fields: [
      head("何を更新する？", "例: 申込のステータスを更新"),
      t("target", "どのDB(テーブル)を？", "更新先"),
      t("cond", "更新対象の条件は？", "条件"),
      ls("items", "更新する項目は？", "更新する項目"),
      cs("none", "対象が見つからない場合は？", "対象が見つからない場合"),
      cs("part", "一部の対象で失敗した場合は？", "一部の対象で失敗した場合"),
      acField()
    ]
  },
  delete: {
    type: "delete", name: "削除", group: "データ操作",
    fields: [
      head("何を削除する？", "例: 取り下げた書類を削除"),
      t("target", "どのDB(テーブル)から？", "削除元"),
      t("cond", "削除対象の条件は？", "条件"),
      { id: "how", q: "論理削除か物理削除か", label: "削除方式", kind: "choice", options: ["論理削除", "物理削除"] },
      t("rel", "紐づくデータはどうする？", "紐づくデータの扱い"),
      cs("none", "対象が見つからない場合は？", "対象が見つからない場合"),
      cs("cant", "削除できない場合は？", "削除できない場合"),
      acField()
    ]
  },
  auth: {
    type: "auth", name: "認証", group: "処理",
    fields: [
      head("何を確認する？", "例: ログイン中の利用者か確認"),
      t("how", "何で確認する？(トークン、セッションなど)", "確認の方法"),
      t("perm", "必要な権限は？(任意)", "必要な権限", { optional: true }),
      { id: "unauth", q: "認証できない場合は？", label: "認証できない場合", kind: "error" },
      { id: "forbid", q: "権限がない場合は？(任意)", label: "権限がない場合", kind: "error", optional: true },
      acField()
    ]
  },
  if: {
    type: "if", name: "条件分岐", group: "処理", hint: "出し分けは、場合ごとに「表示更新」を入れる。",
    fields: [
      head("何を確認する？", "例: ステータスを元に編集可否をチェック"),
      acField("例: ステータスによる編集可否のチェックがされていること"),
      { id: "cases", q: "場合ごとの処理は？", label: "場合", kind: "branches" }
    ]
  },
  view: {
    type: "view", name: "表示更新", group: "処理",
    fields: [
      head("何を更新する？", "例: 書類の一覧を更新"),
      t("target", "対象の要素は？", "対象"),
      t("change", "どう変える？", "変更内容"),
      t("source", "表示するデータの取得元は？(任意)", "データの取得元", { optional: true })
    ]
  },
  error: {
    type: "error", name: "エラーハンドリング", group: "処理",
    fields: [
      t("when", "どんな場合？(条件分岐の中では、場合の条件を使うので不要)", "場合", { optional: true, ac: true }),
      { id: "err", q: "エラーの内容は？", label: "エラー", kind: "error" }
    ]
  },
  do: {
    type: "do", name: "処理実行", group: "処理", hint: "ほかの部品に当てはまらない処理を書く。",
    fields: [
      head("何をする？", "例: 一時ファイルを削除"),
      t("detail", "詳細は？(任意。1行ごとに箇条書きになる)", "詳細", { optional: true, bare: true })
    ]
  }
};

/* 部品の値を新しく作る */
export function newBlock(def: CompDef, key: () => string): Record<string, unknown> {
  const b: Record<string, unknown> = { _k: key(), type: def.type };
  def.fields.forEach(f => {
    if (f.kind === "branches") b[f.id] = [{ _k: key(), cond: "", blocks: [] }, { _k: key(), cond: "", blocks: [] }];
    else if (f.kind === "rows" && f.head !== true && def.type === "check") b[f.id] = [{ _k: key() }];
  });
  return b;
}

/* エラーハンドリングの、処理の流れでの書き方 */
export function errorHead(e: ErrVal | undefined): string {
  const d = (e && e.display) || "";
  if (d === "全画面") return "エラー画面を表示";
  if (d === "モーダル") return "エラーモーダルを表示";
  if (d === "その他") return "エラーハンドリング";
  return "エラーを返却";
}
