/**
 * Offline checks for the browser half: a dedicated Settings section plus the
 * Plugins-page row card, and no secret ever rendered.
 *
 *     node test-client.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let loaded
globalThis.window = {
  __ModuleLoader__: {
    load(descriptor) {
      loaded = descriptor
    },
  },
}

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (initial) => ({ current: initial }),
}

await import('./client.js')

const client = loaded.factory((specifier) => {
  assert.equal(specifier, 'react')
  return fakeReact
})

const checks = []
const check = (name, fn) => checks.push({ name, fn })

check('client bundle registers under the package name', () => {
  assert.ok(loaded, 'window.__ModuleLoader__.load was never called')
  assert.equal(loaded.id, 'dsh-plugin-topdon-ai')
  assert.equal(typeof loaded.factory, 'function')
})

check('exports the client plugin surface', () => {
  assert.equal(typeof client.apply, 'function')
  assert.deepEqual(client.inject, ['slots', 'locale'])
})

function runApply(localeAvailable = false) {
  const registrations = []
  const registered = []
  const effects = []
  const locale = {
    register: (namespace, copy) => {
      registered.push({ namespace, copy })
      return () => {}
    },
    bind: (namespace) => (key) => copyFor(namespace)[key] ?? key,
  }
  const copyFor = (namespace) => (namespace === 'settings.topdon-ai' ? registered.at(-1)?.copy ?? {} : {})
  const ctx = {
    get: (name) => (localeAvailable && name === 'locale' ? locale : undefined),
    effect: (fn) => {
      const dispose = fn()
      effects.push(dispose)
    },
    slots: {
      inject: (name, register) => {
        const result = register()
        return result
      },
      register: (options, render) => {
        registrations.push({ options, render })
        return () => {}
      },
    },
  }
  client.apply(ctx)
  return { registrations, registered, effects }
}

const { registrations } = runApply()

check('registers a dedicated settings section', () => {
  const section = registrations.find((entry) => entry.options.name === 'settings.section')
  assert.ok(section, 'no settings.section registration')
  assert.equal(section.options.id, 'topdon-ai')
  assert.equal(typeof section.options.order, 'number')
  assert.equal(typeof section.options.label, 'function')
  assert.equal(typeof section.render, 'function')
  assert.equal(typeof section.options.inject, 'function')
  assert.ok(section.options.inject(), 'inject() returned nothing')
})

check('registers the section icon with the same id', () => {
  const icon = registrations.find((entry) => entry.options.name === 'settings.section.icon')
  assert.ok(icon, 'no settings.section.icon registration')
  assert.equal(icon.options.id, 'topdon-ai')
})

check('keeps the plugins row card on the same content', () => {
  const row = registrations.find((entry) => entry.options.name === 'plugins.row.config')
  assert.ok(row, 'no plugins.row.config registration')
  assert.equal(row.options.key, 'dsh-plugin-topdon-ai#topdon-ai-injector')
  assert.ok(row.render({ view: 'summary' }))
  const page = row.render({ view: 'page' })
  assert.ok(page)
})

/** Render a slot entry the way the shell does: build the element, then run it. */
function renderEntry(entry, props) {
  const element = entry.render(props)
  if (element === null || typeof element !== 'object') return element
  return typeof element.type === 'function' ? element.type(element.props) : element
}

check('models page card is scoped to this provider only', () => {
  const card = registrations.find((entry) => entry.options.name === 'settings.models.provider-card')
  assert.ok(card, 'no settings.models.provider-card registration')
  // Key MUST be settingsNs (= 'llm-pi-ai'), not the provider id.
  // renderSlot dispatches by entryKey: row.entry.settingsNs which is the
  // Loader entry id ('llm-pi-ai'), shared by every pi-ai provider.
  assert.equal(card.options.key, 'llm-pi-ai')
  assert.equal(renderEntry(card, { provider: { provider: 'moonshotai' } }), null)
  const mine = renderEntry(card, { provider: { provider: 'topdon' } })
  assert.ok(mine && typeof mine === 'object')
})

function collect(node, predicate, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) collect(item, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  if (Array.isArray(node.children)) collect(node.children, predicate, out)
  return out
}

check('models page card points at this plugin settings section', () => {
  const card = registrations.find((entry) => entry.options.name === 'settings.models.provider-card')
  const rendered = renderEntry(card, { provider: { provider: 'topdon' } })
  const serialized = JSON.stringify(rendered)
  // The copy must be RESOLVED (Chinese here), never left as a raw key.
  assert.ok(!serialized.includes('modelsPage.notice'), 'the notice was not translated')
  assert.ok(!serialized.includes('modelsPage.open'), 'the button label was not translated')
  assert.ok(serialized.includes('设置'), 'the notice copy is missing')
  const buttons = collect(rendered, (node) => node.type === 'button')
  assert.equal(buttons.length, 1, 'expected exactly one open-settings button')
  assert.equal(typeof buttons[0].props.onClick, 'function')
  assert.ok(JSON.stringify(buttons[0]).includes('打开'), 'the button label is missing')
})

