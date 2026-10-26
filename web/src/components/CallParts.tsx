/* API呼び出しチケットの入力画面。観点表の要素を、パートごとに問う */
import type { ReactNode } from "react";
import { ERR_ROWS, KINDS, MODES, RETRY, TEST_KINDS, T_CHANGE } from "../domain/call";
import type { Genre, QNode } from "../domain/genres";
import { headsOf, type Values } from "../domain/ticket";
import { editDoc, getAt, newId, setAt, setValue } from "../state/store";
import { fid } from "./Blocks";
import { AutoText, Chips, Field, useV, useVAt } from "./Fields";
import { FeaturePick } from "./FeaturePick";
import { ListControl } from "./Steps";

type Path = (string | number)[];
const listNode = (id: string, label: string, ph: string): QNode => ({ id, q: label, label, type: "list", ph });

/* 「なし」「該当しない」などの切り替え(真偽値) */
function Flag({ path, label }: { path: Path; label: string }) {
  const on = !!useVAt(path);
  return <div className="chips"><button type="button" className="chip" aria-pressed={on} onClick={() => setValue(path, !on, false)}>{label}</button></div>;
}
function Q({ q, opt, children }: { q: string; opt?: boolean; children: ReactNode }) {
  return <div className="node"><div className="head"><div className="q">{q}</div>{opt && <span className="opt">任意</span>}</div>{children}</div>;
}

/* 表の形の入力(1行に複数の欄)。行を足し、× で消す */
interface Col { id: string; label: string; ph?: string; options?: string[] }
function Rows({ path, cols, add }: { path: Path; cols: Col[]; add: string }) {
  const rows: Values[] = useVAt(path) || [];
  const list = rows.length ? rows : [{}];
  const edit = (fn: (a: Values[]) => void) => editDoc(v => {
    let a = getAt(v, path);
    if (!Array.isArray(a) || !a.length) { setAt(v, path, [{ _k: newId() }]); a = getAt(v, path); }
    fn(a);
  });
  return (
    <div className="call-rows">
      {list.map((r, i) => (
        <div key={r._k || i} className="call-row">
          {cols.map(c => c.options
            ? <div key={c.id} className="chips" role="group" aria-label={c.label}>
                {c.options.map(o => <button key={o} type="button" className="chip" aria-pressed={r[c.id] === o}
                  onClick={() => edit(a => { a[i][c.id] = a[i][c.id] === o ? "" : o; })}>{o}</button>)}
              </div>
            : <AutoText key={c.id} id={fid([...path, i, c.id])} value={r[c.id] || ""} placeholder={c.ph || c.label} label={c.label}
                onChange={s => edit(a => { a[i][c.id] = s; })} />)}
          <button type="button" className="del" aria-label={"行 " + (i + 1) + " を削除"} title="削除" onClick={() => edit(a => { a.splice(i, 1); })}>×</button>
        </div>
      ))}
      <button type="button" className="etc-btn" onClick={() => edit(a => { a.push({ _k: newId() }); })}>＋ {add}</button>
    </div>
  );
}

