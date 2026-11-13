/**
 * Topdon AI gateway — host half.
 *
 * 1. MODELS   `cordis.patch.yml` publishes ONE provider (`topdon`) from the
 *             plugin BUNDLE's patch layer, so it exists exactly while the
 *             plugin is installed and enabled. The five model families live
 *             inside that single route, which keeps Settings → Models to one
 *             row instead of five.
 * 2. SELECTION The plugin's own settings section chooses which models are on.
 *             The choice is applied through `providers` — a VOLATILE field of
 *             `llm-pi-ai` — so it is never written to the profile. Disable the
 *             plugin and the whole route (and the selection with it) is gone.
 * 3. HEALER   Deletes a user-layer `llm-pi-ai` override that shadows the
 *             bundle layer with an empty/redundant `providers` map.
 * 4. KEY POOL Several keys share one credential reference; a request that
 *             fails for a key-attributable reason is cooled down and replayed
 *             on the next usable key.
 * 5. ROUTE    `/plugins/dsh-plugin-topdon-ai/pool` backs the in-app cards.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProvider, MODELS, MODEL_IDS, OWNED, PROVIDER_ID, stable } from './providers.mjs'
import { buildPatchText } from './patchgen.mjs'

export { announceModelsChanged }
import {
  activeKey,
  classifyFailure,
  fingerprint,
  nextKey,
  normalizePool,
  readPool,
  withActive,
  withCooldown,
  writePool,
} from './keypool.mjs'

export const inject = ['configEditor', 'credentials']

/** The credential reference the provider declares in `apiKeyEnv`. */
export const CREDENTIAL_REF = 'TOPDON_AI_API_KEY'
/** Route backing the plugin's configuration card. */
export const POOL_ROUTE = '/plugins/dsh-plugin-topdon-ai/pool'
/** Route backing the model selection card. */
export const MODELS_ROUTE = '/plugins/dsh-plugin-topdon-ai/models'
/** Route that checks for a newer version on GitHub. */
export const UPDATE_ROUTE = '/plugins/dsh-plugin-topdon-ai/update-check'
/** Route that downloads and installs the latest version from GitHub. */
export const UPDATE_INSTALL_ROUTE = '/plugins/dsh-plugin-topdon-ai/do-update'

/** GitHub raw URL — fallback when the contents API is unreachable. */
const UPSTREAM_PKG_URL =
  'https://raw.githubusercontent.com/Himzandar/dsh-plugin-topdon-ai/main/package.json'
/**
 * GitHub contents API for the same file, read as the primary source.
 *
 * The raw host is CDN-cached, so a version pushed a moment ago can still read
 * as the old one. The API reads the live object instead.
 */
const UPSTREAM_API_URL =
  'https://api.github.com/repos/Himzandar/dsh-plugin-topdon-ai/contents/package.json'

/** How long to cache a successful update check (ms). */
const UPDATE_CACHE_MS = 4 * 60 * 60 * 1000 // 4 h
let _updateCache = { checkedAt: 0, result: undefined }
/** Whether an install is currently in progress (prevents double-clicks). */
let _installing = false

const ENTRY_ID = 'llm-pi-ai'
const RETRY = Symbol('topdon-ai-pool-retry')
const MAX_ATTEMPTS = 4

// ---------------------------------------------------------------------------
// healer
// ---------------------------------------------------------------------------

function withoutProviders(config) {
  const copy = { ...(config ?? {}) }
  delete copy.providers
  return copy
}

function hasProvidersKey(config) {
  return config !== null && typeof config === 'object' && Object.hasOwn(config, 'providers')
}

/**
 * True when the user-layer override is pure shadow: it declares `providers`, and
 * every owned key in it is identical to the inherited layer's. An empty
 * `providers: {}` satisfies this (vacuous), which is the case that broke the
 * plugin.
 */
