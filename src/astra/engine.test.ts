import test from 'node:test'
import assert from 'node:assert/strict'
import type { DashboardSnapshot, TimelinePoint } from '../types.ts'
import { analyzeDay, answerQuestion } from './engine.ts'
import { buildDemoDay } from './demo.ts'

function point(start: number, end: number, overrides: Partial<TimelinePoint> = {}): TimelinePoint {
  return { timeLabel: '', bucketStartTs: start, bucketEndTs: end, bpm: 70, hrv: 50, keystrokes: 10, clickCount: 4, pointerDistance: 30, appIntensity: 20, agentActivity: 0, agentNames: '', appName: 'VS Code', appIconData: null, secondaryLabel: '', focusLabel: '', ...overrides }
}
function snapshot(timeline: TimelinePoint[]): DashboardSnapshot {
  return { title: 'Test day', bpmRangeLabel: '', headline: '', breakNotice: '', timeline, workouts: [], focusScore: 0, activities: { apps: [], agents: [], breakdown: [] }, insights: [], summary: { appCount: 0, keystrokesLabel: '', mouseLabel: '', musicLabel: '', hrvLabel: '', dictationLabel: '' } }
}

test('demo days are repeatable, contiguous, and span 09:00–17:00', () => {
  for (const scenario of ['balanced', 'overloaded', 'recovered'] as const) {
    const day = buildDemoDay(scenario)
    assert.deepEqual(day, buildDemoDay(scenario))
    assert.equal(day.timeline.length, 240)
    assert.equal(new Date(day.timeline[0].bucketStartTs * 1000).getHours(), 9)
    assert.equal(new Date(day.timeline.at(-1)!.bucketEndTs * 1000).getHours(), 17)
    assert.equal(day.timeline.at(-1)!.bucketEndTs - day.timeline[0].bucketStartTs, 8 * 60 * 60)
    for (let index = 1; index < day.timeline.length; index++) assert.equal(day.timeline[index].bucketStartTs, day.timeline[index - 1].bucketEndTs)
    assert.match(day.title, /synthetic/)
    assert.deepEqual([...new Set(day.timeline.map(item => item.appName))].sort(), ['Chrome', 'Codex', 'Figma', 'Idle', 'Slack', 'VS Code'])
    const analysis = analyzeDay(day)
    assert.equal(analysis.metrics.activeMinutes + analysis.metrics.recoveryMinutes, 480)
    assert.ok(analysis.chapters.every(chapter => chapter.endTs > chapter.startTs))
    assert.ok(analysis.chapters.filter(chapter => chapter.kind === 'focus').every(chapter => chapter.endTs - chapter.startTs >= 1200))
    for (const finding of analysis.findings) {
      assert.ok(finding.evidence.length > 0)
      assert.ok(finding.startTs >= day.timeline[0].bucketStartTs)
      assert.ok(finding.endTs <= day.timeline.at(-1)!.bucketEndTs)
    }
  }
})

test('scenario differences are computed from the timeline', () => {
  const balanced = analyzeDay(buildDemoDay('balanced')).metrics
  const overloaded = analyzeDay(buildDemoDay('overloaded')).metrics
  const recovered = analyzeDay(buildDemoDay('recovered')).metrics
  assert.ok(overloaded.switchCount > balanced.switchCount * 3)
  assert.ok(balanced.switchCount > recovered.switchCount)
  assert.ok(recovered.focusMinutes > balanced.focusMinutes)
  assert.ok(balanced.focusMinutes > overloaded.focusMinutes)
  assert.ok(recovered.recoveryMinutes > balanced.recoveryMinutes)
  assert.ok(balanced.recoveryMinutes > overloaded.recoveryMinutes)
  assert.ok(overloaded.averageHr! > balanced.averageHr!)
  assert.ok(recovered.averageHrv! > balanced.averageHrv!)
})

test('averages and agent overlap use interval duration, excluding invalid samples', () => {
  const day = snapshot([
    point(0, 60, { bpm: 60, hrv: 40, agentActivity: 2, agentNames: 'Codex, Claude Code' }),
    point(60, 240, { bpm: 80, hrv: 60 }),
    point(240, 300, { bpm: 0, hrv: null }),
    point(300, 360, { bpm: NaN, hrv: -1 }),
  ])
  const { metrics } = analyzeDay(day)
  assert.equal(metrics.averageHr, 75)
  assert.equal(metrics.averageHrv, 55)
  assert.equal(metrics.agentMinutes, 1)
  assert.equal(metrics.activeMinutes, 6)
  assert.equal(metrics.recoveryMinutes, 0)
})

