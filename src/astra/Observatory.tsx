import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, AudioLines, Brain, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Command, FlaskConical, Focus, GitBranch, Heart, LayoutDashboard, LoaderCircle, Maximize2, Network, Pause, Play, Radio, RotateCcw, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { DashboardSnapshot } from '../types'
import { fetchDashboardSnapshot, isTauriRuntime } from './native'
import { buildDemoDay } from './demo'
import { analyzeDay, answerQuestion } from './engine'
import { askModel, getModelStatus } from './model'
import type { ModelStatus } from './model'
import MemoryConstellation from './MemoryConstellation'
import SignalOrb from './SignalOrb'
import ReplayChart from './ReplayChart'
import { clockTime } from './format'
import './observatory.css'

type View = 'overview' | 'replay' | 'memory' | 'lab'
type Scenario = 'balanced' | 'overloaded' | 'recovered'
type Answer = { question: string; answer: string; evidence: string[]; source: string; relatedChapterIds?: string[] }
const NAV = [{ id: 'overview' as const, label: 'Observatory', icon: LayoutDashboard }, { id: 'replay' as const, label: 'Day replay', icon: AudioLines }, { id: 'memory' as const, label: 'Memory map', icon: Network }, { id: 'lab' as const, label: 'Pattern lab', icon: FlaskConical }]
const SCENARIOS: { id: Scenario; label: string; description: string }[] = [{ id: 'balanced', label: 'A day in flow', description: 'Deep work, collaboration, and room to recover.' }, { id: 'overloaded', label: 'Context overload', description: 'More interruptions. See what changes in the signals.' }, { id: 'recovered', label: 'Room to recover', description: 'Longer focus blocks and intentional pauses.' }]
const QUESTIONS = ['When was I most focused?', 'What happened during the spike?', 'How did agents change my day?']
function duration(minutes: number) { const whole = Math.round(minutes); return whole >= 60 ? `${Math.floor(whole / 60)}h ${whole % 60}m` : `${whole}m` }
function emptySnapshot() { return { title: 'Waiting for local signals', bpmRangeLabel: '', headline: '', breakNotice: '', timeline: [], workouts: [], focusScore: 0, activities: { apps: [], breakdown: [], agents: [] }, insights: [], summary: { appCount: 0, keystrokesLabel: '0', mouseLabel: '0', musicLabel: '', hrvLabel: '', dictationLabel: '' } } as DashboardSnapshot }

