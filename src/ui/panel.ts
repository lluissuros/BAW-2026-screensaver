import { deleteLocalPreset, listPresets, saveLocalPreset } from '../config/presets'
import { globalSections, layerSections, type Field, type Section } from '../config/schema'
import { migrate, minimalConfig, type Store } from '../config/store'
import { shareLink } from '../config/links'
import { defaultConfig } from '../config/defaults'
import type { DriveBus } from '../drive'
import { copy } from './gallery'

/** Panel-only state: how you are looking at the composition, not part of the composition. */
export interface EditTools {
  ghost: number
  bounds: boolean
}

export interface PanelHooks {
  drive: DriveBus
  tools: EditTools
  onToolsChange: () => void
  /** Called after any config field is edited, so main can react (e.g. start the mic). */
  onFieldChange: (path: string) => void
  onExportVideo: () => void
  onOpenGallery: () => void
  getSelected: () => number
  setSelected: (index: number) => void
}

interface Control {
  sync: () => void
}

export class Panel {
  readonly el: HTMLElement
  private readonly body: HTMLElement
  private readonly tabs: HTMLElement
  private readonly presetSelect: HTMLSelectElement
  private readonly statusEl: HTMLElement
  private readonly phaseInput: HTMLInputElement
  private readonly readout: HTMLElement
  private readonly pauseButton: HTMLButtonElement
  private readonly exportButton: HTMLButtonElement
  private controls: Control[] = []
  private tab = 0 // 0 = global, 1..n = layer index + 1

  constructor(
    parent: HTMLElement,
    private readonly store: Store,
    private readonly hooks: PanelHooks,
  ) {
    this.el = document.createElement('aside')
    this.el.id = 'panel'

    const head = document.createElement('div')
    head.className = 'panel-head'
    head.innerHTML = `<h1>BAW!</h1><span class="sub">edit mode</span>`
    const close = button('Hide', 'btn', () => this.open(false))
    head.append(close)
    this.el.append(head)

    // ── transport ──
    const transport = document.createElement('div')
    transport.className = 'transport'
    this.pauseButton = button('Pause', 'btn', () => {
      this.hooks.drive.paused = !this.hooks.drive.paused
      this.syncTransport()
    })
    this.phaseInput = document.createElement('input')
    this.phaseInput.type = 'range'
    this.phaseInput.min = '0'
    this.phaseInput.max = '1'
    this.phaseInput.step = '0.001'
    this.phaseInput.title = 'Scrub the loop — pause first to hold a frame'
    this.phaseInput.addEventListener('input', () => {
      this.hooks.drive.setPhase(Number(this.phaseInput.value))
    })
    this.readout = document.createElement('span')
    this.readout.className = 'readout'
    transport.append(this.pauseButton, this.phaseInput, this.readout)
    this.el.append(transport)

    // ── tabs ──
    this.tabs = document.createElement('nav')
    this.tabs.className = 'tabs'
    this.el.append(this.tabs)

    this.body = document.createElement('div')
    this.body.className = 'panel-body'
    this.el.append(this.body)

    // ── footer ──
    const foot = document.createElement('div')
    foot.className = 'panel-foot'

    // The happy path is one button. Someone who has never seen this app should be able to move
    // sliders and end up with a link they can send, without meeting the word JSON.
    const saveRow = document.createElement('div')
    saveRow.className = 'row'
    saveRow.append(
      button('Save & copy link', 'btn primary wide', () => void this.saveAndShare()),
      button('Looks…', 'btn', () => this.hooks.onOpenGallery()),
    )

    this.presetSelect = document.createElement('select')
    const presetRow = document.createElement('div')
    presetRow.className = 'row'
    presetRow.append(this.presetSelect, button('Open', 'btn', () => this.loadSelectedPreset()))

    const actionRow = document.createElement('div')
    actionRow.className = 'row'
    this.exportButton = button('Export video loop', 'btn', () => this.hooks.onExportVideo())
    actionRow.append(
      this.exportButton,
      button('Copy link', 'btn', () => void this.copyLink()),
      button('Reset', 'btn', () => this.resetToReference()),
    )

    const fileRow = document.createElement('details')
    fileRow.className = 'section advanced'
    const fileSummary = document.createElement('summary')
    fileSummary.textContent = 'Files'
    const fileButtons = document.createElement('div')
    fileButtons.className = 'row'
    fileButtons.append(
      button('Download JSON', 'btn', () => this.downloadJson()),
      button('Open JSON…', 'btn', () => this.openJson()),
      button('Delete', 'btn', () => this.deleteSelectedPreset()),
    )
    fileRow.append(fileSummary, fileButtons)

    this.statusEl = document.createElement('div')
    this.statusEl.className = 'status'

    const keys = document.createElement('div')
    keys.className = 'keys'
    keys.innerHTML = `<kbd>E</kbd> panel · <kbd>F</kbd> fullscreen · <kbd>Space</kbd> pause ·
      <kbd>G</kbd> ghost · <kbd>L</kbd> looks · <kbd>1–9</kbd> pick layer · <kbd>←↑↓→</kbd> nudge<br>
      drag to move · wheel to resize · shift+wheel to rotate`

    foot.append(saveRow, presetRow, actionRow, this.statusEl, fileRow, keys)
    this.el.append(foot)

    parent.append(this.el)

    this.rebuild()
    this.store.subscribe(() => this.refresh())
  }

