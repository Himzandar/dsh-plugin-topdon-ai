/**
 * Checks that saving a selection announces the change to the browser.
 *
 * The picker is event-driven: it refreshes its catalog only when the Host
 * forwards `llm/models-updated` / `llm/adapters-updated`. Without the emit the
 * saved list is correct on disk and in the running fiber, yet the UI keeps
 * showing the boot-time catalog until the user switches models. That is the
 * regression these cases pin down.
 *
 *     node test-announce.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { announceModelsChanged } from './index.js'

const dir = mkdtempSync(join(tmpdir(), 'topdon-announce-'))

const checks = []
const check = (name, fn) => checks.push({ name, fn })

check('announces on llm/models-updated', () => {
  const events = []
  const ctx = { emit: (name) => events.push(name) }
  announceModelsChanged(ctx)
  assert.deepEqual(events, ['llm/models-updated'])
})

check('the emitted name is in the forwarded-event allowlist', () => {
  // Copied from API_REMOTE_FORWARDED_EVENTS in @deepseek-ai/dsh-api-remotes:
  // only these names reach the browser, so announcing anything else is a no-op.
  const FORWARDED = new Set(['llm/adapters-updated', 'llm/models-updated'])
  const events = []
  announceModelsChanged({ emit: (name) => events.push(name) })
  for (const name of events) assert.ok(FORWARDED.has(name), `${name} is not forwarded`)
})

check('a host without emit does not throw', () => {
  assert.doesNotThrow(() => announceModelsChanged({}))
  assert.doesNotThrow(() => announceModelsChanged({ emit: undefined }))
})

check('a throwing listener does not break the save', () => {
  const ctx = {
    emit: () => {
      throw new Error('listener exploded')
    },
    logger: { debug: () => {} },
  }
  assert.doesNotThrow(() => announceModelsChanged(ctx))
})

rmSync(dir, { recursive: true, force: true })

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
console.log(`\n${checks.length - failed}/${checks.length} passed`)
process.exit(failed === 0 ? 0 : 1)
