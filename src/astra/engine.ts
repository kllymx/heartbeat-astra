import type { DashboardSnapshot, TimelinePoint } from '../types.ts'

export type ChapterKind = 'focus' | 'load' | 'recovery' | 'collaboration'
export type SignalChapter = {
  id: string
  title: string
  kind: ChapterKind
  startTs: number
  endTs: number
  summary: string
  app: string
  avgHr: number | null
}
export type SignalFinding = {
  id: string
  title: string
  description: string
  tone: 'positive' | 'attention' | 'neutral'
  evidence: string[]
  startTs: number
  endTs: number
}
export type SignalAnalysis = {
  metrics: {
    focusMinutes: number
    activeMinutes: number
    switchCount: number
    averageHr: number | null
    averageHrv: number | null
    agentMinutes: number
    recoveryMinutes: number
  }
  chapters: SignalChapter[]
  findings: SignalFinding[]
  narrative: string
}
export type SignalAnswer = { answer: string; evidence: string[]; relatedChapterIds: string[] }

type Bucket = TimelinePoint & { seconds: number }
const FOCUS_SECONDS = 20 * 60
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const rounded = (value: number) => Math.round(value * 10) / 10
const minutes = (seconds: number) => rounded(seconds / 60)
const sumSeconds = (points: Bucket[]) => points.reduce((total, point) => total + point.seconds, 0)
const idle = (point: Bucket) => /^(idle|away|break|walking|locked|lock screen)$/i.test(point.appName.trim())
const active = (point: Bucket) => Boolean(point.appName.trim()) && !idle(point)
const communication = (point: Bucket) => /^(slack|messages|teams|microsoft teams|zoom|mail|outlook|discord)$/i.test(point.appName.trim())
const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const timeRange = (start: number, end: number) => `${clock(start)}–${clock(end)}`

// Sort a copy and clip overlap: a second can contribute to a metric only once.
// Missing intervals remain missing; they are never counted as breaks.
function buckets(snapshot: DashboardSnapshot): Bucket[] {
  const sorted = snapshot.timeline.filter(point => Number.isFinite(point.bucketStartTs) && Number.isFinite(point.bucketEndTs) && point.bucketEndTs > point.bucketStartTs).slice().sort((a, b) => a.bucketStartTs - b.bucketStartTs)
  const result: Bucket[] = []
  let lastEnd = -Infinity
  for (const point of sorted) {
    const start = Math.max(point.bucketStartTs, lastEnd)
    if (point.bucketEndTs <= start) continue
    result.push({ ...point, bucketStartTs: start, seconds: point.bucketEndTs - start })
    lastEnd = point.bucketEndTs
  }
  return result
}
function mean(points: Bucket[], key: 'bpm' | 'hrv'): number | null {
  let weighted = 0, seconds = 0
  for (const point of points) {
    const value = point[key]
    if (positive(value)) { weighted += value * point.seconds; seconds += point.seconds }
  }
  return seconds ? rounded(weighted / seconds) : null
}
function medianHr(points: Bucket[]): number | null {
  const valid = points.filter(point => positive(point.bpm)).slice().sort((a, b) => a.bpm - b.bpm)
  const halfway = sumSeconds(valid) / 2
  if (!halfway) return null
  let elapsed = 0
  for (const point of valid) { elapsed += point.seconds; if (elapsed >= halfway) return point.bpm }
  return null
}
function dominantApp(points: Bucket[]): string {
  const totals = new Map<string, number>()
  for (const point of points) if (point.appName.trim()) totals.set(point.appName, (totals.get(point.appName) ?? 0) + point.seconds)
  return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown workspace'
}
function switches(points: Bucket[]): number[] {
  const result: number[] = []
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1], point = points[index]
    if (previous.bucketEndTs === point.bucketStartTs && active(previous) && active(point) && previous.appName !== point.appName) result.push(point.bucketStartTs)
  }
  return result
}
function stableRuns(points: Bucket[], excluded: Set<Bucket>): Set<Bucket> {
  const stable = new Set<Bucket>()
  let run: Bucket[] = []
  function flush() {
    if (sumSeconds(run) >= FOCUS_SECONDS) for (const point of run) stable.add(point)
    run = []
  }
  for (const point of points) {
    const previous = run[run.length - 1]
    if (!active(point) || communication(point) || excluded.has(point)) { flush(); continue }
    if (previous && (previous.appName !== point.appName || previous.bucketEndTs !== point.bucketStartTs)) flush()
    run.push(point)
  }
  flush()
  return stable
}
function chapterFrom(points: Bucket[], kind: ChapterKind): SignalChapter {
  const first = points[0], last = points[points.length - 1]
  const app = dominantApp(points), duration = minutes(sumSeconds(points)), avgHr = mean(points, 'bpm')
  const agentMinutes = minutes(sumSeconds(points.filter(point => positive(point.agentActivity))))
  const contextCount = new Set(points.filter(active).map(point => point.appName)).size
  const title = kind === 'focus' ? `A clear stretch in ${app}` : kind === 'recovery' ? 'Space between the work' : kind === 'load' ? contextCount > 1 ? 'Several contexts, one busy stretch' : 'A change in your body signal' : agentMinutes ? 'Building alongside agents' : app === 'Unknown workspace' ? 'Workspace context unavailable' : communication(first) ? 'A window for conversation' : 'Exploring the next thread'
  const summary = kind === 'focus'
    ? `${duration} minutes in ${app} without an app change.${agentMinutes ? ` Agents were active for ${agentMinutes} of those minutes.` : ''} A sustained app is a focus proxy, not a measure of attention.`
    : kind === 'recovery'
      ? `${duration} minutes of recorded away or idle context. This is an opportunity to recover; telemetry cannot confirm how restorative it felt.`
      : kind === 'load'
        ? `${duration} minutes with ${contextCount > 1 ? `${contextCount} app contexts` : app}${avgHr === null ? '' : ` and an average heart rate of ${avgHr} bpm`}. This reflects frequent switching or an elevated signal relative to this day, not a diagnosis.`
        : `${duration} minutes ${app === 'Unknown workspace' ? 'without a named workspace context' : `centered on ${app}`}.${agentMinutes ? ` Agent activity overlapped ${agentMinutes} minutes.` : ''} ${communication(first) ? 'A communication app was open; message content is not analyzed.' : 'The record describes activity, not intent.'}`
  return { id: `chapter-${first.bucketStartTs}-${kind}`, title, kind, startTs: first.bucketStartTs, endTs: last.bucketEndTs, summary, app, avgHr }
}

