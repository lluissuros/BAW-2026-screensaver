import './style.css'

import { defaultConfig } from './config/defaults'
import { parseCollection } from './config/links'
import { findPreset, loadWorking, saveWorking } from './config/presets'
import { decodeConfig, encodeConfig, Store } from './config/store'
import type { Config } from './config/types'
import { DriveBus } from './drive'
import { Renderer } from './engine/renderer'
import { ThumbnailRenderer } from './engine/thumbnail'
import { recordLoop } from './export/recorder'
import { canEdit, isTouchPrimary } from './ui/device'
import { Gallery } from './ui/gallery'
import { attachInteractions } from './ui/interact'
import { Overlay } from './ui/overlay'
import { Panel, type EditTools } from './ui/panel'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const uiRoot = document.querySelector<HTMLElement>('#ui')!
const params = new URLSearchParams(location.search)

/** Looks that arrived on a collection link, held for the gallery to offer. */
const receivedLooks: Config[] = []

const store = new Store(resolveInitialConfig())
const drive = new DriveBus()
const renderer = new Renderer(canvas)
await renderer.load()

const overlay = new Overlay(uiRoot)
const tools: EditTools = { ghost: 0, bounds: true }

const thumbnails = new ThumbnailRenderer()

/**
 * Whether this device gets an editor at all. On a phone it does not: the panel would cover the
 * composition, and a shared link (which carries `?edit=1` for collaborators on a laptop) should
 * open as a clean display instead.
 */
const editable = canEdit(params)

let editing = editable && params.has('edit')
let selected = 0
let exporting = false
let hintTimer = 0
let autosaveTimer = 0
let permalinkTimer = 0
let lastFrameAt = performance.now()

const panel = new Panel(uiRoot, store, {
  drive,
  tools,
  onToolsChange: applyTools,
  onFieldChange: (path) => {
    if (path === 'audio.enabled') void syncAudio()
  },
  onExportVideo: () => void exportVideo(),
  onOpenGallery: () => gallery.open(receivedLooks),
  getSelected: () => selected,
  setSelected: select,
})

const gallery = new Gallery(uiRoot, {
  thumbnails,
  canSave: editable,
  getCurrent: () => store.config,
  onSaveCurrent: () => {
    void panel.saveAndShare().then(() => gallery.refresh())
  },
  onOpen: (config, label) => {
    store.replace(config)
    panel.rebuild()
    panel.status(`Opened “${label}”.`)
    if (editable && !editing) setMode(true)
  },
})

attachInteractions({
  canvas,
  store,
  renderer,
  isEditing: () => editing,
  getSelected: () => selected,
  setSelected: (index) => {
    select(index)
    panel.selectLayer(index)
  },
})

// Clickable, not just a keyboard hint: most people who open the shared link will never guess
// that a letter key opens an editor. On a phone there is nothing to open, so the same pill offers
// the one thing that helps there — getting the browser chrome out of the way.
const hint = document.createElement('button')
hint.id = 'hint'
hint.type = 'button'
if (editable) {
  hint.innerHTML = 'Edit this screen <span>· <kbd>E</kbd> · <kbd>F</kbd> full screen</span>'
  hint.addEventListener('click', () => setMode(true))
} else {
  hint.textContent = 'Tap for full screen'
  hint.addEventListener('click', () => void toggleFullscreen())
}
uiRoot.append(hint)

if (!editable) {
  // The whole screen is the button. On a phone the only useful control is getting the browser's
  // chrome out of the way.
  canvas.addEventListener('click', () => void toggleFullscreen())
  if (isTouchPrimary()) document.body.classList.add('touch')
}

setMode(editing)
applyTools()
resize()
window.addEventListener('resize', resize)
window.addEventListener('keydown', onKeyDown)

// An installation runs for hours on a machine nobody is watching. If the GPU context is lost
// (driver hiccup, the screen sleeping), reload rather than sit there on a frozen frame.
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault()
  setTimeout(() => location.reload(), 1200)
})

