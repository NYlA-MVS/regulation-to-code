// Turns confirmed invoices into the same table shape a spreadsheet upload produces, so every
// downstream step (grouping, rules, issues, ภ.พ.30 summary, exports) is shared.
import type { Sheet } from '../io/table'
import { FIELD_LABEL, FIELDS } from '../rules/engine'
import type { Field } from '../rules/engine'
import type { ExtractedInvoice } from './types'

const LINE_FIELDS: Field[] = ['item_desc', 'qty', 'unit_price', 'amount_ex_vat']

export function toSheet(name: string, invoices: ExtractedInvoice[]): Sheet {
  const cols = FIELDS.filter((f) => f !== 'buyer_is_vat_registrant' || invoices.some((x) => x.fields[f]))
  const header = [...cols.map((f) => FIELD_LABEL[f]), 'ไฟล์', 'หน้า']
  const rows: string[][] = []
  for (const inv of invoices) {
    const flags = inv.flags ?? {}
    const head: Partial<Record<Field, string>> = {
      ...inv.fields,
      img_handwritten: flags.handwritten === undefined ? '' : flags.handwritten ? 'Y' : 'N',
      img_copy: flags.copy === undefined ? '' : flags.copy ? 'Y' : 'N',
      img_title_not_printed: flags.titleNotPrinted === undefined ? '' : flags.titleNotPrinted ? 'Y' : 'N',
    }
    // Line items become rows; invoice-level VAT and total repeat on each (the grouping step reads them once).
    const lines = inv.lines.length ? inv.lines : [{ desc: inv.fields.item_desc ?? '', qty: inv.fields.qty ?? '', price: inv.fields.unit_price ?? '', amount: inv.fields.amount_ex_vat ?? '' }]
    const single = lines.length === 1
    for (const l of lines) {
      const row: Partial<Record<Field, string>> = { ...head, item_desc: l.desc, qty: l.qty, unit_price: l.price, amount_ex_vat: single ? (inv.fields.amount_ex_vat ?? l.amount) : l.amount }
      rows.push([...cols.map((f) => (LINE_FIELDS.includes(f) ? row[f] : head[f]) ?? ''), inv.file, inv.pages.join(',')])
    }
  }
  return { name, cells: [header, ...rows] }
}
