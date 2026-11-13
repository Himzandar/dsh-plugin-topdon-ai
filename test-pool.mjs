/**
 * Offline checks for the key pool: selection, cooldown and in-flight failover.
 *
 *     node test-pool.mjs
 */
import assert from 'node:assert/strict'
import { applyPoolAction, createStore, failoverStream, poolView } from './index.js'
import {
  activeKey,
  classifyFailure,
  cooldownFor,
  nextKey,
  normalizePool,
  usableKeys,
  withActive,
  withCooldown,
} from './keypool.mjs'

const KEYS = [
  { id: 'k1', label: '主账号', secret: 'sk-primary-0000' },
  { id: 'k2', label: '备用', secret: 'sk-backup-1111' },
  { id: 'k3', label: '备用2', secret: 'sk-backup-2222' },
]

const pool = () => normalizePool({ enabled: true, keys: KEYS })
const clone = (value) => structuredClone(value)

/** A ctx whose dispatches are served from a queue of chunk lists. */
function harness(streams, { storedValue } = {}) {
  const calls = []
  let index = 0
  const take = () => {
    const chunks = streams[index] ?? [{ type: 'finish', reason: { kind: 'stop' } }]
    index += 1
    calls.push(chunks)
    return (async function* emit() {
      for (const chunk of chunks) yield chunk
    })()
  }
  const credentials = {
    sets: [],
    async set(ref, value) {
      this.sets.push({ ref, value })
    },
    async resolve() {
      return storedValue === undefined ? undefined : { value: storedValue }
    },
  }
  const ctx = { logger: { warn() {}, debug() {} }, credentials, llm: { stream: take } }
  return { ctx, credentials, calls, next: take, dispatched: () => index }
}

const text = (value) => ({ type: 'text', text: value })
const stop = () => ({ type: 'finish', reason: { kind: 'stop' } })
const fail = (failure) => ({ type: 'finish', reason: { kind: 'error', failure } })

async function collect(iterable) {
  const out = []
  for await (const chunk of iterable) out.push(chunk)
  return out
}

const checks = []
const check = (name, fn) => checks.push({ name, fn })

// --- pure selection -------------------------------------------------------

check('normalizePool drops secrets-less entries and keeps order', () => {
  const raw = { enabled: true, keys: [{ id: 'a', label: 'A', secret: 's1' }, { secret: '' }, { label: 'anon', secret: 's2' }] }
  const out = normalizePool(raw)
  assert.equal(out.keys.length, 2)
  assert.equal(out.keys[0].id, 'a')
  assert.match(out.keys[1].id, /^key-[0-9a-f]{8}$/)
  assert.equal(out.keys[1].label, 'anon')
})

check('sticky key wins while usable, falls back to the first usable', () => {
  const base = pool()
  assert.equal(activeKey(base).id, 'k1')
  const sticky = withActive(base, 'k2')
  assert.equal(activeKey(sticky).id, 'k2')
  const cooling = withCooldown(sticky, 'k2', 'bad-key', undefined, 1_000)
  assert.equal(activeKey(cooling, 1_000).id, 'k1')
})

check('nextKey skips cooled keys and never returns the failed one', () => {
  let state = withCooldown(pool(), 'k1', 'bad-key', undefined, 0)
  assert.equal(nextKey(state, 'k1', 0).id, 'k2')
  state = withCooldown(state, 'k2', 'bad-key', undefined, 0)
  assert.equal(nextKey(state, 'k2', 0).id, 'k3')
  state = withCooldown(state, 'k3', 'bad-key', undefined, 0)
  assert.equal(nextKey(state, 'k3', 0), undefined)
  assert.deepEqual(usableKeys(state, 0), [])
})

check('failure classification only rotates on key-attributable failures', () => {
  assert.equal(classifyFailure({ status: 401 }), 'bad-key')
  assert.equal(classifyFailure({ status: 403 }), 'bad-key')
  assert.equal(classifyFailure({ code: 'MISSING_CREDENTIAL' }), 'bad-key')
  assert.equal(classifyFailure({ status: 429 }), 'throttled')
  assert.equal(classifyFailure({ code: 'RATE_LIMIT' }), 'throttled')
  assert.equal(classifyFailure({ status: 500 }), 'other')
  assert.equal(classifyFailure({ code: 'SERVER' }), 'other')
  assert.equal(classifyFailure(undefined), 'other')
})

check('cooldowns honour the upstream Retry-After hint within bounds', () => {
  assert.equal(cooldownFor('bad-key', { providerRetryAfterMs: 1 }), 30 * 60 * 1000)
  assert.equal(cooldownFor('throttled', { providerRetryAfterMs: 42_000 }), 42_000)
  assert.equal(cooldownFor('throttled', { providerRetryAfterMs: 1 }), 5_000)
  assert.equal(cooldownFor('throttled', { providerRetryAfterMs: 99 * 60 * 60 * 1000 }), 30 * 60 * 1000)
  assert.equal(cooldownFor('throttled', undefined), 60_000)
})

check('state transitions never mutate their input', () => {
  const base = pool()
  const snapshot = clone(base)
  withCooldown(base, 'k1', 'bad-key')
  withActive(base, 'k3')
  assert.deepEqual(base, snapshot)
})

