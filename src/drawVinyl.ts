import type { Motion } from './motion'
import type { PitchTracker } from './pitch'
import type { Point } from './stage'

type Ctx = CanvasRenderingContext2D

const ROT_SEC = 6
const GROOVE_STEP = 0.05
const NEEDLE_ANGLE = -0.55
const SPARK_SEC = 1.2
const RING_SEC = 1

export interface Spark extends Point {
  vx: number
  vy: number
  age: number
  size: number
  hue: number
}

export interface Ring extends Point {
  age: number
  strength: number
  midi: number | null
}

export interface VinylView {
  record: HTMLCanvasElement
  rotation: number
  turns: number
  center: number
  last: Point | null
  sparks: Spark[]
  rings: Ring[]
  ringClock: number
}

// Each theme supplies the record's look.
export interface VinylPaint {
  disc: string
  texture: string
  sheen: string
  groove(rc: Ctx, midi: number, width: number): void
  rest(rc: Ctx): void
  label(ctx: Ctx, midi: number | null, cx: number, cy: number, r: number): void
  tonearm(ctx: Ctx, pivot: Point, needle: Point): void
  effects(ctx: Ctx, fx: { sparks: Spark[]; rings: Ring[]; sparkSec: number; ringSec: number }): void
  needle(ctx: Ctx, x: number, y: number, midi: number | null, volume: number, motion: Motion, now: number): void
}

export interface VinylBox {
  cx: number
  cy: number
  r: number
}

export function createVinylView(size: number): VinylView {
  const record = document.createElement('canvas')
  record.width = record.height = Math.ceil(size)
  return { record, rotation: 0, turns: 0, center: 56, last: null, sparks: [], rings: [], ringClock: 0 }
}

export function clearVinyl(view: VinylView) {
  view.record.getContext('2d')!.clearRect(0, 0, view.record.width, view.record.height)
  Object.assign(view, { rotation: 0, turns: 0, last: null, sparks: [], rings: [], ringClock: 0 })
}

interface VinylFrame {
  tracker: PitchTracker
  motion: Motion
  view: VinylView
  dt: number
  now: number
  box: VinylBox
  paint: VinylPaint
  S: number
}

export function drawVinyl(ctx: Ctx, { tracker, motion, view, dt, now, box, paint, S }: VinylFrame) {
  const { cx, cy, r } = box
  const midi = tracker.current
  const rc = view.record.getContext('2d')!
  const half = view.record.width / 2
  const rIn = r * 0.36
  const rOut = r * 0.95

  const step = ((Math.PI * 2) / ROT_SEC) * dt
  view.rotation += step
  view.turns += step / (Math.PI * 2)
  if (midi != null) view.center += (midi - view.center) * 0.04
  let base = rOut - 4 * S - view.turns * GROOVE_STEP * r
  if (base < rIn + 10 * S) {
    // the spiral reached the label: dim the old pass and start again from the outside
    view.turns = 0
    base = rOut - 4 * S
    rc.globalAlpha = 0.6
    rc.fillStyle = paint.disc
    rc.fillRect(0, 0, view.record.width, view.record.height)
    rc.globalAlpha = 1
  }

  const pitch = tracker.history.at(-1)?.midi ?? view.center
  const radius = base + Math.max(-9, Math.min(9, (pitch - view.center) * 2.2)) * S
  const theta = NEEDLE_ANGLE - view.rotation
  const point = { x: half + radius * Math.cos(theta), y: half + radius * Math.sin(theta) }

  if (view.last) {
    rc.lineCap = 'round'
    rc.beginPath()
    rc.moveTo(view.last.x, view.last.y)
    rc.lineTo(point.x, point.y)
    if (midi != null) paint.groove(rc, midi, (1.6 + tracker.volume * 3 + motion.pulse * 2 + motion.hold * 2.5) * S)
    else paint.rest(rc)
  }
  view.last = point

  const nx = cx + radius * Math.cos(NEEDLE_ANGLE)
  const ny = cy + radius * Math.sin(NEEDLE_ANGLE)

  const spawn = (count: number, speed: number) => {
    for (let i = 0; i < count; i++) {
      const angle = NEEDLE_ANGLE + Math.PI / 2 + (Math.random() - 0.5) * (speed > 1 ? Math.PI * 2 : 0.9)
      const v = (40 + Math.random() * 90) * S * speed
      view.sparks.push({ x: nx, y: ny, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, age: 0, size: Math.random(), hue: Math.random() * 360 })
    }
  }
  if (midi != null && Math.random() < 0.35 + motion.hold * 0.5) spawn(1, 1)
  if (motion.onset) spawn(Math.round(6 + motion.onset * 10), 1.8)
  for (const s of view.sparks) {
    s.age += dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vx *= Math.exp(-dt * 2)
    s.vy *= Math.exp(-dt * 2)
  }
  view.sparks = view.sparks.filter((s) => s.age < SPARK_SEC).slice(-250)

  if (motion.vibrato > 0.15) {
    view.ringClock += dt * motion.vibratoRate
    if (view.ringClock >= 1) {
      view.ringClock %= 1
      view.rings.push({ x: nx, y: ny, age: 0, strength: motion.vibrato, midi })
    }
  }
  for (const ring of view.rings) ring.age += dt
  view.rings = view.rings.filter((ring) => ring.age < RING_SEC)

  ctx.save()
  ctx.fillStyle = paint.disc
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = paint.texture
  ctx.lineWidth = 0.5 * S
  for (let gr = rIn; gr < rOut; gr += 5 * S) {
    ctx.beginPath()
    ctx.arc(cx, cy, gr, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.rotate(view.rotation)
  ctx.drawImage(view.record, -half, -half)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = paint.sheen
  ctx.lineCap = 'round'
  ctx.lineWidth = 2 * S
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.82, Math.PI * 1.1, Math.PI * 1.35)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.82, Math.PI * 0.1, Math.PI * 0.35)
  ctx.stroke()
  ctx.restore()

  paint.label(ctx, midi, cx, cy, rIn - 4 * S)
  paint.tonearm(ctx, { x: cx + r * 1.08, y: cy - r * 0.92 }, { x: nx, y: ny })
  paint.effects(ctx, { sparks: view.sparks, rings: view.rings, sparkSec: SPARK_SEC, ringSec: RING_SEC })
  paint.needle(ctx, nx, ny, midi, tracker.volume, motion, now)
}
