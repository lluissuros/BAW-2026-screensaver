import { REFERENCE_URL } from '../assets/manifest'
import type { Config } from '../config/types'
import { computeFit, type Rect } from '../engine/layout'

/**
 * Edit-mode scaffolding drawn on top of the canvas in plain DOM: the artist's original
 * composition as a tracing ghost, and a dashed box per layer.
 *
 * The ghost is what makes a session with the artist quick — instead of arguing about
 * coordinates, you fade in the original and drag until it disappears. It is blended with
 * `difference`, so a perfect match reads as black.
 */
export class Overlay {
  readonly el: HTMLDivElement
  private readonly ghost: HTMLImageElement
  private readonly svg: SVGSVGElement
  private readonly boxes: SVGRectElement[] = []

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div')
    this.el.id = 'overlay'
    this.el.className = 'hidden'

    // The ghost is a direct child of <body> on purpose. `mix-blend-mode` only blends with the
    // backdrop of the parent stacking context, and a `position: fixed` wrapper is one — so
    // nested inside #overlay it could never see the canvas underneath it.
    this.ghost = document.createElement('img')
    this.ghost.id = 'ghost'
    if (REFERENCE_URL) this.ghost.src = REFERENCE_URL
    this.ghost.alt = ''
    document.body.append(this.ghost)

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.setAttribute('preserveAspectRatio', 'none')
    this.el.append(this.svg)

    parent.append(this.el)
  }

  setVisible(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible)
    this.ghost.classList.toggle('hidden', !visible)
  }

  setGhostOpacity(opacity: number): void {
    this.ghost.style.opacity = String(opacity)
  }

  setBoundsVisible(visible: boolean): void {
    this.svg.style.display = visible ? '' : 'none'
  }

  update(config: Config, screenW: number, screenH: number, rects: (Rect | null)[], selected: number): void {
    const fit = computeFit(config.canvas, screenW, screenH)
    const w = screenW * fit.scaleX
    const h = screenH * fit.scaleY
    this.el.style.left = `${(screenW - w) / 2}px`
    this.el.style.top = `${(screenH - h) / 2}px`
    this.el.style.width = `${w}px`
    this.el.style.height = `${h}px`
    for (const [prop, value] of [
      ['left', `${(screenW - w) / 2}px`],
      ['top', `${(screenH - h) / 2}px`],
      ['width', `${w}px`],
      ['height', `${h}px`],
    ] as const) {
      this.ghost.style.setProperty(prop, value)
    }
    this.svg.setAttribute('viewBox', `0 0 ${config.canvas.width} ${config.canvas.height}`)

    while (this.boxes.length < rects.length) {
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      this.svg.append(box)
      this.boxes.push(box)
    }

    rects.forEach((rect, i) => {
      const box = this.boxes[i]!
      if (!rect || !config.layers[i]?.visible) {
        box.style.display = 'none'
        return
      }
      box.style.display = ''
      box.setAttribute('x', String(rect.cx - rect.w / 2))
      box.setAttribute('y', String(rect.cy - rect.h / 2))
      box.setAttribute('width', String(rect.w))
      box.setAttribute('height', String(rect.h))
      box.setAttribute('transform', `rotate(${rect.rotation} ${rect.cx} ${rect.cy})`)
      box.classList.toggle('selected', i === selected)
    })

    for (let i = rects.length; i < this.boxes.length; i++) this.boxes[i]!.style.display = 'none'
  }
}