export default function Observatory() {
  const [view, setView] = useState<View>('overview')
  const [scenario, setScenario] = useState<Scenario>('balanced')
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(() => isTauriRuntime() ? emptySnapshot() : buildDemoDay())
  const [sample, setSample] = useState(!isTauriRuntime())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null)
  const [connectedMode, setConnectedMode] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [exported, setExported] = useState(false)
  const [cinema, setCinema] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const aboutOpener = useRef<HTMLElement | null>(null)
  const analysis = useMemo(() => analyzeDay(snapshot), [snapshot])
  const point = snapshot.timeline[Math.min(selectedIndex, snapshot.timeline.length - 1)]
  const { metrics } = analysis
  const currentChapter = analysis.chapters.find(chapter => point && point.bucketStartTs >= chapter.startTs && point.bucketStartTs < chapter.endTs)
  const dayStamp = snapshot.timeline[0] ? new Date(snapshot.timeline[0].bucketStartTs * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'
  const appDurations = useMemo(() => {
    const totals = new Map<string, number>()
    for (const p of snapshot.timeline) { if (p.appName && p.appName !== 'Idle') totals.set(p.appName, (totals.get(p.appName) ?? 0) + Math.max(0, p.bucketEndTs - p.bucketStartTs) / 60) }
    return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [snapshot])

  useEffect(() => {
    let disposed = false
    getModelStatus().then(status => { if (!disposed) setModelStatus(status) }).catch(() => { if (!disposed) setModelStatus(null) })
    return () => { disposed = true; abortRef.current?.abort() }
  }, [])

  useEffect(() => {
    if (sample) return
    let disposed = false
    const refresh = () => fetchDashboardSnapshot('8H', '1M').then(data => { if (!disposed) { setSnapshot(data); setSourceError(null) } }).catch(() => { if (!disposed) setSourceError('Local signals could not refresh. The last available data is still shown.') })
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [sample])

  useEffect(() => {
    if (!playing || !snapshot.timeline.length) return
    const timer = window.setInterval(() => setSelectedIndex(index => {
      if (index >= snapshot.timeline.length - 1) return 0
      return index + 1
    }), 180)
    return () => window.clearInterval(timer)
  }, [playing, snapshot.timeline.length])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { setShowAbout(false); setCinema(false) }
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return
      if (event.code === 'Space') { event.preventDefault(); setPlaying(value => !value) }
      if (event.key === 'ArrowRight') setSelectedIndex(index => Math.max(0, Math.min(snapshot.timeline.length - 1, index + 1)))
      if (event.key === 'ArrowLeft') setSelectedIndex(index => Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snapshot.timeline.length])

  useEffect(() => {
    if (!showAbout) return
    const previousFocus = aboutOpener.current
    const dialog = document.querySelector<HTMLElement>('.astra-modal')
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]')]
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleTab)
    return () => { document.removeEventListener('keydown', handleTab); previousFocus?.focus() }
  }, [showAbout])

  function loadScenario(next: Scenario) {
    abortRef.current?.abort()
    setAsking(false); setError(null); setSourceError(null); setScenario(next); setSample(true); setSnapshot(buildDemoDay(next)); setSelectedIndex(0); setPlaying(false); setAnswer(null)
  }
  function jumpTo(timestamp: number) {
    const index = snapshot.timeline.findIndex(p => p.bucketEndTs > timestamp)
    setSelectedIndex(Math.max(0, index)); setView('replay'); setPlaying(false)
  }
  async function ask(question: string) {
    if (!question.trim() || asking) return
    setQuery(''); setError(null); setAsking(true)
    const controller = new AbortController(); abortRef.current = controller
    try {
      if (connectedMode && modelStatus?.available) {
        // Only aggregate measurements and already-derived observations leave the device.
        const context = { source: sample ? 'synthetic demonstration' : 'local telemetry aggregates', metrics: analysis.metrics, chapters: analysis.chapters.map(c => ({ id: c.id, kind: c.kind, startTs: c.startTs, endTs: c.endTs, avgHr: c.avgHr })), findings: analysis.findings.map(f => ({ id: f.id, tone: f.tone, evidence: f.evidence, startTs: f.startTs, endTs: f.endTs })) }
        const result = await askModel(question, context, controller.signal)
        if (!controller.signal.aborted) setAnswer({ question, answer: result.answer, evidence: result.evidence, relatedChapterIds: result.relatedChapterIds, source: `${result.model || modelStatus.model || 'Connected model'}` })
      } else {
        const result = answerQuestion(question, analysis, snapshot)
        if (!controller.signal.aborted) setAnswer({ question, answer: result.answer, evidence: result.evidence, relatedChapterIds: result.relatedChapterIds, source: 'Local signal analysis' })
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'The connected model could not answer. Try local analysis.')
    } finally { if (!controller.signal.aborted) setAsking(false) }
  }
  function exportDay() {
    const payload = { product: 'Heartbeat Observatory', source: sample ? 'Synthetic sample day' : 'Local aggregate telemetry', generatedAt: new Date().toISOString(), scenario: sample ? scenario : undefined, metrics: analysis.metrics, chapters: analysis.chapters.map(({ id, title, kind, startTs, endTs, avgHr }) => ({ id, title, kind, startTs, endTs, avgHr })), findings: analysis.findings, narrative: analysis.narrative, note: 'Observational patterns, not causal or medical conclusions. Raw screen captures are excluded.' }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `heartbeat-${sample ? scenario : 'day'}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExported(true); window.setTimeout(() => setExported(false), 2000)
  }

  const intelligence = <aside className="astra-intelligence">
    <div className="astra-card-heading"><span><Sparkles size={16}/> Intelligence</span><span className="astra-small-tag">{connectedMode && modelStatus?.available ? 'MODEL' : 'ON DEVICE'}</span></div>
    <div className="astra-intelligence__intro"><div className="astra-intelligence__glyph"><Brain size={23} strokeWidth={1.4}/></div><h3>A little more<br/>self-awareness.</h3><p>Connect the dots between how you work and how you feel.</p></div>
    <div className="astra-analysis-mode"><span className="astra-status-dot"/><span>{connectedMode && modelStatus?.available ? modelStatus.model : 'Local signal analysis'}</span><CircleHelp size={13} aria-label="Analysis uses measured patterns; it does not establish causes."/></div>
    {modelStatus?.available && <label className="astra-model-toggle"><input type="checkbox" checked={connectedMode} onChange={event => { abortRef.current?.abort(); setAsking(false); setError(null); setConnectedMode(event.target.checked); setAnswer(null) }}/><span>Use connected model · sends aggregate context</span></label>}
    <div className="astra-intelligence__body" aria-live="polite">
      {answer ? <div className="astra-answer"><span className="astra-eyebrow">{answer.source}</span><h4>{answer.question}</h4><p>{answer.answer}</p>{answer.evidence.length > 0 && <div className="astra-evidence"><span><GitBranch size={12}/> SUPPORTING SIGNALS</span>{answer.evidence.slice(0, 4).map((e, i) => <p key={i}>{e}</p>)}</div>}<div className="astra-answer-moments">{answer.relatedChapterIds?.slice(0, 3).map(id => { const chapter = analysis.chapters.find(c => c.id === id); return chapter ? <button key={id} onClick={() => jumpTo(chapter.startTs)}><span>{clockTime(chapter.startTs)} · {chapter.title}</span><ArrowUpRight size={12}/></button> : null })}</div><button className="astra-text-button" onClick={() => setAnswer(null)}>Back to observations <ArrowRight size={13}/></button></div> : <><div className="astra-observation"><span className="astra-eyebrow">TODAY’S READOUT</span><p>{analysis.narrative}</p></div><div className="astra-question-list">{QUESTIONS.map(question => <button key={question} onClick={() => ask(question)} disabled={asking}><span>{question}</span><ArrowUpRight size={14}/></button>)}</div></>}
      {asking && <div className="astra-working"><LoaderCircle size={14} className="astra-spin"/> Reading your signals…</div>}
      {error && <p className="astra-error" role="alert">{error}</p>}
    </div>
    <form className="astra-ask" onSubmit={event => { event.preventDefault(); void ask(query) }}><label className="astra-sr-only" htmlFor="astra-question">Ask about your day</label><input id="astra-question" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ask about your day…" maxLength={1000}/><button aria-label="Send question" disabled={!query.trim() || asking}><Send size={15}/></button></form>
    <div className="astra-intelligence__footer"><ShieldCheck size={12}/>{connectedMode ? 'Only aggregate context is shared' : 'Your signals stay on this device'}</div>
  </aside>

  return <div className={`astra-app ${cinema ? 'astra-app--cinema' : ''}`}>
    <aside className="astra-sidebar">
      <a className="astra-brand" href="?view=observatory" aria-label="Heartbeat home"><span className="astra-brand__mark"><Activity size={23}/></span><span>heartbeat<span className="astra-brand__edition">THE HUMAN OBSERVATORY</span></span></a>
      <div className="astra-workspace"><span className="astra-workspace__avatar">H</span><span>Your workspace<small>Personal observatory</small></span><ChevronDown size={13}/></div>
      <span className="astra-sidebar__label">WORKSPACE</span>
      <nav className="astra-nav" aria-label="Main navigation">{NAV.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} className={view === id ? 'is-active' : ''} onClick={() => { setView(id); setPlaying(false) }} aria-current={view === id ? 'page' : undefined}><Icon size={17} strokeWidth={1.5}/><span>{label}</span>{id === 'memory' && <span className="astra-nav__new">NEW</span>}</button>)}</nav>
      <div className="astra-sidebar__connections"><span className="astra-sidebar__label">SIGNAL SOURCES</span><div><span className="astra-source-icon"><Heart size={13}/></span>Body<span className={`astra-source-dot ${point?.bpm ? '' : 'is-muted'}`}/></div><div><span className="astra-source-icon"><Command size={13}/></span>Workspace<span className={`astra-source-dot ${snapshot.timeline.length ? '' : 'is-muted'}`}/></div><div><span className="astra-source-icon"><Sparkles size={13}/></span>AI agents<span className={`astra-source-dot ${metrics.agentMinutes > 0 ? '' : 'is-muted'}`}/></div><p>{sample ? 'Exploring a synthetic sample day' : 'Collected locally on this Mac'}</p></div>
      <div className="astra-sidebar__bottom"><div className="astra-build-badge"><span className="astra-build-badge__spark">✳</span><span>Built with Astra<small>OpenAI hackathon edition</small></span></div><button onClick={event => { aboutOpener.current = event.currentTarget; setShowAbout(true) }}><CircleHelp size={15}/> About this observatory <ArrowUpRight size={13}/></button><a href="https://github.com/kllymx/heartbeat-astra" target="_blank" rel="noreferrer"><GitBranch size={14}/> Open source <ArrowUpRight size={13}/></a></div>
    </aside>
    <main className="astra-main">
      <header className="astra-topbar"><div><span className="astra-breadcrumb">Workspace</span><ChevronRight size={12}/><span>{NAV.find(item => item.id === view)?.label}</span></div><div className="astra-topbar__right">{isTauriRuntime() && <a className="astra-text-button" href="?view=classic">Telemetry console <ArrowUpRight size={12}/></a>}<span className="astra-source-badge"><span/>{sample ? 'SAMPLE DAY' : 'LOCAL SIGNALS'}</span><button className="astra-icon-button" onClick={() => setCinema(value => !value)} aria-label={cinema ? 'Exit presentation mode' : 'Enter presentation mode'} title="Presentation mode"><Maximize2 size={15}/></button></div></header>
      <div className="astra-content">
        <div className="astra-page-heading"><div><div className="astra-eyebrow">{view === 'overview' ? 'THE BIGGER PICTURE' : view === 'replay' ? 'EVERY MOMENT HAS A STORY' : view === 'memory' ? 'FOLLOW THE CONNECTIONS' : 'MAKE SPACE FOR A BETTER DAY'}</div><h1>{view === 'overview' ? <>Your day, <span>connected.</span></> : view === 'replay' ? <>Find your <span>rhythm.</span></> : view === 'memory' ? <>A map of your <span>mind at work.</span></> : <>Different patterns.<br className="astra-mobile-break"/> <span>New possibilities.</span></>}</h1><p>{view === 'overview' ? 'The quiet patterns behind how you work, think, and recover.' : view === 'replay' ? 'Move through your day. Watch your body and workspace respond together.' : view === 'memory' ? 'Your apps, ideas, and agent sessions. One connected landscape.' : 'Compare synthetic days to understand what the signals can reveal.'}</p></div><div className="astra-heading-actions"><span className="astra-date">{dayStamp}</span><button className="astra-button" onClick={exportDay}>{exported ? <Check size={14}/> : <ArrowDownToLine size={14}/>} {exported ? 'Exported' : 'Export day'}</button></div></div>
        {sourceError && <div className="astra-error" role="status">{sourceError}</div>}
        <div className="astra-context-bar"><span><span className="astra-status-dot"/>{sample ? SCENARIOS.find(s => s.id === scenario)?.label : 'Your local signals'}<span className="astra-context-bar__separator">/</span><span className="astra-context-bar__sub">{sample ? 'Synthetic data · no wearable needed' : 'Last available eight hours'}</span></span><label className="astra-scenario-select"><span className="astra-sr-only">Choose a sample day</span><select value={sample ? scenario : 'native'} onChange={event => { if (event.target.value === 'native') { abortRef.current?.abort(); setAsking(false); setPlaying(false); setSample(false); setSnapshot(emptySnapshot()); setSelectedIndex(0); setAnswer(null); setError(null) } else loadScenario(event.target.value as Scenario) }}>{!sample && <option value="native">Local data</option>}{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}{sample && isTauriRuntime() && <option value="native">Local data</option>}</select><ChevronDown size={12}/></label></div>
        {view === 'memory' ? <MemoryConstellation snapshot={snapshot} onSelectTime={jumpTo}/> : view === 'lab' ? <div className="astra-lab"><div className="astra-lab__intro"><FlaskConical size={22}/><h2>Change the day. See the difference.</h2><p>These are three designed sample days, not predictions. All measurements below are calculated from each scenario’s timeline.</p></div><div className="astra-lab__grid">{SCENARIOS.map(s => {
          const data = buildDemoDay(s.id), result = analyzeDay(data)
          return <article className={`astra-lab-card ${scenario === s.id && sample ? 'is-selected' : ''}`} key={s.id}><span className="astra-eyebrow">SCENARIO {SCENARIOS.indexOf(s) + 1}</span><h3>{s.label}</h3><p>{s.description}</p><div className="astra-lab-card__bars">{[result.metrics.focusMinutes / 480, result.metrics.switchCount / 100, result.metrics.recoveryMinutes / 120].map((v, i) => <div key={i}><span>{['Focus time', 'Context switches', 'Recovery time'][i]}</span><div><i style={{ width: `${Math.max(3, Math.min(100, v * 100))}%` }}/></div><strong>{[duration(result.metrics.focusMinutes), result.metrics.switchCount, duration(result.metrics.recoveryMinutes)][i]}</strong></div>)}</div><p className="astra-lab-card__narrative">{result.narrative}</p><button className="astra-button" onClick={() => { loadScenario(s.id); setView('overview') }}>Explore this day <ArrowRight size={14}/></button></article>
        })}</div><div className="astra-lab__note"><ShieldCheck size={18}/><p><strong>A lens for reflection, not a diagnosis.</strong> A heart-rate change can have many explanations. Heartbeat shows co-occurring signals and makes the supporting evidence visible.</p></div></div> : <>
          <div className="astra-metrics">
            <Metric icon={<Focus size={16}/>} label="FOCUS TIME" value={duration(metrics.focusMinutes)} detail="Sustained app context" spark="focus"/>
            <Metric icon={<Heart size={16}/>} label="AVERAGE HEART RATE" value={metrics.averageHr === null ? '—' : `${Math.round(metrics.averageHr)}`} unit="bpm" detail="Across available samples" spark="heart"/>
            <Metric icon={<GitBranch size={16}/>} label="CONTEXT SWITCHES" value={`${metrics.switchCount}`} detail="Between active applications" spark="switches"/>
            <Metric icon={<Sparkles size={16}/>} label="WITH AI AGENTS" value={duration(metrics.agentMinutes)} detail="Human + agent collaboration" spark="agent"/>
          </div>
          <div className={`astra-observatory-grid ${view === 'replay' ? 'astra-observatory-grid--replay' : ''}`}>
            <div className="astra-observatory-left"><section className="astra-signal-card"><div className="astra-card-heading"><span><span className="astra-status-dot"/> Your rhythm</span><span className="astra-small-tag">{point ? clockTime(point.bucketStartTs) : 'NO SIGNAL'}</span></div><div className="astra-signal-card__body"><SignalOrb bpm={point?.bpm > 0 ? point.bpm : null} focus={snapshot.focusScore} active={Boolean(point)}/><div className="astra-signal-story"><span className={`astra-state-label astra-state-label--${currentChapter?.kind ?? 'focus'}`}><span/>{currentChapter?.kind === 'load' ? 'Elevated load' : currentChapter?.kind === 'recovery' ? 'Making space' : currentChapter?.kind === 'collaboration' ? 'Working together' : 'In your rhythm'}</span><h2>{currentChapter?.title || 'Your day is taking shape.'}</h2><p>{currentChapter?.summary || 'As your day unfolds, explore the connection between your physiology and what’s on your screen.'}</p><div className="astra-moment-context"><div><span className="astra-eyebrow">WORKSPACE</span><strong><Command size={13}/>{point?.appName || 'No activity'}</strong></div><div><span className="astra-eyebrow">HEART VARIABILITY</span><strong><Activity size={13}/>{point?.hrv && point.hrv > 0 ? `${Math.round(point.hrv)} ms` : '—'}</strong></div></div><button className="astra-text-button" onClick={() => { setView(view === 'replay' ? 'memory' : 'replay'); setPlaying(false) }}>{view === 'replay' ? 'Explore connected context' : 'Explore this moment'}<ArrowUpRight size={14}/></button></div></div><div className="astra-signal-footer"><span><ShieldCheck size={12}/>{sample ? 'SYNTHETIC SIGNAL PORTRAIT' : 'LOCAL SIGNAL PORTRAIT'}</span><span>BODY + CONTEXT + AGENTS</span></div></section>
            <section className="astra-timeline-card"><div className="astra-card-heading"><span>Day timeline <span className="astra-muted">/ {duration(metrics.activeMinutes)} active</span></span><div className="astra-timeline-legend"><span><i/>Heart rate</span><span><i/>Apps</span><span><i/>Agents</span></div></div><ReplayChart points={snapshot.timeline} selectedIndex={selectedIndex} onSelect={index => { setSelectedIndex(index); setPlaying(false) }} compact={view === 'overview'}/><div className="astra-replay-controls"><div><button className="astra-icon-button" aria-label="Previous moment" onClick={() => { setSelectedIndex(index => Math.max(0, index - 1)); setPlaying(false) }} disabled={!point}><ChevronLeft size={15}/></button><button className="astra-play-button" onClick={() => setPlaying(value => !value)} disabled={!point}>{playing ? <Pause size={12} fill="currentColor"/> : <Play size={12} fill="currentColor"/>}{playing ? 'Pause replay' : 'Replay day'}</button><button className="astra-icon-button" aria-label="Next moment" onClick={() => { setSelectedIndex(index => Math.max(0, Math.min(snapshot.timeline.length - 1, index + 1))); setPlaying(false) }} disabled={!point}><ChevronRight size={15}/></button></div><span>{point ? clockTime(point.bucketStartTs) : '--:--'}<span className="astra-muted"> / {snapshot.timeline.length ? clockTime(snapshot.timeline[snapshot.timeline.length - 1].bucketEndTs) : '--:--'}</span></span><button className="astra-icon-button" aria-label="Reset replay" onClick={() => { setSelectedIndex(0); setPlaying(false) }}><RotateCcw size={13}/></button></div></section>
            </div>{intelligence}
          </div>
          {view === 'replay' ? <section className="astra-chapters"><div className="astra-section-title"><h2>The chapters of your day</h2><span>{analysis.chapters.length} detected patterns</span></div><div className="astra-chapter-grid">{analysis.chapters.map((chapter, i) => <button key={chapter.id} className={`astra-chapter ${currentChapter?.id === chapter.id ? 'is-active' : ''}`} onClick={() => jumpTo(chapter.startTs)}><span className="astra-chapter__number">{String(i + 1).padStart(2, '0')}</span><span><small>{clockTime(chapter.startTs)} — {clockTime(chapter.endTs)}</small><strong>{chapter.title}</strong><p>{chapter.summary}</p></span><ArrowUpRight size={15}/></button>)}</div></section> : <div className="astra-bottom-grid"><section className="astra-findings"><div className="astra-section-title"><h2>Worth a closer look</h2><span>From your signals</span></div><div className="astra-finding-grid">{analysis.findings.slice(0, 3).map((finding, i) => <button className={`astra-finding astra-finding--${finding.tone}`} key={finding.id} onClick={() => { setAnswer({ question: finding.title, answer: finding.description, evidence: finding.evidence, source: 'Local signal analysis' }); if (finding.startTs) { const idx = snapshot.timeline.findIndex(p => p.bucketEndTs > finding.startTs); setSelectedIndex(Math.max(0, idx)); setPlaying(false) } }}><div><span className="astra-finding__icon">{i === 0 ? <Focus size={16}/> : i === 1 ? <Activity size={16}/> : <Sparkles size={16}/>}</span><ArrowUpRight size={14}/></div><h3>{finding.title}</h3><p>{finding.description}</p><span className="astra-finding__time">{clockTime(finding.startTs)} — {clockTime(finding.endTs)}</span></button>)}{!analysis.findings.length && <p className="astra-muted">More signal history is needed to find patterns.</p>}</div></section><section className="astra-apps"><div className="astra-section-title"><h2>Where your attention went</h2><Command size={15}/></div>{appDurations.map(([app, minutes], i) => <div className="astra-app-row" key={app}><span className={`astra-app-avatar astra-app-avatar--${i}`}>{app.substring(0, 1)}</span><span>{app}<i style={{ width: `${minutes / Math.max(1, appDurations[0][1]) * 100}%` }}/></span><strong>{duration(minutes)}</strong></div>)}</section></div>}
        </>}
        <footer className="astra-footer"><span><span className="astra-status-dot"/> A little context changes everything.</span><span>LOCAL FIRST<span>·</span> HUMAN ALWAYS <Heart size={11}/></span></footer>
      </div>
    </main>
    {showAbout && <div className="astra-modal-backdrop" onClick={() => setShowAbout(false)}><div className="astra-modal" role="dialog" aria-modal="true" aria-labelledby="astra-about-title" onClick={event => event.stopPropagation()}><button className="astra-icon-button astra-modal__close" aria-label="Close about" onClick={() => setShowAbout(false)} autoFocus><X size={18}/></button><span className="astra-brand__mark"><Activity size={25}/></span><h2 id="astra-about-title">Understand the human<br/>behind the work.</h2><p>Heartbeat connects body signals, workspace activity, and AI collaboration into an explorable day. Built with Astra for the OpenAI hackathon.</p><div><Radio size={17}/><p><strong>Honest by design.</strong> Browser mode uses synthetic sample days. Local analysis is deterministic. A connected model is used only when explicitly enabled.</p></div><div><ShieldCheck size={17}/><p><strong>Local first.</strong> Native data stays on your Mac. Connected intelligence receives aggregate context after you opt in. Exports exclude raw screen captures.</p></div><div><Play size={17}/><p><strong>Made to explore.</strong> Press Space to replay, arrow keys to move through time, and Escape to leave presentation mode.</p></div><a className="astra-button" href="https://github.com/kllymx/heartbeat-astra" target="_blank" rel="noreferrer">Explore the open-source project <ArrowUpRight size={14}/></a></div></div>}
  </div>
}

function Metric({ icon, label, value, unit, detail, spark }: { icon: React.ReactNode; label: string; value: string; unit?: string; detail: string; spark: string }) {
  return <article className={`astra-metric astra-metric--${spark}`}><div className="astra-metric__label">{icon}<span>{label}</span></div><div className="astra-metric__value">{value}{unit && <span>{unit}</span>}</div><span className="astra-metric__detail">{detail}</span><svg viewBox="0 0 90 30" aria-hidden="true"><path d={spark === 'focus' ? 'M0 28L8 24L15 26L22 18L30 21L38 13L46 16L54 10L62 14L70 8L80 10L90 4' : spark === 'heart' ? 'M0 19L10 19L17 17L22 22L29 8L34 27L40 18L52 18L62 16L68 22L76 7L80 23L90 17' : spark === 'switches' ? 'M0 24L8 24L8 10L16 10L16 24L25 24L25 15L32 15L32 24L44 24L44 5L52 5L52 24L64 24L64 17L71 17L71 24L84 24L84 11L90 11' : 'M0 26L10 26L10 21L22 21L22 23L35 23L35 16L46 16L46 19L57 19L57 11L70 11L70 13L80 13L80 5L90 5'} fill="none" stroke="currentColor" strokeWidth="1.4"/></svg></article>
}
