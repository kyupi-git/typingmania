import { Box, Group, Txt } from '../graphics/elements.js'
import { CENTER } from '../graphics/styles.js'
import {
  Black,
  BtnBorder,
  Gray,
  UIColor,
  UIFont,
  White,
} from './0-common.js'

export const NETWORK_CHECK_CODE = 'NetworkCheck'
export const NETWORK_LOGS_CODE = 'NetworkLogs'
export const NETWORK_PROXY_APPLY_CODE = 'NetworkProxyApply'
export const NETWORK_REGION_PREFIX = 'NetworkRegion:'

function dispatchKey (key, code = '') {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code }))
}

function button (x, y, width, labelHolder) {
  return Group(x, y, width, 58, [
    Box(0, 0, width, 58).fill(UIColor).stroke(BtnBorder).radius(8),
    labelHolder.value = Txt(10, 0, width - 20, 58)
      .font(UIFont.size(19))
      .color(White)
      .align(CENTER)
      .noOverflow(),
  ])
}

export default class NetworkStatusDialog {
  constructor (i18n) {
    this.i18n = i18n
    this.status = null
    this.logsVisible = false
    this.busy = false
    const checkLabel = {}
    const logsLabel = {}
    const closeLabel = {}
    const proxyApplyLabel = {}

    this.group = Group(0, 0, 1920, 1080, [
      this.overlay = Box(0, 0, 1920, 1080).fill(Black),
      Box(250, 90, 1420, 900).fill(UIColor).stroke(BtnBorder).radius(14),
      this.title = Txt(320, 120, 1280, 55)
        .font(UIFont.size(40)).color(White).align(CENTER),
      this.summary = Txt(330, 178, 1260, 42)
        .font(UIFont.size(18)).color(Gray).align(CENTER).noOverflow(),
      this.regionLabel = Txt(310, 225, 210, 52)
        .font(UIFont.size(20)).color(White),
      this.regionGroup = Group(520, 220, 330, 58),
      this.checkButton = button(860, 220, 250, checkLabel),
      this.logsButton = button(1125, 220, 230, logsLabel),
      this.closeButton = button(1370, 220, 200, closeLabel),
      this.proxyLabel = Txt(310, 295, 200, 52)
        .font(UIFont.size(20)).color(White),
      this.proxyModeGroup = Group(520, 290, 300, 58),
      this.proxyAddressGroup = Group(835, 290, 480, 58),
      this.proxyApplyButton = button(1330, 290, 240, proxyApplyLabel),
      this.content = Group(310, 375, 1300, 540),
      this.hint = Txt(330, 930, 1260, 30)
        .font(UIFont.size(18)).color(Gray).align(CENTER),
    ]).hide()

    this.checkLabel = checkLabel.value
    this.logsLabel = logsLabel.value
    this.closeLabel = closeLabel.value
    this.proxyApplyLabel = proxyApplyLabel.value
    this.overlay.el.style.opacity = '0.82'
    this.overlay.el.style.cursor = 'pointer'
    this.overlay.el.addEventListener('click', () => dispatchKey('Escape'))
    this.group.el.setAttribute('role', 'dialog')
    this.group.el.setAttribute('aria-modal', 'true')

    this.regionSelect = document.createElement('select')
    Object.assign(this.regionSelect.style, {
      width: '330px',
      height: '58px',
      boxSizing: 'border-box',
      border: '1px solid rgba(220, 228, 240, .72)',
      borderRadius: '8px',
      color: '#fff',
      background: 'rgba(26, 33, 45, .96)',
      font: '20px "Open Sans", sans-serif',
      padding: '0 16px',
      cursor: 'pointer',
    })
    this.regionSelect.addEventListener('change', () => {
      dispatchKey(
        `${NETWORK_REGION_PREFIX}${this.regionSelect.value}`,
        'NetworkRegion',
      )
    })
    this.regionGroup.el.appendChild(this.regionSelect)

    this.proxyModeSelect = document.createElement('select')
    Object.assign(this.proxyModeSelect.style, {
      width: '300px', height: '58px', boxSizing: 'border-box',
      border: '1px solid rgba(220, 228, 240, .72)', borderRadius: '8px',
      color: '#fff', background: 'rgba(26, 33, 45, .96)',
      font: '18px "Open Sans", sans-serif', padding: '0 14px',
      cursor: 'pointer',
    })
    this.proxyModeSelect.addEventListener('change', () => {
      this.updateProxyControls()
    })
    this.proxyModeGroup.el.appendChild(this.proxyModeSelect)

    this.proxyAddressInput = document.createElement('input')
    this.proxyAddressInput.type = 'text'
    this.proxyAddressInput.autocomplete = 'off'
    this.proxyAddressInput.spellcheck = false
    Object.assign(this.proxyAddressInput.style, {
      width: '480px', height: '58px', boxSizing: 'border-box',
      border: '1px solid rgba(220, 228, 240, .72)', borderRadius: '8px',
      color: '#fff', background: 'rgba(15, 22, 33, .96)',
      font: '17px "Open Sans", sans-serif', padding: '0 16px',
    })
    this.proxyAddressGroup.el.appendChild(this.proxyAddressInput)

    this.table = document.createElement('div')
    Object.assign(this.table.style, {
      width: '100%',
      height: '100%',
      overflow: 'auto',
      boxSizing: 'border-box',
      borderRadius: '10px',
      background: 'rgba(8, 13, 22, .62)',
      color: '#fff',
      font: '18px "Open Sans", sans-serif',
    })
    this.content.el.appendChild(this.table)

    for (const [element, key, code] of [
      [this.checkButton, 'r', NETWORK_CHECK_CODE],
      [this.logsButton, 'Tab', NETWORK_LOGS_CODE],
      [this.proxyApplyButton, 'Enter', NETWORK_PROXY_APPLY_CODE],
      [this.closeButton, 'Escape', ''],
    ]) {
      element.el.style.cursor = 'pointer'
      element.el.setAttribute('role', 'button')
      element.el.addEventListener('click', () => dispatchKey(key, code))
    }
    this.setLocale()
  }

