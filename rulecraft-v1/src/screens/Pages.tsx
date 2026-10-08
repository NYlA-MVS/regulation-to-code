// Reference pages: the rules checked (with legal text and code) and how to use the tool.
import checksSource from '../rules/checks.ts?raw'
import { CLAUSES } from '../rules/clauses'
import type { ClauseId } from '../rules/clauses'
import { EXTRA_FIELDS, FIELD_LABEL } from '../rules/engine'
import type { Field } from '../rules/engine'
import { ISSUE_TITLE } from '../io/issues'

const STATUS: Record<string, string> = { checkable: 'ตรวจจากข้อมูลได้', partial: 'ตรวจได้บางส่วน', needs_expert: 'บางกรณีต้องให้ผู้เชี่ยวชาญยืนยัน' }

/** The source of one clause's check, cut from checks.ts for display. */
function codeFor(id: ClauseId): string {
  const start = checksSource.indexOf(`'${id}':`)
  if (start < 0) return ''
  const rest = checksSource.slice(start + 1)
  const next = rest.search(/\n {2}'(TI|CN)-\d+b?':/)
  return checksSource.slice(start, next < 0 ? checksSource.lastIndexOf('}') : start + 1 + next).trimEnd()
}

const GROUPS: { title: string; ids: ClauseId[] }[] = [
  { title: 'รายการที่ต้องมีบนใบกำกับภาษีเต็มรูป (มาตรา 86/4 และประกาศฯ ฉบับที่ 199)', ids: ['TI-01', 'TI-02', 'TI-03', 'TI-04', 'TI-05', 'TI-06', 'TI-06b', 'TI-07', 'TI-08', 'TI-09', 'TI-10'] },
  { title: 'ยอดเงิน อัตรา และวันที่', ids: ['TI-11', 'TI-12', 'TI-13', 'TI-14', 'TI-25', 'TI-23', 'TI-22'] },
  { title: 'คุณภาพข้อมูลที่ช่วยให้ลูกค้าใช้ภาษีซื้อได้', ids: ['TI-15', 'TI-16', 'TI-17', 'TI-18', 'TI-24'] },
  { title: 'ใบยกเลิก ใบเพิ่มหนี้ และใบลดหนี้ (มาตรา 86/9, 86/10)', ids: ['TI-21', 'CN-01', 'CN-02', 'CN-03', 'CN-04'] },
]

export function RulesPage() {
  return (
    <div className="grid gap-8">
      <div className="grid max-w-[70ch] gap-2">
        <h1 className="text-[1.625rem]">ข้อกำหนดที่ตรวจ</h1>
        <p className="text-ink-2">ทุกข้อมาจากข้อความกฎหมายจริง แปลเป็นโค้ดที่ให้ผลเหมือนเดิมทุกครั้ง ไม่มี AI ตัดสินผลตอนตรวจ ข้อที่ตีความได้หลายทางจะบอกให้ถามผู้เชี่ยวชาญแทนการเดา</p>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title} className="grid gap-3">
          <h2 className="text-[1.1875rem]">{g.title}</h2>
          <div className="card divide-y divide-line">
            {g.ids.map((id) => {
              const c = CLAUSES.find((x) => x.id === id)!
              return (
                <details key={id} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-start gap-3">
                    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="mt-1 shrink-0 text-ink-3 transition-transform group-open:rotate-90"><path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="grid gap-0.5">
                      <span className="font-medium">{c.plain}</span>
                      <span className="text-[0.875rem] text-ink-3">{c.source} · {STATUS[c.status]} · <span lang="en">{c.id}</span></span>
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-3 pl-8 lg:grid-cols-2">
                    <div className="grid content-start gap-2 text-[0.9375rem]">
                      <blockquote className="border-l-[3px] border-line-strong pl-3 font-[family-name:var(--font-doc)] text-[1.0625rem] leading-[1.75]">“{c.quote}”</blockquote>
                      <p className="text-ink-2">ถ้าไม่ผ่าน จะแสดงว่า: {ISSUE_TITLE[id]}</p>
                      <p className="text-[0.875rem] text-ink-3">ช่องข้อมูลที่ใช้: {c.fields.map((f) => FIELD_LABEL[f as Field] ?? f).join(', ')}</p>
                    </div>
                    <details className="min-w-0">
                      <summary className="cursor-pointer text-[0.875rem] text-action">ดูโค้ดที่ใช้ตรวจ</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-sunken p-3 font-mono text-[0.75rem] leading-relaxed" lang="en">{codeFor(id)}</pre>
                    </details>
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      ))}
      <p className="text-[0.875rem] text-ink-3">ข้อความทางการ: <a className="link" href="https://www.rd.go.th/5208.html" target="_blank" rel="noreferrer">ประมวลรัษฎากร มาตรา 86–86/14</a> · <a className="link" href="https://rd.go.th/27982.html" target="_blank" rel="noreferrer">ประกาศอธิบดีฯ ฉบับที่ 199</a> · <a className="link" href="https://www.rd.go.th/3568.html" target="_blank" rel="noreferrer">คำสั่ง ป.86/2542</a></p>
    </div>
  )
}

