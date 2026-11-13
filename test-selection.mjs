/**
 * Checks for the model-selection contract.
 *
 * Two things have to hold at once:
 *   - the user's choice must survive a restart, and it must live OUTSIDE the
 *     package (a tarball/registry install is hard-linked into pnpm's store, so
 *     writing the package's own files would corrupt a shared blob);
 *   - the package's own bundle patch is only rewritten when its bytes are
 *     private to this install.
 *
 *     node test-selection.mjs
 */
import assert from 'node:assert/strict'
import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  currentSelection,
  readSavedSelection,
  readSelectionFromPatch,
  sharesItsBytes,
  writeSelection,
} from './index.js'
import { buildPatchText } from './patchgen.mjs'
import { MODEL_IDS } from './providers.mjs'

const dir = mkdtempSync(join(tmpdir(), 'topdon-selection-'))
const file = join(dir, 'cordis.patch.yml')
// Every check gets its own state file so a real `$DSH_HOME` is never touched.
let stateSeq = 0
const freshState = () => join(dir, `state-${++stateSeq}.json`)

const checks = []
const check = (name, fn) => checks.push({ name, fn })

check('an absent patch and absent state report the full catalog', () => {
  assert.deepEqual(currentSelection(join(dir, 'missing.yml'), freshState()), [...MODEL_IDS])
})

check('writeSelection persists exactly the kept models, in catalog order', () => {
  const state = freshState()
  const effective = writeSelection(['gpt-6.1-sol', 'deepseek-v4-flash'], file, state)
  assert.deepEqual(effective, ['deepseek-v4-flash', 'gpt-6.1-sol'])
  // The durable copy is the state file, outside the package.
  assert.deepEqual(readSavedSelection(state), ['deepseek-v4-flash', 'gpt-6.1-sol'])
  assert.deepEqual(currentSelection(file, state), ['deepseek-v4-flash', 'gpt-6.1-sol'])
  const text = readFileSync(file, 'utf8')
  assert.equal((text.match(/^\s{10}- id: /gm) ?? []).length, 2)
})

check('writeSelection drops unknown ids', () => {
  const state = freshState()
  const effective = writeSelection(['deepseek-v4-flash', 'not-a-model'], file, state)
  assert.deepEqual(effective, ['deepseek-v4-flash'])
  assert.deepEqual(currentSelection(file, state), ['deepseek-v4-flash'])
})

check('an empty selection falls back to the whole catalog', () => {
  const state = freshState()
  const effective = writeSelection([], file, state)
  assert.equal(effective.length, MODEL_IDS.length)
  assert.deepEqual(currentSelection(file, state), [...MODEL_IDS])
})

check('a round-trip through the file is stable', () => {
  const state = freshState()
  writeSelection(['claude-opus-5-5', 'qwen-plus_thinking'], file, state)
  const first = readFileSync(file, 'utf8')
  writeSelection(['claude-opus-5-5', 'qwen-plus_thinking'], file, state)
  assert.equal(readFileSync(file, 'utf8'), first)
  assert.deepEqual(currentSelection(file, state), ['claude-opus-5-5', 'qwen-plus_thinking'])
})

check('the written patch still declares the provider and the injector row', () => {
  const state = freshState()
  writeSelection(['deepseek-v4-flash'], file, state)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /id: llm-pi-ai/)
  assert.match(text, /apiKeyEnv: TOPDON_AI_API_KEY/)
  assert.match(text, /topdon-ai-injector/)
  assert.match(text, /heal: true/)
})

check('a shared (store-backed) patch is never rewritten, but the choice still saves', () => {
  const state = freshState()
  const shared = join(dir, 'shared.patch.yml')
  // Seed it with the full catalogue, as a store install would ship it.
  writeFileSync(shared, buildPatchText(MODEL_IDS), 'utf8')
  const before = readFileSync(shared, 'utf8')

  // Simulate the pnpm store: a second hard link to the same bytes.
  const twin = join(dir, 'store-blob.yml')
  rmSync(twin, { force: true })
  linkSync(shared, twin)

  assert.equal(sharesItsBytes(shared), true, 'the fixture must look store-backed')
  const effective = writeSelection(['gpt-6.1-sol'], shared, state)

  assert.deepEqual(effective, ['gpt-6.1-sol'])
  assert.deepEqual(readSavedSelection(state), ['gpt-6.1-sol'], 'the choice must still be saved')
  assert.equal(readFileSync(shared, 'utf8'), before, 'the shared patch must keep its bytes')
  // The patch still declares the whole catalogue; narrowing is a runtime act.
  assert.deepEqual(readSelectionFromPatch(shared), [...MODEL_IDS])
})

check('buildPatchText never emits an empty models list', () => {
  const text = buildPatchText([])
  const count = (text.match(/^\s{10}- id: /gm) ?? []).length
  assert.equal(count, MODEL_IDS.length)
})

let failed = 0
for (const { name, fn } of checks) {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}\n     ${error.message}`)
  }
}
rmSync(dir, { recursive: true, force: true })

console.log(`\n${checks.length - failed}/${checks.length} passed`)
process.exit(failed === 0 ? 0 : 1)