store.subscribe((config) => {
  clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => saveWorking(config), 400)
  // Keep the address bar a valid permalink at all times, so "copy the URL" is always a way to
  // save and share — no button required, and a reload restores exactly what you were looking at.
  clearTimeout(permalinkTimer)
  permalinkTimer = window.setTimeout(() => {
    history.replaceState(null, '', `${location.pathname}${location.search}#c=${encodeConfig(config)}`)
  }, 600)
})

const routedView = (window as unknown as { __BAW_VIEW__?: string }).__BAW_VIEW__
if (params.has('gallery') || routedView === 'gallery') gallery.open(receivedLooks)

// A handle on the running app for the browser console. Useful while sitting with the artist
// ("try width 62"), and it is how the screenshot checks in scripts/ drive the page.
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    baw: { store, drive, renderer, tools, panel, setMode, applyTools, recordLoop },
  })
}

// Shorter on a phone: the pill sits over the hand-lettering, and there is only one thing it can
// tell you.
showHint(editable ? 4000 : 2500)
requestAnimationFrame(loop)

// ── loop ──

function loop(now: number): void {
  requestAnimationFrame(loop)
  if (exporting) return

  const dt = Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000))
  lastFrameAt = now

  const config = store.config
  renderer.render(config, drive.tick(dt, config))

  if (editing) {
    overlay.update(config, window.innerWidth, window.innerHeight, renderer.layerRects(config), selected)
    panel.syncTransport()
  }
}

// ── modes ──

function setMode(edit: boolean): void {
  editing = edit && editable
  document.body.classList.toggle('show-mode', !editing)
  panel.open(editing)
  overlay.setVisible(editing)
  if (editing) panel.selectLayer(selected)
}

function applyTools(): void {
  overlay.setGhostOpacity(tools.ghost)
  overlay.setBoundsVisible(tools.bounds)
}

function select(index: number): void {
  selected = Math.min(Math.max(0, index), store.config.layers.length - 1)
}

function resize(): void {
  if (exporting) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.max(2, Math.round(window.innerWidth * dpr))
  canvas.height = Math.max(2, Math.round(window.innerHeight * dpr))
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const typing = target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA'

  if (event.key === 'e' || event.key === 'E') {
    if (typing) return
    setMode(!editing)
    return
  }
  if (event.key === 'f' || event.key === 'F') {
    if (typing) return
    void toggleFullscreen()
    return
  }
  if (event.key === 'Escape') {
    if (gallery.isOpen) gallery.close()
    else if (editing) setMode(false)
    return
  }
  if (typing) return

  if (event.key === 'l' || event.key === 'L') {
    if (gallery.isOpen) gallery.close()
    else gallery.open(receivedLooks)
    return
  }

  if (event.key === ' ') {
    event.preventDefault()
    drive.paused = !drive.paused
    return
  }
  if (event.key === 'g' || event.key === 'G') {
    tools.ghost = tools.ghost > 0 ? 0 : 0.55
    applyTools()
    panel.rebuild()
    return
  }
  if (event.key === 'h' || event.key === 'H') {
    showHint(2500)
    return
  }
  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1
    if (index < store.config.layers.length) {
      select(index)
      panel.selectLayer(index)
    }
    return
  }

  // Nudging is the one thing a mouse is bad at, so keep it on the arrows.
  const nudge: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const delta = nudge[event.key]
  if (delta && editing) {
    event.preventDefault()
    const step = event.shiftKey ? 1 : 0.1
    const layer = store.config.layers[selected]
    if (!layer) return
    store.set(`layers.${selected}.x`, roundTo(layer.x + delta[0] * step, 1))
    store.set(`layers.${selected}.y`, roundTo(layer.y + delta[1] * step, 1))
  }
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    // Denied or unsupported — the composition still fills the window.
  }
}

