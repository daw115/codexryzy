import Recorder from './components/Recorder'
import Dashboard from './components/Dashboard'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-3xl font-bold mb-2">AI Meeting Brain</h1>
      <p className="text-slate-300 mb-6">Private meeting recording, analysis, and searchable AI memory.</p>
      <div className="grid lg:grid-cols-2 gap-6">
        <Recorder />
        <Dashboard />
      </div>
    </div>
  )
}
