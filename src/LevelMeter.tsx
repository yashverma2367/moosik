import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MicLevel } from './stage'

const FLOOR_DB = -60
const LOUD_PEAK_DB = -1
const SOFT_DB = -38
const LOUD_HOLD_SEC = 1.5
const SOFT_AFTER_SEC = 0.8

const MESSAGES = {
  idle: 'Sing to check your level',
  good: 'Good level',
  soft: 'Too soft — move closer to the mic',
  loud: 'Too loud — back off bitch',
}

type Status = keyof typeof MESSAGES

const percent = (db: number) => Math.min(100, Math.max(0, ((db - FLOOR_DB) / -FLOOR_DB) * 100))

// Moves the bar directly each frame so React doesn't re-render 60×/s.
function LevelMeter({ levelRef }: { levelRef: RefObject<MicLevel | null> }) {
  const fillRef = useRef<HTMLDivElement>(null)
  const peakRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    let raf = 0
    let shown: Status = 'idle'
    let smooth = FLOOR_DB
    let peakHold = FLOOR_DB
    let lastClip = -Infinity
    let quietSince: number | null = null
    let last = performance.now() / 1000

    function frame() {
      const now = performance.now() / 1000
      const dt = now - last
      last = now
      const level = levelRef.current
      if (level && fillRef.current && peakRef.current) {
        smooth += (level.rmsDb - smooth) * Math.min(1, dt * 12)
        peakHold = Math.max(level.peakDb, peakHold - dt * 20)
        if (level.peakDb > LOUD_PEAK_DB) lastClip = now
        if (level.voiced && smooth < SOFT_DB) quietSince ??= now
        else quietSince = null

        let next: Status = level.voiced ? 'good' : 'idle'
        if (quietSince != null && now - quietSince > SOFT_AFTER_SEC) next = 'soft'
        if (now - lastClip < LOUD_HOLD_SEC) next = 'loud'
        if (next !== shown) {
          shown = next
          setStatus(next)
        }
        fillRef.current.style.width = `${percent(smooth)}%`
        peakRef.current.style.left = `${percent(peakHold)}%`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [levelRef])

  return (
    <div className={`level level-${status}`}>
      <div className="level-track">
        <div className="level-zone soft" style={{ width: `${percent(SOFT_DB)}%` }} />
        <div className="level-fill" ref={fillRef} />
        <div className="level-peak" ref={peakRef} />
      </div>
      <p className="level-text" aria-live="polite">
        {MESSAGES[status]}
      </p>
    </div>
  )
}

export default LevelMeter
