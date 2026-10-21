// Built from blend modes instead of ctx.filter, which Safari doesn't support.

type Ctx = CanvasRenderingContext2D

interface VideoFilter {
  label: string
  color: string
  apply(ctx: Ctx): void
}

function wash(ctx: Ctx, mode: GlobalCompositeOperation, color: string, alpha: number) {
  ctx.save()
  ctx.globalCompositeOperation = mode
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

const desaturate = (ctx: Ctx, alpha: number) => wash(ctx, 'saturation', '#808080', alpha)

const blurCanvases: Record<number, HTMLCanvasElement> = {}

// Shrinking the frame and stretching it back up blurs it cheaply.
function blurred(ctx: Ctx, shrink: number) {
  let c = blurCanvases[shrink]
  if (!c) {
    c = blurCanvases[shrink] = document.createElement('canvas')
    c.width = Math.round(ctx.canvas.width / shrink)
    c.height = Math.round(ctx.canvas.height / shrink)
  }
  const bctx = c.getContext('2d')!
  bctx.imageSmoothingQuality = 'high'
  bctx.drawImage(ctx.canvas, 0, 0, c.width, c.height)
  return c
}

function drawOver(ctx: Ctx, image: CanvasImageSource, mode: GlobalCompositeOperation, alpha: number) {
  ctx.save()
  ctx.globalCompositeOperation = mode
  ctx.globalAlpha = alpha
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

const glow = (ctx: Ctx, amount: number) => drawOver(ctx, blurred(ctx, 12), 'screen', amount)

const SKIN_W = 270
const SKIN_H = 480

interface Scratch {
  canvas: HTMLCanvasElement
  ctx: Ctx
}

let skin: { sharp: Scratch; tiny: Scratch; soft: Scratch; out: ImageData } | null = null

function makeScratch(width: number, height: number): Scratch {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! }
}

// Cb/Cr colour channels separate skin from other colours regardless of skin tone.
function skinAmount(r: number, g: number, b: number) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  if (y < 35) return 0
  const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b
  const d = Math.hypot((cb - 105) / 22, (cr - 150) / 20)
  return Math.min(1, Math.max(0, 1.5 - d))
}

// Blur laid back only where the colour is skin-like: spots melt, eyes and hair stay sharp.
function smoothSkin(ctx: Ctx, amount: number) {
  if (!skin) {
    const soft = makeScratch(SKIN_W, SKIN_H)
    skin = { sharp: makeScratch(SKIN_W, SKIN_H), tiny: makeScratch(SKIN_W / 3, SKIN_H / 3), soft, out: soft.ctx.createImageData(SKIN_W, SKIN_H) }
  }
  const { sharp, tiny, soft, out } = skin
  sharp.ctx.drawImage(ctx.canvas, 0, 0, SKIN_W, SKIN_H)
  tiny.ctx.drawImage(sharp.canvas, 0, 0, tiny.canvas.width, tiny.canvas.height)
  soft.ctx.drawImage(tiny.canvas, 0, 0, SKIN_W, SKIN_H)

  const px = sharp.ctx.getImageData(0, 0, SKIN_W, SKIN_H).data
  const blur = soft.ctx.getImageData(0, 0, SKIN_W, SKIN_H).data
  const o = out.data
  for (let i = 0; i < px.length; i += 4) {
    o[i] = blur[i]
    o[i + 1] = blur[i + 1]
    o[i + 2] = blur[i + 2]
    // the blur must look like skin too, or face edges pick up background colour
    const mask = Math.min(skinAmount(px[i], px[i + 1], px[i + 2]), skinAmount(blur[i], blur[i + 1], blur[i + 2]))
    o[i + 3] = mask * amount * 255
  }
  soft.ctx.putImageData(out, 0, 0)
  drawOver(ctx, soft.canvas, 'source-over', 1)
}

export const VIDEO_FILTERS = {
  none: { label: 'None', color: '#5A5170', apply: () => {} },
  natural: {
    label: 'Natural',
    color: '#C2410C',
    apply: (ctx) => {
      smoothSkin(ctx, 0.75)
      wash(ctx, 'soft-light', '#ffd8c0', 0.1)
    },
  },
  soft: { label: 'Soft', color: '#7048E8', apply: (ctx) => glow(ctx, 0.12) },
  warm: { label: 'Warm', color: '#F08C00', apply: (ctx) => wash(ctx, 'soft-light', '#ffb070', 0.2) },
  cool: { label: 'Cool', color: '#1C7ED6', apply: (ctx) => wash(ctx, 'soft-light', '#8fb8ff', 0.18) },
  haze: {
    label: 'Haze',
    color: '#E64980',
    apply: (ctx) => {
      glow(ctx, 0.2)
      wash(ctx, 'soft-light', '#ffe3f1', 0.12)
    },
  },
  faded: {
    label: 'Faded',
    color: '#A0703C',
    apply: (ctx) => {
      wash(ctx, 'lighten', '#262626', 0.5)
      desaturate(ctx, 0.15)
    },
  },
  mono: { label: 'Mono', color: '#495057', apply: (ctx) => desaturate(ctx, 0.85) },
} satisfies Record<string, VideoFilter>

export type VideoFilterName = keyof typeof VIDEO_FILTERS

const GRAIN_FPS = 12
let grainTiles: HTMLCanvasElement[] | null = null
const grainPatterns = new WeakMap<Ctx, CanvasPattern[]>()

function makeGrainTiles() {
  return Array.from({ length: 4 }, () => {
    const noise = document.createElement('canvas')
    noise.width = noise.height = 128
    const nctx = noise.getContext('2d')!
    const img = nctx.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    nctx.putImageData(img, 0, 0)
    const tile = document.createElement('canvas')
    tile.width = tile.height = 384
    tile.getContext('2d')!.drawImage(noise, 0, 0, 384, 384)
    return tile
  })
}

export function drawGrain(ctx: Ctx, now: number, amount: number) {
  grainTiles ??= makeGrainTiles()
  let patterns = grainPatterns.get(ctx)
  if (!patterns) {
    patterns = grainTiles.map((t) => ctx.createPattern(t, 'repeat')!)
    grainPatterns.set(ctx, patterns)
  }
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = amount
  ctx.fillStyle = patterns[Math.floor(now * GRAIN_FPS) % patterns.length]
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}
