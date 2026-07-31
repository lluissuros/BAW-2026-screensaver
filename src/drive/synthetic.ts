import type { Drive } from './types'

const TAU = Math.PI * 2

/**
 * Motion with no audio input at all — the default, because the venue's screen might be fed
 * by a machine with no sound card, no permission dialog answered, and nobody around to fix
 * it. Every component is built from whole numbers of cycles per loop, so the result is
 * seamless, and layering non-harmonic rates keeps it from feeling metronomic.
 */
export function syntheticDrive(phase: number, beatsPerLoop: number, seed: number): Omit<Drive, 'phase'> {
  const s = seed * 0.137

  const energy = band(phase, s, 1, 3, 7, [0.26, 0.16, 0.08])
  const bass = band(phase, s + 0.31, 2, 5, 11, [0.3, 0.14, 0.06])
  const mid = band(phase, s + 0.62, 3, 7, 13, [0.24, 0.16, 0.1])
  const high = band(phase, s + 0.87, 5, 11, 17, [0.2, 0.16, 0.14])

  let beat = 0
  if (beatsPerLoop > 0) {
    // Sawtooth through the loop, one tooth per beat, shaped into a percussive decay.
    const within = (phase * beatsPerLoop) % 1
    beat = Math.pow(1 - within, 2.6)
  }

  return { energy, bass, mid, high, beat }
}

function band(phase: number, offset: number, f1: number, f2: number, f3: number, amps: number[]): number {
  const v =
    0.5 +
    amps[0]! * Math.sin(TAU * (phase * f1 + offset)) +
    amps[1]! * Math.sin(TAU * (phase * f2 + offset * 1.7)) +
    amps[2]! * Math.sin(TAU * (phase * f3 + offset * 2.3))
  return Math.min(1, Math.max(0, v))
}
