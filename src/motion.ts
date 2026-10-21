import type { PitchPoint, PitchTracker } from './pitch'

const ONSET_GAP = 0.15
const HOLD_START = 0.4
const HOLD_FULL = 3
const VIBRATO_WINDOW = 0.8

export interface Motion {
  onset: number
  pulse: number
  hold: number
  vibrato: number
  vibratoRate: number
  zoom: number
  dx: number
  dy: number
  punch: number
  slowVolume: number
  lastOnset: number
  wasVoiced: boolean
  holdSec: number
  holdNote: number | null
}

export function createMotion(): Motion {
  return {
    onset: 0,
    pulse: 0,
    hold: 0,
    vibrato: 0,
    vibratoRate: 5.5,
    zoom: 1.04,
    dx: 0,
    dy: 0,
    punch: 0,
    slowVolume: 0,
    lastOnset: -1,
    wasVoiced: false,
    holdSec: 0,
    holdNote: null,
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// Vibrato: remove the slow melody with a ~0.2 s moving average, then measure how often and
// how far what's left swings. Real vibrato is 4–8 wobbles/s by 0.2–2 semitones.
function detectVibrato(history: PitchPoint[], now: number) {
  const pts: { t: number; midi: number }[] = []
  for (let i = history.length - 1; i >= 0 && history[i].t > now - VIBRATO_WINDOW; i--) {
    const p = history[i]
    if (!p.voiced || p.midi == null) return null
    pts.push({ t: p.t, midi: p.midi })
  }
  if (pts.length < 30 || now - pts[pts.length - 1].t < VIBRATO_WINDOW * 0.75) return null
  pts.reverse()

  const t0 = pts[0].t + 0.1
  const t1 = pts[pts.length - 1].t - 0.1
  const dev: number[] = []
  for (const p of pts) {
    if (p.t < t0 || p.t > t1) continue
    let sum = 0
    let n = 0
    for (const q of pts) {
      if (Math.abs(q.t - p.t) <= 0.1) {
        sum += q.midi
        n++
      }
    }
    dev.push(p.midi - sum / n)
  }
  if (dev.length < 12) return null

  let crossings = 0
  for (let i = 1; i < dev.length; i++) if (dev[i - 1] < 0 !== dev[i] < 0) crossings++
  const rate = crossings / 2 / (t1 - t0)
  const peakToPeak = Math.sqrt(dev.reduce((s, d) => s + d * d, 0) / dev.length) * 2 * Math.SQRT2
  if (rate < 4 || rate > 8 || peakToPeak < 0.2 || peakToPeak > 2) return null
  return { rate, strength: clamp01((peakToPeak - 0.2) / 0.4) }
}

export function updateMotion(m: Motion, tracker: PitchTracker, now: number, dt: number) {
  const midi = tracker.current

  m.slowVolume += (tracker.volume - m.slowVolume) * Math.min(1, dt * 3)
  m.onset = 0
  if (midi != null && now - m.lastOnset > ONSET_GAP) {
    const rise = tracker.volume - m.slowVolume
    if (!m.wasVoiced) m.onset = 0.6 + tracker.volume * 0.4
    else if (rise > 0.1) m.onset = Math.min(1, rise * 4)
    if (m.onset) {
      m.lastOnset = now
      m.slowVolume = tracker.volume // new baseline, so one attack fires once
    }
  }
  m.wasVoiced = midi != null
  m.pulse = Math.max(m.pulse * Math.exp(-dt * 6), m.onset)

  if (midi != null && m.holdNote != null && Math.abs(midi - m.holdNote) < 0.6) m.holdSec += dt
  else {
    m.holdSec = 0
    m.holdNote = midi
  }
  const holdTarget = clamp01((m.holdSec - HOLD_START) / (HOLD_FULL - HOLD_START))
  m.hold += (holdTarget - m.hold) * Math.min(1, dt * (holdTarget > m.hold ? 4 : 8))

  const vib = midi != null ? detectVibrato(tracker.history, now) : null
  m.vibrato += ((vib ? vib.strength : 0) - m.vibrato) * Math.min(1, dt * 5)
  if (vib) m.vibratoRate = vib.rate

  if (m.onset && tracker.volume > 0.55) m.punch = 1
  m.punch *= Math.exp(-dt * 5)
  const zoom =
    1.04 + 0.01 * Math.sin(now * 0.3) + (midi != null ? tracker.volume * 0.015 : 0) + m.hold * 0.05 + m.punch * 0.025
  m.zoom += (zoom - m.zoom) * Math.min(1, dt * 6)
  m.dx = Math.sin(now * 0.17) * 0.008
  m.dy = Math.cos(now * 0.13) * 0.006
}