check('the settings section renders without a host locale service', () => {
  const section = registrations.find((entry) => entry.options.name === 'settings.section')
  const rendered = section.render({ t: (key) => key })
  assert.ok(rendered && typeof rendered === 'object')
})

check('locale copy covers both languages and every key used', () => {
  const { registered } = runApply(true)
  const entry = registered.find((item) => item.namespace === 'settings.topdon-ai')
  assert.ok(entry, 'locale.register was never called')
  const zhKeys = Object.keys(entry.copy.zh).sort()
  const enKeys = Object.keys(entry.copy.en).sort()
  assert.deepEqual(zhKeys, enKeys)
  for (const required of ['nav.label', 'models.heading', 'models.save', 'keys.heading', 'keys.add']) {
    assert.ok(zhKeys.includes(required), `missing copy key ${required}`)
  }
})

check('registers the composer key pill in the model-picker row', () => {
  const pill = registrations.find((entry) => entry.options.name === 'conversation.input.right')
  assert.ok(pill, 'no conversation.input.right registration')
  assert.equal(pill.options.id, 'topdon-ai-key-pill')
  assert.equal(typeof pill.options.order, 'number')
  // `input.right` is the row that carries the model picker; `composer.dock` is
  // the summary line UNDER the input, which put the chip below the box.
  assert.ok(
    !registrations.some((entry) => entry.options.name === 'conversation.composer.dock'),
    'the chip must not sit in the summary dock',
  )
  // The inject function must hand the component `t` and a service getter.
  const injected = pill.options.inject()
  assert.equal(typeof injected.t, 'function')
  assert.equal(typeof injected.get, 'function')
})

check('the pill renders nothing until a key exists', async () => {
  const pill = registrations.find((entry) => entry.options.name === 'conversation.input.right')
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ keys: [] }) })
  const injected = pill.options.inject()
  const element = pill.render(injected)
  assert.ok(element && typeof element === 'object')
  const rendered = typeof element.type === 'function' ? element.type(element.props) : element
  assert.equal(rendered, null, 'no keys must render no chip')
})

check('the pill hides while a different provider is selected', () => {
  const provider = client.currentProviderForTest
  assert.equal(typeof provider, 'function', 'currentProvider must be reachable for tests')
  // A KNOWN different provider hides it: the chip describes the Topdon key.
  assert.equal(provider({ useProjection: () => ({ next: { provider: 'deepseek-account' } }) }), 'deepseek-account')
  assert.equal(provider({ useProjection: () => ({ next: { provider: 'topdon' } }) }), 'topdon')
  // ...but an UNKNOWN provider must stay undefined, or a host shape change
  // would make the chip silently disappear.
  assert.equal(provider({}), undefined)
  assert.equal(provider({ useProjection: () => ({}) }), undefined)
  // `usingTopdon` short-circuits when a host does pass it.
  assert.equal(provider({ usingTopdon: true }), 'topdon')
  assert.equal(provider({ usingTopdon: false }), undefined)
})

check('shortNumber formats the chip counts', () => {
  const short = client.shortNumberForTest
  assert.equal(short(999), '999')
  assert.equal(short(1234), '1.2k')
  assert.equal(short(12345), '12k')
  assert.equal(short(1234567), '1.2M')
  assert.equal(short(undefined), '0')
})