  open(open: boolean): void {
    this.el.classList.toggle('open', open)
    if (open) this.refreshPresetList()
  }

  /** Brings a layer's tab to the front — called when one is clicked on the canvas. */
  selectLayer(index: number): void {
    if (this.tab === index + 1) return
    this.tab = index + 1
    this.rebuild()
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open')
  }

  status(message: string): void {
    this.statusEl.textContent = message
  }

  setExporting(exporting: boolean): void {
    this.exportButton.disabled = exporting
    this.exportButton.textContent = exporting ? 'Exporting…' : 'Export video loop'
  }

  /** Called from the render loop: cheap readouts only. */
  syncTransport(): void {
    const { drive } = this.hooks
    const { motion } = this.store.config
    this.pauseButton.textContent = drive.paused ? 'Play' : 'Pause'
    if (document.activeElement !== this.phaseInput) this.phaseInput.value = String(drive.phase)
    const bpm = motion.loopSeconds > 0 ? (motion.beatsPerLoop * 60) / motion.loopSeconds : 0
    this.readout.textContent = `φ ${drive.phase.toFixed(3)} · ${bpm.toFixed(1)} bpm`
  }

  /** Full teardown and rebuild — used when the config is replaced wholesale. */
  rebuild(): void {
    this.controls = []
    this.tabs.replaceChildren()
    this.body.replaceChildren()

    const names = ['Global', ...this.store.config.layers.map((l) => l.id)]
    names.forEach((name, index) => {
      const tab = button(name, index === this.tab ? 'active' : '', () => {
        this.tab = index
        if (index > 0) this.hooks.setSelected(index - 1)
        this.rebuild()
      })
      this.tabs.append(tab)
    })

    const sections = this.tab === 0 ? globalSections() : layerSections(this.tab - 1)
    for (const section of sections) this.body.append(this.buildSection(section))
    if (this.tab === 0) this.body.append(this.buildToolsSection())

    this.refreshPresetList()
    this.refresh()
  }

  /** Push current config values into the existing controls. */
  refresh(): void {
    for (const control of this.controls) control.sync()
  }

  // ── building ──

  private buildSection(section: Section): HTMLElement {
    const details = document.createElement('details')
    details.className = 'section'
    details.open = !section.collapsed
    const summary = document.createElement('summary')
    summary.textContent = section.title
    details.append(summary)
    for (const field of section.fields) details.append(this.buildField(field))
    return details
  }

