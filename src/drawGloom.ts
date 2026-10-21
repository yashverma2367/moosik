import { createVinylView, drawVinyl, type VinylPaint, type VinylView } from './drawVinyl'
import type { Motion } from './motion'
import { isBlackKey, midiToHz, midiToName, noteLetter } from './notes'
import type { PitchPoint, PitchTracker } from './pitch'
import { drawSelfie, H, S, W, type StageFrame } from './stage'
import type { VideoFilterName } from './videoFilters'

type Ctx = CanvasRenderingContext2D

const tint = (alpha: number) => `rgba(201,196,186,${Math.min(1, alpha)})`

const TRAY = { x: 8 * S, y: H - 8 * S - 234 * S, w: W - 16 * S, h: 234 * S }
const VIZ_H = 232 * S
const VIZ_TOP = H - VIZ_H
const PAD = 30 * S
const SPAN = 11
const LANE_H = (VIZ_H - 2 * PAD) / SPAN
const NOW_X = 250 * S
const PX_PER_SEC = 55 * S
const FADE_W = 170 * S
const VINYL = { cx: W / 2, cy: TRAY.y + TRAY.h / 2, r: TRAY.h / 2 - 10 * S }

const ASH_SEC = 3.5
const ASH_EVERY = 0.11
const BREATHE_SEC = 5
const RAIN_DROPS = 22
const RING_SEC = 1.2

interface Ash {
  y: number
  age: number
  rnd: number
  volume: number
  ox: number
  oy: number
  vx: number
  vy: number
}

interface SmokeRing {
  x: number
  y: number
  age: number
  strength: number
}

export interface GloomView {
  center: number
  ash: Ash[]
  ashClock: number
  rings: SmokeRing[]
  ringClock: number
  layer: HTMLCanvasElement
  vinyl: VinylView
}

const yOf = (view: GloomView, midi: number) => VIZ_TOP + PAD + (view.center + SPAN / 2 - midi) * LANE_H

export function createView(): GloomView {
  const layer = document.createElement('canvas')
  layer.width = W
  layer.height = VIZ_H
  return { center: 50, ash: [], ashClock: 0, rings: [], ringClock: 0, layer, vinyl: createVinylView(VINYL.r * 2) }
}

export function drawStage(ctx: Ctx, { video, look, layout, tracker, motion, view, now, dt }: StageFrame<GloomView>) {
  drawCamera(ctx, video, look, motion)
  drawTray(ctx)
  drawWeather(ctx, now)
  if (layout === 'vinyl') {
    drawVinyl(ctx, { tracker, motion, view: view.vinyl, dt, now, box: VINYL, paint: VINYL_PAINT, S })
    return
  }
  updateView(view, tracker, motion, dt)
  drawLanes(ctx, tracker, view, motion)
  drawSmoke(ctx, tracker, view, now, motion)
  drawRings(ctx, view.rings)
  const latest = tracker.history.at(-1)
  drawOrb(ctx, NOW_X, yOf(view, latest?.midi ?? view.center), latest?.voiced ? latest.midi : null, tracker.volume, motion)
  drawNote(ctx, tracker.current, now)
}

function spawnAsh(view: GloomView, y: number, volume: number, puff: boolean) {
  const angle = Math.random() * Math.PI * 2
  const speed = puff ? (30 + Math.random() * 60) * S : 0
  view.ash.push({
    y: y + (Math.random() - 0.5) * 6 * S,
    age: 0,
    rnd: Math.random(),
    volume,
    ox: 0,
    oy: 0,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  })
}

function updateView(view: GloomView, tracker: PitchTracker, motion: Motion, dt: number) {
  const midi = tracker.current
  if (midi != null) {
    view.center += (midi - view.center) * 0.04
    const y = yOf(view, midi)

    view.ashClock += dt * (1 + motion.hold * 2)
    while (view.ashClock > ASH_EVERY) {
      view.ashClock -= ASH_EVERY
      spawnAsh(view, y, tracker.volume, false)
    }
    if (motion.onset) for (let i = 0; i < 4 + motion.onset * 8; i++) spawnAsh(view, y, tracker.volume, true)

    if (motion.vibrato > 0.15) {
      view.ringClock += dt * motion.vibratoRate
      if (view.ringClock >= 1) {
        view.ringClock %= 1
        view.rings.push({ x: NOW_X, y, age: 0, strength: motion.vibrato })
      }
    }
  }
  for (const a of view.ash) {
    a.age += dt
    a.ox += a.vx * dt
    a.oy += a.vy * dt
    a.vx *= Math.exp(-dt * 3)
    a.vy *= Math.exp(-dt * 3)
  }
  view.ash = view.ash.filter((a) => a.age < ASH_SEC).slice(-300)
  for (const r of view.rings) r.age += dt
  view.rings = view.rings.filter((r) => r.age < RING_SEC)
}

