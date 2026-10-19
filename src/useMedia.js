import { useEffect, useRef, useState } from 'react'
import { PRESETS } from './effects'

// Audio graph:
//   mic → source ─┬→ analyser                       (dry, for pitch detection)
//                 └→ bus → preset ─┬→ recordDest     (wet, goes into the video)
//                                  └→ monitor → speakers/headphones
export function useMedia() {
  const mediaRef = useRef(null)
  const [nodes, setNodes] = useState(null)
  const [error, setError] = useState(null)

  useEffect(
    () => () => {
      const m = mediaRef.current
      if (!m) return
      m.stream.getTracks().forEach((t) => t.stop())
      m.ctx.close()
    },
    [],
  )

  function setPreset(name) {
    const m = mediaRef.current
    if (!m) return
    m.bus.disconnect()
    m.chain?.output.disconnect()
    m.chain = PRESETS[name].build(m.ctx)
    m.bus.connect(m.chain.input)
    m.chain.output.connect(m.recordDest)
    m.chain.output.connect(m.monitor)
  }

  function setMonitor(on) {
    const m = mediaRef.current
    if (!m) return
    m.monitor.gain.setTargetAtTime(on ? 1 : 0, m.ctx.currentTime, 0.02)
  }

  async function start(presetName) {
    // created before any await so it counts as started by the click
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', height: { ideal: 1080 } },
        // browser voice processing mangles singing
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      await ctx.resume()

      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play()

      const source = ctx.createMediaStreamSource(stream)
      const analyser = new AnalyserNode(ctx, { fftSize: 2048 })
      const bus = new GainNode(ctx)
      const recordDest = ctx.createMediaStreamDestination()
      const monitor = new GainNode(ctx, { gain: 0 })
      source.connect(analyser)
      source.connect(bus)
      monitor.connect(ctx.destination)

      mediaRef.current = { ctx, stream, bus, recordDest, monitor, chain: null }
      setPreset(presetName)
      setNodes({ video, analyser, sampleRate: ctx.sampleRate, recordStream: recordDest.stream })
    } catch (e) {
      ctx.close()
      setError(
        e.name === 'NotAllowedError'
          ? 'Camera/mic permission denied. Allow it in the browser and try again.'
          : e.message,
      )
    }
  }

  return { nodes, error, start, setPreset, setMonitor }
}
