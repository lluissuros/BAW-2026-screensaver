import { ASSETS } from '../assets/manifest'

/**
 * The edit panel is generated from this schema rather than hand-written, so adding a knob
 * means adding one line here — the control, its bounds and its serialization all follow.
 */

export type Field =
  | { path: string; label: string; kind: 'slider'; min: number; max: number; step: number; unit?: string; hint?: string }
  | { path: string; label: string; kind: 'toggle'; hint?: string }
  | { path: string; label: string; kind: 'color'; hint?: string }
  | { path: string; label: string; kind: 'select'; options: { value: string; label: string }[]; hint?: string }
  | { path: string; label: string; kind: 'text'; hint?: string }

export interface Section {
  title: string
  fields: Field[]
  collapsed?: boolean
}

const pct = (path: string, label: string, max: number, hint?: string): Field => ({
  path,
  label,
  kind: 'slider',
  min: 0,
  max,
  step: 0.1,
  unit: '%',
  hint,
})

const rate = (path: string, label = 'Cycles', max = 8): Field => ({
  path,
  label,
  kind: 'slider',
  min: 0,
  max,
  step: 1,
  unit: '×/loop',
  hint: 'Whole cycles per loop — keeps the motion seamless',
})

export function globalSections(): Section[] {
  return [
    {
      title: 'Composition',
      fields: [
        { path: 'name', label: 'Preset name', kind: 'text' },
        { path: 'canvas.width', label: 'Canvas width', kind: 'slider', min: 320, max: 4096, step: 4, unit: 'px' },
        { path: 'canvas.height', label: 'Canvas height', kind: 'slider', min: 320, max: 8192, step: 4, unit: 'px' },
        {
          path: 'canvas.fit',
          label: 'Fit to screen',
          kind: 'select',
          options: [
            { value: 'contain', label: 'Contain — whole composition, bars if needed' },
            { value: 'cover', label: 'Cover — fill the screen, crop the edges' },
          ],
        },
        { path: 'canvas.background', label: 'Background', kind: 'color' },
      ],
    },
    {
      title: 'Motion',
      fields: [
        {
          path: 'motion.loopSeconds',
          label: 'Loop length',
          kind: 'slider',
          min: 4,
          max: 120,
          step: 1,
          unit: 's',
          hint: 'One full cycle. Longer feels less repetitive; the loop itself is seamless either way.',
        },
        {
          path: 'motion.intensity',
          label: 'Intensity',
          kind: 'slider',
          min: 0,
          max: 3,
          step: 0.01,
          hint: 'Scales every layer at once. 0 freezes the composition.',
        },
        {
          path: 'motion.beatsPerLoop',
          label: 'Beats per loop',
          kind: 'slider',
          min: 0,
          max: 256,
          step: 1,
          hint: 'Drives the pulse. Shown as BPM below.',
        },
        { path: 'motion.seed', label: 'Seed', kind: 'slider', min: 0, max: 100, step: 1, hint: 'Different noise, same amounts.' },
      ],
    },
    {
      title: 'Audio reactivity',
      collapsed: true,
      fields: [
        {
          path: 'audio.enabled',
          label: 'Listen to audio input',
          kind: 'toggle',
          hint: 'Asks for microphone access. Off = the loop drives itself and never depends on the venue.',
        },
        { path: 'audio.amount', label: 'Audio takeover', kind: 'slider', min: 0, max: 1, step: 0.01, hint: '0 = synthetic only, 1 = audio only' },
        { path: 'audio.gain', label: 'Input gain', kind: 'slider', min: 0.1, max: 5, step: 0.05 },
        { path: 'audio.smoothing', label: 'Smoothing', kind: 'slider', min: 0, max: 0.98, step: 0.01 },
        { path: 'audio.beatSensitivity', label: 'Beat sensitivity', kind: 'slider', min: 1, max: 3, step: 0.01 },
      ],
    },
    {
      title: 'Finish',
      collapsed: true,
      fields: [
        { path: 'post.grain', label: 'Grain', kind: 'slider', min: 0, max: 0.2, step: 0.001, hint: 'A little stops flat fuchsia from banding on a big panel.' },
        { path: 'post.vignette', label: 'Vignette', kind: 'slider', min: 0, max: 0.6, step: 0.005 },
      ],
    },
  ]
}

