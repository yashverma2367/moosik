import { PitchDetector } from 'pitchy'
import { hzToMidi } from './notes'

export const WINDOW_SEC = 4.6

const MIN_HZ = 80
const MAX_HZ = 1100
const MIN_CLARITY = 0.9
const SMOOTH_FRAMES = 5
const CONFIRM_FRAMES = 3
const MAX_JUMP = 7
const DROPOUT_FRAMES = 3

export interface PitchPoint {
  t: number
  // while silent, holds the last sung pitch (null before the first note)
  midi: number | null
  voiced: boolean
  volume: number
}

export interface PitchTracker {
  history: PitchPoint[]
  current: number | null
  volume: number
  rmsDb: number
  peakDb: number
  update(now: number): void
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const consistent = (values: number[]) => Math.max(...values) - Math.min(...values) < 1.5

export function createPitchTracker(analyser: AnalyserNode, sampleRate: number): PitchTracker {
  const buffer = new Float32Array(analyser.fftSize)
  const detector = PitchDetector.forFloat32Array(analyser.fftSize)
  detector.minVolumeDecibels = -45

  const recent: number[] = []
  let pending: number[] = []
  let misses = 0
  let lastMidi: number | null = null

  // The detector throws out spikes (overtones an octave off, consonant blips), so a new
  // note or a big jump only counts once a few frames in a row agree.
  function clean(raw: number | null, prev: number | null): number | null {
    if (raw == null) {
      pending = []
      if (prev != null && ++misses <= DROPOUT_FRAMES) return prev
      recent.length = 0
      return null
    }
    misses = 0

    if (prev == null || Math.abs(raw - prev) > MAX_JUMP) {
      pending.push(raw)
      if (!consistent(pending)) pending = [raw]
      if (pending.length < CONFIRM_FRAMES) return prev
      recent.length = 0
      recent.push(...pending)
      pending = []
      return median(recent)
    }

    pending = []
    recent.push(raw)
    if (recent.length > SMOOTH_FRAMES) recent.shift()
    const midi = median(recent)
    return Math.abs(midi - prev) < 1 ? prev + (midi - prev) * 0.5 : midi
  }

  const tracker: PitchTracker = {
    history: [],
    current: null,
    volume: 0,
    rmsDb: -100,
    peakDb: -100,
    update(now) {
      analyser.getFloatTimeDomainData(buffer)
      const [hz, clarity] = detector.findPitch(buffer, sampleRate)

      const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length)
      const peak = buffer.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
      tracker.rmsDb = 20 * Math.log10(rms || 1e-8)
      tracker.peakDb = 20 * Math.log10(peak || 1e-8)
      const loudness = Math.min(1, Math.max(0, (tracker.rmsDb + 50) / 40))
      tracker.volume += (loudness - tracker.volume) * 0.3

      const valid = clarity >= MIN_CLARITY && hz >= MIN_HZ && hz <= MAX_HZ
      const midi = clean(valid ? hzToMidi(hz) : null, tracker.current)

      tracker.current = midi
      if (midi != null) lastMidi = midi
      tracker.history.push({ t: now, midi: lastMidi, voiced: midi != null, volume: tracker.volume })
      while (tracker.history[0].t < now - WINDOW_SEC) tracker.history.shift()
    },
  }
  return tracker
}
