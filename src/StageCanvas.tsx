import { useEffect, useRef, type RefObject } from 'react'
import * as candy from './drawCandy'
import * as gloom from './drawGloom'
import { clearVinyl } from './drawVinyl'
import { createMotion, updateMotion } from './motion'
import { createPitchTracker } from './pitch'
import { H, W, type Layout, type MicLevel, type Theme } from './stage'
import { drawGrain, type VideoFilterName } from './videoFilters'

const GRAIN_AMOUNT: Record<Theme, number> = { candy: 0.06, gloom: 0.09 }

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>
  levelRef: RefObject<MicLevel | null>
  video: HTMLVideoElement
  analyser: AnalyserNode
  sampleRate: number
  theme: Theme
  look: VideoFilterName
  grain: boolean
  layout: Layout
  vinylClears: number
}

function StageCanvas({ canvasRef, levelRef, video, analyser, sampleRate, theme, look, grain, layout, vinylClears }: Props) {
  // read by the draw loop, so changing options doesn't restart it or lose the pitch history
  const optionsRef = useRef({ theme, look, grain, layout, vinylClears })
  useEffect(() => {
    optionsRef.current = { theme, look, grain, layout, vinylClears }
  }, [theme, look, grain, layout, vinylClears])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const tracker = createPitchTracker(analyser, sampleRate)
    const motion = createMotion()
    const views = { candy: candy.createView(), gloom: gloom.createView() }
    let last = performance.now() / 1000
    let clears = optionsRef.current.vinylClears
    let raf = 0

    const frame = () => {
      const now = performance.now() / 1000
      const dt = Math.min(now - last, 0.05)
      last = now
      tracker.update(now)
      updateMotion(motion, tracker, now, dt)
      levelRef.current = { rmsDb: tracker.rmsDb, peakDb: tracker.peakDb, voiced: tracker.current != null }

      const { theme, look, grain, layout, vinylClears } = optionsRef.current
      if (vinylClears !== clears) {
        clears = vinylClears
        clearVinyl(views.candy.vinyl)
        clearVinyl(views.gloom.vinyl)
      }
      const frameData = { video, look, layout, tracker, motion, now, dt }
      if (theme === 'candy') candy.drawStage(ctx, { ...frameData, view: views.candy })
      else gloom.drawStage(ctx, { ...frameData, view: views.gloom })
      if (grain) drawGrain(ctx, now, GRAIN_AMOUNT[theme])
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [canvasRef, levelRef, video, analyser, sampleRate])

  return <canvas ref={canvasRef} width={W} height={H} className="stage" />
}

export default StageCanvas