function drawCamera(ctx: Ctx, video: HTMLVideoElement, look: VideoFilterName, motion: Motion) {
  ctx.fillStyle = '#16181C'
  ctx.fillRect(0, 0, W, H)
  drawSelfie(ctx, video, look, motion)

  // elliptical vignette: a radial gradient squashed vertically
  const cx = W / 2
  const cy = H * 0.35
  const rx = W * 1.2
  const squash = (H * 0.8) / rx
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, squash)
  const vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  vignette.addColorStop(0.4, 'rgba(8,9,11,0)')
  vignette.addColorStop(1, 'rgba(8,9,11,0.82)')
  ctx.fillStyle = vignette
  ctx.fillRect(-cx, -cy / squash, W, H / squash)
  ctx.restore()
}

function drawTray(ctx: Ctx) {
  ctx.fillStyle = '#121417'
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = S
  ctx.beginPath()
  ctx.roundRect(TRAY.x, TRAY.y, TRAY.w, TRAY.h, 20 * S)
  ctx.fill()
  ctx.stroke()
}

function drawWeather(ctx: Ctx, now: number) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(TRAY.x, TRAY.y, TRAY.w, TRAY.h, 20 * S)
  ctx.clip()
  ctx.translate(0, VIZ_TOP)

  for (let i = 0; i < 3; i++) {
    const x = (400 - ((now * (6 + i * 3) + i * 140) % 560)) * S
    const y = (70 + i * 55 + Math.sin(now * 0.2 + i) * 10) * S
    const rx = (130 + i * 30) * S
    const ry = (26 + i * 6) * S
    const alpha = 0.05 + i * 0.02
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, ry / rx)
    const fog = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.3)
    fog.addColorStop(0, tint(alpha))
    fog.addColorStop(0.6, tint(alpha * 0.7))
    fog.addColorStop(1, tint(0))
    ctx.fillStyle = fog
    ctx.fillRect(-rx * 1.3, -rx * 1.3, rx * 2.6, rx * 2.6)
    ctx.restore()
  }

  ctx.lineWidth = 0.7 * S
  for (let i = 0; i < RAIN_DROPS; i++) {
    const s = Math.sin(i * 12.9898) * 43758.5
    const r = s - Math.floor(s)
    const len = 10 + r * 16
    const y = ((now * (140 + r * 90) + r * 400) % (232 + 60)) - 30
    const x = (i * 16.7 + r * 30) % 358
    ctx.strokeStyle = `rgba(184,194,204,${0.06 + r * 0.12})`
    ctx.beginPath()
    ctx.moveTo(x * S, y * S)
    ctx.lineTo((x - len * 0.12) * S, (y + len) * S)
    ctx.stroke()
  }
  ctx.restore()
}

function drawLanes(ctx: Ctx, tracker: PitchTracker, view: GloomView, motion: Motion) {
  const midi = tracker.current
  const top = view.center + SPAN / 2
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(TRAY.x, TRAY.y, TRAY.w, TRAY.h, 20 * S)
  ctx.clip()
  ctx.font = `italic 500 ${15 * S}px 'Cormorant Garamond', Georgia, serif`
  ctx.textAlign = 'left'
  ctx.lineWidth = 0.6 * S
  for (let n = Math.floor(top - SPAN) - 1; n <= Math.ceil(top) + 1; n++) {
    if (isBlackKey(n)) continue
    const near = midi == null ? 0 : Math.max(0, 1 - Math.abs(midi - n) / 1.4)
    const y = yOf(view, n)
    ctx.strokeStyle = `rgba(255,255,255,${0.035 + near * 0.07 + near * motion.pulse * 0.12})`
    ctx.beginPath()
    ctx.moveTo(40 * S, y)
    ctx.lineTo(W - 16 * S, y)
    ctx.stroke()
    ctx.fillStyle = `rgba(214,209,199,${0.5 + near * 0.45})`
    ctx.fillText(midiToName(n).toLowerCase(), 14 * S, y + 5 * S)
  }
  ctx.restore()
}