export function shadowsOnly(inherited, override) {
  const wanted = inherited?.providers ?? {}
  const have = override?.providers ?? {}
  if (!hasProvidersKey(override)) return false
  if (Object.keys(wanted).length === 0) return false
  const onlyKnownKeys = Object.keys(have).every((key) => Object.hasOwn(wanted, key))
  if (!onlyKnownKeys) return false
  const identical = Object.keys(have).every((key) => stable(have[key]) === stable(wanted[key]))
  if (!identical) return false
  return stable(withoutProviders(override)) === stable(withoutProviders(inherited))
}

function findRow(editor) {
  return editor.configuration().find((row) => row.entry?.options?.id === ENTRY_ID)
}

// ---------------------------------------------------------------------------
// model selection
// ---------------------------------------------------------------------------
//
// HOW THE SELECTION IS APPLIED
// ----------------------------
// The first attempt wrote the narrowed provider through `entry.update()`, hoping
// `providers` being a VOLATILE field would commit it into the running fiber. A
// diagnostic run under the real loader showed `update()` resolving while
// `loader/volatile-update` never fired, and the surrounding entry restarting —
// so the adapter never saw the new list and the Models page never re-read it.
//
// The selection is therefore written where the provider already lives: this
// plugin's OWN bundle patch (`cordis.patch.yml`). That file is the plugin's, not
// the profile's user layer, so uninstalling still removes the models with the
// plugin. The entry is then reloaded so `llm-pi-ai` re-resolves its providers
// and re-registers the adapter — which is what makes both the picker and the
// Models page agree with the card.

const PATCH_FILE = join(dirname(fileURLToPath(import.meta.url)), 'cordis.patch.yml')

/** Read the selection currently published by this plugin's own patch file. */
export function currentSelection(file = PATCH_FILE) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return [...MODEL_IDS]
  }
  const ids = []
  for (const line of text.split('\n')) {
    const match = /^\s{10}- id: (.+)$/.exec(line)
    if (match !== null) ids.push(match[1].trim().replace(/^'(.*)'$/, '$1'))
  }
  const known = ids.filter((id) => MODEL_IDS.includes(id))
  return known.length > 0 ? known : [...MODEL_IDS]
}

/**
 * Publish a new selection by rewriting this plugin's own bundle patch.
 *
 * The file is the part that survives: it is what a boot composes and what the
 * Models page reads back through `settings/describe`. A save that only touched
 * memory left the page and the next boot showing the old list, which is exactly
 * the desync this function removes.
 *
 * @returns the effective selection (unknown ids dropped, empty falls back to all)
 */
export function writeSelection(selectedIds, file = PATCH_FILE) {
  const wanted = new Set(Array.isArray(selectedIds) ? selectedIds : [])
  const effective = MODEL_IDS.filter((id) => wanted.has(id))
  const chosen = effective.length > 0 ? effective : [...MODEL_IDS]
  writeFileSync(file, buildPatchText(chosen), 'utf8')
  return chosen
}

/**
 * Tell every observer that the model list changed.
 *
 * WHY THIS IS NOT OPTIONAL
 * ------------------------
 * The browser's model picker does not poll. `dsh-client-ui-model-selection`
 * subscribes to a fixed set of forwarded Host events and calls
 * `catalog.refresh()` on each — `llm/adapters-updated` and `llm/models-updated`
 * among them, both declared in the `API_REMOTE_FORWARDED_EVENTS` allowlist that
 * the gateway bridges to the page.
 *
 * Neither fires on its own for a model-list change:
 * - `llm/adapters-updated` is emitted by `registerAdapter()`/`replace()`, and
 *   `llm-pi-ai` short-circuits on `registrationFacts`, which covers only the
 *   provider NAME, display name and retry policy — not the models. Our save keeps
 *   the same single route, so that fact set is unchanged and the emit never runs.
 * - `llm/models-updated` has no emitter in the shipped packages at all.
 *
 * So the picker kept the catalog it read at page load until something else
 * (switching models) forced a re-read. Emitting here is what closes that gap.
 */
function announceModelsChanged(ctx) {
  try {
    ctx.emit?.('llm/models-updated')
  } catch (error) {
    ctx.logger?.debug?.(`topdon-ai: could not announce the model change: ${error}`)
  }
}

