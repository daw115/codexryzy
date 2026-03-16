import axios from 'axios'
import { useEffect, useState } from 'react'

type Meeting = {
  id: number
  title: string
  meeting_date: string
  duration_seconds: number
  summary_md?: string
}

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function Dashboard() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState('')

  useEffect(() => {
    axios.get(`${apiUrl}/api/meetings`).then((res) => setMeetings(res.data))
  }, [])

  const ask = async () => {
    const res = await axios.post(`${apiUrl}/api/chat`, { question: q })
    setAnswer(res.data.answer)
  }

  return (
    <section className="bg-slate-900 rounded-2xl p-5 border border-slate-700">
      <h2 className="text-xl font-semibold mb-4">Dashboard + Ask Your Meetings</h2>
      <div className="space-y-2 max-h-56 overflow-auto mb-4">
        {meetings.map((m) => (
          <article key={m.id} className="rounded bg-slate-800 p-3 border border-slate-700">
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-slate-400">{m.meeting_date} • {m.duration_seconds}s</p>
          </article>
        ))}
      </div>

      <textarea
        placeholder="What decisions were made about transformer parameters?"
        className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 mb-2"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button onClick={ask} className="px-4 py-2 bg-indigo-600 rounded">Ask</button>
      <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{answer}</pre>
    </section>
  )
}
