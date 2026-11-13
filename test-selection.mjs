/**
 * Checks for the model-selection contract: the SELECTION must land on disk (so
 * the Models page and the next boot agree) and in the running fiber (so the
 * picker updates immediately).
 *
 *     node test-selection.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { currentSelection, writeSelection } from './index.js'
import { buildPatchText } from './patchgen.mjs'
import { MODEL_IDS } from './providers.mjs'

const dir = mkdtempSync(join(tmpdir(), 'topdon-selection-'))
const file = join(dir, 'cordis.patch.yml')

const checks = []
const check = (name, fn) => checks.push({ name, fn })

check('an absent file reports the full catalog', () => {
  assert.deepEqual(currentSelection(join(dir, 'missing.yml')), [...MODEL_IDS])
})

check('writeSelection persists exactly the kept models, in catalog order', () => {
  const effective = writeSelection(['gpt-6.1-sol', 'deepseek-v4-flash'], file)
  assert.deepEqual(effective, ['deepseek-v4-flash', 'gpt-6.1-sol'])
  // The file is the source of truth the Models page reads back.
  assert.deepEqual(currentSelection(file), ['deepseek-v4-flash', 'gpt-6.1-sol'])
  const text = readFileSync(file, 'utf8')
  assert.equal((text.match(/^\s{10}- id: /gm) ?? []).length, 2)
})

check('writeSelection drops unknown ids', () => {
  const effective = writeSelection(['deepseek-v4-flash', 'not-a-model'], file)
  assert.deepEqual(effective, ['deepseek-v4-flash'])
  assert.deepEqual(currentSelection(file), ['deepseek-v4-flash'])
})

check('an empty selection falls back to the whole catalog', () => {
  const effective = writeSelection([], file)
  assert.equal(effective.length, MODEL_IDS.length)
  assert.deepEqual(currentSelection(file), [...MODEL_IDS])
})

check('a round-trip through the file is stable', () => {
  writeSelection(['claude-opus-5-5', 'qwen-plus_thinking'], file)
  const first = readFileSync(file, 'utf8')
  writeSelection(['claude-opus-5-5', 'qwen-plus_thinking'], file)
  assert.equal(readFileSync(file, 'utf8'), first)
  assert.deepEqual(currentSelection(file), ['claude-opus-5-5', 'qwen-plus_thinking'])
})

check('the written patch still declares the provider and the injector row', () => {
  writeSelection(['deepseek-v4-flash'], file)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /id: llm-pi-ai/)
  assert.match(text, /apiKeyEnv: TOPDON_AI_API_KEY/)
  assert.match(text, /topdon-ai-injector/)
  assert.match(text, /heal: true/)
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