/**
 * Push the new provider list into the running `llm-pi-ai`.
 *
 * Writing the file alone fixes the Models page and the next boot but leaves the
 * live picker stale until a restart, because the loader holds the config it
 * composed at boot. `entry.update()` is the harness's own apply path; it
 * re-resolves the entry's fiber when the config genuinely differs, which the
 * adapter's `profiles()` then reads on the next call.
 *
 * The config passed here is built from the NEW selection, not from the entry's
 * current (stale) options — passing the old value back would compare equal and
 * be dropped as a no-op.
 */
async function reloadLlmEntry(editor, selectedIds) {
  const row = findRow(editor)
  if (row === undefined) throw new Error('llm-pi-ai 没有挂载，无法应用模型选择')
  const entry = row.entry
  if (typeof entry?.update !== 'function') throw new Error('当前宿主不支持重载 llm-pi-ai')
  const current = entry.options?.config ?? {}
  const providers = { ...(current.providers ?? {}), ...buildProvider(selectedIds) }
  await entry.update({ config: { ...current, providers } })
}

// ---------------------------------------------------------------------------
// key pool
// ---------------------------------------------------------------------------

/** Mutable pool holder with a debounced, serialized persist. */
export function createStore(initial, persist = writePool) {
  let pool = normalizePool(initial)
  let pending
  let writing = Promise.resolve()
  return {
    current: () => pool,
    set(next) {
      pool = next
      pending ??= setTimeout(() => {
        pending = undefined
        writing = writing.then(() => persist(pool)).catch(() => {})
      }, 200)
      return pool
    },
    async flush() {
      if (pending !== undefined) {
        clearTimeout(pending)
        pending = undefined
      }
      await writing.catch(() => {})
    },
  }
}

/**
 * Per-key request tally, held in memory for the session.
 *
 * WHY IN MEMORY. This is a readout, not an accounting ledger: the composer pill
 * answers "how much have I used since DSH started", and a restart starting over
 * is honest. Persisting it would put a growing file in the home directory for a
 * number nobody balances books against.
 */
export function createUsage() {
  const totals = new Map()
  let requests = 0
  return {
    add(keyId, usage) {
      requests += 1
      const entry = totals.get(keyId) ?? {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }
      entry.requests += 1
      entry.inputTokens += Number(usage?.inputTokens) || 0
      entry.outputTokens += Number(usage?.outputTokens) || 0
      entry.cacheReadTokens += Number(usage?.cacheReadTokens) || 0
      entry.cacheWriteTokens += Number(usage?.cacheWriteTokens) || 0
      totals.set(keyId, entry)
      return entry
    },
    snapshot() {
      return {
        requests,
        keys: Object.fromEntries(totals),
      }
    },
  }
}

/**
 * Replay a failed request against the next key.
 *
 * `next()` may be called only once per dispatch, so the first attempt uses it
 * and every retry re-dispatches through `ctx.llm.stream()` with a marker that
 * makes this wrapper step aside. Only failures that arrive BEFORE any chunk was
 * emitted are replayed; once output is on the wire the failure is passed
 * through unchanged.
 */
export function failoverStream(ctx, options, next, store, credentials, usage) {
  return (async function* run() {
    const pool = store.current()
    const attempts = Math.max(1, Math.min(pool.keys.length, MAX_ATTEMPTS))
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const stream = attempt === 0 ? next() : ctx.llm.stream({ ...options, [RETRY]: true })
      let emitted = false
      let failure
      let lastUsage
      for await (const chunk of stream) {
        if (chunk?.type === 'usage') lastUsage = chunk.usage ?? lastUsage
        if (chunk?.type === 'finish' && chunk.reason?.kind === 'error' && !emitted) {
          failure = chunk
          break
        }
        if (chunk?.type === 'finish') {
          usage?.add(servingId(store), lastUsage)
          yield chunk
          return
        }
        emitted = true
        yield chunk
      }
      if (failure === undefined) return

      const kind = classifyFailure(failure.reason?.failure)
      const current = store.current()
      const serving = current.state.activeId ?? activeKey(current)?.id
      if (kind === 'other' || serving === undefined) {
        yield failure
        return
      }
      const replacement = nextKey(current, serving)
      if (replacement === undefined) {
        yield failure
        return
      }
      store.set(withCooldown(current, serving, kind, failure.reason?.failure))
      await credentials.set(CREDENTIAL_REF, replacement.secret)
      store.set(withActive(store.current(), replacement.id))
      ctx.logger?.warn?.(
        `topdon-ai: key "${serving}" ${kind === 'bad-key' ? 'rejected' : 'throttled'}; retrying with "${replacement.id}"`,
      )
    }
  })()
}

