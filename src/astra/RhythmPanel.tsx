import { useMemo, useState } from 'react'
import type { CollectorStatus, DashboardSnapshot, TimelinePoint } from '../types'
import { analyzeDay, answerQuestion } from './engine'
import SignalOrb from './SignalOrb'
import './rhythm-panel.css'

function elapsed(minutes: number) {
  const m = Math.round(minutes)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
function positive(value: number | null | undefined) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null }

/** Uses the desktop's existing dashboard and collector; never loads a demo fixture. */
export default function RhythmPanel({ snapshot, collector, selectedPoint, nowTs, native, onSelectTime }: {
  snapshot: DashboardSnapshot
  collector: CollectorStatus
  selectedPoint: TimelinePoint | null
  nowTs: number
  native: boolean
  onSelectTime: (timestamp: number) => void
}) {
  const analysis = useMemo(() => analyzeDay(snapshot), [snapshot])
  const [question, setQuestion] = useState('')
  const [askedQuestion, setAskedQuestion] = useState('')
  const answer = useMemo(() => askedQuestion ? answerQuestion(askedQuestion, analysis, snapshot) : null, [askedQuestion, analysis, snapshot])
  const lastHr = collector.latestHeartRate
  const fresh = lastHr !== null && nowTs - lastHr.sampledAtTs >= 0 && nowTs - lastHr.sampledAtTs < 20
  const live = fresh && collector.bluetoothState.includes('streaming')
  const latest = snapshot.timeline.at(-1)
  const bpm = selectedPoint ? positive(selectedPoint.bpm) : native ? positive(lastHr?.bpm) : positive(latest?.bpm)
  const hrv = selectedPoint ? positive(selectedPoint.hrv) : positive(collector.latestHrvMs ?? (native ? null : latest?.hrv))
  const timestamp = selectedPoint?.bucketStartTs ?? (native ? lastHr?.sampledAtTs : latest?.bucketStartTs)
  const stamp = timestamp ? new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12:false }) : '—'
  const app = selectedPoint ? selectedPoint.appName || 'Workspace unavailable' : collector.latestSample?.appName || (native ? 'Waiting for workspace signal' : latest?.appName) || '—'
  const agentNames = selectedPoint?.agentNames || (!selectedPoint ? latest?.agentNames : '') || 'No agent in this moment'
  const device = lastHr?.deviceName.toLowerCase().includes('whoop') ? 'WHOOP BLE' : lastHr?.deviceName || 'BLE'
  const source = !native ? 'BROWSER SAMPLE' : selectedPoint ? 'RECORDED MOMENT' : live ? `${device} · LIVE` : lastHr ? `${device} · LAST SIGNAL` : 'WAITING FOR HEART RATE'
  const observation = analysis.findings.find(finding => finding.id === 'focus') ?? analysis.findings[0]

  return <section className="rhythm-panel" aria-label="Your rhythm">
    <div className="rhythm-panel__portrait"><SignalOrb bpm={bpm} focus={snapshot.focusScore} active={bpm !== null && (!native || selectedPoint !== null || live)}/></div>
    <div className="rhythm-panel__context">
      <div className="rhythm-panel__heading"><h3 className="section-title">YOUR RHYTHM</h3><span className={`rhythm-panel__source ${live && !selectedPoint ? 'is-live' : ''}`}>{source}</span><time>{stamp}</time></div>
      <div className="rhythm-panel__readout"><strong>{app}</strong><span>{selectedPoint ? 'HRV' : 'Latest HRV'} {hrv === null ? '—' : `${Math.round(hrv)} ms`}</span></div>
      <p className="rhythm-panel__agents">{agentNames}</p>
      <div className="rhythm-panel__metrics"><div><span>SUSTAINED CONTEXT</span><strong>{elapsed(analysis.metrics.focusMinutes)}</strong></div><div><span>APP SWITCHES</span><strong>{analysis.metrics.switchCount}</strong></div><div><span>WITH AGENTS</span><strong>{elapsed(analysis.metrics.agentMinutes)}</strong></div></div>
      <div className="rhythm-panel__observation">{observation ? <><span>{observation.title}</span><button type="button" onClick={() => onSelectTime(observation.startTs)}>Show on timeline →</button></> : <span>Patterns appear as local signal history builds.</span>}</div>
    </div>
    <div className="rhythm-panel__analysis">
      <div className="rhythm-panel__heading"><h3 className="section-title">SIGNAL ANALYSIS</h3><span>LOCAL</span></div>
      <p>{answer?.answer ?? analysis.narrative}</p>
      {answer && <div className="rhythm-panel__evidence">{answer.evidence.slice(0, 3).map((evidence, index) => <span key={index}>{evidence}</span>)}</div>}
      {!answer && <button className="rhythm-panel__question" type="button" onClick={() => setAskedQuestion('When was I most focused?')}>When was I most focused? →</button>}
      {answer && <button className="rhythm-panel__question" type="button" onClick={() => setAskedQuestion('')}>Clear answer</button>}
      <form onSubmit={event => { event.preventDefault(); if (question.trim()) { setAskedQuestion(question.trim()); setQuestion('') } }}><input aria-label="Ask about your signals" placeholder="Ask about your signals" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000}/><button type="submit" disabled={!question.trim()}>Ask</button></form>
    </div>
  </section>
}
