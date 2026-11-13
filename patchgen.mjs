/**
 * `cordis.patch.yml` generation, shared by the build script and the runtime.
 *
 * The patch is the plugin BUNDLE's own file, not the profile's user layer:
 * editing it here keeps the "uninstall removes everything" property, because
 * the loader drops the whole bundle patch layer when the plugin goes away.
 */
import { buildProvider, MODEL_IDS } from './providers.mjs'

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
const RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'])

function scalar(value) {
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = String(value)
  if (PLAIN.test(text) && !RESERVED.has(text.toLowerCase())) return text
  return "'" + text.replaceAll("'", "''") + "'"
}

/** Serialize a small JSON-shaped value as block YAML. */
export function emitYaml(value, indent = 0) {
  const pad = ' '.repeat(indent)
  const lines = []
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        const nested = emitYaml(item, indent + 2)
        const [first, ...rest] = nested.split('\n')
        lines.push(pad + '- ' + first.slice(indent + 2))
        lines.push(...rest)
      } else {
        lines.push(pad + '- ' + scalar(item))
      }
    }
    return lines.join('\n')
  }
  for (const [key, child] of Object.entries(value)) {
    if (child !== null && typeof child === 'object' && Object.keys(child).length > 0) {
      lines.push(pad + key + ':')
      lines.push(emitYaml(child, indent + 2))
    } else if (Array.isArray(child)) {
      lines.push(pad + key + ': []')
    } else if (child !== null && typeof child === 'object') {
      lines.push(pad + key + ': {}')
    } else {
      lines.push(pad + key + ': ' + scalar(child))
    }
  }
  return lines.join('\n')
}

const HEADER = `# GENERATED FILE — do not edit. Run: node build-patch.mjs
#
# The provider lives in the plugin BUNDLE's patch layer, never in the profile's
# user layer. Installing/enabling the plugin publishes it; uninstalling or
# disabling it removes the layer and the model goes with it.
#
# The injector below carries no provider data. It (a) deletes a user-layer
# \`llm-pi-ai\` override that shadows this layer, and (b) applies the model
# selection saved from this plugin's settings card.
`

/**
 * The complete patch document for a given model selection.
 *
 * @param modelIds  models to publish; unknown ids are dropped, an empty list
 *                  falls back to the full catalog so the route is never empty
 */
export function buildPatchText(modelIds = MODEL_IDS) {
  const wanted = modelIds.filter((id) => MODEL_IDS.includes(id))
  const effective = wanted.length > 0 ? wanted : MODEL_IDS
  const document = [
    { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: buildProvider(effective) } },
    {
      insert: [
        {
          id: 'topdon-ai-injector',
          name: 'dsh-plugin-topdon-ai',
          config: { heal: true, pool: true, models: true },
        },
      ],
    },
  ]
  const body = emitYaml(document).replaceAll(
    '\n- insert:',
    '\n\n# Clear a shadowing override and apply the saved model selection.\n- insert:',
  )
  return HEADER + body + '\n'
}