// Blur without ctx.filter (unsupported in Safari): draw the shape off-canvas and let its
// shadow land back in place.
function blurFill(c: Ctx, path: Path2D, color: string, blur: number) {
  const off = W * 3
  c.save()
  c.shadowColor = color
  c.shadowBlur = blur
  c.shadowOffsetX = off
  c.translate(-off, 0)
  c.fillStyle = '#000'
  c.fill(path)
  c.restore()
}

function drawSmoke(ctx: Ctx, tracker: PitchTracker, view: GloomView, now: number, motion: Motion) {
  const lc = view.layer.getContext('2d')!
  const history = tracker.history
  const x = (t: number) => NOW_X - (now - t) * PX_PER_SEC
  const y = (p: PitchPoint) => yOf(view, p.midi ?? view.center) - VIZ_TOP
  lc.clearRect(0, 0, W, VIZ_H)
  lc.lineCap = 'round'
  lc.lineJoin = 'round'

  // each run of singing starts from the point before it, so the jump into a new note is drawn
  const runs: PitchPoint[][] = []
  let run: PitchPoint[] = []
  for (let i = 0; i < history.length; i++) {
    const p = history[i]
    if (p.voiced) {
      if (!run.length && i > 0) run.push(history[i - 1])
      run.push(p)
    } else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)

  for (const points of runs) {
    if (points.length < 2) continue
    const pts = points.map((p) => {
      const px = x(p.t)
      const age = Math.min(1, Math.max(0, (NOW_X - px) / NOW_X))
      const fresh = Math.exp(-(now - p.t) / 0.35)
      const swell = 1 + (motion.pulse * 0.6 + motion.hold * 0.9) * fresh
      const w = (1 + p.volume * 5 + age * 7 + Math.sin(p.t * 3) * age * 3) * S * swell
      return { x: px, y: y(p), w, rise: (NOW_X - px) * 0.03 }
    })
    const body = new Path2D()
    pts.forEach((q, i) => (i ? body.lineTo(q.x, q.y - q.w - q.rise) : body.moveTo(q.x, q.y - q.w - q.rise)))
    for (let i = pts.length - 1; i >= 0; i--) body.lineTo(pts[i].x, pts[i].y + pts[i].w * 0.7)
    body.closePath()
    blurFill(lc, body, tint(0.28 + motion.hold * 0.12), 7 * S)
    lc.fillStyle = tint(0.18)
    lc.fill(body)

    lc.strokeStyle = tint(0.85 + motion.hold * 0.15)
    lc.lineWidth = 1.1 * S
    lc.beginPath()
    pts.forEach((q, i) => (i ? lc.lineTo(q.x, q.y) : lc.moveTo(q.x, q.y)))
    lc.stroke()
  }

  lc.strokeStyle = tint(0.55)
  lc.lineWidth = 1.1 * S
  lc.beginPath()
  for (let i = 1; i < history.length; i++) {
    if (history[i].voiced) continue
    lc.moveTo(x(history[i - 1].t), y(history[i - 1]))
    lc.lineTo(x(history[i].t), y(history[i]))
  }
  lc.stroke()

  for (const a of view.ash) {
    const life = 1 - a.age / ASH_SEC
    const ax = NOW_X - a.age * PX_PER_SEC + Math.sin(a.age * 1.4 + a.rnd * 9) * 5 * S + a.ox
    const ay = a.y - VIZ_TOP + a.age * (7 + a.rnd * 12) * S + a.oy
    lc.fillStyle = tint(life * 0.7 * (0.4 + 0.6 * a.volume))
    lc.beginPath()
    lc.arc(ax, ay, (0.5 + a.rnd * 1.1) * S, 0, Math.PI * 2)
    lc.fill()
  }

  lc.globalCompositeOperation = 'destination-out'
  const fade = lc.createLinearGradient(0, 0, FADE_W, 0)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  lc.fillStyle = fade
  lc.fillRect(0, 0, FADE_W, VIZ_H)
  lc.globalCompositeOperation = 'source-over'

  ctx.drawImage(view.layer, 0, VIZ_TOP)
}

