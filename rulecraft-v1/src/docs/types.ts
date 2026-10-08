// An invoice read from a PDF or an image, before the user confirms it and the rules check it.
import type { Field } from '../rules/engine'

export interface DocLine {
  desc: string
  qty: string
  price: string
  amount: string
}

export interface ExtractedInvoice {
  /** "text" = read from the PDF's own text in this browser; "ai" = read by Claude from page images. */
  source: 'text' | 'ai'
  file: string
  /** 1-based page numbers within the file */
  pages: number[]
  fields: Partial<Record<Field, string>>
  lines: DocLine[]
  /** Seen on the image by the AI reader (ประกาศอธิบดีฯ ฉบับที่ 42 ข้อ 2). */
  flags?: { handwritten?: boolean; copy?: boolean; titleNotPrinted?: boolean }
  /** Some characters in the PDF's text layer could not be decoded (usually Thai tone marks). */
  garbled?: boolean
  /** Fields the reader could not find or could not read clearly. */
  missing: Field[]
  thumb?: string
}

/** Fields an invoice cannot be checked without; the review screen highlights them when empty. */
export const DOC_REQUIRED: Field[] = ['doc_title', 'invoice_no', 'issue_date', 'seller_name', 'seller_tax_id', 'buyer_name', 'amount_ex_vat', 'vat_amount']