/** The key expected to serve a request right now, for the usage tally. */
function servingId(store) {
  const pool = store.current()
  return pool.state.activeId ?? activeKey(pool)?.id ?? 'unknown'
}

/**
 * Pass a stream through unchanged while adding its token usage to the tally.
 *
 * The single-key case still needs this: the composer pill reports tokens used,
 * and a user with one key is the most likely to care about the number.
 */
export function countingStream(next, store, usage) {
  return (async function* run() {
    let lastUsage
    for await (const chunk of next()) {
      if (chunk?.type === 'usage') lastUsage = chunk.usage ?? lastUsage
      if (chunk?.type === 'finish') {
        usage?.add(servingId(store), lastUsage)
        yield chunk
        return
      }
      yield chunk
    }
  })()
}

/** Point the shared credential at the pool's sticky key; no-op when unchanged. */
async function activate(ctx, store, credentials) {
  if (credentials === undefined) return false
  const pool = store.current()
  if (!pool.enabled || pool.keys.length === 0) return false
  const key = activeKey(pool)
  if (key === undefined) return false
  const stored = await credentials.resolve(CREDENTIAL_REF).catch(() => undefined)
  if (stored?.value !== key.secret) {
    await credentials.set(CREDENTIAL_REF, key.secret)
    ctx.logger?.debug?.(`topdon-ai: key pool selected "${key.id}"`)
  }
  return true
}

// ---------------------------------------------------------------------------
// HTTP routes (they back client.js)
// ---------------------------------------------------------------------------

function maskSecret(secret) {
  if (secret.length <= 12) return secret.slice(0, 3) + '…'
  return secret.slice(0, 6) + '…' + secret.slice(-4)
}

