import { drawVinyl, createVinylView } from './drawVinyl'
import { isBlackKey, midiToHz, midiToName, noteLetter, pitchHue } from './notes'
import { VIDEO_FILTERS } from './videoFilters'

// Bright "candy" theme. 9:16 for Reels; everything drawn here ends up in the recorded video.
export const W = 1080
export const H = 1920
const S = W / 358 // the design was drawn on a 358 px wide frame; S scales its sizes up

const INK = '#2B2140'
const MUTED = '#6B6280' // lane labels
const REST = '#B8B0C9' // colour of the line while silent
const SAT = 82

const TRAY = { x: 8 * S, y: H - 8 * S - 226 * S, w: W - 16 * S, h: 226 * S }
const VIZ_H = 220 * S
const VIZ_TOP = H - 6 * S - VIZ_H
const PAD = 22 * S
const SPAN = 12 // semitones visible at once
const LANE_H = (VIZ_H - 2 * PAD) / SPAN
const LANE_X = 34 * S
const NOW_X = 262 * S // where the newest pitch is drawn
const PX_PER_SEC = NOW_X / 3.3 // 3.3 s of history across the graph
const FADE_W = 120 * S // oldest part of the ribbon fades out over this width
const VINYL = { cx: W / 2, cy: TRAY.y + TRAY.h / 2, r: TRAY.h / 2 - 10 * S }

const CONFETTI_SEC = 2.4
const CONFETTI_EVERY = 0.07 // seconds between pieces while singing
const HALO_SEC = 1.4
const BOB_SEC = 2.4
const RING_SEC = 1

const color = (midi, lightness = 62) => `hsl(${pitchHue(midi)} ${SAT}% ${lightness}%)`

const yOf = (view, midi) => VIZ_TOP + PAD + (view.center + SPAN / 2 - midi) * LANE_H

// Animation state that lives across frames.
export function createView() {
  const layer = document.createElement('canvas')
  layer.width = W
  layer.height = VIZ_H
  return {
    center: 56,
    confetti: [],
    confettiClock: 0,
    rings: [],
    ringClock: 0,
    layer,
    vinyl: createVinylView(VINYL.r * 2),
  }
}

export function drawStage(ctx, { video, look, layout, tracker, motion, view, now, dt }) {
  drawCamera(ctx, video, look, motion)
  drawTray(ctx)
  if (layout === 'vinyl') {
    drawVinyl(ctx, { tracker, motion, view: view.vinyl, dt, now, box: VINYL, paint: VINYL_PAINT, S })
    return
  }
  updateView(view, tracker, motion, dt)
  drawLanes(ctx, tracker, view, motion)
  drawRibbon(ctx, tracker, view, now, motion)
  drawRings(ctx, view.rings)
  drawOrb(ctx, NOW_X, yOf(view, tracker.history.at(-1)?.midi ?? view.center), tracker, motion, now)
  drawNoteBubble(ctx, tracker.current, now)
}

// burst = a spray in every direction (new syllable); otherwise a piece drifting off the ribbon
function spawnConfetti(view, y, volume, burst) {
  const rnd = Math.random()
  const angle = Math.random() * Math.PI * 2
  const speed = burst ? (120 + Math.random() * 220) * S : 0
  view.confetti.push({
    x: NOW_X,
    y: y + (burst ? 0 : (Math.random() - 0.5) * 16 * S),
    bvx: Math.cos(angle) * speed, // burst velocity, slows down quickly
    bvy: Math.sin(angle) * speed,
    age: 0,
    drift: burst ? 0.5 : 0.8 + rnd * 0.3, // relative to the ribbon's scroll speed
    rise: (8 + rnd * 16) * S,
    phase: Math.random() * 6,
    hue: Math.random() * 360,
    star: rnd > 0.78,
    size: Math.random(),
    volume,
  })
}

