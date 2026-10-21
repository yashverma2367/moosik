import { useRef, useState } from 'react'

// Instagram wants mp4; fall back to webm where the browser can't do it.
const TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']

export interface Clip {
  url: string
  ext: 'mp4' | 'webm'
}

export function useRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const urlRef = useRef<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [clip, setClip] = useState<Clip | null>(null)

  function start(canvas: HTMLCanvasElement, audioStream: MediaStream) {
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioStream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      // only the canvas track; the audio track is reused for the next take
      stream.getVideoTracks().forEach((t) => t.stop())
      const type = recorder.mimeType || 'video/webm'
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = URL.createObjectURL(new Blob(chunks, { type }))
      setClip({ url: urlRef.current, ext: type.includes('mp4') ? 'mp4' : 'webm' })
    }

    recorder.start(1000)
    recorderRef.current = recorder
    setStartedAt(Date.now())
  }

  function stop() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setStartedAt(null)
  }

  return { recording: startedAt !== null, startedAt, clip, start, stop }
}
