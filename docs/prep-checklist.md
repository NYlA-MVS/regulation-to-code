# Prep checklist (before 21 Nov)

No app code before the event. Research, data, design and the pitch are allowed.

## By 23 Oct, 11:59 PM: apply
- [ ] Form a team of 3–4. Each member registers separately on https://luma.com/39zve8ph under the **identical team name**
- [ ] Application text: what we'll build (Regulation-to-Code, AI-Native Products & Operations), each member's technical background, past shipped projects (KhaiDee can be cited as evidence of shipping)
- [ ] Email regionalcodex_th@ultronasia.com to ask:
  - pitch length and the number of finalists
  - whether rule texts and test data prepared in advance are fine (we'll write no code before the day)

## Choose the regulation (decide in week 1)
Pick **one** with requirements that can be checked with data. Candidates:

| Candidate | Why | What to verify |
|---|---|---|
| **Full tax invoice / e-Tax invoice particulars** | Clear required fields; sellers issue them; very checkable with CSV | Exact required particulars and their legal source, from the Revenue Department (กรมสรรพากร) |
| Food nutrition / label particulars | Strong consumer angle; Shopee food sellers | Current Thai FDA (อย.) announcement text |
| Cosmetic advertising claims | Strong demo (catching banned claims) | Banned-claim rules; more interpretation means more risk |

- [x] Chosen: **full tax invoice particulars** (Revenue Code s.86/4 + Director-General VAT Notification No. 199)
- [x] Official text quoted with source URLs and dates in `data/regulations/sources.md`
- [ ] Find an amendment or older version, needed for the amendment-diff demo
- [x] Clause list drafted: 11 clauses in `data/regulations/clauses-draft.md` (3 still need an expert: English-only titles, and when buyer tax ID/branch apply)

## Talk to an expert (strongest evidence of domain depth)
- [ ] Interview 1 accountant or bookkeeper (for tax invoices) or 1 food or cosmetic seller (for labels)
- [ ] Questions:
  1. Which mistakes cause rejections or fines most often?
  2. How do you check today, and how long does it take?
  3. What would you need to trust an automatic check?
- [ ] Get a quote we can use in the pitch, with permission

## Data
- [x] Test CSVs built: shop-a (30 rows), shop-b (8, Thai headers), evasion (10)
- [ ] Hand-check the generated expected labels in `data/expected/` (two people, independently)

## Design
- [ ] Sketch 3 screens on paper: clause review, run report, traceability matrix
- [ ] Finish `docs/AGENTS.draft.md`

## Pitch
- [ ] Find one cited figure for the problem (SME compliance cost, fines, or rejected invoices). No made-up numbers
- [ ] Draft slides from `pitch/outline.md`
