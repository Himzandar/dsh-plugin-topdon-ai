window.__ModuleLoader__.load({
  id: 'dsh-plugin-topdon-ai',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const react = require('react')

    const e = react.createElement

    /** Host routes registered by this plugin's host half. */
    const POOL_ROUTE = '/plugins/dsh-plugin-topdon-ai/pool'
    const MODELS_ROUTE = '/plugins/dsh-plugin-topdon-ai/models'
    /** Settings section id; the icon registration reuses it. */
    const SECTION_ID = 'topdon-ai'
    /** Row this plugin inserts; the Plugins page card targets it. */
    const ROW_ID = 'topdon-ai-injector'
    const PACKAGE_NAME = 'dsh-plugin-topdon-ai'
    /** Provider route this plugin declares (must match providers.mjs). */
    const PROVIDER_ID = 'topdon'
    /** The popover's DOM id, so an outside click can recognise it. */
    const POPOVER_ID = 'topdon-ai-key-popover'

    // --- copy -------------------------------------------------------------
    const zh = {
      'nav.label': 'Topdon AI',
      'page.title': 'Topdon AI 网关',
      'page.subtitle': '公司 Anthropic 兼容网关：一个提供商，18 个模型，可多 Key 自动容灾。',
      'models.heading': '模型',
      'models.hint': '取消勾选后，该模型会从这个提供商里移除；选择只保存在运行时，停用插件即恢复默认。',
      'models.selectAll': '全选',
      'models.selectNone': '全不选',
      'models.save': '保存',
      'models.saved': '已保存',
      'keys.heading': 'API Key 池',
      'keys.hint': '同一时间只启用一个 Key；遇到「Key 失效 / 额度被限」会自动切到下一把并重试当前请求。',
      'keys.enable': '启用 Key 池',
      'keys.empty': '还没有 Key，先添加一把。',
      'keys.labelPlaceholder': '备注（如：主账号）',
      'keys.secretPlaceholder': '粘贴 API Key',
      'keys.add': '添加',
      'keys.use': '设为当前',
      'keys.remove': '删除',
      'keys.active': '使用中',
      'keys.cooling': '冷却',
      'keys.storedAt': 'Key 保存在 DSH 主目录的 .topdon-ai-pool.json；当前 Key 会同步写入凭证库 TOPDON_AI_API_KEY。',
      'common.loading': '读取中…',
      'common.busy': '处理中…',
      'summary.pool': '管理模型与 API Key 池',
      'modelsPage.notice': 'Topdon AI 的模型与 Key 请在「设置 → Topdon AI」里管理；本页仅供查看。',
      'modelsPage.count': '当前已启用模型数：',
      'modelsPage.open': '打开 Topdon AI 设置',
      'pill.label': 'Topdon',
      'pill.noKey': '未配置 Key',
      'pill.requests': '请求',
      'popup.heading': 'Topdon AI Key',
      'popup.switch': '切换',
      'popup.current': '使用中',
      'popup.usage': '用量',
      'popup.tokensIn': '输入',
      'popup.tokensOut': '输出',
      'popup.cacheRead': '缓存读',
      'popup.cacheWrite': '缓存写',
      'popup.requestsCount': '次请求',
      'popup.empty': '还没有配置 Key，去设置里添加。',
      'popup.settings': '打开设置',
      'popup.since': '本次运行累计（重启后归零）',
      'modelsPage.failed': '没能自动打开设置，请手动进入 设置 → Topdon AI。',
    }

    const en = {
      'nav.label': 'Topdon AI',
      'page.title': 'Topdon AI gateway',
      'page.subtitle': 'Company Anthropic-compatible gateway: one provider, 18 models, multi-key failover.',
      'models.heading': 'Models',
      'models.hint': 'Unchecking a model removes it from this provider. The choice lives in runtime state only — disable the plugin to get the defaults back.',
      'models.selectAll': 'Select all',
      'models.selectNone': 'Clear',
      'models.save': 'Save',
      'models.saved': 'Saved',
      'keys.heading': 'API key pool',
      'keys.hint': 'One key serves at a time. A rejected or throttled key is skipped automatically and the request is retried.',
      'keys.enable': 'Enable key pool',
      'keys.empty': 'No keys yet — add the first one below.',
      'keys.labelPlaceholder': 'Label (e.g. primary)',
      'keys.secretPlaceholder': 'Paste the API key',
      'keys.add': 'Add',
      'keys.use': 'Use',
      'keys.remove': 'Remove',
      'keys.active': 'active',
      'keys.cooling': 'cooling',
      'keys.storedAt': 'Keys live in .topdon-ai-pool.json under the DSH home; the active one is written to the TOPDON_AI_API_KEY credential.',
      'common.loading': 'Loading…',
      'common.busy': 'Working…',
      'summary.pool': 'Manage models and the API key pool',
      'modelsPage.notice': 'Topdon AI models and keys are managed in Settings → Topdon AI; this page is read-only.',
      'modelsPage.count': 'Models enabled:',
      'modelsPage.open': 'Open Topdon AI settings',
      'pill.label': 'Topdon',
      'pill.noKey': 'No key',
      'pill.requests': 'req',
      'popup.heading': 'Topdon AI key',
      'popup.switch': 'Switch',
      'popup.current': 'active',
      'popup.usage': 'Usage',
      'popup.tokensIn': 'in',
      'popup.tokensOut': 'out',
      'popup.cacheRead': 'cache read',
      'popup.cacheWrite': 'cache write',
      'popup.requestsCount': 'requests',
      'popup.empty': 'No key configured yet — add one in Settings.',
      'popup.settings': 'Open settings',
      'popup.since': 'Since DSH started (resets on restart)',
      'modelsPage.failed': 'Could not open Settings automatically — go to Settings → Topdon AI.',
    }

    // --- styles -----------------------------------------------------------
    const s = {
      root: { display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '13px' },
      section: { display: 'flex', flexDirection: 'column', gap: '8px' },
      heading: { fontSize: '13px', fontWeight: 600, margin: 0 },
      hint: { opacity: 0.65, lineHeight: '18px' },
      grid: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px' },
      check: { display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' },
      group: { display: 'flex', flexDirection: 'column', gap: '4px' },
      groupTitle: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em', opacity: 0.5 },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 8px',
        border: '1px solid var(--dsw-alias-border-l2, #3a3d45)',
        borderRadius: '8px',
      },
      grow: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '12px' },
      badge: { fontSize: '11px', padding: '1px 6px', borderRadius: '999px', border: '1px solid currentColor' },
      input: {
        padding: '5px 8px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2, #3a3d45)',
        background: 'transparent',
        color: 'inherit',
      },
      button: {
        appearance: 'none',
        padding: '4px 10px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2, #3a3d45)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      primary: { borderColor: 'var(--dsw-alias-state-business-primary, #4d6bfe)', color: 'var(--dsw-alias-state-business-primary, #4d6bfe)' },
      error: { color: 'var(--dsw-alias-state-error-primary, #e5534b)' },
      ok: { color: 'var(--dsw-alias-state-business-primary, #3fb950)' },
    }

    /**
     * Theme variables that ACTUALLY exist in this host.
     *
     * Checked against dsh-client-ui-conversation's stylesheet: `--dsw-alias-bg-l1`
     * and `--dsw-alias-brand-primary` are NOT defined, which is why an earlier
     * popover rendered as a black box with invisible text. These are the ones
     * the host itself uses for panels and labels.
     */
    const THEME = {
      panelBg: 'var(--dsw-alias-bg-base, #16171a)',
      panelBorder: 'var(--dsw-alias-border-l2, #3a3d45)',
      labelPrimary: 'var(--dsw-alias-label-primary, #e8e9ed)',
      labelSecondary: 'var(--dsw-alias-label-secondary, #b7bac2)',
      labelTertiary: 'var(--dsw-alias-label-tertiary, #8b8f99)',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08))',
      accent: 'var(--dsw-alias-state-business-primary, #4d6bfe)',
      shadow: '0 10px 30px rgba(0,0,0,.28)',
    }

    async function request(url, method, body) {
      const response = await fetch(url, {
        method,
        headers:
          body === undefined
            ? { accept: 'application/json' }
            : { 'content-type': 'application/json', accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
      return payload
    }

    function cooldownText(until) {
      const seconds = Math.ceil((until - Date.now()) / 1000)
      if (!Number.isFinite(seconds) || seconds <= 0) return ''
      if (seconds >= 120) return `${Math.round(seconds / 60)}m`
      return `${seconds}s`
    }

    // --- model family grouping (mirrors providers.mjs) --------------------
    const FAMILIES = [
      { id: 'deepseek', label: 'DeepSeek' },
      { id: 'claude', label: 'Claude' },
      { id: 'gpt', label: 'GPT' },
      { id: 'qwen', label: 'Qwen' },
      { id: 'gemini', label: 'Gemini' },
    ]

    function familyOf(id) {
      if (id.startsWith('claude')) return 'claude'
      if (id.startsWith('gpt')) return 'gpt'
      if (id.startsWith('qwen')) return 'qwen'
      if (id.startsWith('gemini')) return 'gemini'
      return 'deepseek'
    }

    function ModelsPanel(props) {
      const { t } = props
      const [catalog, setCatalog] = react.useState([])
      const [selected, setSelected] = react.useState([])
      const [status, setStatus] = react.useState('loading')
      const [error, setError] = react.useState('')
      const [dirty, setDirty] = react.useState(false)

      react.useEffect(() => {
        let alive = true
        request(MODELS_ROUTE, 'GET')
          .then((payload) => {
            if (!alive) return
            setCatalog(payload.catalog ?? [])
            setSelected(payload.models ?? [])
            setStatus('ready')
          })
          .catch((failure) => {
            if (!alive) return
            setError(String(failure.message || failure))
            setStatus('failed')
          })
        return () => {
          alive = false
        }
      }, [])

      const toggle = (id) => {
        setDirty(true)
        setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
      }

      const save = async () => {
        setError('')
        try {
          const payload = await request(MODELS_ROUTE, 'POST', { models: selected })
          setSelected(payload.models ?? [])
          setDirty(false)
          setStatus('saved')
          setTimeout(() => setStatus((value) => (value === 'saved' ? 'ready' : value)), 2000)
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      if (status === 'loading') return e('div', { style: s.hint }, t('common.loading'))

      return e(
        'div',
        { style: s.section },
        e('h3', { style: s.heading }, `${t('models.heading')} (${selected.length}/${catalog.length})`),
        e('div', { style: s.hint }, t('models.hint')),
        e(
          'div',
          { style: s.grid },
          FAMILIES.map((family) => {
            const ids = catalog.filter((id) => familyOf(id) === family.id)
            if (ids.length === 0) return null
            return e(
              'div',
              { key: family.id, style: s.group },
              e('div', { style: s.groupTitle }, family.label),
              ...ids.map((id) =>
                e(
                  'label',
                  { key: id, style: s.check },
                  e('input', {
                    type: 'checkbox',
                    checked: selected.includes(id),
                    onChange: () => toggle(id),
                  }),
                  id,
                ),
              ),
            )
          }),
        ),
        e(
          'div',
          { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          e('button', { style: s.button, onClick: () => { setDirty(true); setSelected(catalog) } }, t('models.selectAll')),
          e('button', { style: s.button, onClick: () => { setDirty(true); setSelected([]) } }, t('models.selectNone')),
          e(
            'button',
            {
              style: { ...s.button, ...s.primary },
              disabled: !dirty || selected.length === 0,
              onClick: save,
            },
            t('models.save'),
          ),
          status === 'saved' ? e('span', { style: s.ok }, t('models.saved')) : null,
        ),
        error.length > 0 ? e('div', { style: s.error }, error) : null,
      )
    }

    function KeysPanel(props) {
      const { t } = props
      const [data, setData] = react.useState(null)
      const [error, setError] = react.useState('')
      const [busy, setBusy] = react.useState(false)
      const [label, setLabel] = react.useState('')
      const [secret, setSecret] = react.useState('')
      const [, tick] = react.useState(0)

      react.useEffect(() => {
        let alive = true
        request(POOL_ROUTE, 'GET')
          .then((payload) => alive && setData(payload))
          .catch((failure) => alive && setError(String(failure.message || failure)))
        const timer = setInterval(() => alive && tick((value) => value + 1), 15000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])

      const run = async (body) => {
        setBusy(true)
        setError('')
        try {
          setData(await request(POOL_ROUTE, 'POST', body))
        } catch (failure) {
          setError(String(failure.message || failure))
        } finally {
          setBusy(false)
        }
      }

      const add = () => {
        const trimmed = secret.trim()
        if (trimmed.length === 0) return
        void run({ action: 'add', label: label.trim(), secret: trimmed }).then(() => {
          setLabel('')
          setSecret('')
        })
      }

      const keys = data?.keys ?? []

      return e(
        'div',
        { style: s.section },
        e('h3', { style: s.heading }, t('keys.heading')),
        e('div', { style: s.hint }, t('keys.hint')),
        data === null
          ? e('div', { style: s.hint }, t('common.loading'))
          : e(
              'label',
              { style: s.check },
              e('input', {
                type: 'checkbox',
                checked: data.enabled !== false,
                disabled: busy,
                onChange: (event) => void run({ action: 'enable', enabled: event.target.checked }),
              }),
              t('keys.enable'),
            ),
        keys.length === 0
          ? e('div', { style: s.hint }, t('keys.empty'))
          : e(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              keys.map((item) => {
                const active = data.active === item.id
                const cooling = cooldownText(item.cooldownUntil)
                return e(
                  'div',
                  { key: item.id, style: s.row },
                  e(
                    'div',
                    { style: s.grow },
                    e('div', { style: { fontWeight: active ? 600 : 400 } }, item.label),
                    e('div', { style: { ...s.mono, opacity: 0.6 } }, item.masked),
                  ),
                  cooling.length > 0 ? e('span', { style: { ...s.badge, opacity: 0.7 } }, `${t('keys.cooling')} ${cooling}`) : null,
                  active ? e('span', { style: { ...s.badge, ...s.primary } }, t('keys.active')) : null,
                  active ? null : e('button', { style: s.button, disabled: busy, onClick: () => void run({ action: 'use', id: item.id }) }, t('keys.use')),
                  e('button', { style: s.button, disabled: busy, onClick: () => void run({ action: 'remove', id: item.id }) }, t('keys.remove')),
                )
              }),
            ),
        e(
          'div',
          { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          e('input', {
            style: { ...s.input, flex: '0 1 140px' },
            placeholder: t('keys.labelPlaceholder'),
            value: label,
            disabled: busy,
            onChange: (event) => setLabel(event.target.value),
          }),
          e('input', {
            style: { ...s.input, flex: '1 1 200px', minWidth: 0 },
            placeholder: t('keys.secretPlaceholder'),
            type: 'password',
            value: secret,
            disabled: busy,
            onChange: (event) => setSecret(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') add()
            },
          }),
          e('button', { style: { ...s.button, ...s.primary }, disabled: busy, onClick: add }, t('keys.add')),
        ),
        error.length > 0 ? e('div', { style: s.error }, error) : null,
        e('div', { style: s.hint }, t('keys.storedAt')),
      )
    }

    // --- open this plugin's Settings section from elsewhere ----------------
    /**
     * Open Settings and select this plugin's section.
     *
     * Two routes, both soft: the settings shell exposes
     * `actions.openSection(id)` through the sidebar seat's store factory, which
     * is the precise route; if the seat is unrecognisable we fall back to
     * clicking the shell's own trigger and then the matching nav row. Every step
     * is inside try/catch — a host that reshapes its chrome must degrade to
     * "nothing happened", never to a broken card.
     */
    const SETTINGS_PANEL_SELECTOR = '[data-shortcut-modal="settings"]'
    const SETTINGS_TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"][aria-expanded]'

    function openThroughStoreSeat(get, sectionId) {
      let slots
      try {
        slots = get?.('slots')
      } catch {
        return false
      }
      if (slots === undefined || typeof slots.entries !== 'function') return false
      let seat
      try {
        seat = slots.entries('sidebar.settings')[0]?.store
      } catch {
        return false
      }
      if (seat === null || typeof seat !== 'object' || typeof seat.create !== 'function') return false
      try {
        const actions = seat.create()?.actions
        if (typeof actions?.openSection === 'function') {
          actions.openSection(sectionId)
          return true
        }
        if (typeof actions?.open === 'function') {
          actions.open()
          return true
        }
      } catch {}
      return false
    }

    function openSectionByClicking(label) {
      try {
        const doc = globalThis.document
        if (doc === undefined) return false
        if (doc.querySelector(SETTINGS_PANEL_SELECTOR) === null) {
          const trigger = Array.from(doc.querySelectorAll(SETTINGS_TRIGGER_SELECTOR)).find(
            (button) => button.getAttribute('aria-expanded') !== 'true',
          )
          if (trigger === undefined) return false
          trigger.click()
        }
        const row = Array.from(doc.querySelectorAll(SETTINGS_PANEL_SELECTOR + ' button, ' + SETTINGS_PANEL_SELECTOR + ' a')).find(
          (candidate) => (candidate.textContent ?? '').trim() === label,
        )
        if (row === undefined) return false
        row.click()
        return true
      } catch {
        return false
      }
    }

    function openSettingsSection(get, label) {
      if (openThroughStoreSeat(get, SECTION_ID)) return true
      return openSectionByClicking(label)
    }

    // --- the Models-page card for this provider ---------------------------
    /**
     * Make the host's Edit/Remove controls inert for THIS row only.
     *
     * WHY CSS AND NOT A PROP
     * ---------------------
     * The Models page renders those buttons itself, unconditionally, and skips
     * only the hard-coded `deepseek-account` route. It exposes no read-only flag
     * a plugin can set, and a `settings.models.provider-card` contribution is
     * APPENDED to the row — it cannot replace the header. The one handle the
     * page does give us is structure: our card lands inside the same
     * `<li class="…rowCard">` as those buttons, which makes a row-scoped CSS
     * rule possible.
     *
     * The rule hangs off a marker only this plugin's card emits, so it cannot
     * match another provider's row:
     *
     *   li.rowCard:has(> div > [data-topdon-managed]) .rowActions { … }
     *
     * `:has()` is supported by every Chromium this app ships on. The rule hides
     * only the ORIGINAL action buttons (we keep ours in a separate container),
     * and only for the row carrying the marker.
     *
     * This is presentation only: nothing about the provider, the credential or
     * the model list changes. Settings → Topdon AI remains the real editor.
     */
    const ROW_CSS_ID = 'topdon-ai-models-row'
    // `rowActions` is a <span> inside `rowHead` (<div>), both CSS-Module classes
    // from the Models page. The `:has()` scope keeps the rule on our row alone.
    const ROW_CSS = `
li.jrmgQW_rowCard:has([data-topdon-ai-managed]) span.jrmgQW_rowActions {
  display: none !important;
}
`

    function ensureRowStyles() {
      try {
        const doc = globalThis.document
        if (doc === undefined) return
        if (doc.getElementById(ROW_CSS_ID) !== null) return
        const style = doc.createElement('style')
        style.id = ROW_CSS_ID
        style.textContent = ROW_CSS
        doc.head.appendChild(style)
      } catch {}
    }

    function ModelsPageCard(props) {
      const t = props?.t ?? ((key) => key)
      const [hint, setHint] = react.useState('')
      const [count, setCount] = react.useState(undefined)
      // The host dispatches this seat by `settingsNs`, which the pi-ai adapter
      // shares with EVERY provider it serves, so the card has to decide per row.
      const provider = props?.provider?.provider
      react.useEffect(() => {
        if (provider !== undefined && provider !== PROVIDER_ID) return
        ensureRowStyles()
        let alive = true
        request(MODELS_ROUTE, 'GET')
          .then((payload) => {
            if (alive && Array.isArray(payload.models)) setCount(payload.models.length)
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [provider])
      if (provider !== undefined && provider !== PROVIDER_ID) return null
      const open = () => {
        const label = t('nav.label')
        if (!openSettingsSection(props?.get, label)) setHint(t('modelsPage.failed'))
      }
      return e(
        'div',
        {
          // The hook the row-scoped CSS matches on.
          'data-topdon-ai-managed': '',
          style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' },
        },
        e('div', { style: s.hint }, t('modelsPage.notice')),
        count === undefined ? null : e('div', { style: s.hint }, `${t('modelsPage.count')} ${count}`),
        e(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          e('button', { style: { ...s.button, ...s.primary }, onClick: open }, t('modelsPage.open')),
          hint.length > 0 ? e('span', { style: s.error }, hint) : null,
        ),
      )
    }

    // --- the composer pill (WorkBuddy-style account chip) -----------------
    /** Short token counts: 1234 → 1.2k, 1234567 → 1.2M. */
    function shortNumber(value) {
      const n = Number(value) || 0
      if (n < 1000) return String(n)
      if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'k'
      return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
    }

    function UsageLine(props) {
      const { t, usage } = props
      if (usage === undefined || usage.requests === 0) return null
      return e(
        'div',
        { style: { ...s.mono, opacity: 0.7, lineHeight: '17px' } },
        `${t('popup.tokensIn')} ${shortNumber(usage.inputTokens)} · ${t('popup.tokensOut')} ${shortNumber(usage.outputTokens)}`,
        usage.cacheReadTokens > 0 || usage.cacheWriteTokens > 0
          ? ` · ${t('popup.cacheRead')} ${shortNumber(usage.cacheReadTokens)}`
          : null,
      )
    }

    /**
     * Where the popover should open.
     *
     * The chip sits inside the input bar's flex row, which clips its children —
     * an `absolute` popover was drawn INSIDE that row. `position: fixed` escapes
     * it, so the coordinates are measured from the chip's own box and clamped to
     * the viewport. The card is deliberately small: it answers one question
     * ("which key, how much") and must not cover the conversation.
     */
    const POPOVER_WIDTH = 216
    function popoverPosition(anchor) {
      const viewportWidth = globalThis.innerWidth ?? 1024
      const fallback = { position: 'fixed', left: '12px', bottom: '88px' }
      try {
        const rect = anchor?.getBoundingClientRect?.()
        if (rect === undefined || rect.width === 0) return fallback
        // Right-align the card with the chip so it never covers the send button.
        const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, viewportWidth - POPOVER_WIDTH - 8))
        const bottom = Math.max(8, (globalThis.innerHeight ?? 768) - rect.top + 6)
        return { position: 'fixed', left: `${Math.round(left)}px`, bottom: `${Math.round(bottom)}px` }
      } catch {
        return fallback
      }
    }

    /**
     * Which provider the composer is currently pointed at, or `undefined` when
     * that cannot be known.
     *
     * WHY THIS IS INDIRECT
     * --------------------
     * `renderSlot("conversation.input.right", {})` passes no props, but the host
     * hands every slot component `useProjection` through the slot runtime
     * (WorkBuddy's own gate reads `useProjection("modelSelection")` the same
     * way). The model picker button is the last resort: it renders the selected
     * model's DISPLAY name, so a chip whose model appears under our provider can
     * be recognised by name when no projection is reachable.
     *
     * `undefined` (unknown) is a first-class answer: an unknown selection must
     * NOT hide the chip, because a host whose shape changed should degrade to
     * "chip visible", never to "chip vanished with no way back".
     */
    function currentProvider(props, get, knownModels) {
      const given = props?.usingTopdon
      if (typeof given === 'boolean') return given ? PROVIDER_ID : undefined
      const project = props?.useProjection
      if (typeof project === 'function') {
        try {
          const snapshot = project('modelSelection')
          const picked = snapshot?.next ?? snapshot?.lastUsed ?? snapshot
          if (typeof picked?.provider === 'string') return picked.provider
        } catch {}
      }
      try {
        const value = get?.('settings')?.get?.('modelSelection')
        if (typeof value?.provider === 'string') return value.provider
      } catch {}
      // DOM fallback: the picker's own trigger shows the selected model name.
      try {
        const doc = globalThis.document
        const label = doc?.querySelector?.('[data-conversation-model-picker]')?.textContent
        if (typeof label === 'string' && label.length > 0) {
          const hit = (knownModels ?? []).find((name) => label.includes(name))
          if (hit !== undefined) return PROVIDER_ID
        }
      } catch {}
      return undefined
    }

    /** WorkBuddy-style gate: runs BEFORE the effect, so a foreign model costs no poll. */
    /**
     * Display names this plugin's catalog publishes, for the DOM fallback.
     *
     * Read once from the host route (it is already fetched for the settings
     * card), then reused: the picker renders one of these strings, so seeing one
     * of them in the picker means the Topdon provider is the selected one.
     */
    const modelNames = { value: [], loading: undefined }
    function loadModelNames() {
      modelNames.loading ??= request(MODELS_ROUTE, 'GET')
        .then((payload) => {
          const names = Array.isArray(payload?.names) ? payload.names : []
          if (names.length > 0) modelNames.value = names
        })
        .catch(() => {})
      return modelNames.loading
    }

    function ComposerPill(props) {
      const t = props?.t ?? ((key) => key)
      const get = props?.get
      const provider = currentProvider(props, get, modelNames.value)
      if (provider !== undefined && provider !== PROVIDER_ID) return null
      return e(ComposerKeyChip, { ...props, t, get })
    }

    function ComposerKeyChip(props) {
      const t = props?.t ?? ((key) => key)
      const get = props?.get
      const [data, setData] = react.useState(null)
      const [open, setOpen] = react.useState(false)
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState('')
      const [anchor, setAnchor] = react.useState({ position: 'fixed', left: '12px', bottom: '96px' })
      const buttonRef = react.useRef?.(null)

      const load = react.useCallback(() => {
        request(POOL_ROUTE, 'GET')
          .then((payload) => setData(payload))
          .catch(() => {})
      }, [])

      react.useEffect(() => {
        load()
        const timer = setInterval(load, 10000)
        return () => clearInterval(timer)
      }, [load])

      // Close on Escape and on an outside click; a dock-anchored popover that
      // cannot be dismissed is worse than no popover.
      react.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        const onDown = (event) => {
          const node = buttonRef?.current
          const pop = globalThis.document?.getElementById?.(POPOVER_ID)
          const path = event?.composedPath?.() ?? []
          if (node !== null && node !== undefined && path.includes(node)) return
          if (pop !== null && pop !== undefined && path.includes(pop)) return
          setOpen(false)
        }
        globalThis.addEventListener?.('keydown', onKey)
        globalThis.addEventListener?.('mousedown', onDown)
        return () => {
          globalThis.removeEventListener?.('keydown', onKey)
          globalThis.removeEventListener?.('mousedown', onDown)
        }
      }, [open])

      if (data === null) return null
      const keys = Array.isArray(data.keys) ? data.keys : []
      // No pool configured: nothing to show, and nothing to occupy in the row.
      if (keys.length === 0) return null

      const active = keys.find((item) => item.id === data.active) ?? keys[0]
      const total = data.requests ?? 0

      const toggle = () => {
        const next = !open
        if (next) setAnchor(popoverPosition(buttonRef?.current))
        setOpen(next)
      }

      const choose = async (id) => {
        if (id === active.id) return
        setBusy(true)
        setError('')
        try {
          const payload = await request(POOL_ROUTE, 'POST', { action: 'use', id })
          setData(payload)
        } catch (failure) {
          setError(String(failure.message || failure))
        } finally {
          setBusy(false)
        }
      }

      const openSettings = () => {
        setOpen(false)
        openSettingsSection(get, t('nav.label'))
      }

      return e(
        'div',
        { style: { display: 'inline-flex' } },
        e(
          'button',
          {
            type: 'button',
            ref: buttonRef,
            onClick: toggle,
            title: t('pill.label'),
            'aria-expanded': open,
            style: {
              appearance: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 7px',
              border: '0',
              borderRadius: '6px',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              font: 'inherit',
              opacity: 0.75,
              whiteSpace: 'nowrap',
            },
          },
          e('span', {
            style: {
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: THEME.accent,
              flex: '0 0 auto',
            },
          }),
          e('span', null, active.label || t('pill.noKey')),
          total > 0 ? e('span', { style: { opacity: 0.6 } }, `· ${t('pill.requests')} ${shortNumber(total)}`) : null,
        ),
        open ? e(
          'div',
          {
            id: POPOVER_ID,
            role: 'dialog',
            style: {
              ...anchor,
              width: `${POPOVER_WIDTH}px`,
              zIndex: 2147483000,
              padding: '8px',
              borderRadius: '8px',
              border: `1px solid ${THEME.panelBorder}`,
              background: THEME.panelBg,
              color: THEME.labelPrimary,
              boxShadow: THEME.shadow,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '12px',
              lineHeight: '16px',
            },
          },
          e(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
            keys.map((item) =>
              e(
                'div',
                {
                  key: item.id,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 5px',
                    borderRadius: '5px',
                    background: item.id === active.id ? THEME.hover : 'transparent',
                  },
                },
                e('span', {
                  style: {
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    flex: '0 0 auto',
                    background: item.id === active.id ? THEME.accent : 'transparent',
                    boxShadow: item.id === active.id ? 'none' : `inset 0 0 0 1px ${THEME.labelTertiary}`,
                  },
                }),
                e(
                  'button',
                  {
                    type: 'button',
                    disabled: busy || item.id === active.id,
                    onClick: () => void choose(item.id),
                    title: item.id === active.id ? t('popup.current') : t('popup.switch'),
                    style: {
                      flex: '1 1 auto',
                      minWidth: 0,
                      appearance: 'none',
                      border: '0',
                      padding: 0,
                      background: 'transparent',
                      color: item.id === active.id ? THEME.labelPrimary : THEME.labelSecondary,
                      font: 'inherit',
                      fontWeight: item.id === active.id ? 600 : 400,
                      textAlign: 'left',
                      cursor: item.id === active.id || busy ? 'default' : 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  },
                  item.label,
                ),
                item.usage !== undefined && item.usage.requests > 0
                  ? e(
                      'span',
                      { style: { flex: '0 0 auto', color: THEME.labelTertiary, fontSize: '11px' } },
                      `${shortNumber(item.usage.inputTokens + item.usage.outputTokens)} tk`,
                    )
                  : null,
              ),
            ),
          ),
          error.length > 0 ? e('div', { style: { color: 'var(--dsw-alias-state-error-primary, #e5534b)', fontSize: '11px' } }, error) : null,
          e(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', paddingTop: '2px' } },
            total > 0
              ? e(
                  'span',
                  { style: { color: THEME.labelTertiary, fontSize: '11px' } },
                  `${shortNumber(total)} ${t('popup.requestsCount')}`,
                )
              : e('span', {}),
            e(
              'button',
              {
                type: 'button',
                onClick: openSettings,
                style: {
                  appearance: 'none',
                  border: '0',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  background: 'transparent',
                  color: THEME.accent,
                  font: 'inherit',
                  fontSize: '11px',
                  cursor: 'pointer',
                },
              },
              t('popup.settings'),
            ),
          ),
        ) : null,
      )
    }

    function Card(props) {
      const t = props?.t ?? ((key) => key)
      try {
        return e('div', { style: s.root }, e(ModelsPanel, { t }), e(KeysPanel, { t }))
      } catch (error) {
        console.error('[dsh-plugin-topdon-ai] settings card failed:', error)
        return e('div', { style: s.error }, String(error?.message ?? error))
      }
    }

    function Summary(props) {
      const t = props?.t ?? ((key) => key)
      return e('span', { style: s.hint }, t('summary.pool'))
    }

    function Icon(props) {
      const size = typeof props?.size === 'number' && props.size > 0 ? props.size : 16
      return e(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        e('rect', { x: 1.5, y: 3.5, width: 13, height: 9, rx: 2, stroke: 'currentColor', strokeWidth: 1.4 }),
        e('circle', { cx: 5, cy: 8, r: 1.3, fill: 'currentColor' }),
        e('path', { d: 'M8.5 7h3.2M8.5 9h2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      )
    }

    function apply(ctx) {
      const namespace = 'settings.topdon-ai'
      const disposers = []

      const registerLocale = ctx.get?.('locale')
      if (registerLocale !== undefined && typeof registerLocale.register === 'function') {
        disposers.push(ctx.effect(() => registerLocale.register(namespace, { zh, en }), 'topdon-ai: copy'))
      }
      const t =
        registerLocale !== undefined && typeof registerLocale.bind === 'function'
          ? registerLocale.bind(namespace)
          : (key) => zh[key] ?? key

      // A renderer for a slot the host dispatches WITHOUT a `t`; every panel
      // takes `t` explicitly, so bind the locale one once here.
      const withT = (render) => (props) => render({ ...props, t: props?.t ?? t })

      // The dedicated Settings entry, mirroring dsh-connect-workbuddy.
      disposers.push(
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: SECTION_ID,
              order: 36,
              label: () => t('nav.label'),
              locale: namespace,
              inject: () => ({ t }),
            },
            Card,
          ),
        ),
      )

      // Its navigation glyph.
      disposers.push(
        ctx.slots.inject('settings.section.icon', () =>
          ctx.slots.register({ name: 'settings.section.icon', id: SECTION_ID, locale: namespace }, Icon),
        ),
      )

      // The Topdon row on Settings → Models: point at this plugin's own page.
      //
      // KEY IS settingsNs, NOT provider id.
      // renderSlot dispatches by `entryKey: row.entry.settingsNs`.
      // For every pi-ai provider, settingsNs = the Loader entry id = "llm-pi-ai".
      // We filter to our provider inside ModelsPageCard.
      disposers.push(
        ctx.slots.inject('settings.models.provider-card', () =>
          ctx.slots.register(
            { name: 'settings.models.provider-card', key: 'llm-pi-ai', order: 0, locale: namespace },
            withT((props) =>
              e(ModelsPageCard, {
                t: props.t,
                provider: props.provider,
                get: props?.get ?? ((name) => ctx.get?.(name)),
              }),
            ),
          ),
        ),
      )

      // The composer pill: this plugin's key chip in the row that carries the
      // model picker.
      //
      // SLOT CHOICE IS THE WHOLE POINT.
      // `conversation.composer.dock` is the summary line UNDER the input (where
      // the token counters live); registering there put the chip below the box.
      // `conversation.input.right` is rendered inside `div.trailing >
      // div.standardControls`, i.e. IMMEDIATELY BEFORE the model picker — the
      // same seat WorkBuddy's credit readout occupies (order 4). `order: 5` puts
      // this chip just left of it so the two readouts stay adjacent.
      disposers.push(
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.right',
              id: 'topdon-ai-key-pill',
              order: 5,
              locale: namespace,
              inject: () => ({ t, get: (name) => ctx.get?.(name) }),
            },
            ComposerPill,
          ),
        ),
      )

      // The row card on the Plugins page keeps working for the same content.
      disposers.push(
        ctx.slots.inject('plugins.row.config', () =>
          ctx.slots.register(
            { name: 'plugins.row.config', key: PACKAGE_NAME + '#' + ROW_ID, order: 0 },
            (props) => (props?.view === 'summary' ? e(Summary, { t: props?.t ?? t }) : e(Card, { t: props?.t ?? t })),
          ),
        ),
      )

      ctx.effect(() => () => {
        for (const dispose of disposers.splice(0)) {
          try {
            if (typeof dispose === 'function') dispose()
          } catch {}
        }
      }, 'topdon-ai: slots')
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    // Exported for the offline checks: these decide WHEN the chip shows, and a
    // wrong answer here is invisible in review but obvious on screen.
    exports.currentProviderForTest = currentProvider
    exports.shortNumberForTest = shortNumber
    exports.name = 'dsh-plugin-topdon-ai'
    return module.exports
  },
})
