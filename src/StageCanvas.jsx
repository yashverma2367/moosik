import { useEffect, useRef } from 'react'
import * as candy from './draw'
import * as gloom from './drawGloom'
import { clearVinyl } from './drawVinyl'
import { createMotion, updateMotion } from './motion'
import { createPitchTracker } from './pitch'
import { drawGrain } from './videoFilters'

const THEMES = { candy, gloom }
const GRAIN_AMOUNT = { candy: 0.06, gloom: 0.09 }

// levelRef gets the mic level every frame, for the level meter outside the canvas.
function StageCanvas({ canvasRef, levelRef, video, analyser, sampleRate, theme, look, grain, layout, vinylClears }) {
  // read by the draw loop, so switching doesn't restart it or lose the pitch history
  const optionsRef = useRef({ theme, look, grain, layout, vinylClears })
  useEffect(() => {
    optionsRef.current = { theme, look, grain, layout, vinylClears }
  }, [theme, look, grain, layout, vinylClears])

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    const tracker = createPitchTracker(analyser, sampleRate)
    const motion = createMotion()
    const views = { candy: candy.createView(), gloom: gloom.createView() }
    let last = performance.now() / 1000
    let clears = optionsRef.current.vinylClears
    let raf

    function frame() {
      const now = performance.now() / 1000
      const dt = Math.min(now - last, 0.05) // don't jump after a stall
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
      THEMES[theme].drawStage(ctx, { video, look, layout, tracker, motion, view: views[theme], now, dt })
      if (grain) drawGrain(ctx, now, GRAIN_AMOUNT[theme])
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [canvasRef, video, analyser, sampleRate])

  return <canvas ref={canvasRef} width={candy.W} height={candy.H} className="stage" />
}

export default StageCanvas