function updateView(view, tracker, motion, dt) {
  const midi = tracker.current
  if (midi != null) {
    view.center += (midi - view.center) * 0.04 // follow her range
    const y = yOf(view, midi)

    view.confettiClock += dt * (1 + motion.hold * 2) // more sparkle the longer she holds
    while (view.confettiClock > CONFETTI_EVERY) {
      view.confettiClock -= CONFETTI_EVERY
      spawnConfetti(view, y, tracker.volume, false)
    }
    if (motion.onset) for (let i = 0; i < 6 + motion.onset * 10; i++) spawnConfetti(view, y, tracker.volume, true)

    // vibrato: one ring per wobble
    if (motion.vibrato > 0.15) {
      view.ringClock += dt * motion.vibratoRate
      if (view.ringClock >= 1) {
        view.ringClock %= 1
        view.rings.push({ x: NOW_X, y, age: 0, strength: motion.vibrato, midi })
      }
    }
  }

  for (const c of view.confetti) {
    c.age += dt
    c.x += (c.bvx - PX_PER_SEC * c.drift) * dt
    c.y += (c.bvy - c.rise) * dt
    c.bvx *= Math.exp(-dt * 3)
    c.bvy *= Math.exp(-dt * 3)
  }
  view.confetti = view.confetti.filter((c) => c.age < CONFETTI_SEC).slice(-400)
  for (const r of view.rings) r.age += dt
  view.rings = view.rings.filter((r) => r.age < RING_SEC)
}

// Selfie view, mirrored, cropped to fill the whole frame, with the picked look and the
// camera motion (slow drift, zooming with her voice). Shared by both themes.
export function drawSelfie(ctx, video, look, motion) {
  if (!video.videoWidth) return
  const scale = Math.max(W / video.videoWidth, H / video.videoHeight) * motion.zoom
  const dw = video.videoWidth * scale
  const dh = video.videoHeight * scale
  ctx.save()
  ctx.translate(W, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, (W - dw) / 2 + motion.dx * W, (H - dh) / 2 + motion.dy * H, dw, dh)
  ctx.restore()
  VIDEO_FILTERS[look].apply(ctx)
}

function drawCamera(ctx, video, look, motion) {
  ctx.fillStyle = '#E9E4F2'
  ctx.fillRect(0, 0, W, H)
  drawSelfie(ctx, video, look, motion)
}

// Solid cream tray the graph sits on.
function drawTray(ctx) {
  ctx.save()
  ctx.shadowColor = 'rgba(43,33,64,0.1)'
  ctx.shadowBlur = 24 * S
  ctx.shadowOffsetY = 8 * S
  ctx.fillStyle = '#FFF6EA'
  ctx.beginPath()
  ctx.roundRect(TRAY.x, TRAY.y, TRAY.w, TRAY.h, 24 * S)
  ctx.fill()
  ctx.restore()
}

