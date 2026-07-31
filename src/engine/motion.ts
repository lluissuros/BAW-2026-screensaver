import { ASSET_PAD } from '../assets/manifest'
import type { CanvasConfig, GlobalMotionConfig, LayerConfig } from '../config/types'
import type { Texture } from './gl'
import type { Rect } from './layout'
import type { Drive } from '../drive/types'

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/**
 * Everything the shader needs for one layer on one frame. Transform-space effects (breathe,
 * pulse, squash, sway, drift) end up in `model`; texture-space effects (wobble, ripple,
 * bleed) end up in the warp uniforms.
 *
 * Two rules hold throughout:
 *
 *  - Every temporal rate is a whole number of cycles per loop, so `phase = 0` and
 *    `phase = 1` produce identical frames. That is what makes the screensaver seamless and
 *    the exported video a true loop.
 *  - Amounts are relative to the artwork's own size, never absolute pixels, so a look built
 *    at one canvas size survives being moved to another screen.
 */
export interface LayerFrame {
  model: Float32Array
  uvHalf: [number, number]
  wobbleUv: [number, number]
  wobbleScale: number
  wobbleRate: number
  rippleUv: number
  rippleWaves: number
  rippleRate: number
  bleedUv: [number, number]
  bleedMid: number
  opacity: number
  phase: number
  seed: number
}

export function computeLayerFrame(
  layer: LayerConfig,
  base: Rect,
  texture: Texture,
  canvas: CanvasConfig,
  global: GlobalMotionConfig,
  drive: Drive,
): LayerFrame {
  const m = layer.motion
  const intensity = Math.max(0, global.intensity)
  const phase = (drive.phase + m.phaseOffset) % 1

  // A slow swell around the mean, so the motion has macro dynamics instead of ticking along
  // at one amplitude. In audio mode this is the actual loudness of the room.
  const swell = 1 + (drive.energy - 0.5) * 1.2 * m.follow
  const amp = intensity * Math.max(0, swell)

  const breathe = (m.breathe / 100) * amp * Math.sin(TAU * phase * m.breatheRate)
  const kick = (m.pulse / 100) * intensity * drive.beat
  const squash = (m.squash / 100) * amp * Math.sin(TAU * phase * m.squashRate + 1.7)

  const scaleX = Math.max(0.01, 1 + breathe + kick + squash)
  const scaleY = Math.max(0.01, 1 + breathe + kick - squash)

  const rotation = (layer.rotation + m.sway * amp * Math.sin(TAU * phase * m.swayRate + 0.4)) * DEG

  // A closed Lissajous path (1:2 frequency ratio), so the drift returns exactly to where it
  // started rather than jumping at the seam.
  const driftSpan = (m.drift / 100) * amp * canvas.width
  const cx = base.cx + driftSpan * Math.sin(TAU * phase * m.driftRate)
  const cy = base.cy + driftSpan * Math.sin(TAU * phase * m.driftRate * 2 + 1.05)

  const halfW = Math.max(0.5, (base.w / 2) * scaleX)
  const halfH = Math.max(0.5, (base.h / 2) * scaleY)

  // Texture-space warps push samples around, so the quad has to be a little larger than the
  // artwork or the displaced pixels would be clipped off at the edge.
  const shortSide = Math.max(1, Math.min(base.w, base.h))
  const wobblePx = (m.wobble / 100) * shortSide * amp
  const ripplePx = (m.ripple / 100) * shortSide * amp
  const bleedPx = (m.bleed / 100) * shortSide * intensity
  const marginPx = (wobblePx + ripplePx + bleedPx) * 1.6 + 3

  const quadHalfW = halfW + marginPx
  const quadHalfH = halfH + marginPx

  // The artwork occupies all of the texture except the transparent border, so its UV
  // half-extent is a touch under 0.5. Growing the quad grows the UV window to match, which
  // is what lets warped samples reach into the transparent margin instead of smearing.
  const uvHalfX = (0.5 - ASSET_PAD / texture.width) * (quadHalfW / halfW)
  const uvHalfY = (0.5 - ASSET_PAD / texture.height) * (quadHalfH / halfH)

  // Design pixels → UV units, per axis, so a displacement given in pixels stays circular
  // even when the layer is stretched.
  const uvPerPxX = uvHalfX / quadHalfW
  const uvPerPxY = uvHalfY / quadHalfH

  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  // Column-major mat3: unit quad → rotated, scaled, translated design-space quad.
  const model = new Float32Array([
    cos * quadHalfW, sin * quadHalfW, 0,
    -sin * quadHalfH, cos * quadHalfH, 0,
    cx, cy, 1,
  ])

  return {
    model,
    uvHalf: [uvHalfX, uvHalfY],
    wobbleUv: [wobblePx * uvPerPxX, wobblePx * uvPerPxY],
    wobbleScale: m.wobbleScale,
    wobbleRate: m.wobbleRate,
    rippleUv: ripplePx * uvPerPxX,
    rippleWaves: m.rippleWaves,
    rippleRate: m.rippleRate,
    bleedUv: [bleedPx * uvPerPxX, bleedPx * uvPerPxY],
    bleedMid: 0.5 - 0.28 * Math.sin(TAU * phase + 2.2),
    opacity: layer.opacity,
    phase,
    seed: global.seed,
  }
}
