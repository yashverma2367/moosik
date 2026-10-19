import { useEffect, useRef, useState } from 'react'

// Mic level bar with a warning when she's too loud (clipping) or too soft.
// Reads levelRef every frame and moves the bar directly, so React doesn't re-render 60×/s.

const FLOOR_DB = -60 // left end of the bar
const LOUD_PEAK_DB = -1 // a sample this close to full scale means the mic is clipping
const SOFT_DB = -38 // average level below this while singing is too quiet
const LOUD_HOLD_SEC = 1.5 // keep the "too loud" warning up this long after a clip
const SOFT_AFTER_SEC = 0.8 // only warn "too soft" if it stays quiet this long

const MESSAGES = {
  idle: 'Sing to check your level',
  good: 'Good level',
  soft: 'Too soft — move closer to the mic',
  loud: 'Too loud — back off bitch',
}

const percent = (db) => Math.min(100, Math.max(0, ((db - FLOOR_DB) / -FLOOR_DB) * 100))

function LevelMeter({ levelRef }) {
  const fillRef = useRef(null)
  const peakRef = useRef(null)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    let raf
    let shown = 'idle'
    let smooth = FLOOR_DB
    let peakHold = FLOOR_DB
    let lastClip = -Infinity
    let quietSince = null
    let last = performance.now() / 1000

    function frame() {
      const now = performance.now() / 1000
      const dt = now - last
      last = now
      const level = levelRef.current
      if (level) {
        smooth += (level.rmsDb - smooth) * Math.min(1, dt * 12)
        peakHold = Math.max(level.peakDb, peakHold - dt * 20) // peak tick falls back slowly
        if (level.peakDb > LOUD_PEAK_DB) lastClip = now
        if (level.voiced && smooth < SOFT_DB) quietSince ??= now
        else quietSince = null

        let next = level.voiced ? 'good' : 'idle'
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
