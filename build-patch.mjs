/**
 * Generate `cordis.patch.yml` from `providers.mjs`.
 *
 *     node build-patch.mjs            # full catalog
 *     node build-patch.mjs --check    # verify the file matches the full catalog
 *
 * The generated patch is what publishes the provider: it is the plugin BUNDLE's
 * patch layer, so it exists exactly while the plugin is installed and enabled.
 * The same generator runs from `index.js` when the settings card saves a
 * different model selection, which is why the emit logic lives in patchgen.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPatchText } from './patchgen.mjs'
import { MODEL_IDS } from './providers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, 'cordis.patch.yml')
const text = buildPatchText(MODEL_IDS)

if (process.argv.includes('--check')) {
  let current
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    current = undefined
  }
  if (current !== text) {
    console.error('cordis.patch.yml is out of date; run: node build-patch.mjs')
    process.exit(1)
  }
  console.log(`cordis.patch.yml matches the full catalog (${MODEL_IDS.length} models)`)
} else {
  writeFileSync(target, text, 'utf8')
  console.log(`wrote ${target} (1 provider, ${MODEL_IDS.length} models)`)
}
