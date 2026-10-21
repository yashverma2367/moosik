import type { Motion } from './motion'
import type { PitchTracker } from './pitch'
import { VIDEO_FILTERS, type VideoFilterName } from './videoFilters'

export type Theme = 'candy' | 'gloom'
export type Layout = 'graph' | 'vinyl'

export interface Point {
  x: number
  y: number
}

export interface StageFrame<View> {
  video: HTMLVideoElement
  look: VideoFilterName
  layout: Layout
  tracker: PitchTracker
  motion: Motion
  view: View
  now: number
  dt: number
}

export interface MicLevel {
  rmsDb: number
  peakDb: number
  voiced: boolean
}

export const W = 1080
export const H = 1920
// the designs were drawn on a 358 px wide frame; S scales their sizes up to 1080
export const S = W / 358

export function drawSelfie(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, look: VideoFilterName, motion: Motion) {
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