export function CallPart({ g, partKey }: { g: Genre; partKey: string }) {
  const h = headsOf(g);
  const v = useV();
  switch (partKey) {
    case "basic": return <>
      <Field path={["title"]} label="タイトル(Jiraの要約欄に入れる)" ph="例: 住所変更時の基幹システム住所更新APIの呼び出し（BE）" />
      <FeaturePick kind="impl" />
      <p className="hint">ストーリーは「〇〇として、△△。□□ためである。」の形で本文に出ます。</p>
      <Field path={["story_who"]} label="誰のための呼び出し？(利用者)" ph="例: 会員" />
      <Field path={["story_what"]} label="実現したいことは？" ph="例: 住所変更の内容を、即時に基幹システムへ反映したい" />
      <Field path={["story_why"]} label="目的・解決したい問題は？(「〜ため」の〜)" ph="例: 夜間バッチを待たずに、郵送物の送付先を正しくする" />
    </>;
    case "flow": return <>
      <p className="hint">順序と分岐までを書きます。実装の詳細（クラス設計や変数名）は書かず、既存実装は「依存関係・環境」で参照先として示します。異常時の挙動は受け入れ条件の表に書くので、ここでは書きません。</p>
      <Field path={["trigger"]} label="呼び出しのきっかけは？(画面操作、バッチ、他処理の後続など)" ph="例: 住所変更画面で変更ボタンが押され、住所の更新が完了したとき" />
      <Q q="前処理は？(入力チェックなど。APIを呼ぶ前に打ち切る条件)">
        <Flag path={["pre_none"]} label="前処理なし" />
        {!v.pre_none && <>
          <Field path={["pre"]} label="前処理" ph="例: 郵便番号と住所1の形式をチェックする" />
          <Field path={["pre_ng"]} label="NGの場合は、どうして終了する？" ph="例: 入力エラーを画面に表示" />
        </>}
      </Q>
      <Field path={["api_name"]} label="呼び出し先のAPI名は？" ph="例: 基幹システムの住所更新API" />
      <Field path={["use"]} label="レスポンスを使った処理は？" ph="例: 基幹システムの更新日時を会員テーブルに保存する" />
      <Q q="後続の処理は？">
        <Flag path={["next_none"]} label="後続処理なし" />
        {!v.next_none && <Field path={["next"]} label="後続処理" ph="例: 変更完了画面を表示する" />}
      </Q>
    </>;
    case "func": return <>
      <Q q="呼び出し方式は？"><Chips path={["mode"]} label="呼び出し方式" options={MODES} /></Q>
      <Field path={["order"]} label="他のAPIとの前後関係は？(任意)" ph="例: 会員情報取得APIの後に呼び出す" />
      <Q q="リクエストの各パラメータに、何を設定する？(値の取得元)">
        <Rows path={["params"]} add="パラメータを追加" cols={[{ id: "name", label: "パラメータ名", ph: "例: postalCode" }, { id: "source", label: "値の取得元", ph: "例: 画面で入力された郵便番号" }]} />
      </Q>
      <Q q="認証情報の付与は？">
        <Flag path={["auth_none"]} label="認証なし" />
        {!v.auth_none && <>
          <Field path={["auth_what"]} label="付与する認証情報は？" ph="例: アクセストークン" />
          <Field path={["auth_how"]} label="どうやって取得する？" ph="例: 共通の認証部品" />
        </>}
      </Q>
      <Field path={["ok_cond"]} label="正常と判定する条件は？(HTTPステータスだけか、業務ステータスコードも見るか)" ph="例: HTTPステータスが200、かつ resultCode が「0」" />
      <Q q="レスポンスのどの項目を、どう使う？">
        <Rows path={["res_use"]} add="項目を追加" cols={[{ id: "item", label: "項目名", ph: "例: updatedAt" }, { id: "use", label: "使い方・渡し先", ph: "例: 会員テーブルの基幹更新日時に保存する" }]} />
      </Q>
      <Q q="参照系か、更新系か？">
        <Chips path={["kind"]} label="参照系か更新系か" options={KINDS} />
        {v.kind === "更新系" && <Field path={["idem"]} label="二重送信をどう防ぐ？" ph="例: リクエストIDを付与し、同じIDの再送は呼び出し先で無視させる" />}
      </Q>
      <ErrTable title={h.callErr} />
    </>;
    case "nonfunc": return <>
      <Q q="タイムアウトは？(秒)">
        <div className="call-row">
          <AutoText id="f_t_conn" value={v.t_conn || ""} placeholder="接続 例: 3" label="接続のタイムアウト(秒)" onChange={s => setValue(["t_conn"], s)} />
          <AutoText id="f_t_read" value={v.t_read || ""} placeholder="読み取り 例: 10" label="読み取りのタイムアウト(秒)" onChange={s => setValue(["t_read"], s)} />
        </div>
        <Chips path={["t_change"]} label="設定変更の可否" options={Object.keys(T_CHANGE)} />
      </Q>
      <Q q={"リトライは？" + (v.kind === "更新系" ? "(更新系なので、するかどうかを必ず決める)" : "")}>
        <Chips path={["retry"]} label="リトライ" options={RETRY} />
        {v.retry === "する" && <>
          <Field path={["retry_target"]} label="対象のエラーは？" ph="例: 5xx とタイムアウト" />
          <div className="call-row">
            <AutoText id="f_retry_count" value={v.retry_count || ""} placeholder="回数 例: 2" label="リトライ回数" onChange={s => setValue(["retry_count"], s)} />
            <AutoText id="f_retry_interval" value={v.retry_interval || ""} placeholder="間隔(秒) 例: 1" label="リトライ間隔(秒)" onChange={s => setValue(["retry_interval"], s)} />
          </div>
        </>}
        {v.retry === "しない" && <Field path={["retry_reason"]} label="しない理由は？(任意)" ph="例: 更新系で、二重更新のおそれがあるため" />}
      </Q>
      <Q q="性能は？">
        <Field path={["perf_range"]} label="どの範囲の応答時間？" ph="例: 変更ボタン押下から変更完了画面の表示まで" />
        <Field path={["perf_cond"]} label="どんな条件で？" ph="例: 通常時" />
        <Field path={["perf_sec"]} label="何秒以内？" ph="例: 3" />
        <Field path={["perf_freq"]} label="呼び出し頻度は？" ph="例: 1日あたり最大1,000回" />
        <Field path={["perf_rate"]} label="呼び出し先のレート制限は？(任意)" ph="例: 毎秒10回まで" />
      </Q>
      <Q q="ログは？">
        <Field path={["log_content"]} label="何を出力する？" ph="例: リクエストID・HTTPステータス・処理時間" />
        <Field path={["log_level"]} label="ログレベルは？" ph="例: INFO" />
        <Field path={["log_mask_item"]} label="マスキングする項目は？(任意)" ph="例: postalCode" />
        {String(v.log_mask_item || "").trim() && <Field path={["log_mask_how"]} label="どうマスキングする？" ph="例: 先頭3桁以外を * に置き換える" />}
        <Field path={["log_forbid"]} label="出力してはいけない項目は？" ph="例: アクセストークン・住所" />
      </Q>
      <Q q="セキュリティは？">
        <Field path={["sec_store"]} label="認証情報の保管場所は？" ph="例: AWS Secrets Manager" />
        <Field path={["sec_enc"]} label="通信経路の暗号化は？" ph="例: HTTPS（TLS1.2以上）" />
      </Q>
      <Q q={h.other + "：呼び出し先の利用可能時間帯は？(計画停止・サービス時間外の扱い)"}>
        <Flag path={["hours_none"]} label="該当しない" />
        {!v.hours_none && <Field path={["hours"]} label="利用可能時間帯と、時間外の扱い" ph="例: 毎日2時〜4時は計画停止のため、この時間帯は呼び出さずに夜間バッチで反映すること" />}
      </Q>
      <Field path={["monitor"]} label="監視・アラートは？(任意)" ph="例: 5xx が5分間に10回以上で、運用チームに通知すること" />
    </>;
    case "done": return <>
      <p className="hint">受け入れ条件の各項目に対応する単体テストを書きます。「異常時の挙動」の各行、前処理NGでAPIが呼ばれないこと、ログの確認、既存テストの成功は自動で入ります。</p>
      <Q q="テストのケースは？(正常系は必ず1つ以上)">
        <Rows path={["tests"]} add="ケースを追加" cols={[{ id: "kind", label: "種類", options: TEST_KINDS }, { id: "cond", label: "条件", ph: "例: 住所2が空" }, { id: "expect", label: "期待結果", ph: "例: 住所2を空文字で送信する" }]} />
      </Q>
    </>;
    case "spec": return <>
      <p className="hint">AIが参照できない外部資料に頼らず、実装に必要な部分を転記します。</p>
      <Q q="エンドポイントは？">
        <Chips path={["spec_method"]} label="メソッド" options={["GET", "POST", "PUT", "PATCH", "DELETE"]} />
        <Field path={["spec_path"]} label="パス" ph="例: /core/members/{memberId}/address" />
        <Field path={["spec_ver"]} label="仕様書のバージョン" ph="例: v1.3" />
      </Q>
      <Q q="リクエストヘッダは？(1つずつ)"><ListControl node={listNode("spec_headers", "リクエストヘッダ", "例: Authorization: Bearer {token}")} /></Q>
      <Q q="リクエストパラメータは？">
        <Rows path={["spec_req"]} add="項目を追加" cols={[{ id: "name", label: "項目" }, { id: "type", label: "型", ph: "例: string" }, { id: "need", label: "必須", options: ["○", "-"] }, { id: "desc", label: "内容" }]} />
      </Q>
      <Q q="レスポンス(正常時)は？">
        <Rows path={["spec_res"]} add="項目を追加" cols={[{ id: "name", label: "項目" }, { id: "type", label: "型", ph: "例: string" }, { id: "need", label: "必須", options: ["○", "-"] }, { id: "desc", label: "内容" }]} />
      </Q>
      <Q q="業務エラーコードは？">
        <Flag path={["codes_none"]} label="なし" />
        {!v.codes_none && <Rows path={["spec_codes"]} add="コードを追加" cols={[{ id: "code", label: "コード", ph: "例: E1001" }, { id: "meaning", label: "意味", ph: "例: 会員が存在しない" }]} />}
      </Q>
    </>;
    case "deps": return <>
      <Q q="参照すべき既存実装は？">
        <Field path={["dep_common"]} label="使用する共通部品は？(独自のHTTPクライアントは作らない)" ph="例: ExternalApiClient" />
        <Field path={["dep_example"]} label="呼び出し例となる既存クラスは？(任意)" ph="例: CoreMemberApiCaller" />
        <Field path={["dep_target"]} label="組み込み先は？(クラス#メソッド)" ph="例: AddressService#update" />
      </Q>
      <Q q="テスト環境は？">
        <Field path={["test_env"]} label="呼び出し先のテスト環境の提供状況は？" ph="例: ST環境のみ提供あり" />
        <Field path={["stub_env"]} label="スタブ・モックを使う環境は？" ph="例: 単体テストとローカル環境" />
        <Field path={["stub_how"]} label="スタブ・モックの方法は？" ph="例: WireMock" />
      </Q>
      <Field path={["url_setting"]} label="接続先URLの設定方法は？(設定ファイル・キー)" ph="例: application.yml の core.api.base-url" />
      <Q q="事前手続きは？(APIキー・証明書の払い出し、FW開放・疎通申請)">
        <Flag path={["proc_none"]} label="なし" />
        {!v.proc_none && <>
          <Field path={["proc"]} label="手続きの内容" ph="例: FW開放申請" />
          <Field path={["proc_ticket"]} label="チケット番号(任意)" ph="例: INFRA-123" />
        </>}
      </Q>
      <Q q="前提チケットは？(先に完了が必要なもの)">
        <Flag path={["pre_ticket_none"]} label="なし" />
        {!v.pre_ticket_none && <>
          <Field path={["pre_ticket"]} label="内容" ph="例: 住所変更APIの構築（BE）" />
          <Field path={["pre_ticket_no"]} label="チケット番号(任意)" ph="例: PROJ-456" />
        </>}
      </Q>
      <Q q={h.refs + "は？(仕様書、シーケンス図、メッセージ一覧の所在)"} opt>
        <Rows path={["refs"]} add="資料を追加" cols={[{ id: "name", label: "資料名", ph: "例: 住所更新API仕様書" }, { id: "where", label: "所在", ph: "例: Confluence / 基幹連携 / API仕様" }]} />
      </Q>
    </>;
  }
  return null;
}

