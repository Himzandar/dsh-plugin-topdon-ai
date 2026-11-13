/**
 * Topdon AI key pool — storage, selection and failure classification.
 *
 * The pool lives in `$DSH_HOME/.topdon-ai-pool.json`:
 *
 *     {
 *       "enabled": true,
 *       "keys":    [{ "id": "k1", "label": "主账号", "secret": "sk-…" }],
 *       "state":   { "activeId": "k1", "cooldownUntil": { "k1": 0 } }
 *     }
 *
 * `keys` is the user's list (order matters); `state` is measured data written
 * at runtime. They are kept apart for the same reason dsh-connect-workbuddy
 * separates its pool preferences from its measurements: a settings save must
 * not roll back a cooldown, and a cooldown must not rewrite the user's list.
 *
 * Every key is used through the SAME credential reference the provider routes
 * declare (`TOPDON_AI_API_KEY`), so the model picker never shows duplicates:
 * switching a key is a credential write, not a provider change.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Minutes a key stays out of rotation after the upstream rejects it. */
const BAD_KEY_COOLDOWN_MS = 30 * 60 * 1000
/** Seconds a key stays out of rotation after throttling, when the upstream is silent. */
const THROTTLE_COOLDOWN_MS = 60 * 1000
const MAX_COOLDOWN_MS = 30 * 60 * 1000
const MIN_COOLDOWN_MS = 5 * 1000

/** `$DSH_HOME/.topdon-ai-pool.json`, matching the harness home layout. */
export function poolPath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, '.topdon-ai-pool.json')
}

/** Coerce a parsed file into the shape the runtime uses. Never invents keys. */
export function normalizePool(raw) {
  const keys = []
  for (const entry of Array.isArray(raw?.keys) ? raw.keys : []) {
    const secret = typeof entry?.secret === 'string' ? entry.secret.trim() : ''
    if (secret.length === 0) continue
    const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : fingerprint(secret)
    keys.push({
      id,
      label: typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : id,
      secret,
    })
  }
  const state = raw?.state !== null && typeof raw?.state === 'object' ? raw.state : {}
  const cooldownUntil = {}
  for (const [id, until] of Object.entries(state.cooldownUntil ?? {})) {
    if (Number.isFinite(until)) cooldownUntil[id] = until
  }
  return {
    enabled: raw?.enabled !== false,
    keys,
    state: {
      activeId: typeof state.activeId === 'string' ? state.activeId : undefined,
      cooldownUntil,
    },
  }
}

/** Stable short id for a secret that has no explicit id. */
export function fingerprint(secret) {
  return 'key-' + createHash('sha256').update(secret).digest('hex').slice(0, 8)
}

export async function readPool(path = poolPath()) {
  try {
    const text = await readFile(path, 'utf8')
    return normalizePool(JSON.parse(text))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

export async function writePool(pool, path = poolPath()) {
  const document = {
    enabled: pool.enabled,
    keys: pool.keys.map(({ id, label, secret }) => ({ id, label, secret })),
    state: { activeId: pool.state.activeId, cooldownUntil: pool.state.cooldownUntil },
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = path + '.tmp'
  await writeFile(temporary, JSON.stringify(document, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, path)
}

/** Keys usable right now, in the user's order. */
export function usableKeys(pool, now = Date.now()) {
  return pool.keys.filter((key) => (pool.state.cooldownUntil[key.id] ?? 0) <= now)
}

/** The key that should serve the next request: the sticky one while it is usable. */
export function activeKey(pool, now = Date.now()) {
  if (!pool.enabled || pool.keys.length === 0) return undefined
  const usable = usableKeys(pool, now)
  const sticky = usable.find((key) => key.id === pool.state.activeId)
  if (sticky !== undefined) return sticky
  return usable[0] ?? pool.keys[0]
}

/**
 * The next usable key after `excludeId`, wrapping around. Returns undefined when
 * no other key is usable, which is the pool's "no failover left" answer.
 */
export function nextKey(pool, excludeId, now = Date.now()) {
  const usable = usableKeys(pool, now).filter((key) => key.id !== excludeId)
  return usable[0]
}

/**
 * What a failed request says about the key that served it.
 *
 * Only key-attributable failures rotate: a rejected credential, or throttling
 * that names this key's quota. Transport, server and timeout failures are left
 * to the host's own retry policy — switching keys would not have helped.
 */
export function classifyFailure(failure) {
  const status = failure?.status
  const code = typeof failure?.code === 'string' ? failure.code.toUpperCase() : ''
  if (status === 401 || status === 403) return 'bad-key'
  if (code === 'AUTH' || code === 'INVALID_CREDENTIAL' || code === 'MISSING_CREDENTIAL' || code === 'CREDENTIAL_REJECTED') {
    return 'bad-key'
  }
  if (status === 429 || code === 'RATE_LIMIT') return 'throttled'
  return 'other'
}

/** How long a key sits out, and why. */
export function cooldownFor(kind, failure) {
  if (kind === 'bad-key') return BAD_KEY_COOLDOWN_MS
  const stated = failure?.providerRetryAfterMs
  if (Number.isFinite(stated) && stated > 0) return Math.min(Math.max(stated, MIN_COOLDOWN_MS), MAX_COOLDOWN_MS)
  return THROTTLE_COOLDOWN_MS
}

/** Record a failure against one key. Pure: returns a new pool object. */
export function withCooldown(pool, keyId, kind, failure, now = Date.now()) {
  const until = now + cooldownFor(kind, failure)
  return {
    ...pool,
    state: {
      ...pool.state,
      cooldownUntil: { ...pool.state.cooldownUntil, [keyId]: until },
    },
  }
}

/** Make one key sticky and clear its cooldown. Pure: returns a new pool object. */
export function withActive(pool, keyId, now = Date.now()) {
  const cooldownUntil = { ...pool.state.cooldownUntil }
  delete cooldownUntil[keyId]
  return { ...pool, state: { ...pool.state, activeId: keyId, cooldownUntil } }
}

/** One-line operator view, used by the CLI and by log lines. */
export function describePool(pool, now = Date.now()) {
  if (pool.keys.length === 0) return 'pool empty'
  return pool.keys
    .map((key) => {
      const until = pool.state.cooldownUntil[key.id] ?? 0
      const active = pool.state.activeId === key.id ? '*' : ' '
      const state = until > now ? `cooldown ${Math.ceil((until - now) / 1000)}s` : 'usable'
      return `${active} ${key.id} (${key.label}) ${state}`
    })
    .join('\n')
}