function drawRings(ctx: Ctx, rings: SmokeRing[]) {
  ctx.lineWidth = 1.2 * S
  for (const r of rings) {
    const k = r.age / RING_SEC
    ctx.strokeStyle = tint(0.45 * r.strength * (1 - k))
    ctx.beginPath()
    ctx.arc(r.x, r.y, (6 + 28 * k) * S, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// midi = null draws the faint resting dot.
function drawOrb(ctx: Ctx, x: number, y: number, midi: number | null, volume: number, motion: Motion) {
  if (midi == null) {
    ctx.fillStyle = 'rgba(238,234,226,0.35)'
    ctx.beginPath()
    ctx.arc(x, y, 2 * S, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const radius = (10 + volume * 16) * S * 1.8 * (1 + motion.hold * 0.8 + motion.pulse * 0.3)
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
  glow.addColorStop(0, tint(0.22 + motion.hold * 0.18))
  glow.addColorStop(1, tint(0))
  ctx.fillStyle = glow
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  ctx.fillStyle = '#EEEAE2'
  ctx.beginPath()
  ctx.arc(x, y, (2.6 + motion.hold * 1.5) * S, 0, Math.PI * 2)
  ctx.fill()
}

function drawNote(ctx: Ctx, midi: number | null, now: number) {
  const right = W - 20 * S
  const bottom = H - 240 * S
  const breathe = (1 - Math.cos(((now % BREATHE_SEC) / BREATHE_SEC) * Math.PI * 2)) / 2

  ctx.save()
  ctx.globalAlpha = 0.55 + 0.35 * breathe
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'

  ctx.font = `500 ${13 * S}px 'Inter Tight', system-ui, sans-serif`
  ctx.letterSpacing = `${2.6 * S}px`
  ctx.fillStyle = '#A7A39B'
  ctx.fillText(`${midi != null ? Math.round(midiToHz(midi)) : '—'} HZ`, right + 2.6 * S, bottom - 2 * S)
  ctx.letterSpacing = '0px'

  const baseline = bottom - 26 * S
  let x = right
  if (midi != null) {
    ctx.font = `italic 400 ${22 * S}px 'Cormorant Garamond', Georgia, serif`
    ctx.fillStyle = '#A7A39B'
    const octave = String(Math.floor(Math.round(midi) / 12) - 1)
    ctx.fillText(octave, x, baseline)
    x -= ctx.measureText(octave).width + 2 * S
  }
  ctx.font = `400 ${52 * S}px 'Cormorant Garamond', Georgia, serif`
  ctx.fillStyle = '#D6D1C7'
  ctx.fillText(midi != null ? noteLetter(midi).toLowerCase() : '·', x, baseline)
  ctx.restore()
}

const VINYL_PAINT: VinylPaint = {
  disc: '#0A0B0D',
  texture: 'rgba(255,255,255,0.03)',
  sheen: 'rgba(255,255,255,0.07)',
  groove(rc, _midi, width) {
    rc.strokeStyle = tint(0.06)
    rc.lineWidth = width * 3
    rc.stroke()
    rc.strokeStyle = tint(0.75)
    rc.lineWidth = width * 0.45
    rc.stroke()
  },
  rest(rc) {
    rc.strokeStyle = tint(0.3)
    rc.lineWidth = S
    rc.stroke()
  },
  label(ctx, midi, cx, cy, r) {
    ctx.fillStyle = '#121417'
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = S
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#D6D1C7'
    ctx.font = `400 ${r * 0.95}px 'Cormorant Garamond', Georgia, serif`
    ctx.fillText(midi != null ? noteLetter(midi).toLowerCase() : '·', cx, cy - r * 0.12)
    if (midi != null) {
      ctx.fillStyle = '#A7A39B'
      ctx.font = `italic 400 ${r * 0.38}px 'Cormorant Garamond', Georgia, serif`
      ctx.fillText(String(Math.floor(Math.round(midi) / 12) - 1), cx, cy + r * 0.55)
    }
  },
  tonearm(ctx, pivot, needle) {
    ctx.strokeStyle = tint(0.5)
    ctx.lineCap = 'round'
    ctx.lineWidth = 1.4 * S
    ctx.beginPath()
    ctx.moveTo(pivot.x, pivot.y)
    ctx.lineTo(needle.x, needle.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(pivot.x, pivot.y, 5 * S, 0, Math.PI * 2)
    ctx.stroke()
  },
  effects(ctx, { sparks, rings, sparkSec }) {
    for (const s of sparks) {
      ctx.fillStyle = tint((1 - s.age / sparkSec) * 0.7)
      ctx.beginPath()
      ctx.arc(s.x, s.y + s.age * 10 * S, (0.5 + s.size * 1.1) * S, 0, Math.PI * 2)
      ctx.fill()
    }
    drawRings(ctx, rings)
  },
  needle(ctx, x, y, midi, volume, motion) {
    drawOrb(ctx, x, y, midi, volume, motion)
  },
}
