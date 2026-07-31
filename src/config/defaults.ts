import type { Config, LayerMotionConfig } from './types'

/** The two colours the artist fixed. Sampled from `Mesa de trabajo 1_1.png`. */
export const PALETTE = {
  /** Background fuchsia. */
  fuchsia: '#fb80a4',
  /** The logo's red. */
  redLogo: '#e50000',
  /** The painted forma's red. */
  redForma: '#f00000',
  /** The hand-drawn "BRAVA! ARTS WEEKEND" red. */
  redInk: '#ce1215',
} as const

/**
 * Layer geometry below is measured off the artist's reference composition
 * (`assets-source/reference-composition.png`, 4253 × 8504) by masking the red pixels and
 * reading the bounding boxes — see the table in README.md. So the app opens on exactly the
 * composition the designer drew, and edit mode moves away from it rather than towards it.
 */

function motion(overrides: Partial<LayerMotionConfig> = {}): LayerMotionConfig {
  return {
    breathe: 0,
    breatheRate: 1,
    pulse: 0,
    squash: 0,
    squashRate: 2,
    sway: 0,
    swayRate: 1,
    drift: 0,
    driftRate: 1,
    wobble: 0,
    wobbleScale: 1.8,
    wobbleRate: 1,
    ripple: 0,
    rippleWaves: 2,
    rippleRate: 1,
    bleed: 0,
    follow: 1,
    phaseOffset: 0,
    ...overrides,
  }
}

export function defaultConfig(): Config {
  return {
    version: 1,
    name: 'reference',
    canvas: {
      // 1:2 portrait — the exact ratio of the artist's artboard (4253 × 8504).
      width: 1080,
      height: 2160,
      fit: 'contain',
      background: PALETTE.fuchsia,
    },
    motion: {
      loopSeconds: 24,
      intensity: 1,
      beatsPerLoop: 48, // 48 beats over 24s = 120 BPM
      seed: 0,
    },
    audio: {
      enabled: false,
      amount: 0.75,
      gain: 1,
      smoothing: 0.8,
      beatSensitivity: 1.3,
    },
    post: {
      // Grain is a technical fix, not a look: it stops the large flat fuchsia field from
      // banding on a big panel. The vignette starts at zero because the artist did not draw
      // one — it is available, not assumed.
      grain: 0.025,
      vignette: 0,
    },
    layers: [
      {
        id: 'forma',
        asset: 'forma-bruno-1',
        visible: true,
        x: 57.3,
        y: 51.8,
        width: 59.8,
        stretchY: 1.125,
        rotation: 0,
        opacity: 1,
        // The hero. Everything here stays small on purpose: the brief is "breathes and
        // deforms a little while keeping its structure", not an algorithmic fantasy.
        motion: motion({
          breathe: 3.5,
          breatheRate: 1,
          pulse: 2.5,
          squash: 2,
          squashRate: 2,
          sway: 0.8,
          swayRate: 1,
          drift: 0.6,
          driftRate: 1,
          wobble: 1.6,
          wobbleScale: 1.8,
          wobbleRate: 1,
          ripple: 0.8,
          rippleWaves: 2,
          rippleRate: 1,
          // Off by default: bleed is the one effect that resamples the painted edge rather
          // than moving it, so it should be dialled in on purpose, with the artist watching.
          bleed: 0,
          follow: 1,
        }),
      },
      {
        id: 'logo',
        asset: 'logo-baw-2026',
        visible: true,
        x: 39.1,
        y: 10.8,
        width: 63.9,
        stretchY: 1,
        rotation: 0,
        opacity: 1,
        // Typography: it must stay legible and un-warped. Almost pure transform motion.
        motion: motion({
          breathe: 1.2,
          pulse: 1.5,
          sway: 0.3,
          drift: 0.25,
          wobble: 0.35,
          wobbleScale: 1.2,
          follow: 0.6,
          phaseOffset: 0.35,
        }),
      },
      {
        id: 'brava',
        asset: 'brava-arts-weekend',
        visible: true,
        x: 34.9,
        y: 94.5,
        width: 58.9,
        stretchY: 1,
        rotation: 0,
        opacity: 1,
        // Hand lettering: a little wobble suits it, it already looks drawn by hand.
        motion: motion({
          breathe: 0.8,
          pulse: 1,
          sway: 0.4,
          drift: 0.2,
          wobble: 0.5,
          wobbleScale: 2.5,
          ripple: 0.4,
          rippleWaves: 3,
          follow: 0.4,
          phaseOffset: 0.66,
        }),
      },
    ],
  }
}
