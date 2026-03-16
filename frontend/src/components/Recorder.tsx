import axios from 'axios'
import { useMemo, useRef, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function Recorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [title, setTitle] = useState('Weekly Sync')
  const timerRef = useRef<number | null>(null)

  const formatted = useMemo(() => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0')
    const s = String(elapsed % 60).padStart(2, '0')
    return `${m}:${s}`
  }, [elapsed])

  const start = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })

    const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' })
    chunksRef.current = []

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const file = new File([blob], 'meeting_recording.webm', { type: 'video/webm' })
      const form = new FormData()
      form.append('file', file)
      form.append('title', title)
      form.append('meeting_date', new Date().toISOString().slice(0, 10))
      form.append('duration_seconds', String(elapsed))
      await axios.post(`${apiUrl}/api/meetings/upload`, form)
    }

    mr.start(1000)
    mediaRecorderRef.current = mr
    setRecording(true)
    setElapsed(0)
    timerRef.current = window.setInterval(() => setElapsed((v) => v + 1), 1000)
  }

  const stop = () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    setRecording(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
  }

  return (
    <section className="bg-slate-900 rounded-2xl p-5 border border-slate-700">
      <h2 className="text-xl font-semibold mb-4">Browser Meeting Recorder</h2>
      <label className="block text-sm mb-2">Meeting Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full mb-4 rounded bg-slate-800 border border-slate-700 px-3 py-2"
      />
      <p className="mb-4 text-slate-300">Timer: <span className="font-mono">{formatted}</span></p>
      <div className="flex gap-3">
        <button onClick={start} disabled={recording} className="px-4 py-2 bg-emerald-600 rounded disabled:opacity-40">Start</button>
        <button onClick={stop} disabled={!recording} className="px-4 py-2 bg-rose-600 rounded disabled:opacity-40">Stop</button>
      </div>
      <p className="mt-4 text-xs text-slate-400">Select a screen/window in browser picker. System audio support depends on OS/browser policy.</p>
    </section>
  )
}
