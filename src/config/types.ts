/**
 * The whole visual state of the screensaver is this one plain object. It is what the edit
 * panel mutates, what gets saved as a preset, and what the renderer reads every frame —
 * there is no other source of truth.
 *
 * Geometry is resolution-independent: positions and sizes are percentages of the design
 * canvas, so a preset made on a laptop looks identical on the venue's screen.
 */

export interface Config {
  /** Bumped when the shape changes incompatibly, so old presets can be migrated. */
  version: number
  name: string
  canvas: CanvasConfig
  motion: GlobalMotionConfig
  audio: AudioConfig
  post: PostConfig
  layers: LayerConfig[]
}

export interface CanvasConfig {
  /** Design resolution. Everything is composed here, then fitted to the real screen. */
  width: number
  height: number
  /** contain = whole composition visible with background bars. cover = fill, cropping. */
  fit: 'contain' | 'cover'
  background: string
  /**
   * What fills the screen *outside* the design canvas. Black by default, on purpose: matching it
   * to the background hides where the composition ends, and you cannot judge whether something is
   * centred if you cannot see the edges it is centred within.
   */
  outside: string
}

export interface GlobalMotionConfig {
  /**
   * Length of one full cycle. Every animation rate is an integer number of cycles per
   * loop, which is what makes the motion seamless — there is no restart to see.
   */
  loopSeconds: number
  /** Scales every layer's motion amounts at once. 0 = frozen composition. */
  intensity: number
  /** Beats per loop. Integer, so the pulse also lands seamlessly. */
  beatsPerLoop: number
  /** Changes the noise field without changing any amount. */
  seed: number
}

export interface AudioConfig {
  /** Off by default: the screensaver must never depend on the venue's audio setup. */
  enabled: boolean
  /** How much live audio replaces the synthetic drive, 0..1. */
  amount: number
  gain: number
  /** 0..0.99 — higher is smoother, slower to react. */
  smoothing: number
  beatSensitivity: number
}

export interface PostConfig {
  /** A touch of grain stops large flat areas of fuchsia from banding on big screens. */
  grain: number
  vignette: number
}

export interface LayerConfig {
  id: string
  /** Key into the asset manifest (src/assets/*.png). */
  asset: string
  visible: boolean
  /** Centre of the artwork, as a percentage of the design canvas. */
  x: number
  y: number
  /** Artwork width as a percentage of canvas width. Height follows the natural aspect. */
  width: number
  /** 1 = natural aspect ratio. The reference composition stretches the forma to 1.125. */
  stretchY: number
  rotation: number
  opacity: number
  motion: LayerMotionConfig
}

export interface LayerMotionConfig {
  // ── transform-space: moves the whole artwork, never touches its internal shape ──
  /** Uniform scale oscillation, % of size. */
  breathe: number
  breatheRate: number
  /** Beat-synced scale kick, % of size. */
  pulse: number
  /** Anisotropic squash/stretch, % — taller and thinner, then wider and shorter. */
  squash: number
  squashRate: number
  /** Rotation sway, degrees. */
  sway: number
  swayRate: number
  /** Positional drift along a closed path, % of canvas. */
  drift: number
  driftRate: number

  // ── texture-space: deforms the artwork itself ──
  /** Domain-warped noise displacement, % of the artwork's short side. */
  wobble: number
  /** Noise frequency across the artwork. Low = whole-body flex, high = edge chatter. */
  wobbleScale: number
  wobbleRate: number
  /** Travelling wave along the long axis, % of the short side. */
  ripple: number
  rippleWaves: number
  rippleRate: number
  /** Dilates and erodes the painted edge, like ink bleeding. % of the short side. */
  bleed: number

  /**
   * How much this layer's amplitude follows the drive's overall energy, 0..1. Works in both
   * modes: synthetic energy swells slowly, audio energy is the loudness of the room.
   */
  follow: number
  /** Offsets this layer in the loop so layers don't all breathe in unison. */
  phaseOffset: number
}
