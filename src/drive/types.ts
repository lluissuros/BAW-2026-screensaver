/**
 * The one set of numbers that animation reads. Synthetic motion and live audio both produce
 * a Drive, so nothing downstream knows or cares which is in charge — that is what lets the
 * screensaver run with no audio at all and still look alive.
 */
export interface Drive {
  /** Position in the loop, 0..1. */
  phase: number
  /** Overall level, 0..1, centred near 0.5. */
  energy: number
  bass: number
  mid: number
  high: number
  /** 1 on a beat, decaying to 0 before the next one. */
  beat: number
}
