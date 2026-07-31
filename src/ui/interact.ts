import type { Store } from '../config/store'
import type { Renderer } from '../engine/renderer'
import { hitTest, screenToDesign } from '../engine/layout'

/**
 * Direct manipulation on the canvas: drag to move, wheel to resize, shift+wheel to rotate.
 *
 * Hit testing uses each layer's *static* rect rather than its animated position, so a layer
 * doesn't squirm out from under the cursor mid-breath. Pausing with Space also helps.
 */
export function attachInteractions(options: {
  canvas: HTMLCanvasElement
  store: Store
  renderer: Renderer
  isEditing: () => boolean
  getSelected: () => number
  setSelected: (index: number) => void
}): void {
  const { canvas, store, renderer, isEditing, getSelected, setSelected } = options

  let dragging: { index: number; offsetX: number; offsetY: number } | null = null

  const toDesign = (clientX: number, clientY: number) =>
    screenToDesign(store.config.canvas, window.innerWidth, window.innerHeight, clientX, clientY)

  canvas.addEventListener('pointerdown', (event) => {
    if (!isEditing() || event.button !== 0) return
    const point = toDesign(event.clientX, event.clientY)
    const rects = renderer.layerRects(store.config)

    // Topmost first: later layers draw on top, so they win the click.
    for (let i = rects.length - 1; i >= 0; i--) {
      const rect = rects[i]
      if (!rect || !store.config.layers[i]?.visible) continue
      if (!hitTest(rect, point.x, point.y)) continue
      setSelected(i)
      dragging = { index: i, offsetX: point.x - rect.cx, offsetY: point.y - rect.cy }
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }
  })

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return
    const point = toDesign(event.clientX, event.clientY)
    const { canvas: design } = store.config
    const x = ((point.x - dragging.offsetX) / design.width) * 100
    const y = ((point.y - dragging.offsetY) / design.height) * 100
    store.set(`layers.${dragging.index}.x`, round(x))
    store.set(`layers.${dragging.index}.y`, round(y))
  })

  const endDrag = (event: PointerEvent) => {
    if (!dragging) return
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    dragging = null
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)

  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!isEditing()) return
      const index = getSelected()
      const layer = store.config.layers[index]
      if (!layer) return
      event.preventDefault()
      const step = event.deltaY * (event.altKey ? 0.02 : 0.08)
      if (event.shiftKey) {
        store.set(`layers.${index}.rotation`, round(clamp(layer.rotation - step, -180, 180)))
      } else {
        store.set(`layers.${index}.width`, round(clamp(layer.width - step, 1, 200)))
      }
    },
    { passive: false },
  )
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
