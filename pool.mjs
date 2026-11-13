#!/usr/bin/env node
/**
 * Manage the Topdon AI key pool.
 *
 *     node pool.mjs list
 *     node pool.mjs add "主账号" sk-xxxxxxxx
 *     node pool.mjs use k-1a2b3c4d
 *     node pool.mjs remove k-1a2b3c4d
 *     node pool.mjs enable | disable
 *
 * The file lives at `$DSH_HOME/.topdon-ai-pool.json`. Restart DeepSeek Harness
 * after changing it.
 */
import { activeKey, describePool, fingerprint, normalizePool, poolPath, readPool, writePool } from './keypool.mjs'

const USAGE = `usage:
  node pool.mjs list
  node pool.mjs add <label> <secret>
  node pool.mjs use <id>
  node pool.mjs remove <id>
  node pool.mjs enable | disable`

function mask(secret) {
  if (secret.length <= 12) return secret.slice(0, 3) + '…'
  return secret.slice(0, 6) + '…' + secret.slice(-4)
}

async function load() {
  const pool = await readPool()
  return pool ?? normalizePool({ enabled: true, keys: [] })
}

const [command, ...args] = process.argv.slice(2)

if (command === 'list') {
  const pool = await load()
  console.log(`${poolPath()}  enabled=${pool.enabled}`)
  for (const key of pool.keys) {
    const until = pool.state.cooldownUntil[key.id] ?? 0
    const active = pool.state.activeId === key.id ? '*' : ' '
    const state = until > Date.now() ? `cooldown ${Math.ceil((until - Date.now()) / 1000)}s` : 'usable'
    console.log(`${active} ${key.id}  ${key.label}  ${mask(key.secret)}  ${state}`)
  }
  if (pool.keys.length === 0) console.log('(empty — add a key first)')
  console.log(`\nserving next: ${activeKey(pool)?.id ?? '(none)'}`)
} else if (command === 'add') {
  const [label, secret] = args
  if (!secret) {
    console.error(USAGE)
    process.exit(1)
  }
  const pool = await load()
  const trimmed = secret.trim()
  if (pool.keys.some((key) => key.secret === trimmed)) {
    console.error('that secret is already in the pool')
    process.exit(1)
  }
  let id = fingerprint(trimmed)
  const keys = [...pool.keys, { id, label: label?.trim() || id, secret: trimmed }]
  pool.keys = keys
  pool.state.activeId ??= id
  await writePool(pool)
  console.log(`added ${id} (${label ?? id}); ${keys.length} key(s) in the pool`)
} else if (command === 'use') {
  const pool = await load()
  const key = pool.keys.find((entry) => entry.id === args[0])
  if (!key) {
    console.error(`no key "${args[0]}"`)
    process.exit(1)
  }
  pool.state.activeId = key.id
  delete pool.state.cooldownUntil[key.id]
  await writePool(pool)
  console.log(`active: ${key.id}`)
} else if (command === 'remove') {
  const pool = await load()
  const id = args[0]
  if (!pool.keys.some((key) => key.id === id)) {
    console.error(`no key "${id}"`)
    process.exit(1)
  }
  pool.keys = pool.keys.filter((key) => key.id !== id)
  delete pool.state.cooldownUntil[id]
  if (pool.state.activeId === id) pool.state.activeId = pool.keys[0]?.id
  await writePool(pool)
  console.log(`removed ${id}; ${pool.keys.length} key(s) left`)
} else if (command === 'enable' || command === 'disable') {
  const pool = await load()
  pool.enabled = command === 'enable'
  await writePool(pool)
  console.log(`pool ${pool.enabled ? 'enabled' : 'disabled'}`)
} else {
  console.error(USAGE)
  process.exit(command === undefined ? 0 : 1)
}