/** Pool state as the browser may see it: no secret is ever returned. */
export function poolView(store, usage) {
  const pool = store.current()
  const tally = usage?.snapshot() ?? { requests: 0, keys: {} }
  return {
    enabled: pool.enabled,
    active: pool.state.activeId ?? null,
    serving: activeKey(pool)?.id ?? null,
    requests: tally.requests,
    keys: pool.keys.map((key) => ({
      id: key.id,
      label: key.label,
      masked: maskSecret(key.secret),
      cooldownUntil: pool.state.cooldownUntil[key.id] ?? 0,
      usage: tally.keys[key.id] ?? { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })),
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJsonBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Apply one key-pool mutation. Pure enough to test without HTTP. */
export function applyPoolAction(store, body) {
  const pool = store.current()
  const action = String(body?.action ?? '')
  if (action === 'add') {
    const secret = String(body.secret ?? '').trim()
    if (secret.length === 0) throw new Error('API Key 不能为空')
    if (pool.keys.some((key) => key.secret === secret)) throw new Error('这个 Key 已经在池子里了')
    const id = fingerprint(secret)
    const label = String(body.label ?? '').trim() || id
    store.set({
      ...pool,
      enabled: true,
      keys: [...pool.keys, { id, label, secret }],
      state: { ...pool.state, activeId: pool.state.activeId ?? id },
    })
    return store.current()
  }
  if (action === 'remove') {
    const id = String(body.id ?? '')
    if (!pool.keys.some((key) => key.id === id)) throw new Error(`没有这个 Key：${id}`)
    const keys = pool.keys.filter((key) => key.id !== id)
    const cooldownUntil = { ...pool.state.cooldownUntil }
    delete cooldownUntil[id]
    store.set({
      ...pool,
      keys,
      state: {
        activeId: pool.state.activeId === id ? keys[0]?.id : pool.state.activeId,
        cooldownUntil,
      },
    })
    return store.current()
  }
  if (action === 'use') {
    const id = String(body.id ?? '')
    if (!pool.keys.some((key) => key.id === id)) throw new Error(`没有这个 Key：${id}`)
    store.set(withActive(pool, id))
    return store.current()
  }
  if (action === 'enable') {
    store.set({ ...pool, enabled: body.enabled !== false })
    return store.current()
  }
  throw new Error(`未知操作：${action}`)
}
/**
 * Check whether a newer version is available on GitHub.
 *
 * Returns `{ current, latest, hasUpdate }`. Caches the result for 4 h so the
 * settings card can call this route on every open without hammering GitHub.
 * Errors (network down, rate-limited, private repo) return `{ error }` and
 * the card shows nothing — a failed check is not surfaced as a warning.
 */
async function checkForUpdate({ force = false } = {}) {
  const now = Date.now()
  if (!force && _updateCache.result !== undefined && now - _updateCache.checkedAt < UPDATE_CACHE_MS) {
    return _updateCache.result
  }
  const require = createRequire(import.meta.url)
  const local = require('./package.json').version
  let upstream
  try {
    // GitHub API first, raw second.
    //
    // `raw.githubusercontent.com` is served through a CDN that can keep a
    // previous version for minutes after a push, which makes a fresh release
    // look "already up to date". The contents API reads the live git object.
    // It is anonymous-capable for a public repo (60 requests/hour is ample for
    // a 4-hour cache), and the raw URL stays as a fallback for deployments that
    // block api.github.com.
    const headers = {
      'User-Agent': `dsh-plugin-topdon-ai/${local}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    const signal = AbortSignal.timeout?.(10_000)
    let json
    try {
      const api = await fetch(UPSTREAM_API_URL, { headers, signal })
      if (api.ok) json = JSON.parse(Buffer.from((await api.json()).content, 'base64').toString('utf8'))
    } catch {}
    if (json === undefined) {
      const raw = await fetch(UPSTREAM_PKG_URL, {
        headers: { 'User-Agent': `dsh-plugin-topdon-ai/${local}`, Accept: 'application/json' },
        signal,
      })
      if (!raw.ok) return { current: local, error: `HTTP ${raw.status}` }
      json = await raw.json()
    }
    upstream = json.version
  } catch (error) {
    return { current: local, error: String(error?.message ?? error) }
  }
  if (typeof upstream !== 'string' || upstream.length === 0) {
    return { current: local, error: 'upstream package.json has no version' }
  }
  // A plain `!==` would call a DOWNGRADE an update, and the Update button would
  // then overwrite a local build with an older release. Compare the parts.
  const result = { current: local, latest: upstream, hasUpdate: isNewer(upstream, local) }
  _updateCache = { checkedAt: now, result }
  return result
}

/**
 * Semver-ish ordering for `a` newer than `b`.
 *
 * Only `major.minor.patch` with optional `-prerelease`/`+build` is needed here;
 * a prerelease sorts BELOW its release (1.2.3-rc.1 < 1.2.3), and an unparsable
 * side falls back to inequality so an unusual tag is still offered.
 */
export function isNewer(a, b) {
  const parse = (text) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?/.exec(String(text).trim())
    if (match === null) return undefined
    return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] }
  }
  const left = parse(a)
  const right = parse(b)
  if (left === undefined || right === undefined) return a !== b
  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] !== right.parts[index]) return left.parts[index] > right.parts[index]
  }
  if (left.pre === right.pre) return false
  if (left.pre === undefined) return true
  if (right.pre === undefined) return false
  return left.pre > right.pre
}

/**
 * Pull the latest release from GitHub and apply it in place.
 *
 * WHY IN-PLACE AND NOT A RE-INSTALL
 * ---------------------------------
 * This plugin is installed into the profile as a LINK to its working copy, so
 * the bytes the host loaded live in the same directory this module was loaded
 * from. Writing the new files there is the whole update: a re-install through
 * the package manager would move the profile back to a registry copy and lose
 * that link, which is worse than not updating at all.
 *
 * WHAT IS PRESERVED
 * -----------------
 * `cordis.patch.yml` carries the user's model SELECTION, not just the catalog,
 * and the settings card rewrites it on every save. A naive overwrite would
 * silently re-enable every model the user had turned off. The incoming catalog
 * and the current selection are therefore merged: the new file is generated
 * from the NEW `providers.mjs`, narrowed to the models the user already had on.
 *
 * The client half is picked up by the host's bundle watch (HMR); the host half
 * needs the entry to restart, which the caller triggers through `pluginManager`
 * when it is reachable.
 *
 * @returns `{ ok, message, version?, reload? }`
 */
async function installUpdate(ctx) {
  if (_installing) return { ok: false, message: '正在更新中，请稍候…' }
  _installing = true
  const require = createRequire(import.meta.url)
  const local = require('./package.json').version
  const installDir = dirname(fileURLToPath(import.meta.url))
  const ua = `dsh-plugin-topdon-ai/${local}`
  const rawHeaders = { 'User-Agent': ua }

  /**
   * Files that make up the plugin, per `files` in package.json plus the patch.
   * The test scripts and build helpers are deliberately excluded: they are not
   * shipped and a partial upstream set must not delete anything locally.
   */
  const UPDATABLE = new Set([
    'index.js',
    'client.js',
    'providers.mjs',
    'keypool.mjs',
    'pool.mjs',
    'patchgen.mjs',
    'cordis.patch.yml',
    'icon.svg',
    'README.md',
    'package.json',
  ])

  try {
    const signal = AbortSignal.timeout?.(60_000)

    /**
     * Raw first, contents API only as a fallback.
     *
     * The anonymous contents API allows 60 requests per HOUR per address, and
     * the settings card's update check already spends one each time it looks.
     * Driving the whole download through it made a 403 about as likely as a
     * successful update. `raw.githubusercontent.com` has no such budget for a
     * public repo, and the file names are fixed by `package.json`, so the exact
     * set can be fetched directly without a directory listing.
     */
    const UPSTREAM_RAW_ROOT = 'https://raw.githubusercontent.com/Himzandar/dsh-plugin-topdon-ai/main/'
    const staged = new Map()

    const fetchText = async (relative) => {
      const res = await fetch(UPSTREAM_RAW_ROOT + relative, { headers: rawHeaders, signal })
      if (!res.ok) throw new Error(`下载 ${relative} 失败：HTTP ${res.status}`)
      return res.text()
    }

    for (const name of UPDATABLE) {
      staged.set(name, await fetchText(name))
    }
    // Locale resources: fixed, small, and optional.
    for (const name of ['locale/zh.json', 'locale/en.json']) {
      try {
        staged.set(name, await fetchText(name))
      } catch {
        // A release without locale files must not fail the update.
      }
    }
    if (!staged.has('index.js') || !staged.has('package.json')) {
      throw new Error('上游仓库缺少 index.js 或 package.json，已中止更新')
    }

    // Publish. The patch is handled last and separately, because it is the one
    // file whose content is user state rather than upstream code.
    for (const [name, text] of staged) {
      if (name === 'cordis.patch.yml') continue
      if (name.startsWith('locale/')) {
        const dir = join(installDir, 'locale')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, name.slice('locale/'.length)), text, 'utf8')
      } else {
        writeFileSync(join(installDir, name), text, 'utf8')
      }
    }

    // Re-generate the patch from the NEW catalog, keeping the user's selection.
    let kept = []
    try {
      const fresh = await import(`./providers.mjs?update=${Date.now()}`)
      const known = fresh.MODEL_IDS ?? []
      const before = currentSelection()
      kept = before.filter((id) => known.includes(id))
      // The generator lives in patchgen.mjs, not providers.mjs; reload it too so
      // the emitted document matches the new catalog's shape.
      const generator = await import(`./patchgen.mjs?update=${Date.now()}`)
      let text
      try {
        text = generator.buildPatchText(kept.length > 0 ? kept : known)
      } catch {
        // buildPatchText reads providers.mjs through the SAME specifier this
        // module already loaded, so an upstream shape change can surface here.
        text = undefined
      }
      const wanted = kept.length > 0 ? kept : known
      const generated = text ?? fresh.buildPatchText?.(wanted)
      if (typeof generated !== 'string' || generated.length === 0) {
        throw new Error('could not regenerate cordis.patch.yml')
      }
      writeFileSync(join(installDir, 'cordis.patch.yml'), generated, 'utf8')
    } catch (patchError) {
      // Keep whatever upstream shipped rather than leaving a stale local patch.
      const shipped = staged.get('cordis.patch.yml')
      if (shipped !== undefined) writeFileSync(join(installDir, 'cordis.patch.yml'), shipped, 'utf8')
      ctx.logger?.warn?.(`topdon-ai: patch regeneration failed (${patchError}); used the upstream patch`)
    }

    _updateCache = { checkedAt: 0, result: undefined }

    // Publish the new CLIENT bytes to open pages.
    //
    // `clientModules.rebuilt(id)` is the HMR hook: it re-reads this package's
    // client bundle and bumps the graph rev, which is what makes an open page
    // load the new `client.js` instead of the one it booted with. Re-installing
    // through `pluginManager` is deliberately NOT used here — this plugin lives
    // in the profile as a LINK to the directory being written, so the package
    // manager would answer `already-installed` and change nothing.
    let clientReloaded = false
    try {
      const modules = ctx.get?.('clientModules')
      if (modules !== undefined && typeof modules.rebuilt === 'function') {
        clientReloaded = modules.rebuilt('dsh-plugin-topdon-ai') !== undefined
      }
    } catch (reloadError) {
      ctx.logger?.warn?.(`topdon-ai: could not publish the new client bundle: ${reloadError}`)
    }

    // The HOST half is the one that still needs a restart: this module's code is
    // already in memory, and no loader API swaps a running entry's module. The
    // message says so rather than pretending a refresh is enough.
    const next = JSON.parse(staged.get('package.json')).version ?? '?'
    return {
      ok: true,
      version: next,
      clientReloaded,
      message: clientReloaded
        ? `已更新到 ${next}。页面稍后会自动加载新界面；网关本体要在重启 DSH 后生效。`
        : `已更新到 ${next}。请刷新页面；网关本体要在重启 DSH 后生效。`,
    }
  } catch (error) {
    ctx.logger?.warn?.(`topdon-ai: installUpdate failed: ${error}`)
    return { ok: false, message: String(error?.message ?? error) }
  } finally {
    _installing = false
  }
}

/** Register one exact-path JSON route on the host webserver. */
function registerRoute(ctx, path, handler) {  ctx.inject(['webServer'], (child) => {
    child.effect(() =>
      child.webServer.register({
        kind: 'exact',
        path,
        handler: async (req, res) => {
          if (!isLoopback(req)) return sendJson(res, 403, { error: 'loopback only' })
          try {
            return await handler(req, res)
          } catch (error) {
            ctx.logger?.warn?.(`topdon-ai: ${path} failed: ${error}`)
            return sendJson(res, 400, { error: String(error?.message ?? error) })
          }
        },
      }),
    )
  })
}

// ---------------------------------------------------------------------------
// plugin entry
// ---------------------------------------------------------------------------

/**
 * @param ctx  plugin context; needs `configEditor`, `credentials`, `effect`
 * @param config  row config from cordis.patch.yml. `heal: false` disables the
 *                override repair, `pool: false` the key pool, `models: false`
 *                the model-selection card.
 */
export function apply(ctx, config = {}) {
  const heal = config.heal !== false
  const poolEnabled = config.pool !== false
  const modelsEnabled = config.models !== false
  const editor = ctx.configEditor
  const credentials = ctx.credentials
  let disposed = false
  let attempts = 0
  let timer

  const sync = async () => {
    if (disposed || !heal) return
    attempts += 1
    try {
      const row = findRow(editor)
      if (row === undefined) return
      if (!shadowsOnly(row.inherited, row.override)) return
      await editor.edit(row.entry, () => structuredClone(row.inherited))
      ctx.logger?.debug?.('topdon-ai: removed a profile override that hid the bundle providers')
    } catch (error) {
      if (attempts < 8 && !disposed) timer = setTimeout(sync, 1000)
      else ctx.logger?.debug?.(`topdon-ai: heal gave up: ${error}`)
    }
  }

  timer = setTimeout(sync, 300)

  let store
  // `inject`/`effect` are plugin-context services; a bare test double skips the
  // routes and pool so the healer stays independently testable.
  const hosted = typeof ctx.inject === 'function' && typeof ctx.effect === 'function'

  if (modelsEnabled && hosted) {
    registerRoute(ctx, MODELS_ROUTE, async (req, res) => {
      if (req.method === 'GET') {
        return sendJson(res, 200, {
          provider: PROVIDER_ID,
          models: currentSelection(),
          catalog: MODEL_IDS,
          names: MODELS.map((model) => model.name),
        })
      }
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      const body = await readJsonBody(req)
      const wanted = Array.isArray(body?.models) ? body.models : []
      if (wanted.length === 0) throw new Error('至少要保留一个模型')
      const unknown = wanted.filter((id) => !MODEL_IDS.includes(id))
      if (unknown.length > 0) throw new Error(`未知模型：${unknown.join(', ')}`)
      const effective = writeSelection(wanted)
      await reloadLlmEntry(editor, effective)
      announceModelsChanged(ctx)
      ctx.logger?.debug?.(`topdon-ai: published ${effective.length} models`)
      return sendJson(res, 200, {
        provider: PROVIDER_ID,
        models: currentSelection(),
        catalog: MODEL_IDS,
      })
    })

    registerRoute(ctx, UPDATE_ROUTE, async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
      // `?force=1` skips the 4h cache. The settings card uses it for an explicit
      // "check now", and it is what makes a just-pushed release visible without
      // restarting the host.
      const force = /[?&]force=1\b/.test(req.url ?? '')
      return sendJson(res, 200, await checkForUpdate({ force }))
    })

    registerRoute(ctx, UPDATE_INSTALL_ROUTE, async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      const result = await installUpdate(ctx)
      return sendJson(res, result.ok ? 200 : 500, result)
    })
  }

  const usage = poolEnabled ? createUsage() : undefined

  if (poolEnabled && hosted) {
    registerRoute(ctx, POOL_ROUTE, async (req, res) => {
      if (req.method === 'GET') return sendJson(res, 200, poolView(store, usage))
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      if (store === undefined) throw new Error('key pool is still loading')
      applyPoolAction(store, await readJsonBody(req))
      await writePool(store.current())
      await activate(ctx, store, credentials)
      return sendJson(res, 200, poolView(store, usage))
    })

    void (async () => {
      try {
        const raw = await readPool()
        // No file yet: start from an empty pool so the card can create it.
        store = createStore(raw ?? { enabled: true, keys: [] })
        if (disposed) return
        await activate(ctx, store, credentials)
        if (credentials !== undefined && typeof ctx.on === 'function') {
          ctx.on('llm/stream', (options, next) => {
            if (options?.[RETRY]) return next()
            if (store === undefined || !store.current().enabled) return next()
            const provider = options?.provider
            if (typeof provider === 'string' && provider !== PROVIDER_ID) return next()
            // One key needs no failover, but its tokens still count: the tally
            // is what the composer pill shows, so it runs even with a single key.
            if (store.current().keys.length < 2) return countingStream(next, store, usage)
            return failoverStream(ctx, options, next, store, credentials, usage)
          })
        }
      } catch (error) {
        ctx.logger?.warn?.(`topdon-ai: key pool unavailable: ${error}`)
      }
    })()
  }

  // Cleanup is deliberately write-free except for flushing pool state.
  ctx.effect(() => () => {
    disposed = true
    clearTimeout(timer)
    void store?.flush()
  })
}

export { OWNED, PROVIDER_ID }
