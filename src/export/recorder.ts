/**
 * Records exactly one loop off the canvas.
 *
 * Two details make the result a true loop rather than an approximate one:
 *
 *  - Frames are *pushed* (`captureStream(0)` + `requestFrame()`) instead of sampled at the
 *    browser's whim, so every frame we draw is a frame in the file — none dropped, none
 *    duplicated.
 *  - Phases run from 0 to (total-1)/total, so the last frame is one step short of the start
 *    rather than a repeat of it. Played back on loop, the seam is exact.
 *
 * MediaRecorder timestamps frames by wall clock, so the recording necessarily takes as long
 * as the loop itself. That is the price of using the browser's encoder, and at 24 seconds it
 * is not worth avoiding.
 */

interface Candidate {
  type: string
  extension: string
}

const CANDIDATES: Candidate[] = [
  { type: 'video/webm;codecs=vp9', extension: 'webm' },
  { type: 'video/mp4;codecs=avc1.4d002a', extension: 'mp4' },
  { type: 'video/webm;codecs=vp8', extension: 'webm' },
  { type: 'video/webm', extension: 'webm' },
]

export interface RecordOptions {
  canvas: HTMLCanvasElement
  /** Draw one frame at this loop position, 0..1. */
  render: (phase: number) => void
  seconds: number
  fps: number
  onProgress?: (fraction: number, frame: number, total: number) => void
}

export interface Recording {
  blob: Blob
  extension: string
  frames: number
}

export async function recordLoop(options: RecordOptions): Promise<Recording> {
  const { canvas, render, seconds, fps, onProgress } = options

  const candidate = CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.type))
  if (!candidate) throw new Error('This browser cannot record video from a canvas.')

  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  if (!track) throw new Error('Could not capture a video track from the canvas.')

  const recorder = new MediaRecorder(stream, {
    mimeType: candidate.type,
    videoBitsPerSecond: 40_000_000,
  })
  const chunks: Blob[] = []
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })
  const finished = new Promise<void>((resolve, reject) => {
    recorder.addEventListener('stop', () => resolve())
    recorder.addEventListener('error', () => reject(new Error('The encoder failed mid-recording.')))
  })

  const total = Math.max(1, Math.round(seconds * fps))
  recorder.start()
  const startedAt = performance.now()

  for (let frame = 0; frame < total; frame++) {
    render(frame / total)
    track.requestFrame()
    onProgress?.((frame + 1) / total, frame + 1, total)
    await waitUntil(startedAt + ((frame + 1) * 1000) / fps)
  }

  recorder.stop()
  track.stop()
  await finished

  return { blob: new Blob(chunks, { type: candidate.type }), extension: candidate.extension, frames: total }
}

function waitUntil(target: number): Promise<void> {
  return new Promise((resolve) => {
    const step = () => {
      if (performance.now() >= target) resolve()
      else requestAnimationFrame(step)
    }
    step()
  })
}