export function analyzeDay(snapshot: DashboardSnapshot): SignalAnalysis {
  const points = buckets(snapshot)
  const metrics: SignalAnalysis['metrics'] = { focusMinutes: 0, activeMinutes: minutes(sumSeconds(points.filter(active))), switchCount: 0, averageHr: mean(points, 'bpm'), averageHrv: mean(points, 'hrv'), agentMinutes: minutes(sumSeconds(points.filter(point => positive(point.agentActivity)))), recoveryMinutes: minutes(sumSeconds(points.filter(idle))) }
  if (!points.length) return { metrics, chapters: [], findings: [], narrative: 'Your day is still taking shape. Add workspace or wearable signals to begin finding patterns.' }
  const switchTimes = switches(points), baseline = medianHr(points)
  metrics.switchCount = switchTimes.length
  const loadPoints = new Set<Bucket>()
  let switchStart = 0, switchEnd = 0
  for (const point of points) {
    while (switchEnd < switchTimes.length && switchTimes[switchEnd] <= point.bucketStartTs) switchEnd++
    while (switchStart < switchEnd && switchTimes[switchStart] <= point.bucketStartTs - 10 * 60) switchStart++
    const busy = switchEnd - switchStart >= 3
    const elevated = baseline !== null && positive(point.bpm) && point.bpm >= baseline + 12
    if (active(point) && (busy || elevated)) loadPoints.add(point)
  }
  const stable = stableRuns(points, loadPoints)
  const chapters: SignalChapter[] = []
  let group: Bucket[] = [], groupKind: ChapterKind = 'collaboration', focusSeconds = 0
  for (const point of points) {
    const kind: ChapterKind = idle(point) ? 'recovery' : loadPoints.has(point) ? 'load' : stable.has(point) ? 'focus' : 'collaboration'
    if (kind === 'focus') focusSeconds += point.seconds
    const previous = group[group.length - 1]
    if (previous && (kind !== groupKind || point.bucketStartTs !== previous.bucketEndTs || (kind === 'focus' && point.appName !== previous.appName))) {
      chapters.push(chapterFrom(group, groupKind)); group = []
    }
    groupKind = kind; group.push(point)
  }
  if (group.length) chapters.push(chapterFrom(group, groupKind))
  metrics.focusMinutes = minutes(focusSeconds)
  const first = points[0], last = points[points.length - 1]
  const findings: SignalFinding[] = []
  const focus = chapters.filter(chapter => chapter.kind === 'focus').sort((a, b) => (b.endTs - b.startTs) - (a.endTs - a.startTs))[0]
  if (focus) findings.push({ id: 'focus', title: 'Your longest sustained stretch', description: `${focus.app} held one continuous app context for ${minutes(focus.endTs - focus.startTs)} minutes. It is the clearest focus proxy in this record.`, tone: 'positive', evidence: [timeRange(focus.startTs, focus.endTs), 'Focus proxy: at least 20 minutes in the same non-communication app.', ...(focus.avgHr === null ? [] : [`Average heart rate in this stretch: ${focus.avgHr} bpm.`]), 'App continuity does not prove uninterrupted attention.'], startTs: focus.startTs, endTs: focus.endTs })
  const load = chapters.filter(chapter => chapter.kind === 'load').sort((a, b) => (b.endTs - b.startTs) - (a.endTs - a.startTs))[0]
  if (load) {
    const loadPoints = points.filter(point => point.bucketStartTs >= load.startTs && point.bucketEndTs <= load.endTs)
    findings.push({ id: 'load', title: 'A busier patch in the day', description: `${timeRange(load.startTs, load.endTs)} combined changing workspace context or heart rate above the day’s median. These signals co-occurred; neither establishes the cause of the other.`, tone: 'attention', evidence: [`${minutes(load.endTs - load.startTs)} minutes in this stretch.`, `${switches(loadPoints).length} observed app changes within the stretch.`, ...(load.avgHr === null ? [] : [`Average heart rate: ${load.avgHr} bpm; day median: ${baseline} bpm.`]), 'Load rule: 3 app changes in 10 minutes or heart rate at least 12 bpm above the day median.'], startTs: load.startTs, endTs: load.endTs })
  }
  const agentPoints = points.filter(point => positive(point.agentActivity))
  if (agentPoints.length) findings.push({ id: 'agents', title: 'A day with a second pair of hands', description: `Agent activity overlapped ${metrics.agentMinutes} minutes of the recorded day. That shows when agents were present, without claiming time saved or work quality.`, tone: 'neutral', evidence: [`${metrics.agentMinutes} minutes with positive agent activity; concurrent agents are counted once.`, `Agents observed: ${[...new Set(agentPoints.flatMap(point => point.agentNames.split(',').map(name => name.trim()).filter(Boolean)))].join(', ') || 'unnamed agent'}.`, ...(mean(agentPoints, 'bpm') === null ? [] : [`Average heart rate during agent activity: ${mean(agentPoints, 'bpm')} bpm.`]), 'Agent presence alone cannot measure productivity or causal benefit.'], startTs: agentPoints[0].bucketStartTs, endTs: agentPoints[agentPoints.length - 1].bucketEndTs })
  const recovery = chapters.filter(chapter => chapter.kind === 'recovery').sort((a, b) => (b.endTs - b.startTs) - (a.endTs - a.startTs))[0]
  if (recovery) findings.push({ id: 'recovery', title: 'Room to step away', description: `${metrics.recoveryMinutes} minutes were marked away or idle. The longest pause lasted ${minutes(recovery.endTs - recovery.startTs)} minutes.`, tone: 'positive', evidence: [timeRange(recovery.startTs, recovery.endTs), 'Only explicit idle or away app contexts count; missing data does not.', 'An idle interval is a recovery opportunity, not proof of physiological recovery.'], startTs: recovery.startTs, endTs: recovery.endTs })
  if (!findings.length) findings.push({ id: 'coverage', title: 'The first pieces of your day', description: 'There is activity to explore, but no sustained focus, explicit pause, agent session, or elevated-load pattern was detected yet.', tone: 'neutral', evidence: [`${minutes(sumSeconds(points))} minutes of valid timeline coverage.`, `${metrics.switchCount} observed app changes.`, 'More continuous history may reveal additional patterns.'], startTs: first.bucketStartTs, endTs: last.bucketEndTs })
  const narrative = focus
    ? `${metrics.focusMinutes} minutes of sustained app context, with your longest stretch in ${focus.app}. ${metrics.recoveryMinutes ? `${metrics.recoveryMinutes} minutes away gave the day some breathing room.` : 'No explicit away intervals were recorded.'} ${metrics.switchCount} app changes fill in the rhythm between.`
    : `${metrics.switchCount} app changes shaped this record, with no uninterrupted 20-minute focus proxy detected. ${metrics.recoveryMinutes ? `${metrics.recoveryMinutes} recorded minutes away offered room to pause.` : 'No explicit away intervals were recorded.'}`
  return { metrics, chapters, findings, narrative }
}