  setLocale () {
    const t = this.i18n.t.bind(this.i18n)
    this.title.text(t('network.title'))
    this.regionLabel.text(t('network.regionLabel'))
    this.checkLabel.text(t('network.check'))
    this.logsLabel.text(t(this.logsVisible
      ? 'network.showSources'
      : 'network.showLogs'))
    this.closeLabel.text(t('network.close'))
    this.proxyLabel.text(t('network.proxyLabel'))
    this.proxyApplyLabel.text(t('network.proxyApply'))
    this.hint.text(t('network.hint'))
    this.group.el.setAttribute('aria-label', t('network.title'))
    this.populateRegions()
    this.populateProxyModes()
    this.render()
  }

  populateRegions () {
    const selected = this.status?.selectedRegion || 'auto'
    this.regionSelect.replaceChildren()
    for (const region of this.status?.regions || [
      'auto', 'cn', 'hk', 'tw', 'jp', 'kr', 'sea', 'us', 'eu', 'global',
    ]) {
      const option = document.createElement('option')
      option.value = region
      option.textContent = this.i18n.t(`network.region.${region}`)
      option.selected = region === selected
      this.regionSelect.appendChild(option)
    }
  }

  populateProxyModes () {
    const selected = this.status?.proxyMode || 'system'
    this.proxyModeSelect.replaceChildren()
    for (const mode of ['system', 'direct', 'manual']) {
      const option = document.createElement('option')
      option.value = mode
      option.textContent = this.i18n.t(`network.proxy.${mode}`)
      option.selected = mode === selected
      this.proxyModeSelect.appendChild(option)
    }
    this.proxyAddressInput.value = ''
    this.proxyAddressInput.placeholder = this.status?.manualProxy ||
      this.i18n.t('network.proxyPlaceholder')
    this.updateProxyControls()
  }

  updateProxyControls () {
    const manual = this.proxyModeSelect.value === 'manual'
    this.proxyAddressInput.disabled = this.busy || !manual
    this.proxyAddressInput.style.opacity = manual ? '1' : '0.5'
  }

  proxySettings () {
    return {
      mode: this.proxyModeSelect.value,
      manualProxy: this.proxyAddressInput.value.trim(),
    }
  }

  show (status) {
    this.status = status
    this.logsVisible = false
    this.setLocale()
    this.group.show()
  }

  hide () {
    this.group.hide()
  }

  setBusy (busy) {
    this.busy = Boolean(busy)
    this.checkButton.el.setAttribute('aria-disabled', String(this.busy))
    this.proxyApplyButton.el.setAttribute('aria-disabled', String(this.busy))
    this.checkButton.el.style.pointerEvents = this.busy ? 'none' : 'auto'
    this.proxyApplyButton.el.style.pointerEvents = this.busy ? 'none' : 'auto'
    this.regionSelect.disabled = this.busy
    this.proxyModeSelect.disabled = this.busy
    this.updateProxyControls()
    this.checkLabel.text(this.i18n.t(this.busy
      ? 'network.checking'
      : 'network.check'))
  }