test('empty timelines and all missing physiology never produce NaN or invented measurements', () => {
  const empty = snapshot([]), analysis = analyzeDay(empty)
  assert.equal(analysis.metrics.averageHr, null)
  assert.equal(analysis.metrics.averageHrv, null)
  assert.deepEqual(analysis.chapters, [])
  assert.deepEqual(analysis.findings, [])
  assert.match(answerQuestion('What happened during the spike?', analysis, empty).answer, /no usable timeline/)
  const missing = snapshot([point(0, 1200, { bpm: 0, hrv: null })]), result = analyzeDay(missing)
  assert.equal(result.metrics.averageHr, null)
  assert.equal(result.metrics.averageHrv, null)
  assert.equal(result.chapters[0].avgHr, null)
  assert.match(answerQuestion('Heart rate peak?', result, missing).answer, /no valid heart-rate/)
  assert.match(answerQuestion('What is my HRV?', result, missing).answer, /no valid HRV/)
})

test('focus requires a continuous 20-minute app context and does not bridge gaps', () => {
  const day = snapshot([point(0, 600), point(600, 1200), point(1800, 2400), point(2400, 3000, { appName: 'Slack' })])
  const result = analyzeDay(day)
  assert.equal(result.metrics.focusMinutes, 20)
  assert.equal(result.metrics.activeMinutes, 40)
  assert.equal(result.metrics.recoveryMinutes, 0)
  assert.equal(result.metrics.switchCount, 1)
  assert.equal(result.chapters[0].endTs, 1200)
  assert.equal(result.chapters[1].startTs, 1800)
})

test('input inactivity is not classified as a break; explicit idle is', () => {
  const day = snapshot([point(0, 1200, { keystrokes: 0, clickCount: 0, pointerDistance: 0 }), point(1200, 1800, { appName: 'Idle', keystrokes: 0 }), point(1800, 2400, { appName: '' }), point(2400, 3000, { appName: 'Chrome' })])
  const { metrics } = analyzeDay(day)
  assert.equal(metrics.activeMinutes, 30)
  assert.equal(metrics.recoveryMinutes, 10)
  assert.equal(metrics.switchCount, 0)
  assert.equal(metrics.focusMinutes, 20)
})

test('sorts safely, removes invalid intervals, and counts overlapping time only once', () => {
  const day = snapshot([point(600, 1800, { bpm: 80 }), point(0, 1200, { bpm: 60 }), point(3000, 2990), point(NaN, 2000), point(100, 200)])
  const originalOrder = [...day.timeline]
  const result = analyzeDay(day)
  assert.equal(result.metrics.activeMinutes, 30)
  assert.equal(result.metrics.averageHr, 66.7)
  assert.equal(result.metrics.focusMinutes, 20)
  assert.deepEqual(day.timeline, originalOrder)
  assert.equal(result.chapters[0].startTs, 0)
  assert.equal(result.chapters.at(-1)!.endTs, 1800)
})

test('local answers contain traceable evidence without claiming agents caused benefits', () => {
  const day = buildDemoDay(), analysis = analyzeDay(day)
  for (const question of ['When was I most focused?', 'What happened during the spike?', 'How did agents change my day?', 'When did I recover?', 'What does my HRV show?', 'Tell me about the day']) {
    const answer = answerQuestion(question, analysis, day)
    assert.ok(answer.answer.length > 30)
    assert.ok(answer.evidence.length)
    assert.ok(answer.relatedChapterIds.every(id => analysis.chapters.some(chapter => chapter.id === id)))
  }
  assert.match(answerQuestion('How much time did agents save?', analysis, day).answer, /without claiming time saved/)
  assert.match(answerQuestion('Was this a heart attack?', analysis, day).answer, /cannot determine a medical condition/)
  assert.match(answerQuestion('What was my heart rate variability?', analysis, day).answer, /average HRV/)
})

test('highest-heart-rate answer points to the measured peak and admits its limits', () => {
  const day = snapshot([point(0, 1200, { bpm: 60 }), point(1200, 1260, { appName: 'Slack', bpm: 95, hrv: 25 }), point(1260, 1320, { bpm: 70 })])
  const result = analyzeDay(day), answer = answerQuestion('What happened during the spike?', result, day)
  assert.match(answer.answer, /95 bpm/)
  assert.match(answer.answer, /Slack/)
  assert.match(answer.answer, /not proof/)
  assert.equal(answer.relatedChapterIds.length, 1)
  assert.ok(answer.evidence.some(item => item.includes('25 ms')))
})
