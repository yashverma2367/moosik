import { PitchDetector } from 'pitchy'
import { hzToMidi } from './notes'

export const WINDOW_SEC = 4.6 // history kept; the longest any theme shows

const MIN_HZ = 80 // roughly the lowest sung note
const MAX_HZ = 1100 // roughly the highest sung note
const MIN_CLARITY = 0.9 // below this it's breath, noise or silence
const SMOOTH_FRAMES = 5
const CONFIRM_FRAMES = 3 // a new note (after silence or a big jump) must last this long to be drawn
const MAX_JUMP = 7 // semitones; bigger jumps between frames need confirming
const DROPOUT_FRAMES = 3 // brief misses inside a note are bridged instead of breaking it

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// Reads the analyser once per frame and keeps a rolling pitch history.
// history entries: { t: seconds, midi, voiced }
// While silent, midi holds the last sung pitch (null before the first note).
export function createPitchTracker(analyser, sampleRate) {
  const buffer = new Float32Array(analyser.fftSize)
  const detector = PitchDetector.forFloat32Array(analyser.fftSize)
  detector.minVolumeDecibels = -45

  const recent = []
  let pending = [] // candidate readings waiting to be confirmed
  let misses = 0
  let lastMidi = null

  // Readings agree if they're within a semitone and a half of each other.
  const consistent = (values) => Math.max(...values) - Math.min(...values) < 1.5

  // Turns one raw reading into what gets drawn, rejecting the spikes pitch detection
  // throws out: overtones read an octave or more off, and blips from consonants or noise.
  function clean(raw, prev) {
    if (raw == null) {
      pending = []
      if (prev != null && ++misses <= DROPOUT_FRAMES) return prev // bridge a short dropout
      recent.length = 0
      return null
    }
    misses = 0

    const m = raw
    // after silence, or on a big jump (often an overtone read an octave off), wait for
    // a few frames that agree before believing it; real leaps pass, one-off spikes don't
    if (prev == null || Math.abs(m - prev) > MAX_JUMP) {
      pending.push(m)
      if (!consistent(pending)) pending = [m]
      if (pending.length < CONFIRM_FRAMES) return prev // not sure yet: keep what was there
      recent.length = 0
      recent.push(...pending)
      pending = []
      return median(recent)
    }

    pending = []
    // median of the last few frames smooths what's left
    recent.push(m)
    if (recent.length > SMOOTH_FRAMES) recent.shift()
    let midi = median(recent)
    // ease small wobbles for a silkier line; real note changes stay instant
    if (Math.abs(midi - prev) < 1) midi = prev + (midi - prev) * 0.5
    return midi
  }
  const tracker = {
    history: [],
    current: null,
    volume: 0, // 0 (quiet) to 1 (loud), smoothed
    rmsDb: -100, // raw mic level, for the level meter
    peakDb: -100, // loudest sample this frame; near 0 dB the mic is clipping
    update(now) {
      analyser.getFloatTimeDomainData(buffer)
      const [hz, clarity] = detector.findPitch(buffer, sampleRate)

      const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length)
      const peak = buffer.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
      tracker.rmsDb = 20 * Math.log10(rms || 1e-8)
      tracker.peakDb = 20 * Math.log10(peak || 1e-8)
      const loudness = Math.min(1, Math.max(0, (20 * Math.log10(rms || 1e-8) + 50) / 40))
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
