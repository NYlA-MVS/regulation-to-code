# Architecture

Design principle: **the LLM interprets, Codex compiles, deterministic code decides, a person approves.** An LLM never decides pass or fail at runtime.

## Flow

```
Regulation text (PDF / pasted)
        │
        ▼
1. Clause extractor (LLM, structured output)
   → clauses.json: id, source text, requirement type, checkable?, effective date
        │
        ▼
2. Human review: confirm each clause interpretation; mark ambiguous ones "ask an expert"
        │
        ▼
3. Check compiler (Codex, run non-interactively in a sandbox)
   → checks/<clause_id>.ts  +  tests/<clause_id>.test.ts  (pass, fail and evasion examples)
        │
        ▼
4. CI gate: all tests green + mutation score ≥ target → publish rule pack vX (immutable, dated)
        │
        ▼
5. Runner (in the browser, deterministic): SME CSV → column mapping → run rule pack
        │
        ▼
6. Report: row × clause verdicts, source quote, fix hint; traceability matrix
```

## Components

| Component | Job | Notes |
|---|---|---|
| Clause extractor | Regulation text → structured clauses | OpenAI Responses API with a JSON schema. Keeps the exact source quote. |
| Review UI | A person approves or edits each clause | Shows source text beside the interpretation |
| Check compiler | Clause → check function + tests | Codex. Input: clause JSON, data schema, examples. Output: code + tests only. |
| CI gate | Proves the pack works | Unit tests + mutation testing (flip one field, a check must fail) |
| Rule pack store | Versioned, dated packs | A new amendment creates a new version; the diff shows changed checks |
| Runner | Executes checks on user data | Runs in the browser, so data never leaves the user's machine |
| Report | Verdicts with citations | Row, clause, quote, fix; exportable |

## Data model (draft)

```jsonc
// clause
{ "id": "TAXINV-03", "source": "<exact quoted text>", "sourceRef": "<doc + section, verify>",
  "type": "field_required | format | threshold | deadline | checklist_only",
  "checkable": true, "effectiveFrom": "YYYY-MM-DD", "status": "approved | needs_expert" }

// check result
{ "row": 17, "clauseId": "TAXINV-03", "verdict": "fail | pass | n/a",
  "evidence": { "column": "buyer_tax_id", "value": "" }, "fixHint": "..." }
```

## Edge cases we must handle

- **Ambiguous clause:** never compiled automatically; it goes to the "ask an expert" list.
- **Amendments:** each clause has effective dates, so a record is judged by the rule in force on its date.
- **Mismatched columns:** a proposed mapping that the user confirms. Unmapped required fields give `n/a`, never a silent pass.
- **Evasion in text fields:** spaced-out Thai letters, emoji and look-alike characters are normalised before checks run.
- **Prompt injection in user data:** user data only ever reaches deterministic code, never an LLM.
- **A check that passes everything:** mutation testing catches it, and the CI gate fails.

## Trust and privacy

- Every check links to its clause id, source quote and rule-pack version, so it can be audited.
- The product never claims legal certainty. The UI says results are a self-check, and that the official source or a professional decides.
- SME data stays in the browser; only the regulation text and synthetic examples are sent to models.

## Stack (proposal, decide as a team)

- TypeScript throughout: Vite + React + Tailwind UI, checks as pure TS functions, Vitest for tests, Stryker or a small custom mutator for mutation tests
- OpenAI Responses API (structured outputs) for clause extraction; Codex for check and test generation
- No backend needed for the MVP: rule packs are JSON + bundled TS, and runs happen in the browser
