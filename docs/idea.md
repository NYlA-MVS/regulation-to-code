# Idea #100: Regulation-to-Code

**One line:** Codex turns a new regulation into executable compliance checks with tests, and SMEs run those checks against their own data.

**Track:** T2 AI-Native Products & Operations (can be pitched as T3 Deep Domain if we go deep on one regulation)
**SDG:** 16.6 (effective, accountable institutions), 9.3 (small businesses' access to markets and compliance)
**Score (estimate, not a result):** P4 · B4 · D5 · C5 = 18/20

## Problem

When a new announcement or regulation comes out, an SME has to read a long document and work out what it must change. Most have no legal team, so they find out when they're inspected or fined. Consultants are expensive and only check once.

Marketplaces and sellers rely on keyword lists and manual review. These miss evasions like "ข า ว ใ น 7 วัน" (spaced-out letters) and go out of date silently when the rules change.

## Users

- **Primary:** SME owners, and bookkeepers or accountants who look after several businesses.
- **Secondary:** business associations that tell members about new rules; marketplace sellers (Shopee).

## How it works

1. Import a regulation's text. An agent extracts the requirements that can be checked with data (for example, which particulars a full tax invoice must show).
2. Codex turns each requirement into a check function, plus tests built from passing and failing examples.
3. An expert or the user confirms each check matches the regulation text before it's published as a rule pack.
4. The SME uploads its own data (sales CSV, product list, labels) and runs the rule pack in the browser.
5. They get a report: which rule failed, on which row, the regulation text it comes from, and how to fix it.

## What it does alone, and when it asks a person

- **Alone:** the agent and Codex write checks and tests by themselves.
- **Needs a person:**
  - Every rule pack must be reviewed by a person before it's published.
  - Ambiguous requirements are labelled "ask an expert" instead of being turned into code.

## Unexpected situations

- **The SME's columns don't match what a check expects:** the system proposes a column mapping and the user confirms it.
- **The regulation is amended:** a new rule-pack version is built, the system shows which checks changed, and the data can be re-run immediately.
- **A requirement can't be checked with data (for example, staff training):** it becomes a checklist item the user ticks off.

## What Codex does

- **The core of the system:** Codex reads requirements and writes check functions with pass/fail tests.
- **Repair:** Codex fixes a check that fails when a reviewer adds an edge-case example.
- **On stage:** paste a new regulation chosen by the judges. Codex builds the rule pack, runs the tests, then runs it against sample SME data live.

## MVP for the day

- Import 1 regulation, picking one with clear, data-checkable requirements
- Pipeline: regulation → checks + tests via Codex
- Review screen showing each check beside its regulation text
- SME uploads a CSV and gets a pass/fail report row by row

## Demo moment

Paste a new announcement. Codex builds 5 checks with all tests green in a few minutes. Run them on a mock shop's data and show exactly which rows break which rule.

## Sea fit

Shopee sellers could check their listings and sales data against new rules (labels, tax) before their listings get suspended.

## Risks and fixes

- **Codex misreads a rule:** human review is mandatory, and the regulation text sits beside the code of every check.
- **SMEs worry about uploading business data:** checks run in the user's browser and the data never leaves their machine.

## Upgrade plan (from the judge-style review)

**Weakness a judge would see:** turning law into code is hard to verify. If we don't name one specific regulation, judges will see it as generic.

**Three upgrades:**
1. Pick one announcement (for example e-Tax / full tax invoice requirements, or food labelling) and go deep on it.
2. Add a traceability matrix: regulation text ↔ function ↔ test ↔ failing data row.
3. Add mutation testing: change the data one field at a time to prove the checks really catch errors and don't just pass everything.

**Killer feature:** paste the amended version of a regulation. Codex shows which checks changed and which of the SME's rows now fail.

**Proof number for the stage (a target, not a result):** on a 30-row sample CSV that the team checks by hand, measure agreement between the checks and the hand labels, plus the rule pack's mutation score.

**Combine with:** #25 อย. Compliance Checker. Regulation-to-Code becomes the engine that produces checks from Thai FDA announcements, so that checker updates itself when new announcements come out.

## Pitch line

> กฎหมายใหม่หนึ่งฉบับ ควรกลายเป็นชุดตรวจที่ SME กดรันได้ในวันเดียวกัน ไม่ใช่เอกสารที่ไม่มีใครอ่าน
> (One new regulation should become a check an SME can run the same day, not a document nobody reads.)

*All scores and targets are estimates. Anything legal must be checked against the official source before we use it.*
