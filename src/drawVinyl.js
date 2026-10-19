// Vinyl mode: her voice is cut into a spinning record. The needle writes a spiral groove
// that wobbles with her pitch and takes each note's colour; over a song it builds up a
// pattern. Each theme supplies the look through a `paint` object (see draw.js / drawGloom.js).

const ROT_SEC = 6 // one turn of the record
const GROOVE_STEP = 0.05 // fraction of the radius the spiral moves inward per turn
const NEEDLE_ANGLE = -0.55 // where the needle sits, radians from 3 o'clock (negative = up)
const SPARK_SEC = 1.2
const RING_SEC = 1

// Animation state that lives across frames. `size` is the record's diameter in px.
export function createVinylView(size) {
  const record = document.createElement('canvas')
  record.width = record.height = Math.ceil(size)
  return { record, rotation: 0, turns: 0, center: 56, last: null, sparks: [], rings: [], ringClock: 0 }
}

// Wipes the record so the next take starts on a blank disc.
export function clearVinyl(view) {
  view.record.getContext('2d').clearRect(0, 0, view.record.width, view.record.height)
  Object.assign(view, { rotation: 0, turns: 0, last: null, sparks: [], rings: [], ringClock: 0 })
}

// box: { cx, cy, r } on the frame, in px. S: the theme's design-to-frame scale.
export function drawVinyl(ctx, { tracker, motion, view, dt, now, box, paint, S }) {
  const { cx, cy, r } = box
  const midi = tracker.current
  const voiced = midi != null
  const rc = view.record.getContext('2d')
  const half = view.record.width / 2
  const rIn = r * 0.36 // inside edge of the grooves (just outside the label)
  const rOut = r * 0.95

  // spin, and slowly move the groove inward like a real record
  const step = ((Math.PI * 2) / ROT_SEC) * dt
  view.rotation += step
  view.turns += step / (Math.PI * 2)
  if (voiced) view.center += (midi - view.center) * 0.04
  let base = rOut - 4 * S - view.turns * GROOVE_STEP * r
  if (base < rIn + 10 * S) {
    // reached the label: dim what's there and start a new pass from the outside
    view.turns = 0
    base = rOut - 4 * S
    rc.globalAlpha = 0.6
    rc.fillStyle = paint.disc
    rc.fillRect(0, 0, view.record.width, view.record.height)
    rc.globalAlpha = 1
  }

  // the groove wobbles with pitch around the spiral (about 2 px per semitone on the design)
  const pitch = tracker.history.at(-1)?.midi ?? view.center
  const radius = base + Math.max(-9, Math.min(9, (pitch - view.center) * 2.2)) * S
  const theta = NEEDLE_ANGLE - view.rotation // the needle's position in record space
  const point = { x: half + radius * Math.cos(theta), y: half + radius * Math.sin(theta) }

  if (view.last) {
    rc.lineCap = 'round'
    rc.beginPath()
    rc.moveTo(view.last.x, view.last.y)
    rc.lineTo(point.x, point.y)
    if (voiced) {
      const width = (1.6 + tracker.volume * 3 + motion.pulse * 2 + motion.hold * 2.5) * S
      paint.groove(rc, midi, width, motion)
    } else {
      paint.rest(rc, S)
    }
  }
  view.last = point

  // needle position on the frame
  const nx = cx + radius * Math.cos(NEEDLE_ANGLE)
  const ny = cy + radius * Math.sin(NEEDLE_ANGLE)

  // sparks fly off the needle along the spin; a burst on each new syllable
  const spawn = (count, speed) => {
    for (let i = 0; i < count; i++) {
      const tangent = NEEDLE_ANGLE + Math.PI / 2 + (Math.random() - 0.5) * (speed > 1 ? Math.PI * 2 : 0.9)
      const v = (40 + Math.random() * 90) * S * speed
      view.sparks.push({ x: nx, y: ny, vx: Math.cos(tangent) * v, vy: Math.sin(tangent) * v, age: 0, size: Math.random(), hue: Math.random() * 360 })
    }
  }
  if (voiced && Math.random() < 0.35 + motion.hold * 0.5) spawn(1, 1)
  if (motion.onset) spawn(Math.round(6 + motion.onset * 10), 1.8)
  for (const s of view.sparks) {
    s.age += dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vx *= Math.exp(-dt * 2)
    s.vy *= Math.exp(-dt * 2)
  }
  view.sparks = view.sparks.filter((s) => s.age < SPARK_SEC).slice(-250)

  // vibrato: a ring per wobble
  if (motion.vibrato > 0.15) {
    view.ringClock += dt * motion.vibratoRate
    if (view.ringClock >= 1) {
      view.ringClock %= 1
      view.rings.push({ x: nx, y: ny, age: 0, strength: motion.vibrato, midi })
    }
  }
  for (const ring of view.rings) ring.age += dt
  view.rings = view.rings.filter((ring) => ring.age < RING_SEC)

  // draw: disc, the spinning record, the label, tonearm, needle and effects
  ctx.save()
  ctx.fillStyle = paint.disc
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = paint.texture // faint pressed-in grooves
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

  // light catching the vinyl: two fixed arcs that don't spin
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

  paint.label(ctx, midi, cx, cy, rIn - 4 * S, view.rotation)

  const pivot = { x: cx + r * 1.08, y: cy - r * 0.92 }
  paint.tonearm(ctx, pivot, { x: nx, y: ny })
  paint.effects(ctx, { sparks: view.sparks, rings: view.rings, sparkSec: SPARK_SEC, ringSec: RING_SEC })
  paint.needle(ctx, nx, ny, midi, tracker.volume, motion, now)
}
