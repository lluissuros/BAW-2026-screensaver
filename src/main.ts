import './style.css'

import { defaultConfig } from './config/defaults'
import { findPreset, loadWorking, saveWorking } from './config/presets'
import { decodeConfig, Store } from './config/store'
import type { Config } from './config/types'
import { DriveBus } from './drive'
import { Renderer } from './engine/renderer'
import { recordLoop } from './export/recorder'
import { attachInteractions } from './ui/interact'
import { Overlay } from './ui/overlay'
import { Panel, type EditTools } from './ui/panel'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const uiRoot = document.querySelector<HTMLElement>('#ui')!

const store = new Store(resolveInitialConfig())
const drive = new DriveBus()
const renderer = new Renderer(canvas)
await renderer.load()

const overlay = new Overlay(uiRoot)
const tools: EditTools = { ghost: 0, bounds: true }

let editing = new URLSearchParams(location.search).has('edit')
let selected = 0
let exporting = false
let hintTimer = 0
let autosaveTimer = 0
let lastFrameAt = performance.now()

const panel = new Panel(uiRoot, store, {
  drive,
  tools,
  onToolsChange: applyTools,
  onFieldChange: (path) => {
    if (path === 'audio.enabled') void syncAudio()
  },
  onExportVideo: () => void exportVideo(),
  getSelected: () => selected,
  setSelected: select,
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

const hint = document.createElement('div')
hint.id = 'hint'
hint.innerHTML = '<kbd>E</kbd> edit · <kbd>F</kbd> fullscreen'
uiRoot.append(hint)

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
})

// A handle on the running app for the browser console. Useful while sitting with the artist
// ("try width 62"), and it is how the screenshot checks in scripts/ drive the page.
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    baw: { store, drive, renderer, tools, panel, setMode, applyTools, recordLoop },
  })
}

showHint(4000)
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
  editing = edit
  document.body.classList.toggle('show-mode', !edit)
  panel.open(edit)
  overlay.setVisible(edit)
  if (edit) panel.selectLayer(selected)
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
  if (event.key === 'Escape' && editing) {
    setMode(false)
    return
  }
  if (typing) return

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
  const hash = location.hash.startsWith('#c=') ? location.hash.slice(3) : ''
  if (hash) {
    const shared = decodeConfig(hash)
    if (shared) return shared
  }

  const wanted = new URLSearchParams(location.search).get('preset')
  if (wanted) {
    const preset = findPreset(wanted)
    if (preset) return structuredClone(preset.config)
  }

  // Nothing asked for: pick up where the last session left off, so a stray reload mid-edit
  // costs nothing. `?fresh=1` skips that.
  if (!new URLSearchParams(location.search).has('fresh')) {
    const working = loadWorking()
    if (working) return working
  }

  return defaultConfig()
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
