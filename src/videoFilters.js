// Camera looks, applied right after the selfie is drawn (before the theme's own overlays).
// Kept subtle on purpose. Built from blend modes instead of ctx.filter, which Safari doesn't support.

function wash(ctx, mode, color, alpha) {
  ctx.save()
  ctx.globalCompositeOperation = mode
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

// alpha 1 = fully black and white, lower keeps a hint of colour
const desaturate = (ctx, alpha) => wash(ctx, 'saturation', '#808080', alpha)

// blurred copy of the frame, made by shrinking it and stretching it back up.
// `shrink` sets how blurry: 12 = big soft glow.
const blurCanvases = {}
function blurred(ctx, shrink) {
  const { width, height } = ctx.canvas
  let c = blurCanvases[shrink]
  if (!c) {
    c = blurCanvases[shrink] = document.createElement('canvas')
    c.width = Math.round(width / shrink)
    c.height = Math.round(height / shrink)
  }
  const bctx = c.getContext('2d')
  bctx.imageSmoothingQuality = 'high'
  bctx.drawImage(ctx.canvas, 0, 0, c.width, c.height)
  return c
}

function drawOver(ctx, image, mode, alpha) {
  ctx.save()
  ctx.globalCompositeOperation = mode
  ctx.globalAlpha = alpha
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

// soft bloom: screen a very blurred copy on top
const glow = (ctx, amount) => drawOver(ctx, blurred(ctx, 12), 'screen', amount)

// Skin smoothing, like WhatsApp's touch-up. Works on a small 270x480 copy so it's fast:
// blur the picture, then lay the blur back over the frame only where the colour is skin-like.
// Eyes, brows, hair and the background aren't skin-coloured, so they stay sharp; spots and
// pores are still skin-coloured, so they melt away.
const SKIN_W = 270
const SKIN_H = 480
let skin = null

function makeCanvas(width, height) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) }
}

// 1 for typical skin (any tone), fading to 0 away from it. Uses the Cb/Cr colour channels,
// which separate skin from other colours regardless of how light or dark the skin is.
function skinAmount(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  if (y < 35) return 0
  const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b
  const d = Math.hypot((cb - 105) / 22, (cr - 150) / 20)
  return Math.min(1, Math.max(0, 1.5 - d))
}

function smoothSkin(ctx, amount) {
  if (!skin) {
    skin = { sharp: makeCanvas(SKIN_W, SKIN_H), tiny: makeCanvas(SKIN_W / 3, SKIN_H / 3), soft: makeCanvas(SKIN_W, SKIN_H) }
    skin.out = skin.soft.ctx.createImageData(SKIN_W, SKIN_H)
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
  drawOver(ctx, soft.canvas, 'source-over', 1) // stretching it up softens the mask edges too
}

// color = the button's colour when picked in the bright theme
export const VIDEO_FILTERS = {
  none: { label: 'None', color: '#5A5170', apply: () => {} },
  natural: {
    label: 'Natural',
    color: '#C2410C',
    apply: (ctx) => {
      smoothSkin(ctx, 0.75)
      wash(ctx, 'soft-light', '#ffd8c0', 0.1) // a touch of healthy warmth
    },
  },
  soft: {
    label: 'Soft',
    color: '#7048E8',
    apply: (ctx) => glow(ctx, 0.12),
  },
  warm: {
    label: 'Warm',
    color: '#F08C00',
    apply: (ctx) => wash(ctx, 'soft-light', '#ffb070', 0.2),
  },
  cool: {
    label: 'Cool',
    color: '#1C7ED6',
    apply: (ctx) => wash(ctx, 'soft-light', '#8fb8ff', 0.18),
  },
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
      wash(ctx, 'lighten', '#262626', 0.5) // lifts the blacks a little
      desaturate(ctx, 0.15)
    },
  },
  mono: {
    label: 'Mono',
    color: '#495057',
    apply: (ctx) => desaturate(ctx, 0.85),
  },
}

// Film grain: a few tiles of grey noise, cycled so it flickers. Drawn last, over everything.
const GRAIN_FPS = 12
let grainTiles = null
const grainPatterns = new WeakMap() // patterns belong to the context that made them

function makeGrainTiles() {
  return Array.from({ length: 4 }, () => {
    const noise = document.createElement('canvas')
    noise.width = noise.height = 128
    const nctx = noise.getContext('2d')
    const img = nctx.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    nctx.putImageData(img, 0, 0)
    const tile = document.createElement('canvas')
    tile.width = tile.height = 384 // each grain about 3 px on the 1080 px frame
    tile.getContext('2d').drawImage(noise, 0, 0, 384, 384)
    return tile
  })
}

export function drawGrain(ctx, now, amount) {
  grainTiles ??= makeGrainTiles()
  if (!grainPatterns.has(ctx)) grainPatterns.set(ctx, grainTiles.map((t) => ctx.createPattern(t, 'repeat')))
  const patterns = grainPatterns.get(ctx)
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = amount
  ctx.fillStyle = patterns[Math.floor(now * GRAIN_FPS) % patterns.length]
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}