  private buildField(field: Field): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'control'
    // Lets a check drive a specific knob — `[data-path="layers.0.width"] input` — instead of
    // counting sliders and hoping the order never changes.
    wrap.dataset.path = field.path

    const label = document.createElement('label')
    label.textContent = field.label
    wrap.append(label)

    const commit = (value: unknown) => {
      this.store.set(field.path, value)
      this.hooks.onFieldChange(field.path)
    }

    let sync: () => void = () => {}

    if (field.kind === 'slider') {
      const number = document.createElement('input')
      number.type = 'number'
      number.min = String(field.min)
      number.max = String(field.max)
      number.step = String(field.step)
      const range = document.createElement('input')
      range.type = 'range'
      range.min = String(field.min)
      range.max = String(field.max)
      range.step = String(field.step)
      const apply = (raw: string) => {
        const value = Number(raw)
        if (Number.isFinite(value)) commit(clamp(value, field.min, field.max))
      }
      range.addEventListener('input', () => apply(range.value))
      number.addEventListener('input', () => apply(number.value))
      wrap.append(number, range)
      if (field.unit) label.textContent = `${field.label} (${field.unit})`
      sync = () => {
        const value = Number(this.store.get(field.path) ?? 0)
        if (document.activeElement !== number) number.value = String(round(value, field.step))
        if (document.activeElement !== range) range.value = String(value)
      }
    } else if (field.kind === 'toggle') {
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.addEventListener('change', () => commit(input.checked))
      wrap.append(input)
      sync = () => {
        input.checked = Boolean(this.store.get(field.path))
      }
    } else if (field.kind === 'color') {
      const swatch = document.createElement('input')
      swatch.type = 'color'
      const text = document.createElement('input')
      text.type = 'text'
      swatch.addEventListener('input', () => commit(swatch.value))
      text.addEventListener('change', () => commit(text.value.trim()))
      wrap.append(swatch, text)
      sync = () => {
        const value = String(this.store.get(field.path) ?? '#000000')
        swatch.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'
        if (document.activeElement !== text) text.value = value
      }
    } else if (field.kind === 'select') {
      const select = document.createElement('select')
      for (const option of field.options) {
        const el = document.createElement('option')
        el.value = option.value
        el.textContent = option.label
        select.append(el)
      }
      select.addEventListener('change', () => commit(select.value))
      wrap.append(select)
      sync = () => {
        select.value = String(this.store.get(field.path) ?? '')
      }
    } else {
      const input = document.createElement('input')
      input.type = 'text'
      input.addEventListener('change', () => commit(input.value.trim()))
      wrap.append(input)
      sync = () => {
        if (document.activeElement !== input) input.value = String(this.store.get(field.path) ?? '')
      }
    }

    if (field.hint) {
      const hint = document.createElement('div')
      hint.className = 'hint'
      hint.textContent = field.hint
      wrap.append(hint)
    }