export function layerSections(index: number): Section[] {
  const L = `layers.${index}`
  return [
    {
      title: 'Placement',
      fields: [
        {
          path: `${L}.asset`,
          label: 'Artwork',
          kind: 'select',
          options: ASSETS.map((a) => ({ value: a.key, label: a.label })),
        },
        { path: `${L}.visible`, label: 'Visible', kind: 'toggle' },
        { path: `${L}.x`, label: 'Centre X', kind: 'slider', min: -50, max: 150, step: 0.1, unit: '%' },
        { path: `${L}.y`, label: 'Centre Y', kind: 'slider', min: -50, max: 150, step: 0.1, unit: '%' },
        { path: `${L}.width`, label: 'Width', kind: 'slider', min: 1, max: 200, step: 0.1, unit: '%' },
        {
          path: `${L}.stretchY`,
          label: 'Vertical stretch',
          kind: 'slider',
          min: 0.4,
          max: 2.5,
          step: 0.005,
          hint: '1 = the artwork’s natural proportions',
        },
        { path: `${L}.rotation`, label: 'Rotation', kind: 'slider', min: -180, max: 180, step: 0.1, unit: '°' },
        { path: `${L}.opacity`, label: 'Opacity', kind: 'slider', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      title: 'Moves as a whole',
      fields: [
        pct(`${L}.motion.breathe`, 'Breathe', 20, 'Uniform scale in and out'),
        rate(`${L}.motion.breatheRate`, 'Breathe rate'),
        pct(`${L}.motion.pulse`, 'Beat pulse', 25, 'Kick on every beat, elastic decay'),
        pct(`${L}.motion.squash`, 'Squash / stretch', 20, 'Taller and thinner, then wider and shorter'),
        rate(`${L}.motion.squashRate`, 'Squash rate'),
        { path: `${L}.motion.sway`, label: 'Sway', kind: 'slider', min: 0, max: 15, step: 0.05, unit: '°' },
        rate(`${L}.motion.swayRate`, 'Sway rate'),
        pct(`${L}.motion.drift`, 'Drift', 20, 'Slow travel along a closed path'),
        rate(`${L}.motion.driftRate`, 'Drift rate'),
      ],
    },
    {
      title: 'Deforms the artwork',
      fields: [
        pct(`${L}.motion.wobble`, 'Wobble', 20, 'Noise displacement — the wet-paint flex'),
        {
          path: `${L}.motion.wobbleScale`,
          label: 'Wobble scale',
          kind: 'slider',
          min: 0.2,
          max: 12,
          step: 0.05,
          hint: 'Low = the whole body flexes. High = the edges chatter.',
        },
        rate(`${L}.motion.wobbleRate`, 'Wobble rate'),
        pct(`${L}.motion.ripple`, 'Ripple', 20, 'Travelling wave along the long axis'),
        { path: `${L}.motion.rippleWaves`, label: 'Ripple waves', kind: 'slider', min: 0.5, max: 12, step: 0.1 },
        rate(`${L}.motion.rippleRate`, 'Ripple rate'),
        pct(`${L}.motion.bleed`, 'Edge bleed', 4, 'Dilates and erodes the painted edge like ink'),
      ],
    },
    {
      title: 'Timing',
      collapsed: true,
      fields: [
        {
          path: `${L}.motion.follow`,
          label: 'Follows energy',
          kind: 'slider',
          min: 0,
          max: 1,
          step: 0.01,
          hint: 'How much the slow energy swell — or the room’s loudness — scales this layer',
        },
        {
          path: `${L}.motion.phaseOffset`,
          label: 'Phase offset',
          kind: 'slider',
          min: 0,
          max: 1,
          step: 0.01,
          hint: 'Shifts this layer in the loop so layers don’t breathe in unison',
        },
      ],
    },
  ]
}