// Pastel pill per natural note; the ones near her pitch light up, and flash on each syllable.
function drawLanes(ctx, tracker, view, motion) {
  const midi = tracker.current
  const top = view.center + SPAN / 2
  const h = LANE_H * 1.25

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(TRAY.x, TRAY.y, TRAY.w, TRAY.h, 24 * S) // keep lanes and labels inside the tray
  ctx.clip()
  ctx.font = `600 ${10 * S}px Fredoka, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  for (let n = Math.floor(top - SPAN) - 1; n <= Math.ceil(top) + 1; n++) {
    if (isBlackKey(n)) continue
    const near = midi == null ? 0 : Math.max(0, 1 - Math.abs(midi - n) / 1.2)
    const y = yOf(view, n)

    ctx.globalAlpha = 0.16 + near * 0.3 + near * motion.pulse * 0.3
    ctx.fillStyle = color(n, 70)
    ctx.beginPath()
    ctx.roundRect(LANE_X, y - h / 2, W - 16 * S - LANE_X, h, h / 2) // ends inside the tray
    ctx.fill()

    ctx.globalAlpha = 1
    ctx.fillStyle = near > 0.3 ? color(n, 42) : MUTED
    ctx.fillText(midiToName(n), 12 * S, y + 3.5 * S)
  }
  ctx.restore()
}

// Candy ribbon (each slice the colour of its note, width follows loudness),
// a glossy highlight and confetti, drawn on a layer so the left edge can fade out.
// The newest part swells on each syllable and grows brighter while a note is held.
function drawRibbon(ctx, tracker, view, now, motion) {
  const lc = view.layer.getContext('2d')
  const history = tracker.history
  const x = (t) => NOW_X - (now - t) * PX_PER_SEC
  const y = (p) => yOf(view, p.midi ?? view.center)

  lc.clearRect(0, 0, W, VIZ_H)
  lc.save()
  lc.translate(0, -VIZ_TOP)
  lc.lineCap = 'round'
  lc.lineJoin = 'round'

  const resting = new Path2D()
  const gloss = new Path2D()
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]
    const p = history[i]
    if (!p.voiced) {
      resting.moveTo(x(prev.t), y(prev))
      resting.lineTo(x(p.t), y(p))
      continue
    }
    const px = x(p.t)
    const fresh = Math.exp(-(now - p.t) / 0.35) // 1 at the needle, fading over ~1 s
    const swell = 1 + (motion.pulse * 0.6 + motion.hold * 0.9) * fresh
    lc.strokeStyle = color(p.midi, 62 + motion.hold * 10 * fresh)
    lc.lineWidth = (3 + p.volume * 9 * (0.45 + 0.55 * (px / NOW_X))) * S * swell
    lc.beginPath()
    lc.moveTo(x(prev.t), y(prev))
    lc.lineTo(px, y(p))
    lc.stroke()
    gloss.moveTo(x(prev.t), y(prev) - S)
    gloss.lineTo(px, y(p) - S)
  }
  lc.strokeStyle = REST
  lc.lineWidth = 2 * S
  lc.stroke(resting)
  lc.strokeStyle = 'rgba(255,255,255,0.75)'
  lc.lineWidth = 1.6 * S
  lc.stroke(gloss)

  drawConfetti(lc, view.confetti, CONFETTI_SEC)
  lc.restore()

  lc.globalCompositeOperation = 'destination-out'
  const fade = lc.createLinearGradient(0, 0, FADE_W, 0)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  lc.fillStyle = fade
  lc.fillRect(0, 0, FADE_W, VIZ_H)
  lc.globalCompositeOperation = 'source-over'

  ctx.drawImage(view.layer, 0, VIZ_TOP)
}

// Rainbow dots and four-point sparkles. Shared with vinyl mode (pieces need x, y, age,
// size, hue; `star`, `phase` and `volume` are optional).
function drawConfetti(c, pieces, lifeSec) {
  for (const p of pieces) {
    const life = 1 - p.age / lifeSec
    const py = p.y + Math.sin(p.age * 4 + (p.phase ?? 0)) * 3 * S
    c.fillStyle = `hsl(${p.hue} ${SAT}% 64%)`
    if (p.star ?? p.size > 0.78) {
      c.globalAlpha = life
      c.save()
      c.translate(p.x, py)
      c.rotate((p.age * 120 * Math.PI) / 180)
      c.scale((0.5 + p.size * 0.6) * S, (0.5 + p.size * 0.6) * S)
      c.beginPath()
      c.moveTo(0, -6)
      c.quadraticCurveTo(1, -1, 6, 0)
      c.quadraticCurveTo(1, 1, 0, 6)
      c.quadraticCurveTo(-1, 1, -6, 0)
      c.quadraticCurveTo(-1, -1, 0, -6)
      c.fill()
      c.restore()
    } else {
      c.globalAlpha = life * 0.9
      c.beginPath()
      c.arc(p.x, py, (1.2 + p.size * 2.6 * (p.volume ?? 0.6)) * S, 0, Math.PI * 2)
      c.fill()
    }
  }
  c.globalAlpha = 1
}

// Vibrato rings rippling out from the orb, in the note's colour.
function drawRings(ctx, rings) {
  for (const r of rings) {
    const k = r.age / RING_SEC
    ctx.globalAlpha = 0.7 * r.strength * (1 - k)
    ctx.strokeStyle = color(r.midi, 56)
    ctx.lineWidth = (3 * (1 - k) + 1) * S
    ctx.beginPath()
    ctx.arc(r.x, r.y, (10 + 34 * k) * S, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// White orb with two rings pulsing out while she sings and a glow that grows while she holds;
// small and grey when silent. Also the needle in vinyl mode.
function drawOrb(ctx, x, y, tracker, motion, now) {
  const latest = tracker.history.at(-1)
  if (!latest?.voiced) {
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = REST
    ctx.lineWidth = 2 * S
    ctx.beginPath()
    ctx.arc(x, y, 5 * S, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    return
  }

  const c = color(latest.midi, 56)
  if (motion.hold > 0.05) {
    ctx.globalAlpha = 0.25 * motion.hold
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(x, y, (14 + 14 * motion.hold) * S, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = c
  for (const offset of [0, HALO_SEC / 2]) {
    const k = ((now + offset) % HALO_SEC) / HALO_SEC
    const eased = 1 - (1 - k) ** 2
    ctx.globalAlpha = 0.7 * (1 - k)
    ctx.lineWidth = 2 * S
    ctx.beginPath()
    ctx.arc(x, y, (8 + 22 * eased) * S, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 3 * S
  ctx.beginPath()
  ctx.arc(x, y, (6 + tracker.volume * 3 + motion.hold * 3 + motion.pulse * 3) * S, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

// Bobbing pill above the graph: note letter, note name, frequency.
function drawNoteBubble(ctx, midi, now) {
  const voiced = midi != null
  const name = voiced ? midiToName(midi) : 'listening'
  const hz = `${voiced ? Math.round(midiToHz(midi)) : '—'} HZ`

  ctx.font = `600 ${15 * S}px Fredoka, sans-serif`
  const nameW = ctx.measureText(name).width
  ctx.font = `800 ${10 * S}px Nunito, sans-serif`
  ctx.letterSpacing = `${S}px`
  const hzW = ctx.measureText(hz).width
  ctx.letterSpacing = '0px'

  const w = (6 + 36 + 8 + 14) * S + Math.max(nameW, hzW)
  const h = 48 * S
  const cx = W - 16 * S - w / 2
  const cy = H - 238 * S - h / 2
  const bob = (1 - Math.cos(((now % BOB_SEC) / BOB_SEC) * Math.PI * 2)) / 2 // 0 → 1 → 0

  ctx.save()
  ctx.translate(cx, cy - 3 * S * bob)
  ctx.rotate(((-2 + 4 * bob) * Math.PI) / 180)

  ctx.shadowColor = 'rgba(43,33,64,0.08)'
  ctx.shadowBlur = 14 * S
  ctx.shadowOffsetY = 4 * S
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'

  const dotX = -w / 2 + 24 * S
  ctx.fillStyle = voiced ? color(midi, 56) : REST
  ctx.beginPath()
  ctx.arc(dotX, 0, 18 * S, 0, Math.PI * 2)
  ctx.fill()

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${18 * S}px Fredoka, sans-serif`
  ctx.fillText(voiced ? noteLetter(midi) : '·', dotX, S)

  const textX = -w / 2 + 50 * S
  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.font = `600 ${15 * S}px Fredoka, sans-serif`
  ctx.fillText(name, textX, -6 * S)
  ctx.fillStyle = '#6B6280'
  ctx.font = `800 ${10 * S}px Nunito, sans-serif`
  ctx.letterSpacing = `${S}px`
  ctx.fillText(hz, textX, 10 * S)
  ctx.restore()
}