// --- in-flight failover ---------------------------------------------------

check('rejected key is cooled and the request replays on the next key', async () => {
  const store = createStore(pool(), async () => {})
  const { ctx, credentials, next } = harness([
    [fail({ status: 401, code: 'AUTH', message: 'invalid api key' })],
    [text('hello'), stop()],
  ])
  const chunks = await collect(failoverStream(ctx, { provider: 'topdon', model: 'm' }, next, store, credentials))
  assert.deepEqual(chunks, [text('hello'), stop()])
  assert.deepEqual(credentials.sets, [{ ref: 'TOPDON_AI_API_KEY', value: 'sk-backup-1111' }])
  assert.equal(store.current().state.activeId, 'k2')
  assert.ok((store.current().state.cooldownUntil.k1 ?? 0) > Date.now())
})

check('throttled key is cooled and the retry uses the next key', async () => {
  const store = createStore(pool(), async () => {})
  const { ctx, credentials, next } = harness([
    [fail({ status: 429, message: 'quota' })],
    [text('ok'), stop()],
  ])
  const chunks = await collect(failoverStream(ctx, { provider: 'topdon-claude' }, next, store, credentials))
  assert.deepEqual(chunks, [text('ok'), stop()])
  assert.equal(store.current().state.activeId, 'k2')
})

check('a failure after output was emitted is passed through, not replayed', async () => {
  const store = createStore(pool(), async () => {})
  const failure = fail({ status: 401, message: 'expired mid-stream' })
  const { ctx, credentials, next, dispatched } = harness([[text('partial'), failure]])
  const chunks = await collect(failoverStream(ctx, { provider: 'topdon' }, next, store, credentials))
  assert.deepEqual(chunks, [text('partial'), failure])
  assert.equal(dispatched(), 1)
  assert.deepEqual(credentials.sets, [])
})

check('server failures do not rotate keys', async () => {
  const store = createStore(pool(), async () => {})
  const failure = fail({ status: 500, code: 'SERVER', message: 'boom' })
  const { ctx, credentials, next, dispatched } = harness([[failure]])
  const chunks = await collect(failoverStream(ctx, { provider: 'topdon' }, next, store, credentials))
  assert.deepEqual(chunks, [failure])
  assert.equal(dispatched(), 1)
})

check('exhausted pool surfaces the original failure', async () => {
  const store = createStore(normalizePool({ enabled: true, keys: [KEYS[0]] }), async () => {})
  const failure = fail({ status: 401, message: 'nope' })
  const { ctx, credentials, next } = harness([[failure]])
  const chunks = await collect(failoverStream(ctx, { provider: 'topdon' }, next, store, credentials))
  assert.deepEqual(chunks, [failure])
})

check('successful replay is not wrapped twice', async () => {
  const store = createStore(pool(), async () => {})
  const { ctx, credentials, next } = harness([
    [fail({ status: 401, message: 'invalid' })],
    [text('done'), stop()],
  ])
  const chunks = await collect(failoverStream(ctx, { provider: 'topdon' }, next, store, credentials))
  assert.equal(chunks.filter((chunk) => chunk.type === 'text').length, 1)
})

// --- card actions (the in-app editor) -------------------------------------

check('card actions add, switch and remove keys without exposing secrets', () => {
  const store = createStore({ enabled: true, keys: [] }, async () => {})
  applyPoolAction(store, { action: 'add', label: '主账号', secret: 'sk-primary-0000' })
  applyPoolAction(store, { action: 'add', label: '备用', secret: 'sk-backup-1111' })
  assert.equal(store.current().keys.length, 2)
  assert.equal(store.current().state.activeId, store.current().keys[0].id)

  const view = poolView(store)
  assert.equal(view.keys.length, 2)
  assert.equal(view.active, store.current().keys[0].id)
  const serialized = JSON.stringify(view)
  assert.ok(!serialized.includes('sk-primary-0000'), 'poolView leaked a secret')
  assert.ok(!serialized.includes('sk-backup-1111'), 'poolView leaked a secret')
  assert.match(view.keys[0].masked, /^sk-pri…/)

  applyPoolAction(store, { action: 'use', id: store.current().keys[1].id })
  assert.equal(store.current().state.activeId, store.current().keys[1].id)

  applyPoolAction(store, { action: 'remove', id: store.current().keys[1].id })
  assert.equal(store.current().keys.length, 1)
  assert.equal(store.current().state.activeId, store.current().keys[0].id)
})

check('card actions reject duplicates and unknown ids', () => {
  const store = createStore({ enabled: true, keys: [] }, async () => {})
  applyPoolAction(store, { action: 'add', secret: 'sk-dup-9999' })
  assert.throws(() => applyPoolAction(store, { action: 'add', secret: 'sk-dup-9999' }), /已经在池子里/)
  assert.throws(() => applyPoolAction(store, { action: 'add', secret: '  ' }), /不能为空/)
  assert.throws(() => applyPoolAction(store, { action: 'use', id: 'nope' }), /没有这个 Key/)
  assert.throws(() => applyPoolAction(store, { action: 'explode' }), /未知操作/)
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
