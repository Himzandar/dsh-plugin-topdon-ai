/**
 * Checks the per-key usage tally that backs the composer pill.
 *
 *     node test-usage.mjs
 */
import assert from 'node:assert/strict'
import { countingStream, createStore, createUsage, poolView } from './index.js'
import { normalizePool } from './keypool.mjs'

const KEYS = [
  { id: 'k1', label: '主账号', secret: 'sk-primary' },
  { id: 'k2', label: '备用', secret: 'sk-backup' },
]
const pool = () => normalizePool({ enabled: true, keys: KEYS })

const text = (value) => ({ type: 'text', text: value })
const finish = () => ({ type: 'finish', reason: { kind: 'stop' } })
const usageChunk = (usage) => ({ type: 'usage', usage })

function streamOf(chunks) {
  return (async function* emit() {
    for (const chunk of chunks) yield chunk
  })()
}

async function collect(iterable) {
  const out = []
  for await (const chunk of iterable) out.push(chunk)
  return out
}

const checks = []
const check = (name, fn) => checks.push({ name, fn })

check('usage starts empty and fills per key', () => {
  const usage = createUsage()
  assert.deepEqual(usage.snapshot(), { requests: 0, keys: {} })
  usage.add('k1', { inputTokens: 100, outputTokens: 20 })
  usage.add('k1', { inputTokens: 50, outputTokens: 5, cacheReadTokens: 7 })
  usage.add('k2', { inputTokens: 10, outputTokens: 1 })
  const snap = usage.snapshot()
  assert.equal(snap.requests, 3)
  assert.deepEqual(snap.keys.k1, {
    requests: 2,
    inputTokens: 150,
    outputTokens: 25,
    cacheReadTokens: 7,
    cacheWriteTokens: 0,
  })
  assert.equal(snap.keys.k2.requests, 1)
})

check('usage tolerates a missing payload', () => {
  const usage = createUsage()
  usage.add('k1', undefined)
  const snap = usage.snapshot()
  assert.equal(snap.requests, 1)
  assert.equal(snap.keys.k1.inputTokens, 0)
})

check('poolView exposes per-key usage but never a secret', () => {
  const store = createStore(pool(), async () => {})
  const usage = createUsage()
  usage.add('k1', { inputTokens: 42, outputTokens: 8 })
  const view = poolView(store, usage)
  assert.equal(view.requests, 1)
  assert.equal(view.keys[0].usage.inputTokens, 42)
  assert.equal(view.keys[1].usage.requests, 0, 'an unused key reports zeroes, not undefined')
  const serialized = JSON.stringify(view)
  assert.ok(!serialized.includes('sk-primary'), 'poolView leaked a secret')
  assert.ok(!serialized.includes('sk-backup'), 'poolView leaked a secret')
})

check('poolView works without a usage tally', () => {
  const store = createStore(pool(), async () => {})
  const view = poolView(store, undefined)
  assert.equal(view.requests, 0)
  assert.equal(view.keys[0].usage.requests, 0)
})

check('countingStream records the usage chunk it passes through', async () => {
  const store = createStore(pool(), async () => {})
  const usage = createUsage()
  const chunks = [text('hi'), usageChunk({ inputTokens: 30, outputTokens: 4 }), finish()]
  const stream = countingStream(() => streamOf(chunks), store, usage)
  const received = await collect(stream)
  assert.deepEqual(received, chunks, 'it must not alter the stream')
  const snap = usage.snapshot()
  assert.equal(snap.requests, 1)
  assert.equal(snap.keys.k1.inputTokens, 30)
  assert.equal(snap.keys.k1.outputTokens, 4)
})

check('countingStream keeps the LAST usage chunk of a turn', async () => {
  const store = createStore(pool(), async () => {})
  const usage = createUsage()
  const stream = countingStream(
    () => streamOf([usageChunk({ inputTokens: 999 }), text('x'), usageChunk({ inputTokens: 5, outputTokens: 2 }), finish()]),
    store,
    usage,
  )
  await collect(stream)
  // The final usage chunk is the authoritative one.
  assert.equal(usage.snapshot().keys.k1.inputTokens, 5)
  assert.equal(usage.snapshot().keys.k1.outputTokens, 2)
})

check('countingStream survives a host without a tally', async () => {
  const store = createStore(pool(), async () => {})
  const chunks = [text('a'), finish()]
  const received = await collect(countingStream(() => streamOf(chunks), store, undefined))
  assert.deepEqual(received, chunks)
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
console.log(`\n${checks.length - failed}/${checks.length} passed`)
process.exit(failed === 0 ? 0 : 1)
