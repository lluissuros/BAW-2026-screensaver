import { ASSET_PAD } from '../assets/manifest'
import type { CanvasConfig, LayerConfig } from '../config/types'
import type { Texture } from './gl'

/** An axis-aligned-before-rotation rectangle in design-canvas pixels. */
export interface Rect {
  cx: number
  cy: number
  w: number
  h: number
  rotation: number
}

/**
 * Where the artwork sits when nothing is animating. Edit-mode dragging and hit testing use
 * this rather than the animated position, so a layer doesn't wriggle out from under the
 * cursor while you are trying to grab it.
 */
export function contentRect(layer: LayerConfig, canvas: CanvasConfig, texture: Texture): Rect {
  const artW = Math.max(1, texture.width - 2 * ASSET_PAD)
  const artH = Math.max(1, texture.height - 2 * ASSET_PAD)
  const w = (layer.width / 100) * canvas.width
  const h = w * (artH / artW) * layer.stretchY
  return {
    cx: (layer.x / 100) * canvas.width,
    cy: (layer.y / 100) * canvas.height,
    w,
    h,
    rotation: layer.rotation,
  }
}

/** Is this design-space point inside the (possibly rotated) rect? */
export function hitTest(rect: Rect, px: number, py: number): boolean {
  const a = (-rect.rotation * Math.PI) / 180
  const dx = px - rect.cx
  const dy = py - rect.cy
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(lx) <= rect.w / 2 && Math.abs(ly) <= rect.h / 2
}

export interface Fit {
  /** Half-extent of the composition in clip space, 0..1 per axis. */
  scaleX: number
  scaleY: number
}

/** How the design canvas maps onto the real screen. */
export function computeFit(canvas: CanvasConfig, screenW: number, screenH: number): Fit {
  const screenAspect = screenW / Math.max(1, screenH)
  const designAspect = canvas.width / Math.max(1, canvas.height)
  const wider = screenAspect > designAspect
  const contain = canvas.fit !== 'cover'
  if (contain === wider) {
    return { scaleX: designAspect / screenAspect, scaleY: 1 }
  }
  return { scaleX: 1, scaleY: screenAspect / designAspect }
}

/** Screen pixel → design-canvas pixel, so mouse input lands where the artwork is. */
export function screenToDesign(
  canvas: CanvasConfig,
  screenW: number,
  screenH: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  const fit = computeFit(canvas, screenW, screenH)
  const drawnW = screenW * fit.scaleX
  const drawnH = screenH * fit.scaleY
  const offsetX = (screenW - drawnW) / 2
  const offsetY = (screenH - drawnH) / 2
  return {
    x: ((sx - offsetX) / drawnW) * canvas.width,
    y: ((sy - offsetY) / drawnH) * canvas.height,
  }
}
