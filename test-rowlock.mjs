/**
 * Checks the Models-page row lock: the host's own Edit/Remove controls must be
 * hidden for THIS row only, and only while our card is present.
 *
 * The rule is verified against a hand-built DOM that mirrors the host's markup
 * (li.rowCard > div.rowHead > span.rowActions), using a tiny `:has()` evaluator,
 * because jsdom is not a dependency of this package.
 *
 *     node test-rowlock.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let loaded
const injectedStyles = []

function makeElement(tag, attributes = {}, children = []) {
  return {
    tag,
    attributes,
    children,
    className: attributes.class ?? '',
    textContent: '',
    id: attributes.id,
  }
}

const fakeDocument = {
  getElementById: (id) => injectedStyles.find((style) => style.id === id) ?? null,
  createElement: (tag) => makeElement(tag),
  head: {
    appendChild(node) {
      injectedStyles.push(node)
      return node
    },
  },
}

globalThis.document = fakeDocument
globalThis.window = {
  __ModuleLoader__: { load: (descriptor) => (loaded = descriptor) },
}
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ models: [] }) })

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (fn) => {
    // Run effects eagerly so style injection is observable.
    try {
      fn()
    } catch {}
  },
}

await import('./client.js')
const client = loaded.factory(() => fakeReact)

const checks = []
const check = (name, fn) => checks.push({ name, fn })

/** Minimal descendant search by tag + class. */
function descendants(node, out = []) {
  for (const child of node.children ?? []) {
    if (child && typeof child === 'object') {
      out.push(child)
      descendants(child, out)
    }
  }
  return out
}

/** Does `li` contain an element carrying the marker attribute? */
function hasMarker(li) {
  return descendants(li).some((node) => node.attributes && Object.hasOwn(node.attributes, 'data-topdon-ai-managed'))
}

/** The exact rule the plugin injects, applied to a row. */
function hidesActions(li) {
  const isRowCard = li.tag === 'li' && li.className.split(/\s+/).includes('jrmgQW_rowCard')
  if (!isRowCard) return false
  if (!hasMarker(li)) return false
  const actions = descendants(li).filter(
    (node) => node.tag === 'span' && node.className.split(/\s+/).includes('jrmgQW_rowActions'),
  )
  return actions.length > 0
}

// Build the card once so its effect injects the stylesheet.
const card = client.apply
const ctx = {
  get: (name) => (name === 'locale' ? undefined : undefined),
  effect: (fn) => {
    const dispose = fn()
    return dispose
  },
  slots: {
    inject: (name, register) => register(),
    register: (options, render) => {
      ctx.last = { options, render }
      return () => {}
    },
  },
}
client.apply(ctx)

/** The registered card renderer, wrapped by the locale binder. */
function renderModelsCard(props) {
  const registrations = []
  const capture = {
    get: () => undefined,
    effect: (fn) => {
      try {
        fn()
      } catch {}
      return () => {}
    },
    slots: {
      inject: (name, register) => register(),
      register: (options, render) => {
        registrations.push({ options, render })
        return () => {}
      },
    },
  }
  client.apply(capture)
  const entry = registrations.find((item) => item.options.name === 'settings.models.provider-card')
  const element = entry.render(props)
  if (element === null) return null
  return typeof element.type === 'function' ? element.type(element.props) : element
}

check('a row carrying the card is recognised as ours', () => {
  const card = renderModelsCard({ provider: { provider: 'topdon' } })
  assert.ok(card, 'card did not render')
  const marked = makeElement('div', { 'data-topdon-ai-managed': '', style: {} }, card.children ?? [])
  const row = makeElement('li', { class: 'jrmgQW_rowCard' }, [
    makeElement('div', { class: 'jrmgQW_rowHead' }, [
      makeElement('span', { class: 'jrmgQW_rowActions' }, []),
    ]),
    marked,
  ])
  assert.equal(hidesActions(row), true, 'the action buttons should be hidden on our row')
})

check('another provider row keeps its buttons', () => {
  const row = makeElement('li', { class: 'jrmgQW_rowCard' }, [
    makeElement('div', { class: 'jrmgQW_rowHead' }, [
      makeElement('span', { class: 'jrmgQW_rowActions' }, []),
    ]),
  ])
  assert.equal(hidesActions(row), false, 'an unmarked row must keep its buttons')
})

check('the card renders nothing for a foreign provider', () => {
  assert.equal(renderModelsCard({ provider: { provider: 'moonshotai' } }), null)
})

check('the injected stylesheet is scoped with :has and the marker', () => {
  assert.ok(injectedStyles.length > 0, 'no stylesheet was injected')
  const css = injectedStyles.map((style) => style.textContent ?? '').join('\n')
  assert.match(css, /:has\(\[data-topdon-ai-managed\]\)/)
  assert.match(css, /jrmgQW_rowActions/)
  assert.match(css, /jrmgQW_rowCard/)
  // A global rule would hide every row's buttons — the failure this guards.
  assert.ok(!/\n\s*span\.jrmgQW_rowActions\s*\{/.test(css), 'the rule must not be global')
})

check('the card advertises the real editor', () => {
  const rendered = renderModelsCard({ provider: { provider: 'topdon' } })
  const text = JSON.stringify(rendered)
  assert.ok(text.includes('设置'), 'the notice copy is missing')
  assert.ok(text.includes('打开'), 'the open-settings control is missing')
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
