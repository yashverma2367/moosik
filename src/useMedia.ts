import { useEffect, useRef, useState } from 'react'
import { PRESETS, type Chain, type PresetName } from './effects'

// mic → source ─┬→ analyser                    (dry, for pitch detection)
//               └→ bus → preset ─┬→ recordDest  (wet, goes into the video)
//                                └→ monitor → headphones

interface Graph {
  ctx: AudioContext
  stream: MediaStream
  bus: GainNode
  recordDest: MediaStreamAudioDestinationNode
  monitor: GainNode
  chain: Chain | null
}

export interface MediaNodes {
  video: HTMLVideoElement
  analyser: AnalyserNode
  sampleRate: number
  recordStream: MediaStream
}

export function useMedia() {
  const graphRef = useRef<Graph | null>(null)
  const [nodes, setNodes] = useState<MediaNodes | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      const g = graphRef.current
      if (!g) return
      g.stream.getTracks().forEach((t) => t.stop())
      void g.ctx.close()
    },
    [],
  )

  function setPreset(name: PresetName) {
    const g = graphRef.current
    if (!g) return
    g.bus.disconnect()
    g.chain?.output.disconnect()
    g.chain = PRESETS[name].build(g.ctx)
    g.bus.connect(g.chain.input)
    g.chain.output.connect(g.recordDest)
    g.chain.output.connect(g.monitor)
  }

  function setMonitor(on: boolean) {
    const g = graphRef.current
    if (!g) return
    g.monitor.gain.setTargetAtTime(on ? 1 : 0, g.ctx.currentTime, 0.02)
  }

  async function start(presetName: PresetName) {
    // created before any await so the browser counts it as started by the click
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', height: { ideal: 1080 } },
        // the browser's voice processing mangles singing
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

      graphRef.current = { ctx, stream, bus, recordDest, monitor, chain: null }
      setPreset(presetName)
      setNodes({ video, analyser, sampleRate: ctx.sampleRate, recordStream: recordDest.stream })
    } catch (e) {
      void ctx.close()
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setError('Camera/mic permission denied. Allow it in the browser and try again.')
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  return { nodes, error, start, setPreset, setMonitor }
}
