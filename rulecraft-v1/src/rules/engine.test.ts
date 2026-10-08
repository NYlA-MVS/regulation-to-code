import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { applyMapping, autoMap, compareExpected, mutationTest, runPack } from './engine'
import { parseDate, taxIdProblem, isBranchNotation } from './validators'
import { compact } from './normalize'

const dir = join(__dirname, '..', 'samples')
const load = (f: string) => Papa.parse<Record<string, string>>(readFileSync(join(dir, f), 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true })

describe.each(['shop-a', 'shop-b', 'evasion'])('%s', (name) => {
  const raw = load(`${name}.csv`)
  const rows = applyMapping(raw.data, autoMap(raw.meta.fields ?? []))
  const expected = load(`${name}.expected.csv`).data
  const results = runPack(rows, 'v2026', 0.07)

  it('maps every column automatically', () => {
    const m = autoMap(raw.meta.fields ?? [])
    expect(Object.values(m).filter((v) => !v)).toEqual([])
  })
  it('agrees with every expected label', () => {
    const cmp = compareExpected(results, expected)
    expect(cmp.mismatches).toEqual([])
    expect(cmp.total).toBe(expected.length * 11)
  })
  it('kills every mutant', () => {
    const m = mutationTest(rows, 0.07)
    expect(m.filter((x) => !x.killed).map((x) => x.clause.id)).toEqual([])
  })
})

describe('validators', () => {
  it('tax id check digit', () => {
    expect(taxIdProblem('0105536000313')).toBeNull()
    expect(taxIdProblem('0-1055-36000-31-3')).toBeNull()
    expect(taxIdProblem('0105536000314')).not.toBeNull()
    expect(taxIdProblem('010553600031')).not.toBeNull()
  })
  it('dates', () => {
    expect(parseDate('2026-11-15')).not.toBeNull()
    expect(parseDate('15/11/2569')?.getUTCFullYear()).toBe(2026)
    expect(parseDate('๑๕/๑๑/๒๕๖๙')).not.toBeNull()
    expect(parseDate('31/02/2569')).toBeNull()
    expect(parseDate('')).toBeNull()
  })
  it('branch notation', () => {
    for (const ok of ['สำนักงานใหญ่', 'สนญ.', 'HQ', '00000', 'สาขาที่ 2', 'Branch No. 3']) expect(isBranchNotation(ok)).toBe(true)
    for (const bad of ['', 'กรุงเทพ', 'branch']) expect(isBranchNotation(bad)).toBe(false)
  })
  it('normalises decomposed Thai vowel and zero-width spaces', () => {
    expect(compact('ใบกํากับภาษี')).toBe(compact('ใบกำกับภาษี'))
    expect(compact('ใบ​กำกับ ภาษี')).toBe(compact('ใบกำกับภาษี'))
  })
})
