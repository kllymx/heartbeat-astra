import type { ActivityRow, DashboardSnapshot, TimelinePoint } from '../types.ts'
import { analyzeDay } from './engine.ts'

type Scenario = 'balanced' | 'overloaded' | 'recovered'
type Segment = { until: number; app: string; context: string; hr: number; hrv: number; agents?: string; rotate?: number }
const PLANS: Record<Scenario, Segment[]> = {
  balanced: [
    { until: 24, app: 'Chrome', context: 'Reference desk · morning reading', hr: 72, hrv: 52 },
    { until: 114, app: 'Codex', context: 'Heartbeat · shaping the signal engine', hr: 69, hrv: 59, agents: 'Codex' },
    { until: 128, app: 'Idle', context: 'Away from the desk', hr: 64, hrv: 65 },
    { until: 144, app: 'Figma', context: 'Observatory · exploring a visual language', hr: 73, hrv: 53 },
    { until: 160, app: 'Chrome', context: 'Visual references · opening the next idea', hr: 74, hrv: 52 },
    { until: 194, app: 'Slack', context: 'Design conversation · the afternoon handoff', hr: 83, hrv: 38 },
    { until: 224, app: 'Idle', context: 'Lunch · space between the work', hr: 65, hrv: 63 },
    { until: 294, app: 'VS Code', context: 'Heartbeat · connecting body and workspace', hr: 71, hrv: 55 },
    { until: 310, app: 'Chrome', context: 'Browser preview · testing the day replay', hr: 77, hrv: 48 },
    { until: 350, app: 'Codex', context: 'Heartbeat · a second pair of hands', hr: 73, hrv: 53, agents: 'Codex, Claude Code' },
    { until: 364, app: 'Idle', context: 'Away from the desk', hr: 64, hrv: 66 },
    { until: 388, app: 'Figma', context: 'Memory map · bringing the connections to life', hr: 70, hrv: 58 },
    { until: 404, app: 'Chrome', context: 'Memory map · reviewing the browser preview', hr: 72, hrv: 54 },
    { until: 444, app: 'Codex', context: 'Heartbeat · putting the pieces together', hr: 72, hrv: 55, agents: 'Codex' },
    { until: 464, app: 'Slack', context: 'Team check-in · sharing the build', hr: 78, hrv: 46 },
    { until: 480, app: 'Chrome', context: 'The finished observatory · a final look', hr: 70, hrv: 57 },
  ],
  overloaded: [
    { until: 30, app: 'Chrome', context: 'Reference desk · planning the morning', hr: 77, hrv: 45 },
    { until: 126, app: 'Codex', context: 'Several open threads · code, messages, previews', hr: 86, hrv: 34, agents: 'Codex', rotate: 6 },
    { until: 136, app: 'Idle', context: 'A short pause', hr: 75, hrv: 44 },
    { until: 196, app: 'Figma', context: 'Design review · back and forth', hr: 89, hrv: 32, rotate: 4 },
    { until: 218, app: 'Slack', context: 'Release conversation · several moving pieces', hr: 96, hrv: 28 },
    { until: 234, app: 'Idle', context: 'Lunch away from the screen', hr: 76, hrv: 44 },
    { until: 354, app: 'Codex', context: 'Release debugging · messages, code, and agents', hr: 93, hrv: 30, agents: 'Codex, Claude Code', rotate: 2 },
    { until: 378, app: 'VS Code', context: 'Heartbeat · a small uninterrupted patch', hr: 86, hrv: 37 },
    { until: 390, app: 'Idle', context: 'A short pause', hr: 76, hrv: 43 },
    { until: 454, app: 'Codex', context: 'Open loops · reviewing and responding', hr: 90, hrv: 32, agents: 'Codex', rotate: 4 },
    { until: 480, app: 'Slack', context: 'End-of-day handoff · still in conversation', hr: 87, hrv: 35 },
  ],
  recovered: [
    { until: 20, app: 'Chrome', context: 'Reference desk · choosing one thing', hr: 69, hrv: 59 },
    { until: 120, app: 'Codex', context: 'Heartbeat · one idea, room to build', hr: 66, hrv: 66, agents: 'Codex' },
    { until: 144, app: 'Idle', context: 'A longer pause away from the desk', hr: 61, hrv: 74 },
    { until: 204, app: 'Figma', context: 'Observatory · a quiet design stretch', hr: 68, hrv: 62 },
    { until: 234, app: 'Slack', context: 'A dedicated window for conversation', hr: 75, hrv: 51 },
    { until: 288, app: 'Idle', context: 'Lunch · leaving room in the day', hr: 62, hrv: 72 },
    { until: 388, app: 'VS Code', context: 'Heartbeat · building the replay', hr: 67, hrv: 65, agents: 'Codex' },
    { until: 410, app: 'Idle', context: 'Away from the desk', hr: 61, hrv: 75 },
    { until: 470, app: 'Codex', context: 'Heartbeat · finishing one thread', hr: 66, hrv: 66, agents: 'Codex, Claude Code' },
    { until: 480, app: 'Chrome', context: 'The finished observatory · a final look', hr: 68, hrv: 62 },
  ],
}
const APPS = ['Codex', 'Slack', 'Chrome', 'VS Code', 'Figma']
const COLORS: Record<string, string> = { Codex: '#86c4ad', 'VS Code': '#7dabb8', Slack: '#b49abf', Figma: '#d3a779', Chrome: '#d08a78', Idle: '#84978d' }
const NAMES: Record<Scenario, string> = { balanced: 'A day in flow', overloaded: 'Context overload', recovered: 'Room to recover' }
const mins = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h ${Math.round(value % 60)}m` : `${Math.round(value)}m`
function average(points: TimelinePoint[], key: 'bpm' | 'hrv') {
  let sum = 0, seconds = 0
  for (const point of points) if (typeof point[key] === 'number' && Number.isFinite(point[key]) && point[key]! > 0) {
    const duration = point.bucketEndTs - point.bucketStartTs
    sum += point[key]! * duration; seconds += duration
  }
  return seconds ? Math.round(sum / seconds) : null
}
function activityRow(name: string, points: TimelinePoint[], kindLabel: string): ActivityRow {
  return { name, kindLabel, timeLabel: mins(points.reduce((total, point) => total + (point.bucketEndTs - point.bucketStartTs) / 60, 0)), avgHr: average(points, 'bpm'), delta: null, accent: COLORS[name] ?? '#86c4ad', iconData: null, tokensLabel: null }
}

/** A repeatable, explicitly synthetic eight-hour day, using two-minute buckets. */
export function buildDemoDay(scenario: Scenario = 'balanced'): DashboardSnapshot {
  const plan = PLANS[scenario]
  // A fixed local calendar date makes the demo repeatable and the axis 09:00–17:00.
  const startTs = new Date(2026, 8, 10, 9, 0, 0).getTime() / 1000
  let segmentIndex = 0, segmentStart = 0, smoothHr = plan[0].hr, smoothHrv = plan[0].hrv
  const timeline: TimelinePoint[] = Array.from({ length: 240 }, (_, index) => {
    const minute = index * 2
    while (minute >= plan[segmentIndex].until) { segmentStart = plan[segmentIndex].until; segmentIndex++ }
    const segment = plan[segmentIndex]
    const appName = segment.rotate ? APPS[Math.floor((minute - segmentStart) / segment.rotate) % APPS.length] : segment.app
    const away = appName === 'Idle'
    const agentNames = away ? '' : segment.agents ?? ''
    const wave = Math.sin(index * .63) * 1.7 + Math.sin(index * .19) * 1.1
    const peak = scenario === 'balanced' ? 15 * Math.exp(-(((minute - 177) / 8) ** 2)) : scenario === 'overloaded' ? 18 * Math.exp(-(((minute - 283) / 12) ** 2)) + 7 * Math.exp(-(((minute - 178) / 10) ** 2)) : 0
    smoothHr += (segment.hr + peak - smoothHr) * .62
    smoothHrv += (segment.hrv - peak * .45 - smoothHrv) * .62
    const bpm = Math.round(smoothHr + wave)
    const hrv = Math.round(smoothHrv - wave * 1.1 + Math.cos(index * .37) * 1.2)
    const bucketStartTs = startTs + minute * 60
    const intensity = away ? 0 : appName === 'Figma' ? 28 : appName === 'Slack' ? 20 : 32
    return {
      timeLabel: new Date(bucketStartTs * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      bucketStartTs, bucketEndTs: bucketStartTs + 120, bpm, hrv,
      keystrokes: away ? 0 : Math.round((appName === 'VS Code' ? 98 : appName === 'Codex' ? 64 : appName === 'Slack' ? 42 : 16) * (1 + Math.sin(index * .43) * .25)),
      clickCount: away ? 0 : Math.round((appName === 'Figma' ? 35 : appName === 'Chrome' ? 24 : 11) * (1 + Math.cos(index * .4) * .3)),
      pointerDistance: away ? 0 : Math.round((appName === 'Figma' ? 1900 : 760) * (1 + Math.sin(index * .29) * .35)),
      appIntensity: away ? 0 : Math.round(intensity + Math.sin(index * .47) * 5),
      agentActivity: agentNames ? agentNames.split(',').length : 0, agentNames, appName, appIconData: null,
      secondaryLabel: segment.context,
      focusLabel: away ? 'Recovery opportunity' : segment.rotate ? 'Changing context' : appName === 'Slack' ? 'Conversation window' : 'Sustained workspace',
    }
  })
  const snapshot: DashboardSnapshot = {
    title: `${NAMES[scenario]} · synthetic sample`, bpmRangeLabel: `${Math.min(...timeline.map(point => point.bpm))}–${Math.max(...timeline.map(point => point.bpm))} BPM`,
    headline: '', breakNotice: 'Designed sample data · body signals and workspace events are synthetic.', timeline, workouts: [], focusScore: 0,
    activities: {
      apps: [...new Set(timeline.map(point => point.appName))].filter(name => name !== 'Idle').map(name => activityRow(name, timeline.filter(point => point.appName === name), 'Foreground app')).sort((a, b) => timeline.filter(point => point.appName === b.name).length - timeline.filter(point => point.appName === a.name).length),
      breakdown: [],
      agents: ['Codex', 'Claude Code'].filter(name => timeline.some(point => point.agentNames.split(',').map(agent => agent.trim()).includes(name))).map(name => activityRow(name, timeline.filter(point => point.agentNames.split(',').map(agent => agent.trim()).includes(name)), 'Agent overlap')),
    },
    insights: [],
    summary: { appCount: APPS.length, keystrokesLabel: timeline.reduce((total, point) => total + point.keystrokes, 0).toLocaleString('en-US'), mouseLabel: `${timeline.reduce((total, point) => total + point.clickCount, 0).toLocaleString('en-US')} clicks`, musicLabel: 'Not recorded', hrvLabel: `${average(timeline, 'hrv')} ms`, dictationLabel: 'Not recorded' },
  }
  const analysis = analyzeDay(snapshot)
  snapshot.headline = analysis.narrative
  snapshot.focusScore = Math.round(analysis.metrics.focusMinutes / Math.max(1, analysis.metrics.activeMinutes) * 100)
  snapshot.insights = [
    { icon: 'focus', label: 'Sustained context', value: mins(analysis.metrics.focusMinutes), detail: 'App continuity is a focus proxy.', tone: 'flat' },
    { icon: 'activity', label: 'Context switches', value: String(analysis.metrics.switchCount), detail: 'Observed transitions between active apps.', tone: 'flat' },
    { icon: 'recovery', label: 'Away from the desk', value: mins(analysis.metrics.recoveryMinutes), detail: 'Explicit idle intervals in this designed day.', tone: 'flat' },
  ]
  snapshot.activities.breakdown = ['focus', 'load', 'recovery', 'collaboration'].map(kind => {
    const chapters = analysis.chapters.filter(chapter => chapter.kind === kind)
    return activityRow({ focus: 'Sustained focus', load: 'Elevated load', recovery: 'Recovery opportunities', collaboration: 'Collaboration & exploration' }[kind]!, timeline.filter(point => chapters.some(chapter => point.bucketStartTs >= chapter.startTs && point.bucketEndTs <= chapter.endTs)), 'Observed pattern')
  })
  return snapshot
}