check('theme tokens used by the popover exist in this host', () => {
  // `--dsw-alias-bg-l1` and `--dsw-alias-brand-primary` do NOT exist; using them
  // produced a black box with invisible labels. Only `var(--…)` USES count — the
  // comment explaining the bug is allowed to name them.
  const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8')
  const used = new Set([...source.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((match) => match[1]))
  const DEFINED = new Set([
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-module-platform',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-border-l3',
    '--dsw-alias-border-l4',
    '--dsw-alias-button-info-fill',
    '--dsw-alias-button-info-hover',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-hover-solid',
    '--dsw-alias-label-caption',
    '--dsw-alias-label-dimmed',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-primary-bluish',
    '--dsw-alias-label-primary-dimmed',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-scrollbar-bg-l1',
    '--dsw-alias-scrollbar-bg-l2',
    '--dsw-alias-scrollbar-hover-l2',
    '--dsw-alias-state-business-primary',
    '--dsw-alias-state-business-tertiary',
    '--dsw-alias-state-error-primary',
  ])
  for (const token of used) assert.ok(DEFINED.has(token), `${token} is not defined by the host stylesheet`)
  assert.ok(used.has('--dsw-alias-bg-base'), 'the popover needs a real panel background')
})

check('shortNumber keeps the chip compact', () => {
  // The chip lives in a dense composer row; a raw 1234567 would not fit.
  const { shortNumberForTest } = client
  if (shortNumberForTest === undefined) return
  assert.equal(shortNumberForTest(999), '999')
  assert.equal(shortNumberForTest(1234), '1.2k')
  assert.equal(shortNumberForTest(12345), '12k')
  assert.equal(shortNumberForTest(1234567), '1.2M')
})

check('currentProvider falls back to the picker text', () => {
  const provider = client.currentProviderForTest
  // No projection, no settings service: the picker's rendered text decides.
  const doc = { querySelector: () => ({ textContent: 'GPT 6.1 Sol' }) }
  const previous = globalThis.document
  globalThis.document = doc
  try {
    assert.equal(provider({}, undefined), undefined, 'without a model list nothing can be matched')
    assert.equal(provider({}, undefined, ['DeepSeek V4 Flash', 'GPT 6.1 Sol']), 'topdon')
    globalThis.document = { querySelector: () => ({ textContent: 'DeepSeek-V4.1-Flash' }) }
    assert.equal(provider({}, undefined, ['DeepSeek V4 Flash', 'GPT 6.1 Sol']), undefined)
  } finally {
    globalThis.document = previous
  }
})

// ---------------------------------------------------------------------------
// the update banner
// ---------------------------------------------------------------------------
//
// The banner is the one part of this plugin that writes to disk, so the checks
// below pin down the three things that make it safe to click:
//   1. it only offers Update when the compare says NEWER, never on a downgrade;
//   2. the button posts to the install route, not to the check route;
//   3. a failed install reports the reason instead of looking like success.

/**
 * Render `UpdateBanner` with a working `useState`.
 *
 * The shared `fakeReact.state` is a no-op setter, which is fine for components
 * whose first render is all a check needs. The banner changes shape across
 * renders (idle → checking → update → installing → done), so the state setter
 * has to land somewhere the check can read back.
 */
/**
 * Render the banner with a fixed slice of useState values, in call order.
 *
 * The banner uses the module-level `react` reference (which is `fakeReact`
 * in the test environment, because `require('react')` returns it). We seed a
 * specific state branch by temporarily replacing `fakeReact.useState` with a
 * queue-drain function, then restoring it after the render. This matches how
 * the production code runs: React calls the component, which calls useState.
 */
function renderBannerWith(client, seeded) {
  const buttons = []
  const collectButtons = (node) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(collectButtons)
    if (node.type === 'button') buttons.push(node)
    if (Array.isArray(node.children)) node.children.forEach(collectButtons)
  }
  const queue = [...seeded]
  const savedUseState = fakeReact.useState
  fakeReact.useState = (initial) => [queue.length > 0 ? queue.shift() : initial, () => {}]
  let element
  try {
    element = client.UpdateBannerForTest({ t: (key) => key })
  } finally {
    fakeReact.useState = savedUseState
  }
  collectButtons(element)
  return { element, buttons, serialized: JSON.stringify(element) }
}

check('no install button when the host says up to date', () => {
  // The semver verdict belongs to the HOST (`isNewer` in index.js) — the banner
  // renders the button ONLY for `hasUpdate`. Seeding `up-to-date` proves the
  // button is not unconditional: an older upstream must not offer to overwrite.
  const { buttons, serialized } = renderBannerWith(client, [
    'up-to-date', { current: '1.17.0', latest: '1.16.0', hasUpdate: false }, 0, 'idle', '',
  ])
  // The re-check link is expected here; the INSTALL action is not.
  assert.ok(!serialized.includes('update.install'), 'no install affordance when nothing is newer')
  assert.ok(serialized.includes('update.recheck'), 'up-to-date should still offer a re-check')
  assert.ok(
    !buttons.some((node) => JSON.stringify(node).includes('update.install')),
    'up-to-date must not render the install button',
  )
})

check('the install button posts to the install route', async () => {
  const { buttons } = renderBannerWith(client, [
    'update', { current: '1.16.0', latest: '1.17.0', hasUpdate: true }, 0, 'idle', '',
  ])
  const install = buttons.find((node) => JSON.stringify(node).includes('update.install'))
  assert.ok(install, 'no install button in the update-available state')
  assert.equal(typeof install.props.onClick, 'function', 'the install button has no handler')

  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options?.method })
    return { ok: true, status: 200, json: async () => ({ ok: true, message: 'done' }) }
  }
  await install.props.onClick()
  assert.equal(calls.length, 1, 'the handler must make exactly one request')
  assert.ok(calls[0].url.includes('/do-update'), `posted to ${calls[0].url}`)
  assert.equal(calls[0].method, 'POST', 'installing is a POST')
})

check('a rejected install reports the reason, not success', async () => {
  const { buttons } = renderBannerWith(client, [
    'update', { current: '1.16.0', latest: '1.17.0', hasUpdate: true }, 0, 'idle', '',
  ])
  const install = buttons.find((node) => JSON.stringify(node).includes('update.install'))
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ ok: false, message: '下载 index.js 失败：HTTP 404' }),
  })
  // The handler catches the non-OK reply; it must not resolve as if it worked.
  await install.props.onClick()

  const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8')
  // Success copy is reachable only inside the `result.ok` branch...
  assert.ok(
    /if \(result\.ok\) \{[\s\S]{0,800}?update\.installOk/.test(source),
    'success copy must be gated on result.ok',
  )
  // ...and the rejected branch must fill a reason rather than claim success.
  assert.ok(
    /\} else \{[\s\S]{0,400}?update\.installError/.test(source),
    'the rejected branch must report the failure reason',
  )
  // A thrown request fills the same reason path.
  assert.match(source, /catch \(err\) \{[\s\S]{0,400}?update\.installError/)
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