export function HelpPage() {
  return (
    <div className="grid max-w-[70ch] gap-8">
      <h1 className="text-[1.625rem]">วิธีใช้</h1>
      <section className="grid gap-3">
        <h2 className="text-[1.1875rem]">ตรวจในสามขั้น</h2>
        <ol className="grid gap-3">
          {[
            ['ส่งออกรายงานภาษีขายเป็น Excel หรือ CSV', 'จากโปรแกรมบัญชีที่ใช้อยู่ เช่น Express, FlowAccount, PEAK หรือไฟล์ที่ทำเอง จะเป็นหนึ่งแถวต่อหนึ่งรายการสินค้า หรือหนึ่งแถวต่อหนึ่งใบก็ได้'],
            ['เลือกไฟล์ในหน้าแรก', 'ระบบหาหัวคอลัมน์เอง แม้มีชื่อรายงานอยู่ด้านบน ถ้าจับคู่คอลัมน์ได้ครบ จะไปหน้าผลตรวจทันที และจำการจับคู่ไว้ใช้เดือนหน้า'],
            ['แก้ตามรายการ แล้วตรวจซ้ำ', 'เริ่มจากเรื่องที่ "ต้องแก้" ส่งรายการให้ฝ่ายบัญชีเป็นไฟล์ Excel หรือพิมพ์เป็น PDF แก้ในโปรแกรมบัญชี แล้วส่งออกไฟล์ใหม่มาตรวจอีกครั้ง'],
          ].map(([t, d], i) => (
            <li key={i} className="card flex gap-4 p-4">
              <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-action font-semibold text-on-action">{i + 1}</span>
              <span className="grid gap-0.5"><span className="font-semibold">{t}</span><span className="text-ink-2">{d}</span></span>
            </li>
          ))}
        </ol>
      </section>
      <section className="grid gap-3">
        <h2 className="text-[1.1875rem]">ผลตรวจแต่ละระดับหมายถึงอะไร</h2>
        <dl className="card grid gap-3 p-5">
          <div><dt className="font-semibold text-fail">ต้องแก้</dt><dd className="text-ink-2">ขาดหรือผิดในรายการที่กฎหมายกำหนด ลูกค้าอาจใช้ภาษีซื้อจากใบนี้ไม่ได้ ควรแก้ก่อนยื่น ภ.พ.30</dd></div>
          <div><dt className="font-semibold text-warn">ควรตรวจสอบ</dt><dd className="text-ink-2">ข้อมูลดูผิดปกติ แต่ขึ้นกับข้อเท็จจริงที่ไฟล์ไม่ได้บอก เช่น ผู้ซื้อจด VAT หรือไม่ หรือมีส่วนลดหรือไม่</dd></div>
          <div><dt className="font-semibold text-expert">ถามผู้เชี่ยวชาญ</dt><dd className="text-ink-2">กฎหมายตีความได้หลายทาง ระบบจึงไม่ตัดสินแทน มีปุ่มคัดลอกคำถามไว้ส่งให้นักบัญชี</dd></div>
        </dl>
      </section>
      <section className="grid gap-3">
        <h2 className="text-[1.1875rem]">ตรวจได้ และยังตรวจไม่ได้</h2>
        <ul className="grid list-disc gap-2 pl-5 text-ink-2">
          <li>ตรวจว่ารายการที่กฎหมายกำหนดมีครบและถูกรูปแบบ ยอดเงินและอัตราภาษีถูกต้อง วันที่อยู่ในเดือนที่ยื่น และข้อมูลสม่ำเสมอทั้งไฟล์</li>
          <li>ตรวจใบเพิ่มหนี้ ใบลดหนี้ ใบที่ยกเลิกและออกแทน เงินตราต่างประเทศ รายการอัตรา 0% และรายการยกเว้น เมื่อไฟล์มีคอลัมน์เหล่านี้: {EXTRA_FIELDS.map((f) => FIELD_LABEL[f]).join(', ')}</li>
          <li>ไม่ได้ตรวจว่าเลขผู้เสียภาษีจดทะเบียน VAT จริง และไม่ได้ตรวจหน้าตาเอกสารจริง ดูรายการ "ตรวจด้วยตา" ในหน้าผลตรวจ</li>
          <li>ยังไม่รองรับไฟล์ e-Tax Invoice แบบ XML และรายงานจากเครื่อง POS</li>
        </ul>
      </section>
      <section className="grid gap-3">
        <h2 className="text-[1.1875rem]">ความเป็นส่วนตัว</h2>
        <p className="text-ink-2">ไฟล์ถูกเปิดและตรวจในเบราว์เซอร์ของคุณเท่านั้น ไม่มีเซิร์ฟเวอร์ ไม่มีการส่งข้อมูลออก เมื่อหน้าเว็บโหลดแล้ว ปิดอินเทอร์เน็ตก็ยังตรวจได้ สิ่งที่เก็บไว้ในเครื่องมีเพียงการจับคู่คอลัมน์และรายการที่ติ๊กในรายการตรวจด้วยตา</p>
      </section>
    </div>
  )
}
