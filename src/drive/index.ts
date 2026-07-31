import type { Config } from '../config/types'
import { AudioDrive } from './audio'
import { syntheticDrive } from './synthetic'
import type { Drive } from './types'

export type { Drive } from './types'

/**
 * Owns the loop clock and blends the two drive sources.
 *
 * The phase is integrated rather than derived from the wall clock, so changing the loop
 * length in edit mode speeds the motion up or down instead of making it jump.
 */
export class DriveBus {
  phase = 0
  paused = false
  readonly audio = new AudioDrive()

  tick(dt: number, config: Config): Drive {
    if (!this.paused) {
      const loop = Math.max(0.1, config.motion.loopSeconds)
      this.phase = (this.phase + dt / loop) % 1
    }
    return this.sample(config, dt)
  }

  /** Deterministic sampling, used by the exporter so every frame is reproducible. */
  sample(config: Config, dt: number): Drive {
    const synthetic = syntheticDrive(this.phase, config.motion.beatsPerLoop, config.motion.seed)
    const live = config.audio.enabled ? this.audio.read(config.audio, dt) : null
    if (!live) return { phase: this.phase, ...synthetic }

    const k = Math.min(1, Math.max(0, config.audio.amount))
    return {
      phase: this.phase,
      energy: mix(synthetic.energy, live.energy, k),
      bass: mix(synthetic.bass, live.bass, k),
      mid: mix(synthetic.mid, live.mid, k),
      high: mix(synthetic.high, live.high, k),
      beat: mix(synthetic.beat, live.beat, k),
    }
  }

  setPhase(phase: number): void {
    this.phase = ((phase % 1) + 1) % 1
  }
}

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k
}