  setStatus (status) {
    this.status = status
    this.populateRegions()
    this.populateProxyModes()
    this.render()
  }

  toggleLogs () {
    this.logsVisible = !this.logsVisible
    this.logsLabel.text(this.i18n.t(this.logsVisible
      ? 'network.showSources'
      : 'network.showLogs'))
    this.render()
  }

  render () {
    if (!this.status) return
    const t = this.i18n.t.bind(this.i18n)
    const values = {
      mode: t(`network.mode.${this.status.mode || 'auto'}`),
      device: t(`network.region.${this.status.deviceRegion || 'global'}`),
      proxy: t(`network.region.${this.status.proxyRegion || 'global'}`),
      region: t(`network.region.${this.status.effectiveRegion || 'global'}`),
      connection: t(`network.proxy.${this.status.proxyMode || 'system'}`),
    }
    const summaryKey = this.status.proxyActive
      ? this.status.proxyRegion
        ? 'network.summaryProxy'
        : 'network.summaryProxyPending'
      : 'network.summaryDirect'
    this.summary.text(t(summaryKey, values))
    this.table.replaceChildren()
    if (this.logsVisible) this.renderLogs()
    else this.renderSources()
  }

  renderSources () {
    const t = this.i18n.t.bind(this.i18n)
    const table = document.createElement('table')
    table.style.width = '100%'
    table.style.borderCollapse = 'collapse'
    const header = document.createElement('tr')
    for (const label of [
      t('network.column.priority'),
      t('network.column.source'),
      t('network.column.category'),
      t('network.column.status'),
      t('network.column.latency'),
    ]) {
      const cell = document.createElement('th')
      cell.textContent = label
      Object.assign(cell.style, {
        position: 'sticky', top: '0', padding: '13px 16px',
        textAlign: 'left', background: '#202a39', color: '#cbd5e1',
      })
      header.appendChild(cell)
    }
    table.appendChild(header)
    for (const source of this.status.sources || []) {
      const row = document.createElement('tr')
      const values = [
        String(source.priority),
        source.name,
        t(`network.category.${source.category || 'metadata'}`),
        t(`network.status.${source.status || 'untested'}`),
        source.latencyMs === null
          ? '—'
          : t('network.latency', { value: source.latencyMs }),
      ]
      for (const value of values) {
        const cell = document.createElement('td')
        cell.textContent = value
        Object.assign(cell.style, {
          padding: '11px 16px',
          borderTop: '1px solid rgba(255,255,255,.09)',
        })
        row.appendChild(cell)
      }
      table.appendChild(row)
    }
    this.table.appendChild(table)
  }

  renderLogs () {
    const t = this.i18n.t.bind(this.i18n)
    const jobLogs = []
    for (const [jobName, job] of Object.entries(this.status.jobs || {})) {
      for (const failure of job?.failures || []) {
        jobLogs.push({
          at: this.status.checkedAt,
          source: `${jobName}: ${failure.title || failure.file || ''}`,
          status: 'unavailable',
          latencyMs: 0,
          error: failure.reason || failure.error || '',
        })
      }
      if (job?.error) {
        jobLogs.push({
          at: this.status.checkedAt,
          source: jobName,
          status: 'unavailable',
          latencyMs: 0,
          error: job.error.message || job.error,
        })
      }
    }
    const logs = [...jobLogs, ...(this.status.logs || [])].slice(0, 50)
    if (!logs.length) {
      const empty = document.createElement('div')
      empty.textContent = t('network.logsEmpty')
      empty.style.padding = '32px'
      empty.style.color = '#b8bdc7'
      this.table.appendChild(empty)
      return
    }
    for (const log of logs) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,.09)',
        lineHeight: '26px',
      })
      const time = new Date(log.at).toLocaleTimeString(this.i18n.locale)
      const latency = log.status === 'available' && Number(log.latencyMs) >= 0
        ? `${Math.round(Number(log.latencyMs) || 0)} ms`
        : '—'
      row.textContent = `${time} · ${log.source} · ` +
        `${t(`network.status.${log.status || 'untested'}`)} · ` +
        `${latency}${log.error ? ` · ${log.error}` : ''}`
      this.table.appendChild(row)
    }
  }
}
