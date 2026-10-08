// Which fields a file must, should, or may have.
import { EXTRA_FIELDS, FIELDS } from './rules/engine'
import type { Field } from './rules/engine'

export const REQUIRED: Field[] = ['invoice_no', 'issue_date', 'seller_tax_id', 'buyer_name', 'amount_ex_vat', 'vat_amount']
export const OPTIONAL: Field[] = ['book_no', 'unit_price', 'total', ...EXTRA_FIELDS]
export const RECOMMENDED: Field[] = FIELDS.filter((f) => !REQUIRED.includes(f) && !OPTIONAL.includes(f))

export type MatchKind = 'saved' | 'auto' | 'manual' | 'none'

