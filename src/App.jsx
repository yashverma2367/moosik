import { useEffect, useRef, useState } from 'react'
import { PRESETS } from './effects'
import LevelMeter from './LevelMeter'
import { VIDEO_FILTERS } from './videoFilters'
import StageCanvas from './StageCanvas'
import { useMedia } from './useMedia'
import { useRecorder } from './useRecorder'

const REEL_MAX_SEC = 90 // the progress bar fills up over this long
const COUNTDOWN_SEC = 5 // time to get in position after pressing Record

const PANELS = { voice: 'Voice', look: 'Look' }

// One row of pick-one buttons; the picked one fills with its colour in the bright theme.
function OptionGrid({ label, options, value, onChange, theme }) {
  const count = Object.keys(options).length
  return (
    <div className="presets" role="group" aria-label={label} style={{ '--cols': count > 6 ? 4 : 3 }}>
      {Object.entries(options).map(([key, o]) => (
        <button
          key={key}
          type="button"
          className="preset"
          aria-pressed={value === key}
          style={value === key && theme === 'candy' ? { background: o.color, color: '#fff' } : undefined}
          onClick={() => onChange(key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function loadTheme() {
  try {
    return localStorage.getItem('moosik-theme') === 'gloom' ? 'gloom' : 'candy'
  } catch {
    return 'candy'
  }
}

function LayoutToggle({ layout, onChange }) {
  const next = layout === 'vinyl' ? 'graph' : 'vinyl'
  return (
    <button type="button" className="theme-toggle" onClick={() => onChange(next)}>
      {next === 'vinyl' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 17l5-6 4 3 4-7 5 5" />
        </svg>
      )}
      {next === 'vinyl' ? 'Vinyl' : 'Graph'}
    </button>
  )
}

function ThemeToggle({ theme, onChange }) {
  const next = theme === 'gloom' ? 'candy' : 'gloom'
  return (
    <button type="button" className="theme-toggle" onClick={() => onChange(next)}>
      {next === 'gloom' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
      {next === 'gloom' ? 'Gloom mode' : 'Bright mode'}
    </button>
  )
}

// Lives in the HTML over the canvas, not on it, so it doesn't show up in the video.
function RecOverlay({ start }) {
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  const sec = (now - start) / 1000
  const s = Math.floor(sec)
  return (
    <>
      <div className="progress">
        <div style={{ width: `${Math.min(100, (sec / REEL_MAX_SEC) * 100)}%` }} />
      </div>
      <div className="rec-badge">
        <span className="rec-dot" />
        REC {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </div>
    </>
  )
}

function App() {
  const canvasRef = useRef(null)
  const levelRef = useRef(null)
  const media = useMedia()
  const recorder = useRecorder()
  const [preset, setPreset] = useState('studio')
  const [monitor, setMonitor] = useState(false)
  const [theme, setTheme] = useState(loadTheme)
  const [look, setLook] = useState('none')
  // grain remembered per theme: on by default for gloom, off for bright
  const [grainByTheme, setGrainByTheme] = useState({ candy: false, gloom: true })
  const grain = grainByTheme[theme]
  const [panel, setPanel] = useState('voice')
  const [layout, setLayout] = useState('graph')
  const [vinylClears, setVinylClears] = useState(0) // bumped by the Clear button
  const [countdown, setCountdown] = useState(null) // seconds left before recording starts
  const countdownTimer = useRef(null)

  useEffect(() => () => clearInterval(countdownTimer.current), [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('moosik-theme', theme)
    } catch {
      // private mode: theme just isn't remembered
    }
  }, [theme])

  function changePreset(name) {
    setPreset(name)
    media.setPreset(name)
  }

  function toggleMonitor(on) {
    setMonitor(on)
    media.setMonitor(on)
  }

  function toggleRecord() {
    if (recorder.recording) {
      recorder.stop()
      return
    }
    if (countdown != null) {
      // pressed again during the countdown: cancel
      clearInterval(countdownTimer.current)
      setCountdown(null)
      return
    }
    let left = COUNTDOWN_SEC
    setCountdown(left)
    countdownTimer.current = setInterval(() => {
      left -= 1
      if (left > 0) {
        setCountdown(left)
        return
      }
      clearInterval(countdownTimer.current)
      setCountdown(null)
      recorder.start(canvasRef.current, media.nodes.recordStream)
    }, 1000)
  }

  if (!media.nodes) {
    return (
      <main className="intro">
        <h1>moosik</h1>
        <div className="rainbow" />
        <p>Sing into your camera. Your voice becomes a ribbon of colour, ready to post as a Reel.</p>
        <button className="start" type="button" onClick={() => media.start(preset)}>
          Start camera &amp; mic
        </button>
        {media.error && <p className="error">{media.error}</p>}
        <ThemeToggle theme={theme} onChange={setTheme} />
      </main>
    )
  }

  const { video, analyser, sampleRate } = media.nodes
  return (
    <main className="app">
      <div className="frame">
        <StageCanvas canvasRef={canvasRef} levelRef={levelRef} video={video} analyser={analyser} sampleRate={sampleRate} theme={theme} look={look} grain={grain} layout={layout} vinylClears={vinylClears} />
        {recorder.recording && <RecOverlay start={recorder.startedAt} />}
        {countdown != null && (
          <div className="countdown" aria-live="assertive">
            <span key={countdown}>{countdown}</span>
          </div>
        )}
      </div>

      <div className="controls">
        <LevelMeter levelRef={levelRef} />
        <div className="tabs" role="tablist" aria-label="Filters">
          {Object.entries(PANELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={panel === key}
              onClick={() => setPanel(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {panel === 'voice' ? (
          <OptionGrid label="Voice filter" options={PRESETS} value={preset} onChange={changePreset} theme={theme} />
        ) : (
          <>
            <OptionGrid label="Video look" options={VIDEO_FILTERS} value={look} onChange={setLook} theme={theme} />
            <label className="monitor grain">
              <input
                type="checkbox"
                checked={grain}
                onChange={(e) => setGrainByTheme({ ...grainByTheme, [theme]: e.target.checked })}
              />
              Film grain
            </label>
          </>
        )}

        <div className="row">
          <label className="monitor">
            <input type="checkbox" checked={monitor} onChange={(e) => toggleMonitor(e.target.checked)} />
            <span>
              Hear myself
              <br />
              <small>wired headphones only</small>
            </span>
          </label>

          <button
            type="button"
            className={recorder.recording || countdown != null ? 'record on' : 'record'}
            aria-label={recorder.recording ? 'Stop recording' : countdown != null ? 'Cancel countdown' : 'Start recording'}
            onClick={toggleRecord}
          >
            <span className="record-dot" />
            <span>{recorder.recording ? 'Stop' : countdown != null ? 'Cancel' : 'Record'}</span>
          </button>
        </div>

        <div className="row">
          <div className="toggles">
            <ThemeToggle theme={theme} onChange={setTheme} />
            <LayoutToggle layout={layout} onChange={setLayout} />
            {layout === 'vinyl' && (
              <button type="button" className="theme-toggle" onClick={() => setVinylClears((n) => n + 1)}>
                Clear
              </button>
            )}
          </div>
          {recorder.clip && !recorder.recording && (
            <a className="download" href={recorder.clip.url} download={`moosik-take.${recorder.clip.ext}`}>
              Download take
            </a>
          )}
        </div>
      </div>
    </main>
  )
}

export default App