function showHint(ms: number): void {
  hint.classList.add('visible')
  clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => hint.classList.remove('visible'), ms)
}

// ── audio ──

async function syncAudio(): Promise<void> {
  const wanted = store.config.audio.enabled
  if (wanted && !drive.audio.running) {
    const ok = await drive.audio.start()
    if (!ok) {
      store.set('audio.enabled', false)
      panel.status(`Audio input unavailable: ${drive.audio.error ?? 'permission denied'}. Still running on synthetic motion.`)
      panel.refresh()
    } else {
      panel.status('Listening to audio input.')
    }
  } else if (!wanted && drive.audio.running) {
    drive.audio.stop()
    panel.status('Audio input stopped.')
  }
}

// ── export ──

async function exportVideo(): Promise<void> {
  if (exporting) return
  const config: Config = structuredClone(store.config)
  // A recording has to be reproducible, and live audio is not. Force synthetic motion.
  config.audio.enabled = false

  const fps = 30
  const seconds = config.motion.loopSeconds
  const previousWidth = canvas.width
  const previousHeight = canvas.height
  const previousPhase = drive.phase

  exporting = true
  document.body.classList.add('exporting')
  panel.setExporting(true)
  panel.status(`Recording ${seconds}s at ${config.canvas.width}×${config.canvas.height}…`)

  // Record at the design resolution exactly, whatever the window happens to be.
  canvas.width = config.canvas.width
  canvas.height = config.canvas.height

  try {
    const recording = await recordLoop({
      canvas,
      seconds,
      fps,
      render: (phase) => {
        drive.setPhase(phase)
        renderer.render(config, drive.sample(config, 1 / fps))
      },
      onProgress: (fraction, frame, total) => {
        panel.status(`Recording… frame ${frame}/${total} (${Math.round(fraction * 100)}%)`)
      },
    })

    const name = `${(config.name || 'baw').replace(/[^\w-]+/g, '-').toLowerCase()}-${config.canvas.width}x${
      config.canvas.height
    }-${seconds}s.${recording.extension}`
    const url = URL.createObjectURL(recording.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    panel.status(`Saved ${name} — ${recording.frames} frames. See README for converting to mp4/ProRes.`)
  } catch (error) {
    panel.status(`Export failed: ${error instanceof Error ? error.message : error}`)
  } finally {
    exporting = false
    document.body.classList.remove('exporting')
    panel.setExporting(false)
    canvas.width = previousWidth
    canvas.height = previousHeight
    drive.setPhase(previousPhase)
    resize()
  }
}

// ── startup config ──

function resolveInitialConfig(): Config {
  // A link someone was sent always wins — that is the whole point of it.
  if (location.hash.startsWith('#c=')) {
    const shared = decodeConfig(location.hash.slice(3))
    if (shared) return shared
  }

  // A collection link: several looks in one URL. Open the first, offer the rest in the gallery.
  if (location.hash.startsWith('#cs=')) {
    for (const encoded of parseCollection(location.hash.slice(4))) {
      const config = decodeConfig(encoded)
      if (config) receivedLooks.push(config)
    }
    if (receivedLooks[0]) return structuredClone(receivedLooks[0])
  }

  // The generated route pages (`/1/`, `/calm/`) inject this. Someone opening /3 wants look 3,
  // not whatever they were fiddling with yesterday, so it outranks the autosave.
  const routed = (window as unknown as { __BAW_LOOK__?: string }).__BAW_LOOK__
  const wanted = routed || params.get('preset')
  if (wanted) {
    const preset = findPreset(wanted)
    if (preset) return structuredClone(preset.config)
  }

  // Nothing asked for: pick up where the last session left off, so a stray reload mid-edit
  // costs nothing. `?fresh=1` skips that.
  if (!params.has('fresh')) {
    const working = loadWorking()
    if (working) return working
  }

  return defaultConfig()
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