    this.controls.push({ sync })
    sync()
    return wrap
  }

  /** Edit-time helpers. Not saved into presets: they describe the session, not the look. */
  private buildToolsSection(): HTMLElement {
    const details = document.createElement('details')
    details.className = 'section'
    details.open = true
    const summary = document.createElement('summary')
    summary.textContent = 'Edit tools'
    details.append(summary)

    const ghostWrap = document.createElement('div')
    ghostWrap.className = 'control'
    const ghostLabel = document.createElement('label')
    ghostLabel.textContent = 'Reference ghost'
    const ghost = document.createElement('input')
    ghost.type = 'range'
    ghost.min = '0'
    ghost.max = '1'
    ghost.step = '0.01'
    ghost.value = String(this.hooks.tools.ghost)
    ghost.addEventListener('input', () => {
      this.hooks.tools.ghost = Number(ghost.value)
      this.hooks.onToolsChange()
    })
    const ghostHint = document.createElement('div')
    ghostHint.className = 'hint'
    ghostHint.textContent =
      'Fades in the artist’s original composition, blended so a perfect match goes black. Drag layers until it disappears.'
    ghostWrap.append(ghostLabel, ghost, ghostHint)

    const boundsWrap = document.createElement('div')
    boundsWrap.className = 'control'
    const boundsLabel = document.createElement('label')
    boundsLabel.textContent = 'Layer outlines'
    const bounds = document.createElement('input')
    bounds.type = 'checkbox'
    bounds.checked = this.hooks.tools.bounds
    bounds.addEventListener('change', () => {
      this.hooks.tools.bounds = bounds.checked
      this.hooks.onToolsChange()
    })
    boundsWrap.append(boundsLabel, bounds)

    details.append(ghostWrap, boundsWrap)
    return details
  }

  // ── presets and files ──

  private refreshPresetList(): void {
    const current = this.presetSelect.value
    this.presetSelect.replaceChildren()
    for (const preset of listPresets()) {
      const option = document.createElement('option')
      option.value = `${preset.source}:${preset.name}`
      option.textContent = preset.source === 'builtin' ? `${preset.name} (file)` : preset.name
      this.presetSelect.append(option)
    }
    if (current) this.presetSelect.value = current
  }

  private loadSelectedPreset(): void {
    const [source, ...rest] = this.presetSelect.value.split(':')
    const name = rest.join(':')
    const preset = listPresets().find((p) => p.source === source && p.name === name)
    if (!preset) return this.status('No preset selected.')
    this.store.replace(structuredClone(preset.config))
    this.rebuild()
    this.status(`Loaded “${preset.name}”.`)
  }

  /** Save and hand back a link in one move — the only step most people need. */
  async saveAndShare(): Promise<void> {
    const suggestion = this.store.config.name === 'reference' ? '' : this.store.config.name
    const name = prompt('Name this look:', suggestion)?.trim()
    if (!name) return
    this.store.set('name', name)
    saveLocalPreset(name, this.store.config)
    this.refreshPresetList()
    this.presetSelect.value = `local:${name}`
    const copied = await copy(shareLink(this.store.config, { edit: true }))
    this.status(
      copied
        ? `Saved “${name}” and copied its link — paste it anywhere to bring this exact look back.`
        : `Saved “${name}”. The link is in the box above.`,
    )
  }

  private deleteSelectedPreset(): void {
    const [source, ...rest] = this.presetSelect.value.split(':')
    const name = rest.join(':')
    if (source !== 'local') return this.status('Only presets saved in this browser can be deleted here.')
    if (!confirm(`Delete the local preset “${name}”?`)) return
    deleteLocalPreset(name)
    this.refreshPresetList()
    this.status(`Deleted “${name}”.`)
  }

  private downloadJson(): void {
    const name = this.store.config.name || 'preset'
    // Only what differs from the reference, so a committed look reads as a short, reviewable
    // list of intentions rather than a dump of every parameter in the app.
    const blob = new Blob([JSON.stringify(minimalConfig(this.store.config), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`
    link.click()
    URL.revokeObjectURL(url)
    this.status(`Saved ${link.download}. Commit it into src/presets/ to make it permanent.`)
  }

  private openJson(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        this.store.replace(migrate(JSON.parse(await file.text())))
        this.rebuild()
        this.status(`Loaded ${file.name}.`)
      } catch (error) {
        this.status(`Could not read ${file.name}: ${error instanceof Error ? error.message : error}`)
      }
    })
    input.click()
  }

  private async copyLink(): Promise<void> {
    const url = shareLink(this.store.config, { edit: true })
    const copied = await copy(url)
    this.status(copied ? `Link copied (${url.length} characters) — the whole look travels in it.` : url)
  }

  private resetToReference(): void {
    if (!confirm('Discard the current look and go back to the artist’s reference composition?')) return
    this.store.replace(defaultConfig())
    this.rebuild()
    this.status('Back to the reference composition.')
  }
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = className
  el.textContent = text
  el.addEventListener('click', onClick)
  return el
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)))
  return Number(value.toFixed(decimals))
}
