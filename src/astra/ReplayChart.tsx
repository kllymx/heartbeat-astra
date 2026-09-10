import { useId } from 'react'
import type { TimelinePoint } from '../types'

import { clockTime } from './format'

export default function ReplayChart({ points, selectedIndex, onSelect, compact = false }: { points: TimelinePoint[]; selectedIndex: number; onSelect: (index: number) => void; compact?: boolean }) {
  const id = useId().replace(/:/g, '')
  if (!points.length) return <div className="astra-chart-empty">Your timeline will appear when signals are available.</div>
  const w = 1000, h = compact ? 122 : 178
  const valid = points.filter(p => Number.isFinite(p.bpm) && p.bpm > 0)
  const low = Math.floor(Math.min(55, ...valid.map(p => p.bpm)) / 10) * 10
  const high = Math.ceil(Math.max(100, ...valid.map(p => p.bpm)) / 10) * 10
  const start = points[0].bucketStartTs, end = points[points.length - 1].bucketEndTs
  const span = Math.max(1, end - start)
  const safeIndex = Math.max(0, Math.min(points.length - 1, selectedIndex))
  const center = (index: number) => (points[index].bucketStartTs + points[index].bucketEndTs) / 2
  const x = (index: number) => (center(index) - start) / span * w
  const nearest = (timestamp: number) => points.reduce((best, _, index) => Math.abs(center(index) - timestamp) < Math.abs(center(best) - timestamp) ? index : best, 0)
  const laneStyle = (point: TimelinePoint) => ({ left: `${(point.bucketStartTs - start) / span * 100}%`, width: `${Math.max(0, point.bucketEndTs - point.bucketStartTs) / span * 100}%` })
  const contiguous = points.every((point, index) => index === 0 || points[index - 1].bucketEndTs === point.bucketStartTs)
  const y = (bpm: number) => h - 18 - (bpm - low) / (high - low) * (h - 36)
  const line = points.map((point, index) => {
    if (!Number.isFinite(point.bpm) || point.bpm <= 0) return ''
    const previous = points[index - 1]
    const cmd = previous && Number.isFinite(previous.bpm) && previous.bpm > 0 && previous.bucketEndTs === point.bucketStartTs ? 'L' : 'M'
    return `${cmd}${x(index).toFixed(1)},${y(point.bpm).toFixed(1)}`
  }).join(' ')
  const point = points[safeIndex]
  const apps = [...new Set(points.map(p => p.appName))]
  const colors = ['#73bcb1', '#809ba8', '#c6ac81', '#a693b6', '#d48474', '#739c88', '#7e9bbd']
  return <div className="astra-chart">
    <div className="astra-chart__graph" onPointerDown={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      onSelect(nearest(start + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * span))
    }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label="Heart rate across your day. Use the time slider below to explore.">
        <defs><linearGradient id={`chart-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#65ceba" stopOpacity=".18"/><stop offset="1" stopColor="#65ceba" stopOpacity="0"/></linearGradient></defs>
        {[0, 1, 2, 3].map(row => <g key={row}><line x1="0" x2={w} y1={18 + row * (h - 36) / 3} y2={18 + row * (h - 36) / 3} stroke="#ffffff" strokeOpacity=".06" strokeDasharray="3 6"/><text x={w - 1} y={13 + row * (h - 36) / 3} textAnchor="end" fill="#71817f" fontSize="9">{Math.round(high - row * (high - low) / 3)}</text></g>)}
        {valid.length === points.length && contiguous && <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#chart-${id})`}/>}
        <path d={line} fill="none" stroke="#83ccbb" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
        <line x1={x(safeIndex)} x2={x(safeIndex)} y1="0" y2={h} stroke="#e3e8df" strokeOpacity=".5" strokeDasharray="3 4"/>
        {point.bpm > 0 && <circle cx={x(safeIndex)} cy={y(point.bpm)} r="4" fill="#d9f5e7" stroke="#425e53" strokeWidth="4"/>}
      </svg>
    </div>
    <div className="astra-chart__lane" aria-label="Application activity">{points.map((p, i) => <div key={i} style={{ ...laneStyle(p), background: colors[apps.indexOf(p.appName) % colors.length], opacity: .65 }} title={`${clockTime(p.bucketStartTs)} · ${p.appName}`}/>)}</div>
    <div className="astra-chart__lane astra-chart__lane--agents" aria-label="Agent activity">{points.map((p, i) => <div key={i} style={{ ...laneStyle(p), background: p.agentActivity > 0 ? '#b5c7a6' : '#1b2326', opacity: p.agentActivity > 0 ? .6 : .4 }} title={`${clockTime(p.bucketStartTs)} · ${p.agentNames || 'No agent'}`}/>)}</div>
    <input className="astra-chart__slider" type="range" min={start} max={end} step="1" value={center(safeIndex)} onChange={event => onSelect(nearest(Number(event.target.value)))} aria-label="Explore time" onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); onSelect(Math.min(points.length - 1, safeIndex + 1)) } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); onSelect(Math.max(0, safeIndex - 1)) } }} aria-valuetext={`${clockTime(point.bucketStartTs)}, ${point.appName}, ${point.bpm > 0 ? `${point.bpm} BPM` : 'no heart rate'}`}/>
    <div className="astra-chart__axis">{Array.from({ length: 5 }, (_, i) => <span key={i}>{clockTime(start + span * i / 4)}</span>)}</div>
  </div>
}
