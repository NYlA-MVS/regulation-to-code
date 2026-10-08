# Clause list (draft): full tax invoice rule pack v2026.11

Status key: **checkable** = a data check can decide; **partial** = data can catch obvious failures, a person decides the rest; **needs_expert** = don't compile until confirmed.

| Clause id | Source | Requirement (plain English) | CSV fields used | Check logic (deterministic) | Status |
|---|---|---|---|---|---|
| TI-01 | 86/4 (1) | The word "ใบกำกับภาษี" appears on the document | `doc_title` | Title contains "ใบกำกับภาษี" after normalisation. English-only "Tax Invoice" → `needs_expert` verdict, not fail | partial (English-only case open) |
| TI-02 | 86/4 (2) | Seller's name, address and 13-digit tax ID | `seller_name`, `seller_address`, `seller_tax_id` | All non-empty; tax ID = 13 digits with a valid check digit | checkable |
| TI-03 | 86/4 (3) | Buyer's name and address | `buyer_name`, `buyer_address` | Both non-empty, not placeholders like "-", "N/A", "ลูกค้าทั่วไป" (walk-in customer) | checkable |
| TI-04 | 86/4 (4) | Invoice serial number (and book number if books are used) | `invoice_no`, `book_no` | `invoice_no` non-empty and unique in the file (the first occurrence passes, later duplicates fail) | checkable |
| TI-05 | 86/4 (5) | Name/kind/quantity/value of goods or services | `item_desc`, `qty`, `amount_ex_vat` | Description non-empty; qty > 0; amount is a number ≥ 0 | checkable |
| TI-06 | 86/4 (6) | VAT amount shown separately from the value | `vat_amount`, `amount_ex_vat` | `vat_amount` present and numeric (separate column, not merged into amount) | checkable |
| TI-06b | 86/4 (6), arithmetic | VAT amount matches the value × rate | `vat_amount`, `amount_ex_vat` | abs(vat − amount × RATE) ≤ 0.01 baht; `n/a` if TI-06 fails or the amount is invalid. **RATE is a setting** (verify the current rate) | partial (rate to verify) |
| TI-07 | 86/4 (7) | Date of issue | `issue_date` | Valid date (accepts ISO and Thai Buddhist-era dd/mm/2569) | checkable |
| TI-08 | DG No. 199 (issuer location) | Seller's head office or branch shown | `seller_branch` | Matches "สำนักงานใหญ่", "สนญ", "HO", "HQ", "00000", "สาขาที่ n", "Branch No. n" or a 5-digit code | checkable |
| TI-09 | DG No. 199 (buyer tax ID) | Buyer's tax ID | `buyer_tax_id`, `buyer_is_vat_registrant` | If the buyer is VAT-registered: 13 digits, valid check digit. If not: `n/a` until we confirm the rule | needs_expert (scope) |
| TI-10 | DG No. 199 (buyer location) | Buyer's head office or branch | `buyer_branch`, `buyer_is_vat_registrant` | Same patterns as TI-08, applied when the buyer is VAT-registered | needs_expert (scope) |

## Tax ID check digit (13 digits)
Use the standard Thai 13-digit check: multiply the first 12 digits by 13, 12, …, 2, sum them, and the check digit = (11 − sum mod 11) mod 10. Treat this as a format check only; it doesn't prove the number is registered.

## Not checkable from invoice data (becomes a checklist item)
- "Placed prominently" (ในที่ที่เห็นได้เด่นชัด) in 86/4 (1) is about layout. We can only check the word exists, so the UI shows a manual tick: "the word is clearly visible on the printed or PDF invoice".
