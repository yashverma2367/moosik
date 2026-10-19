// Turns the pitch tracker into expression signals both themes animate with:
// onsets (new syllables / loud attacks), how long a note has been held, vibrato,
// and the camera's slow drift, breathing and punch-ins.

const ONSET_GAP = 0.15 // seconds; at most one pulse per syllable
const HOLD_START = 0.4 // a note counts as "held" after this long...
const HOLD_FULL = 3 // ...and the build-up peaks here
const VIBRATO_WINDOW = 0.8 // seconds of pitch looked at for vibrato

export function createMotion() {
  return {
    onset: 0, // > 0 only on the frame a syllable starts (0–1 strength)
    pulse: 0, // onset, decaying over ~0.2 s
    hold: 0, // 0–1 build-up while a note is held
    vibrato: 0, // 0–1 strength
    vibratoRate: 5.5, // wobbles per second
    zoom: 1.04,
    dx: 0, // camera drift, as a fraction of the frame
    dy: 0,
    punch: 0,
    slowVolume: 0,
    lastOnset: -1,
    wasVoiced: false,
    holdSec: 0,
    holdNote: null,
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// Vibrato = the pitch wobbling 4–8 times a second by 0.2–2 semitones.
// Subtract the slow melody (a ~0.2 s moving average), then count how often what's
// left crosses zero and how big it is.
function detectVibrato(history, now) {
  const pts = []
  for (let i = history.length - 1; i >= 0 && history[i].t > now - VIBRATO_WINDOW; i--) {
    if (!history[i].voiced) return null
    pts.push(history[i])
  }
  if (pts.length < 30 || now - pts.at(-1).t < VIBRATO_WINDOW * 0.75) return null
  pts.reverse()

  const t0 = pts[0].t + 0.1
  const t1 = pts.at(-1).t - 0.1
  const dev = []
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

export function updateMotion(m, tracker, now, dt) {
  const midi = tracker.current
  const voiced = midi != null

  // onsets: singing starts after silence, or loudness jumps above its slow average
  m.slowVolume += (tracker.volume - m.slowVolume) * Math.min(1, dt * 3)
  m.onset = 0
  if (voiced && now - m.lastOnset > ONSET_GAP) {
    const rise = tracker.volume - m.slowVolume
    if (!m.wasVoiced) m.onset = 0.6 + tracker.volume * 0.4
    else if (rise > 0.1) m.onset = Math.min(1, rise * 4)
    if (m.onset) {
      m.lastOnset = now
      m.slowVolume = tracker.volume // new baseline, so one attack fires once
    }
  }
  m.wasVoiced = voiced
  m.pulse = Math.max(m.pulse * Math.exp(-dt * 6), m.onset)

  // hold: the same note (within about half a semitone) sung without a break
  if (voiced && m.holdNote != null && Math.abs(midi - m.holdNote) < 0.6) m.holdSec += dt
  else {
    m.holdSec = 0
    m.holdNote = midi
  }
  const holdTarget = clamp01((m.holdSec - HOLD_START) / (HOLD_FULL - HOLD_START))
  // builds up slowly, lets go quickly when she releases
  m.hold += (holdTarget - m.hold) * Math.min(1, dt * (holdTarget > m.hold ? 4 : 8))

  const vib = voiced ? detectVibrato(tracker.history, now) : null
  m.vibrato += ((vib ? vib.strength : 0) - m.vibrato) * Math.min(1, dt * 5)
  if (vib) m.vibratoRate = vib.rate

  // camera: slow drift, breathing with loudness, leaning in on held notes, a punch on loud attacks
  if (m.onset && tracker.volume > 0.55) m.punch = 1
  m.punch *= Math.exp(-dt * 5)
  const zoom =
    1.04 + 0.01 * Math.sin(now * 0.3) + (voiced ? tracker.volume * 0.015 : 0) + m.hold * 0.05 + m.punch * 0.025
  m.zoom += (zoom - m.zoom) * Math.min(1, dt * 6)
  m.dx = Math.sin(now * 0.17) * 0.008
  m.dy = Math.cos(now * 0.13) * 0.006
}
