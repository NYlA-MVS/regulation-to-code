# Test data to prepare

All data is synthetic. Mark it "ตัวอย่างสมมุติ" (synthetic sample) in the demo, and never use real customers' data.

## 1. Regulation texts → `data/regulations/`
- The chosen regulation's official text (PDF or text), saved with its source URL and download date
- An older or amended version, for the amendment-diff demo
- `clauses-draft.md`: each clause listed and marked checkable / checklist only / ambiguous

## 2. SME sample data → `data/samples/`
- `shop-a.csv`: about 30 rows, a realistic mix of pass and fail cases
- `shop-b.csv`: different column names, to demo column mapping
- `evasion.csv`: tricky cases (spaced Thai letters, look-alike characters, empty but present fields)

## 3. Expected results → `data/expected/`
- `shop-a.expected.csv`: row, clause id, expected verdict, hand-checked by two teammates
- This file is the baseline for the accuracy number in the pitch (agreement between checks and hand labels)

## Labelling rules
- Two people label independently, then resolve disagreements together and note why
- If a row is genuinely ambiguous under the regulation, label it `needs_expert` rather than guessing

## What's here now (generated 2026-10-08)

| File | Rows | What it tests |
|---|---|---|
| `samples/shop-a.csv` | 30 | Main demo shop: a realistic mix of clean rows and one planted error per row (row 18 has three) |
| `samples/shop-b.csv` | 8 | Same rules, **Thai column headers**, to demo column mapping |
| `samples/evasion.csv` | 10 | Tricky formatting: zero-width spaces, full-width digits, dashes in tax IDs, Thai numerals in dates, decomposed Thai vowels, thousands separators |
| `expected/*.expected.csv` | — | One verdict per clause per row: `pass`, `fail`, `n/a` or `needs_expert`, plus a note on what was planted |

Settings used: VAT rate 7% (a setting; check the current rate). Dates are in November 2026, with some in Buddhist-era format (2569).

**Important:** the expected labels come from the errors we planted, not from a person reading each row. Before the event, two teammates should still check every row by hand against `regulations/clauses-draft.md` and fix any label they disagree with. That hand-checked file is what makes the accuracy number in the pitch honest.

Seller "บริษัท แพรว สกิน แล็บ จำกัด" and all buyers are fictional. Tax IDs are randomly generated with valid check digits and don't belong to real entities.