/* 異常時の挙動の表。決まった5行(4xx・5xx・業務エラー・タイムアウト・形式不正)と、足した行 */
function ErrTable({ title }: { title: string }) {
  const v = useV();
  const errs: Values = v.errs || {};
  return (
    <Q q={title + "は？(異常の種類ごとに、システムの挙動と利用者への表示)"}>
      <div className="call-errs">
        {ERR_ROWS.map((r, i) => (
          <div key={r.id} className="call-err">
            <div className="lbl">{i + 1}. {r.label}{r.id === "biz" && <span className="call-biz">（判定条件：<AutoText id="f_biz_cond" value={v.biz_cond || ""} placeholder="例: resultCode が 0 以外" label="業務エラーの判定条件" onChange={s => setValue(["biz_cond"], s)} />）</span>}</div>
            <AutoText id={fid(["errs", r.id, "sys"])} value={(errs[r.id] || {}).sys || ""} placeholder="システムの挙動 例: リトライせず、WARNログを出力" label={r.label + "のシステムの挙動"} onChange={s => setValue(["errs", r.id, "sys"], s)} />
            <AutoText id={fid(["errs", r.id, "msg"])} value={(errs[r.id] || {}).msg || ""} placeholder="利用者への表示 例: 時間をおいて再度お試しください" label={r.label + "の利用者への表示"} onChange={s => setValue(["errs", r.id, "msg"], s)} />
          </div>
        ))}
      </div>
      <p className="hint">ほかにも分けたい異常があれば足します（任意）。</p>
      <Rows path={["errs_extra"]} add="異常を追加" cols={[{ id: "kind", label: "異常", ph: "例: 409（競合）" }, { id: "sys", label: "システムの挙動" }, { id: "msg", label: "利用者への表示" }]} />
    </Q>
  );
}
