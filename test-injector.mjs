/**
 * Offline checks for the host half: override healing, model selection over the
 * volatile `providers` field, and the key pool.
 *
 *     node test-injector.mjs
 */
import assert from 'node:assert/strict'
import { apply, shadowsOnly } from './index.js'
import { buildProvider, MODEL_IDS, MODELS, OWNED, PROVIDER_ID, stable } from './providers.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => (value === undefined ? undefined : structuredClone(value))

function makeEditor({ inherited, override }) {
  const entry = { options: { id: 'llm-pi-ai', config: clone(override) } }
  const edits = []
  const updates = []
  // Mimic `EntryLoaderEntry.update`: merge the new options, and because
  // `providers` is a VOLATILE `llm-pi-ai` field, commit without a restart.
  entry.update = async (options) => {
    updates.push(clone(options))
    for (const [key, value] of Object.entries(options)) entry.options[key] = value
  }
  return {
    entry,
    edits,
    updates,
    editor: {
      entries: () => [entry],
      configuration: () => [{ entry, inherited: clone(inherited), override: clone(override) }],
      edit: async (target, change) => {
        edits.push(clone(override))
        target.options.config = change(clone(target.options.config), clone(inherited))
      },
    },
  }
}

async function run(editor, { config = {}, wait = 450, disposeEarly = false } = {}) {
  const disposers = []
  const ctx = { configEditor: editor, effect: (fn) => disposers.push(fn()) }
  apply(ctx, config)
  if (disposeEarly) disposers.forEach((fn) => fn())
  await sleep(wait)
}

const checks = []
const check = (name, fn) => checks.push({ name, fn })

// --- provider shape -------------------------------------------------------

check('one provider carries all 18 models', () => {
  const providers = buildProvider()
  assert.deepEqual(Object.keys(providers), [PROVIDER_ID])
  const provider = providers[PROVIDER_ID]
  assert.equal(provider.api, 'anthropic-messages')
  assert.equal(provider.apiKeyEnv, 'TOPDON_AI_API_KEY')
  assert.equal(provider.models.length, 18)
  assert.equal(MODEL_IDS.length, 18)
  assert.deepEqual(OWNED, ['topdon'])
  // The host rejects unknown fields, so the plugin's own grouping tag must go.
  for (const model of provider.models) assert.ok(!('family' in model), `family leaked on ${model.id}`)
})

check('model ids are unique and grouped into the five families', () => {
  assert.equal(new Set(MODEL_IDS).size, MODEL_IDS.length)
  const families = new Set(MODELS.map((model) => model.family))
  assert.deepEqual([...families].sort(), ['claude', 'deepseek', 'gemini', 'gpt', 'qwen'])
})

check('buildProvider honours a selection and keeps catalog order', () => {
  const picked = ['claude-opus-4-8_image_thinking', 'deepseek-v4-flash', 'gpt-6.1-sol']
  const provider = buildProvider(picked)[PROVIDER_ID]
  assert.deepEqual(
    provider.models.map((model) => model.id),
    MODEL_IDS.filter((id) => picked.includes(id)),
  )
})

// --- selection ------------------------------------------------------------
// --- selection ------------------------------------------------------------
//
// The selection contract changed after a diagnostic run under the real loader
// proved `entry.update()` re-resolves the fiber but writes NO file: the Models
// page and the next boot kept reading the old list. The selection is now
// written to this plugin's own bundle patch AND pushed into the live entry.
// These cases live in test-selection.mjs; the healer cases below stay here.

// --- healer ---------------------------------------------------------------

check('empty providers override is cleared', async () => {
  const { editor, edits } = makeEditor({ inherited: { providers: buildProvider() }, override: { providers: {} } })
  await run(editor)
  assert.equal(edits.length, 1)
  assert.equal(stable(makeEditor({}).entry.options.config ?? {}), '{}')
})

check('no override at all is left alone', async () => {
  const { editor, edits } = makeEditor({ inherited: { providers: buildProvider() }, override: {} })
  await run(editor)
  assert.equal(edits.length, 0)
})

check('byte-identical override is deduplicated', async () => {
  const providers = buildProvider()
  const { editor, edits } = makeEditor({ inherited: { providers: clone(providers) }, override: { providers } })
  await run(editor)
  assert.equal(edits.length, 1)
})

check('foreign provider in the override is respected', async () => {
  const { editor, edits } = makeEditor({
    inherited: { providers: buildProvider() },
    override: { providers: { mine: { displayName: 'mine', models: [] } } },
  })
  await run(editor)
  assert.equal(edits.length, 0)
})

check('different value for the owned provider is respected', async () => {
  const errors = []
  const { editor, edits } = makeEditor({
    inherited: { providers: buildProvider() },
    override: { providers: { topdon: { ...buildProvider().topdon, displayName: 'custom' } } },
  })
  await run(editor)
  assert.equal(edits.length, 0)
  assert.deepEqual(errors, [])
})

check('other llm-pi-ai settings block the clear', async () => {
  const { editor, edits } = makeEditor({
    inherited: { providers: buildProvider() },
    override: { providers: {}, defaultContextWindow: 32768 },
  })
  await run(editor)
  assert.equal(edits.length, 0)
})

check('heal: false disables the repair', async () => {
  const { editor, edits } = makeEditor({ inherited: { providers: buildProvider() }, override: { providers: {} } })
  await run(editor, { config: { heal: false } })
  assert.equal(edits.length, 0)
})

check('unload writes nothing', async () => {
  const { editor, edits } = makeEditor({ inherited: { providers: buildProvider() }, override: { providers: {} } })
  await run(editor, { disposeEarly: true })
  await sleep(600)
  assert.equal(edits.length, 0)
})

check('shadowsOnly accepts the historic trap only', () => {
  const inherited = { providers: buildProvider() }
  assert.equal(shadowsOnly(inherited, { providers: {} }), true)
  assert.equal(shadowsOnly(inherited, { providers: clone(inherited.providers) }), true)
  assert.equal(shadowsOnly(inherited, {}), false)
  assert.equal(shadowsOnly({}, { providers: {} }), false)
  assert.equal(shadowsOnly(inherited, { providers: { topdon: { displayName: 'x' } } }), false)
  assert.equal(shadowsOnly(inherited, { providers: {}, apiKeyEnv: 'OTHER' }), false)
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
