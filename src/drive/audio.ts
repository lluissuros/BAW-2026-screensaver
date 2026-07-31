import type { AudioConfig } from '../config/types'

interface Band {
  from: number
  to: number
  /** Slowly decaying peak, so a quiet room and a loud one both use the full range. */
  peak: number
  value: number
}

/**
 * Live audio from whatever input the machine has — a laptop microphone pointed at the room,
 * or a loopback device (BlackHole, Loopback) if the music is playing on the same machine.
 *
 * Deliberately optional. It is never started unless someone asks for it in edit mode, and if
 * permission is denied the app keeps running on synthetic motion without complaining.
 */
export class AudioDrive {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private spectrum: Float32Array<ArrayBuffer> = new Float32Array(0)

  private bands: Band[] = [
    { from: 25, to: 160, peak: 0.2, value: 0 }, // bass
    { from: 160, to: 2000, peak: 0.2, value: 0 }, // mid
    { from: 2000, to: 9000, peak: 0.2, value: 0 }, // high
  ]

  private bassAverage = 0
  private beatEnvelope = 0
  private beatCooldown = 0

  error: string | null = null
  running = false

  async start(): Promise<boolean> {
    if (this.running) return true
    this.error = null
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // We want the room as it actually sounds, not a cleaned-up voice call.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      const context = new AudioContext()
      await context.resume()
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.6
      analyser.minDecibels = -95
      analyser.maxDecibels = -10
      context.createMediaStreamSource(this.stream).connect(analyser)
      this.spectrum = new Float32Array(analyser.frequencyBinCount)
      this.context = context
      this.analyser = analyser
      this.running = true
      return true
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.stop()
      return false
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.context?.close()
    this.stream = null
    this.context = null
    this.analyser = null
    this.running = false
    this.beatEnvelope = 0
  }

  /** Reads the current spectrum. Returns null while not running. */
  read(config: AudioConfig, dt: number): { energy: number; bass: number; mid: number; high: number; beat: number } | null {
    const analyser = this.analyser
    if (!analyser || !this.context) return null

    analyser.getFloatFrequencyData(this.spectrum)
    const nyquist = this.context.sampleRate / 2
    const perBin = nyquist / this.spectrum.length
    const smoothing = Math.min(0.98, Math.max(0, config.smoothing))

    for (const band of this.bands) {
      const first = Math.max(0, Math.floor(band.from / perBin))
      const last = Math.min(this.spectrum.length - 1, Math.ceil(band.to / perBin))
      let sum = 0
      let count = 0
      for (let i = first; i <= last; i++) {
        // dBFS (roughly -95..-10) mapped to 0..1.
        sum += Math.min(1, Math.max(0, (this.spectrum[i]! + 95) / 85))
        count++
      }
      const raw = Math.min(1.5, (count > 0 ? sum / count : 0) * config.gain)

      // Auto-range: track the loudest recent level per band and normalise against it, so the
      // look does not depend on how far the laptop is from the speakers.
      band.peak = Math.max(raw, band.peak - dt * 0.08)
      const normalised = band.peak > 0.02 ? Math.min(1, raw / band.peak) : 0
      band.value = band.value * smoothing + normalised * (1 - smoothing)
    }

    const [bass, mid, high] = [this.bands[0]!.value, this.bands[1]!.value, this.bands[2]!.value]

    // Beat = a bass level clearly above its own recent average, rate-limited so a sustained
    // bass note does not retrigger every frame.
    this.bassAverage = this.bassAverage * 0.94 + bass * 0.06
    this.beatCooldown = Math.max(0, this.beatCooldown - dt)
    if (this.beatCooldown === 0 && bass > this.bassAverage * config.beatSensitivity && bass > 0.12) {
      this.beatEnvelope = 1
      this.beatCooldown = 0.12
    }
    this.beatEnvelope = Math.max(0, this.beatEnvelope - dt * 4.5)

    const energy = Math.min(1, bass * 0.5 + mid * 0.35 + high * 0.15)
    return { energy, bass, mid, high, beat: this.beatEnvelope }
  }
}