export function answerQuestion(question: string, analysis: SignalAnalysis, snapshot: DashboardSnapshot): SignalAnswer {
  const points = buckets(snapshot), query = question.trim().toLowerCase()
  if (!points.length) return { answer: 'There is no usable timeline yet. Once workspace or wearable signals arrive, I can describe focus stretches, app changes, pauses, and agent activity.', evidence: ['No valid timeline intervals are available.'], relatedChapterIds: [] }
  const respond = (finding: SignalFinding): SignalAnswer => ({ answer: finding.description, evidence: finding.evidence, relatedChapterIds: analysis.chapters.filter(chapter => chapter.startTs < finding.endTs && chapter.endTs > finding.startTs).map(chapter => chapter.id) })
  if (/diagnos|disease|heart attack|medical|anxiety|healthy|unhealthy/.test(query)) return { answer: 'These workspace and wearable signals cannot determine a medical condition or explain how you felt. I can describe the measured changes and what was open at the time.', evidence: ['Heart rate and HRV vary for many reasons; app co-occurrence does not identify a cause.'], relatedChapterIds: [] }
  if (!/hrv|variability/.test(query) && /spike|peak|highest|heart rate|\bhr\b|stress/.test(query)) {
    const valid = points.filter(point => positive(point.bpm))
    if (!valid.length) return { answer: 'There are no valid heart-rate samples in this record, so I cannot locate a spike or infer physiological load.', evidence: ['Missing, zero, and invalid heart-rate values are excluded.'], relatedChapterIds: [] }
    const peak = valid.reduce((highest, point) => point.bpm > highest.bpm ? point : highest)
    const baseline = medianHr(points)
    const chapter = analysis.chapters.find(item => item.startTs <= peak.bucketStartTs && item.endTs > peak.bucketStartTs)
    return { answer: `The highest recorded heart rate was ${rounded(peak.bpm)} bpm at ${clock(peak.bucketStartTs)}, ${peak.appName ? `while ${peak.appName} was the recorded app` : 'with no named app context'}.${positive(peak.agentActivity) ? ' Agent activity was also present.' : ''} This is the highest available sample, not proof of a stress event or its cause.`, evidence: [`Bucket: ${timeRange(peak.bucketStartTs, peak.bucketEndTs)}.`, `Day median: ${baseline} bpm; duration-weighted average: ${analysis.metrics.averageHr} bpm.`, ...(positive(peak.hrv) ? [`HRV in the same bucket: ${rounded(peak.hrv)} ms.`] : ['HRV is unavailable for this bucket.']), 'Caffeine, movement, emotion, and sensor variation cannot be separated by this record.'], relatedChapterIds: chapter ? [chapter.id] : [] }
  }
  if (/hrv|variability/.test(query)) return { answer: analysis.metrics.averageHrv === null ? 'There are no valid HRV measurements in this record.' : `The duration-weighted average HRV was ${analysis.metrics.averageHrv} ms across available measurements. This single day does not establish your personal baseline or recovery status.`, evidence: [`${minutes(sumSeconds(points.filter(point => positive(point.hrv))))} minutes have a valid HRV measurement.`, 'Missing HRV is excluded rather than treated as zero.'], relatedChapterIds: [] }
  const topic = /agent|\bai\b|codex|automat|saved/.test(query) ? 'agents' : /recover|break|pause|rest|away/.test(query) ? 'recovery' : /focus|flow|concentrat|productive/.test(query) ? 'focus' : /switch|interrupt|overload|busy/.test(query) ? 'load' : null
  if (topic) {
    const finding = analysis.findings.find(item => item.id === topic)
    if (finding) return respond(finding)
    const absent = { agents: 'No positive agent activity was recorded, so I cannot describe agent overlap or time saved.', recovery: 'No explicit away or idle intervals were recorded. Missing input or a gap alone does not establish a break.', focus: 'No continuous 20-minute stretch in a non-communication app met the focus proxy. That does not mean you were unfocused.', load: `${analysis.metrics.switchCount} app changes were observed. No interval met the local elevated-load rule.` }
    return { answer: absent[topic], evidence: [`${analysis.metrics.activeMinutes} minutes with a named active app.`, 'These are observational rules, not a measurement of intent or feeling.'], relatedChapterIds: [] }
  }
  return { answer: `${analysis.narrative} Local analysis can answer questions about focus, heart-rate peaks, HRV, app changes, pauses, and agent overlap. It cannot infer the contents of your work or why a pattern occurred.`, evidence: [`${analysis.metrics.activeMinutes} active minutes and ${analysis.metrics.switchCount} observed app changes.`, `${analysis.metrics.agentMinutes} minutes with agent activity.`, 'All averages use recorded interval duration and exclude missing measurements.'], relatedChapterIds: analysis.chapters.slice(0, 3).map(chapter => chapter.id) }
}
