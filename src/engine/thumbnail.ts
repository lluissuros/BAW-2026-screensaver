import type { Config } from '../config/types'
import { syntheticDrive } from '../drive/synthetic'
import { Renderer } from './renderer'

/**
 * Renders a look to a small PNG for the gallery.
 *
 * Geometry in a Config is expressed as percentages, so shrinking the design canvas produces the
 * same picture at a smaller size — the thumbnail is the real renderer's output, not an
 * approximation of it, and it costs a fraction of a full-resolution frame.
 *
 * Uses its own GL context so it can never disturb the frame on screen.
 */
export class ThumbnailRenderer {
  private readonly canvas = document.createElement('canvas')
  private renderer: Renderer | null = null
  private loading: Promise<Renderer> | null = null
  private readonly cache = new Map<string, string>()

  private async ready(): Promise<Renderer> {
    if (this.renderer) return this.renderer
    this.loading ??= (async () => {
      const renderer = new Renderer(this.canvas)
      await renderer.load()
      this.renderer = renderer
      return renderer
    })()
    return this.loading
  }

  /** Returns a PNG data URL. `key` is used for caching; pass something stable per look. */
  async render(config: Config, key: string, height = 300): Promise<string> {
    const cached = this.cache.get(key)
    if (cached) return cached

    const renderer = await this.ready()
    const scale = height / Math.max(1, config.canvas.height)
    const scaled: Config = {
      ...structuredClone(config),
      canvas: {
        ...config.canvas,
        width: Math.max(16, Math.round(config.canvas.width * scale)),
        height: Math.round(height),
        fit: 'contain',
      },
      // Grain is sized in screen pixels, so at a seventh of the size it stops reading as a
      // finish and starts reading as a broken image. It is not part of what the card is showing.
      post: { ...config.post, grain: 0 },
    }
    this.canvas.width = scaled.canvas.width
    this.canvas.height = scaled.canvas.height

    // A phase slightly off the beat, so thumbnails aren't all caught at the pulse's peak.
    const phase = 0.12
    renderer.render(scaled, { phase, ...syntheticDrive(phase, scaled.motion.beatsPerLoop, scaled.motion.seed) })

    const url = this.canvas.toDataURL('image/png')
    this.cache.set(key, url)
    return url
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }
}
