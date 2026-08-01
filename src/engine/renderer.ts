import { ASSETS } from '../assets/manifest'
import type { Config } from '../config/types'
import type { Drive } from '../drive/types'
import {
  createContext,
  createRenderTarget,
  createUnitQuad,
  deleteRenderTarget,
  hexToRgb,
  loadTexture,
  Shader,
  type RenderTarget,
  type Texture,
} from './gl'
import { computeFit, contentRect, type Rect } from './layout'
import { computeLayerFrame } from './motion'

import layerVert from './shaders/layer.vert.glsl?raw'
import layerFrag from './shaders/layer.frag.glsl?raw'
import postVert from './shaders/post.vert.glsl?raw'
import postFrag from './shaders/post.frag.glsl?raw'

/**
 * Two-stage renderer.
 *
 * Stage one composes the layers into an offscreen target at the *design* resolution, so the
 * composition is identical whatever screen it lands on — a laptop, the festival's panel, or
 * the exporter. Stage two fits that image onto the actual canvas and adds grain.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext
  private readonly quad: WebGLVertexArrayObject
  private readonly layerShader: Shader
  private readonly postShader: Shader
  private readonly textures = new Map<string, Texture>()
  private target: RenderTarget | null = null

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = createContext(canvas)
    this.quad = createUnitQuad(this.gl)
    this.layerShader = new Shader(this.gl, layerVert, layerFrag, 'layer')
    this.postShader = new Shader(this.gl, postVert, postFrag, 'post')
  }

  /** Loads every asset in the manifest up front — there are only a few and they are small. */
  async load(): Promise<void> {
    const loaded = await Promise.all(
      ASSETS.map(async (asset) => [asset.key, await loadTexture(this.gl, asset.url)] as const),
    )
    for (const [key, texture] of loaded) this.textures.set(key, texture)
  }

  texture(assetKey: string): Texture | undefined {
    return this.textures.get(assetKey)
  }

  /** Static rects for every layer, in design space. Edit mode uses these for hit testing. */
  layerRects(config: Config): (Rect | null)[] {
    return config.layers.map((layer) => {
      const texture = this.textures.get(layer.asset)
      return texture ? contentRect(layer, config.canvas, texture) : null
    })
  }

  private ensureTarget(width: number, height: number): RenderTarget {
    if (this.target && this.target.width === width && this.target.height === height) return this.target
    if (this.target) deleteRenderTarget(this.gl, this.target)
    this.target = createRenderTarget(this.gl, width, height)
    return this.target
  }

  render(config: Config, drive: Drive): void {
    const gl = this.gl
    const design = {
      width: Math.max(16, Math.round(config.canvas.width)),
      height: Math.max(16, Math.round(config.canvas.height)),
    }
    const target = this.ensureTarget(design.width, design.height)
    const [br, bg, bb] = hexToRgb(config.canvas.background)

    // ── stage one: compose the layers at design resolution ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.viewport(0, 0, target.width, target.height)
    gl.clearColor(br, bg, bb, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    // Textures are uploaded premultiplied, so this is the correct blend for them.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.bindVertexArray(this.quad)
    this.layerShader.use()
    this.layerShader.i('uTex', 0)
    this.layerShader.f2('uResolution', target.width, target.height)
    gl.activeTexture(gl.TEXTURE0)

    for (const layer of config.layers) {
      if (!layer.visible || layer.opacity <= 0) continue
      const texture = this.textures.get(layer.asset)
      if (!texture) continue

      const base = contentRect(layer, config.canvas, texture)
      if (base.w <= 0 || base.h <= 0) continue
      const frame = computeLayerFrame(layer, base, texture, config.canvas, config.motion, drive)

      gl.bindTexture(gl.TEXTURE_2D, texture.handle)
      this.layerShader.mat3('uModel', frame.model)
      this.layerShader.f2('uUvHalf', frame.uvHalf[0], frame.uvHalf[1])
      this.layerShader.f('uOpacity', frame.opacity)
      this.layerShader.f('uPhase', frame.phase)
      this.layerShader.f('uSeed', frame.seed)
      this.layerShader.f2('uWobble', frame.wobbleUv[0], frame.wobbleUv[1])
      this.layerShader.f('uWobbleScale', frame.wobbleScale)
      this.layerShader.f('uWobbleRate', frame.wobbleRate)
      this.layerShader.f('uRipple', frame.rippleUv)
      this.layerShader.f('uRippleWaves', frame.rippleWaves)
      this.layerShader.f('uRippleRate', frame.rippleRate)
      this.layerShader.f2('uBleed', frame.bleedUv[0], frame.bleedUv[1])
      this.layerShader.f('uBleedMid', frame.bleedMid)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    // ── stage two: fit onto the real canvas and finish ──
    const fit = computeFit(config.canvas, this.canvas.width, this.canvas.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.BLEND)
    // Everything outside the design canvas gets its own colour — black by default. Filling it with
    // the background instead would make the composition look like it bleeds to the screen edge,
    // and then there is no way to tell whether an element is centred.
    const [or_, og, ob] = hexToRgb(config.canvas.outside)
    gl.clearColor(or_, og, ob, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    this.postShader.use()
    this.postShader.i('uTex', 0)
    this.postShader.f2('uScale', fit.scaleX, fit.scaleY)
    this.postShader.f('uGrain', config.post.grain)
    this.postShader.f('uVignette', config.post.vignette)
    // Derived from the phase so the grain loops along with everything else.
    this.postShader.f('uGrainSeed', Math.floor(drive.phase * 1024))
    gl.bindTexture(gl.TEXTURE_2D, target.texture)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }
}