// How vinyl mode looks in this theme: a dark record with rainbow grooves and a note-coloured label.
const VINYL_PAINT = {
  disc: INK,
  texture: 'rgba(255,255,255,0.05)',
  sheen: 'rgba(255,255,255,0.14)',
  groove(rc, midi, width) {
    rc.strokeStyle = color(midi, 66)
    rc.lineWidth = width
    rc.stroke()
  },
  rest(rc) {
    rc.strokeStyle = 'rgba(184,176,201,0.45)'
    rc.lineWidth = 1.2 * S
    rc.stroke()
  },
  label(ctx, midi, cx, cy, r) {
    const voiced = midi != null
    ctx.fillStyle = voiced ? color(midi, 56) : REST
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2 * S
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${r * 0.8}px Fredoka, sans-serif`
    ctx.fillText(voiced ? noteLetter(midi) : '·', cx, cy - r * 0.08)
    if (voiced) {
      ctx.font = `800 ${r * 0.3}px Nunito, sans-serif`
      ctx.fillText(`${Math.round(midiToHz(midi))} HZ`, cx, cy + r * 0.55)
    }
  },
  tonearm(ctx, pivot, needle) {
    ctx.save()
    ctx.shadowColor = 'rgba(43,33,64,0.3)'
    ctx.shadowBlur = 6 * S
    ctx.strokeStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.lineWidth = 4 * S
    ctx.beginPath()
    ctx.moveTo(pivot.x, pivot.y)
    ctx.lineTo(needle.x, needle.y)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(pivot.x, pivot.y, 9 * S, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = INK
    ctx.lineWidth = 2 * S
    ctx.beginPath()
    ctx.arc(pivot.x, pivot.y, 4 * S, 0, Math.PI * 2)
    ctx.stroke()
  },
  effects(ctx, { sparks, rings, sparkSec }) {
    drawConfetti(ctx, sparks, sparkSec)
    drawRings(ctx, rings)
  },
  needle(ctx, x, y, midi, volume, motion, now) {
    drawOrb(ctx, x, y, { history: [{ midi, voiced: midi != null }], volume }, motion, now)
  },
}
