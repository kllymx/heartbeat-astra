import { useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { ArrowRight, ArrowUpRight, Clock3, Command, Heart, Layers3, Network, Search, Sparkles, X } from 'lucide-react'
import type { DashboardSnapshot, TimelinePoint } from '../types'
import './memory.css'

type Kind = 'app' | 'context' | 'agent'
type Filter = 'all' | Kind
type MemoryNode = {
  id: string
  label: string
  kind: Kind
  points: TimelinePoint[]
  seconds: number
  avgHr: number | null
  x: number
  y: number
  radius: number
}
type MemoryEdge = { source: string; target: string; seconds: number }
type MemoryGraph = { nodes: MemoryNode[]; edges: MemoryEdge[]; total: number; points: TimelinePoint[] }
type Props = { snapshot: DashboardSnapshot; onSelectTime?: (timestamp: number) => void }

const COLORS: Record<Kind, string> = { app: '#a8cfb6', context: '#8abac4', agent: '#c9bc96' }
const LABELS: Record<Kind, string> = { app: 'Application', context: 'Context', agent: 'Agent session' }
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'Everything' }, { id: 'app', label: 'Apps' }, { id: 'context', label: 'Contexts' }, { id: 'agent', label: 'Agents' }]
const CENTER = { x: 390, y: 305 }

function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

function clock(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function shortLabel(label: string, length = 25) {
  return label.length > length ? `${label.slice(0, length - 1).trim()}…` : label
}

function average(points: TimelinePoint[], value: (point: TimelinePoint) => number | null | undefined) {
  let sum = 0
  let weight = 0
  for (const point of points) {
    const reading = value(point)
    if (reading == null || !Number.isFinite(reading) || reading <= 0) continue
    const seconds = point.bucketEndTs - point.bucketStartTs
    sum += reading * seconds
    weight += seconds
  }
  return weight ? sum / weight : null
}

function buildGraph(timeline: TimelinePoint[]): MemoryGraph {
  const points = timeline.filter(point => Number.isFinite(point.bucketStartTs) && Number.isFinite(point.bucketEndTs) && point.bucketEndTs > point.bucketStartTs).slice().sort((a, b) => a.bucketStartTs - b.bucketStartTs)
  const nodes = new Map<string, MemoryNode>()
  const edges = new Map<string, MemoryEdge>()
  let session: { names: string; id: string; end: number } | null = null

  function addNode(id: string, label: string, kind: Kind, point: TimelinePoint) {
    let node = nodes.get(id)
    if (!node) {
      node = { id, label, kind, points: [], seconds: 0, avgHr: null, x: 0, y: 0, radius: 0 }
      nodes.set(id, node)
    }
    node.points.push(point)
    node.seconds += point.bucketEndTs - point.bucketStartTs
    return id
  }

  for (const point of points) {
    const ids: string[] = []
    const app = point.appName.trim()
    const context = (point.secondaryLabel.trim() || point.focusLabel.trim())
    if (app && !/^(idle|unknown|none|no activity)$/i.test(app)) ids.push(addNode(`app:${app.toLowerCase()}`, app, 'app', point))
    if (context && context.toLowerCase() !== app.toLowerCase() && !/^(idle|unknown|none|no activity|—|-)$/i.test(context)) ids.push(addNode(`context:${context.toLowerCase()}`, context, 'context', point))
    const names = [...new Set(point.agentNames.split(/[,;]+/).map(name => name.trim()).filter(Boolean))].sort().join(' + ')
    if (point.agentActivity > 0 && names) {
      if (!session || session.names !== names || point.bucketStartTs > session.end + 1) session = { names, id: `agent:${point.bucketStartTs}:${names}`, end: point.bucketEndTs }
      session.end = Math.max(session.end, point.bucketEndTs)
      ids.push(addNode(session.id, names, 'agent', point))
    } else session = null
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [source, target] = [ids[i], ids[j]].sort()
        const key = `${source}\u0000${target}`
        const edge = edges.get(key) ?? { source, target, seconds: 0 }
        edge.seconds += point.bucketEndTs - point.bucketStartTs
        edges.set(key, edge)
      }
    }
  }

  const allNodes = [...nodes.values()].sort((a, b) => b.seconds - a.seconds || a.id.localeCompare(b.id))
  const apps = allNodes.filter(node => node.kind === 'app').slice(0, 8)
  const contexts = allNodes.filter(node => node.kind === 'context').slice(0, 12)
  const agents = allNodes.filter(node => node.kind === 'agent').slice(0, 8)
  const visible = [...apps, ...contexts, ...agents]
  const visibleIds = new Set(visible.map(node => node.id))
  const connections = [...edges.values()].filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target))
  const maxSeconds = Math.max(1, ...visible.map(node => node.seconds))
  const anchors = new Map<string, { x: number; y: number }>()
  const appAngles = new Map<string, number>()

  apps.forEach((node, index) => appAngles.set(node.id, -Math.PI / 2 + index / Math.max(apps.length, 1) * Math.PI * 2 + 0.22))
  visible.forEach((node, index) => {
    const associatedApps = connections.filter(edge => edge.source === node.id || edge.target === node.id).map(edge => ({ id: edge.source === node.id ? edge.target : edge.source, seconds: edge.seconds })).filter(edge => appAngles.has(edge.id)).sort((a, b) => b.seconds - a.seconds)
    const baseAngle = appAngles.get(node.id) ?? (associatedApps[0] ? appAngles.get(associatedApps[0].id)! : index * 2.39996)
    const group = node.kind === 'context' ? contexts : agents
    const ordinal = group.indexOf(node)
    const angle = baseAngle + (node.kind === 'app' ? 0 : ((ordinal % 3) - 1) * 0.38 + 0.15)
    const orbit = node.kind === 'app' ? 150 + (index % 2) * 23 : node.kind === 'context' ? 230 + (ordinal % 2) * 25 : 84 + (ordinal % 3) * 14
    node.x = CENTER.x + Math.cos(angle) * orbit * 1.18
    node.y = CENTER.y + Math.sin(angle) * orbit
    node.radius = 5 + Math.sqrt(node.seconds / maxSeconds) * 12 + (node.kind === 'app' ? 2 : 0)
    node.avgHr = average(node.points, point => point.bpm)
    anchors.set(node.id, { x: node.x, y: node.y })
  })

  // Keep related nodes in their radial neighborhoods while giving labels room.
  for (let pass = 0; pass < 110; pass++) {
    for (const node of visible) {
      const anchor = anchors.get(node.id)!
      node.x += (anchor.x - node.x) * 0.025
      node.y += (anchor.y - node.y) * 0.025
    }
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i]
        const b = visible[j]
        const dx = b.x - a.x || 0.1
        const dy = b.y - a.y || 0.1
        const distance = Math.hypot(dx, dy)
        const minDistance = Math.abs(dy) < 48 ? 122 : a.radius + b.radius + 40
        if (distance < minDistance) {
          const force = (minDistance - distance) / distance * 0.28
          a.x -= dx * force
          a.y -= dy * force
          b.x += dx * force
          b.y += dy * force
        }
      }
    }
    for (const node of visible) {
      node.x = Math.max(85, Math.min(695, node.x))
      node.y = Math.max(64, Math.min(529, node.y))
    }
  }
  return { nodes: visible, edges: connections, total: allNodes.length, points }
}

function moments(points: TimelinePoint[]) {
  const result: { start: number; end: number; app: string; context: string }[] = []
  for (const point of points) {
    const previous = result.at(-1)
    if (previous && previous.app === point.appName && previous.context === point.secondaryLabel && point.bucketStartTs <= previous.end + 1) previous.end = Math.max(previous.end, point.bucketEndTs)
    else result.push({ start: point.bucketStartTs, end: point.bucketEndTs, app: point.appName, context: point.secondaryLabel })
  }
  return result
}

function HeartTrace({ points, id }: { points: TimelinePoint[]; id: string }) {
  const readings = points.filter(point => Number.isFinite(point.bpm) && point.bpm > 0)
  if (readings.length < 2) return <p className="memory-no-trace">More heart rate samples will reveal the shape of this time.</p>
  const min = Math.min(...readings.map(point => point.bpm)) - 3
  const max = Math.max(...readings.map(point => point.bpm)) + 3
  const start = readings[0].bucketStartTs
  const span = Math.max(1, readings.at(-1)!.bucketStartTs - start)
  const coordinate = (point: TimelinePoint) => `${((point.bucketStartTs - start) / span * 228 + 1).toFixed(2)},${(48 - (point.bpm - min) / (max - min) * 41).toFixed(2)}`
  const segments: TimelinePoint[][] = []
  for (const point of readings) {
    const previous = segments.at(-1)
    if (previous && point.bucketStartTs <= previous.at(-1)!.bucketEndTs + 1) previous.push(point)
    else segments.push([point])
  }
  return <svg className="memory-heart-trace" viewBox="0 0 230 58" role="img" aria-label={`Heart rate across the selected periods, from ${Math.round(min + 3)} to ${Math.round(max - 3)} beats per minute`}>
    <defs><linearGradient id={`${id}-trace`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#9dd7bd" stopOpacity=".14"/><stop offset="100%" stopColor="#9dd7bd" stopOpacity="0"/></linearGradient></defs>
    <line x1="0" y1="48" x2="230" y2="48" stroke="#26312e" strokeDasharray="2 4"/>
    {segments.map(segment => {
      const xy = segment.map(coordinate)
      const firstX = xy[0].split(',')[0]
      const lastX = xy.at(-1)!.split(',')[0]
      return <g key={segment[0].bucketStartTs}><path d={`M${xy.join(' L')} L${lastX},58 L${firstX},58 Z`} fill={`url(#${id}-trace)`}/><path d={`M${xy.join(' L')}`} fill="none" stroke="#9cc4b0" strokeWidth="1.3" strokeLinejoin="round"/>{segment.length === 1 && <circle cx={firstX} cy={xy[0].split(',')[1]} r="1.6" fill="#9cc4b0"/>}</g>
    })}
  </svg>
}

function KindIcon({ kind, size = 14 }: { kind: Kind; size?: number }) {
  return kind === 'app' ? <Command size={size}/> : kind === 'agent' ? <Sparkles size={size}/> : <Layers3 size={size}/>
}

export default function MemoryConstellation({ snapshot, onSelectTime }: Props) {
  const graph = useMemo(() => buildGraph(snapshot.timeline), [snapshot.timeline])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const instanceId = useId().replace(/:/g, '')
  const selected = graph.nodes.find(node => node.id === selectedId) ?? null
  const activeId = hoveredId ?? selected?.id
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const relatedIds = new Set(graph.edges.filter(edge => edge.source === activeId || edge.target === activeId).flatMap(edge => [edge.source, edge.target]))
  const search = query.trim().toLowerCase()
  const matches = graph.nodes.filter(node => (filter === 'all' || node.kind === filter) && (!search || node.label.toLowerCase().includes(search)))
  const matchingIds = new Set(matches.map(node => node.id))
  const isFiltering = !!search || filter !== 'all'
  const related = selected ? graph.edges.filter(edge => edge.source === selected.id || edge.target === selected.id).map(edge => ({ node: nodeById.get(edge.source === selected.id ? edge.target : edge.source)!, seconds: edge.seconds })).sort((a, b) => b.seconds - a.seconds) : []
  const selectedMoments = selected ? moments(selected.points) : []
  const baseline = useMemo(() => average(graph.points, point => point.bpm), [graph.points])
  const hrv = selected ? average(selected.points, point => point.hrv) : null
  const hrDifference = selected?.avgHr != null && baseline != null ? Math.round(selected.avgHr - baseline) : null
  const maxEdge = Math.max(1, ...graph.edges.map(edge => edge.seconds))
  const totalDuration = graph.points.reduce((sum, point) => sum + point.bucketEndTs - point.bucketStartTs, 0)

  function selectNode(id: string) { setSelectedId(id); setHoveredId(null) }
  function nodeKeyDown(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectNode(id) }
    if (event.key === 'Escape') { event.stopPropagation(); setSelectedId(null); setHoveredId(null) }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation()
      const index = graph.nodes.findIndex(node => node.id === id)
      const next = (index + (event.key === 'ArrowRight' ? 1 : graph.nodes.length - 1)) % graph.nodes.length
      const siblings = event.currentTarget.parentElement?.querySelectorAll<SVGGElement>('[data-memory-node]')
      siblings?.[next]?.focus()
    }
  }

  return <section className="memory-shell" aria-label="Memory constellation">
    <div className="memory-intro">
      <div><span className="memory-eyebrow">THE CONNECTIONS BETWEEN YOUR MOMENTS</span><h2>Follow a thread.</h2><p>Apps, contexts, and agents. A different way to find your way back.</p></div>
      <div className="memory-summary"><span><strong>{graph.nodes.filter(node => node.kind === 'context').length}</strong> contexts</span><i/><span><strong>{duration(totalDuration)}</strong> mapped</span></div>
    </div>
    <div className="memory-workspace">
      <div className="memory-canvas-panel">
        <div className="memory-toolbar">
          <div className="memory-filters" role="group" aria-label="Highlight a type of memory">{FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? 'memory-filter memory-filter--active' : 'memory-filter'} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
          <label className="memory-search"><Search size={13}/><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a connection…" aria-label="Search memory map"/>{query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus() }}><X size={12}/></button>}</label>
        </div>
        {!graph.nodes.length ? <div className="memory-empty"><Network size={38} strokeWidth={1}/><h3>Your connections begin here.</h3><p>As app activity, context, and agent sessions appear in your timeline, this map will bring them together.</p></div> : <div className="memory-canvas">
          <div className="memory-map-meta"><span className="memory-eyebrow">ATTENTION, IN ORBIT</span><span>{clock(graph.points[0].bucketStartTs)} — {clock(graph.points.at(-1)!.bucketEndTs)}</span></div>
          <svg className="memory-graph" viewBox="0 0 780 610" aria-label="Interactive map. Select a node to explore its recorded moments. Use Tab or arrow keys to move between nodes.">
            <defs>
              <radialGradient id={`${instanceId}-atmosphere`}><stop offset="0%" stopColor="#7eb99d" stopOpacity=".08"/><stop offset="65%" stopColor="#6c9e9a" stopOpacity=".025"/><stop offset="100%" stopColor="#6c9e9a" stopOpacity="0"/></radialGradient>
              <filter id={`${instanceId}-glow`} x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="6"/></filter>
            </defs>
            <g aria-hidden="true" className="memory-backdrop">
              <ellipse cx={CENTER.x} cy={CENTER.y} rx="345" ry="285" fill={`url(#${instanceId}-atmosphere)`}/>
              {[91, 173, 257].map((radius, index) => <ellipse key={radius} cx={CENTER.x} cy={CENTER.y} rx={radius * 1.14} ry={radius} fill="none" stroke="#7a9e8e" strokeOpacity={index === 2 ? '.085' : '.1'} strokeWidth=".65" strokeDasharray={index === 1 ? '2 7' : undefined} transform={`rotate(-12 ${CENTER.x} ${CENTER.y})`}/>)}
              <line x1="62" y1={CENTER.y} x2="718" y2={CENTER.y} stroke="#6a8a7d" strokeOpacity=".07" strokeDasharray="2 7"/>
              <line x1={CENTER.x} y1="42" x2={CENTER.x} y2="569" stroke="#6a8a7d" strokeOpacity=".07" strokeDasharray="2 7"/>
              {Array.from({ length: 66 }, (_, index) => <circle key={index} cx={44 + (index * 137.51) % 692} cy={45 + (index * 83.19) % 505} r={index % 7 === 0 ? 1.1 : .65} fill="#b3c9bf" opacity={index % 5 === 0 ? .28 : .11}/>)}
              <circle cx={CENTER.x} cy={CENTER.y} r="24" fill="#0d1415" fillOpacity=".65" stroke="#496b5c" strokeOpacity=".22"/>
              <path d={`M${CENTER.x - 9},${CENTER.y} h5 l3,-7 l4,14 l3,-7 h5`} fill="none" stroke="#8bab9c" strokeWidth="1" opacity=".55"/>
            </g>
            <g aria-hidden="true" className="memory-edges">{graph.edges.map(edge => {
              const source = nodeById.get(edge.source)!
              const target = nodeById.get(edge.target)!
              const connected = activeId && (edge.source === activeId || edge.target === activeId)
              const filtered = isFiltering && !matchingIds.has(edge.source) && !matchingIds.has(edge.target)
              const midX = (source.x + target.x) / 2
              const midY = (source.y + target.y) / 2
              const controlX = midX + (CENTER.x - midX) * .18
              const controlY = midY + (CENTER.y - midY) * .18
              return <path key={`${edge.source}:${edge.target}`} d={`M${source.x},${source.y} Q${controlX},${controlY} ${target.x},${target.y}`} fill="none" stroke={connected ? '#b1d9c6' : '#789b8d'} strokeWidth={connected ? 1.5 : .45 + edge.seconds / maxEdge * .85} strokeOpacity={filtered ? .025 : activeId ? connected ? .65 : .07 : .16 + edge.seconds / maxEdge * .14}/>
            })}</g>
            <g className="memory-nodes">{graph.nodes.map((node, index) => {
              const active = selected?.id === node.id
              const emphasized = activeId === node.id || relatedIds.has(node.id)
              const dimmed = (isFiltering && !matchingIds.has(node.id)) || (!!activeId && !emphasized && !active)
              const color = COLORS[node.kind]
              return <g key={node.id} data-memory-node={node.id} role="button" tabIndex={0} aria-label={`${node.label}, ${LABELS[node.kind]}, ${duration(node.seconds)}${node.avgHr ? `, average heart rate ${Math.round(node.avgHr)} beats per minute` : ''}`} aria-pressed={active} className={`memory-node${active ? ' memory-node--selected' : ''}${dimmed ? ' memory-node--dimmed' : ''}`} style={{ '--memory-node-color': color, '--memory-delay': `${index * 37}ms` } as CSSProperties} transform={`translate(${node.x} ${node.y})`} onClick={() => selectNode(node.id)} onKeyDown={event => nodeKeyDown(event, node.id)} onMouseEnter={() => setHoveredId(node.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(node.id)} onBlur={() => setHoveredId(null)}>
                <title>{node.label} · {LABELS[node.kind]} · {duration(node.seconds)}</title>
                <circle className="memory-node-hit" r={Math.max(23, node.radius + 9)} fill="transparent"/>
                <circle className="memory-node-halo" r={node.radius + 7} fill={color} opacity={active ? '.2' : '.075'} filter={`url(#${instanceId}-glow)`}/>
                <circle className="memory-node-ring" r={node.radius + 7} fill="none" stroke={color} strokeWidth=".7" strokeOpacity={active ? '.7' : '.15'} strokeDasharray={node.kind === 'agent' ? '2.3 3.5' : undefined}/>
                <circle r={node.radius} fill="#121e1c" stroke={color} strokeWidth={node.kind === 'app' ? '1' : '.7'} strokeOpacity=".75"/>
                <circle r={node.radius * .62} fill={color} opacity={node.kind === 'app' ? '.25' : '.16'}/>
                {node.kind === 'agent' ? <path d="M0,-4 L1.2,-1.2 L4,0 L1.2,1.2 L0,4 L-1.2,1.2 L-4,0 L-1.2,-1.2 Z" fill={color}/> : <circle r={node.kind === 'app' ? 2.4 : 1.7} fill={color}/>}
                <text className={`memory-node-label memory-node-label--${node.kind}`} y={node.radius + 23} textAnchor="middle">{shortLabel(node.label, node.kind === 'agent' ? 22 : 25)}</text>
                {node.kind === 'app' && <text className="memory-node-duration" y={node.radius + 37} textAnchor="middle">{duration(node.seconds)}</text>}
              </g>
            })}</g>
          </svg>
          {isFiltering && <div className="memory-search-status" role="status">{matches.length ? `${matches.length} ${matches.length === 1 ? 'connection' : 'connections'} highlighted` : 'No connections match this search.'}<button type="button" onClick={() => { setQuery(''); setFilter('all') }}>Reset<X size={10}/></button></div>}
          <div className="memory-map-caption"><span><span className="memory-caption-dot"/>Every connection has a moment behind it.</span><span>SELECT A NODE TO EXPLORE</span></div>
        </div>}
        <div className="memory-map-footer"><div className="memory-legend"><span><i style={{ background: COLORS.app }}/>Apps</span><span><i style={{ background: COLORS.context }}/>Contexts</span><span><i style={{ background: COLORS.agent }}/>Agents</span></div><span>{graph.total > graph.nodes.length ? `${graph.nodes.length} of ${graph.total} elements · ` : ''}Size reflects time spent</span></div>
      </div>
      <aside className="memory-inspector" aria-label="Selected memory details" aria-live="polite">
        {selected ? <>
          <div className="memory-inspector-top"><span className="memory-eyebrow">A CLOSER LOOK</span><button type="button" className="memory-close" onClick={() => setSelectedId(null)} aria-label="Close memory details"><X size={14}/></button></div>
          <div className="memory-selected-icon" style={{ color: COLORS[selected.kind] }}><KindIcon kind={selected.kind} size={23}/></div>
          <span className="memory-kind-label">{LABELS[selected.kind]}{selected.kind === 'agent' ? ` · ${clock(selected.points[0].bucketStartTs)}` : ''}</span>
          <h3>{selected.label}</h3>
          <p className="memory-selected-description">{selectedMoments.length === 1 ? 'One continuous moment' : `${selectedMoments.length} recorded moments`} across your day. Follow the connections to see what shared this time.</p>
          <div className="memory-detail-stats"><div><span><Clock3 size={11}/>TIME SPENT</span><strong>{duration(selected.seconds)}</strong></div><div><span><Heart size={11}/>AVG HEART RATE</span><strong>{selected.avgHr != null ? Math.round(selected.avgHr) : '—'}<small>{selected.avgHr != null ? 'bpm' : ''}</small></strong></div></div>
          <HeartTrace points={selected.points} id={instanceId}/>
          <div className="memory-physiology-note">{hrDifference == null ? 'Heart rate data is unavailable for these moments.' : hrDifference === 0 ? 'In line with your average for this timeline.' : `${Math.abs(hrDifference)} bpm ${hrDifference > 0 ? 'above' : 'below'} your average for this timeline.`}{hrv != null && <span>Average HRV · {Math.round(hrv)} ms</span>}</div>
          {related.length > 0 && <div className="memory-related"><h4>Connected by shared time <span>{related.length}</span></h4>{related.slice(0, 4).map(({ node, seconds }) => <button type="button" key={node.id} onClick={() => selectNode(node.id)}><span style={{ color: COLORS[node.kind] }}><KindIcon kind={node.kind} size={12}/></span><span>{node.label}<small>{LABELS[node.kind]}</small></span><em>{duration(seconds)}</em><ArrowUpRight size={12}/></button>)}</div>}
          <div className="memory-moments"><h4>Return to a moment <span>{selectedMoments.length}</span></h4>{selectedMoments.slice(0, 3).map(moment => <button key={moment.start} type="button" disabled={!onSelectTime} onClick={() => onSelectTime?.(moment.start)}><span className="memory-moment-marker"/><span><strong>{clock(moment.start)} <span>— {clock(moment.end)}</span></strong><small>{moment.app || moment.context || selected.label}</small></span><ArrowUpRight size={12}/></button>)}{selectedMoments.length > 3 && <p className="memory-more-moments">+ {selectedMoments.length - 3} more in the timeline</p>}</div>
          {onSelectTime && <button type="button" className="memory-open-moment" onClick={() => onSelectTime(selected.points[0].bucketStartTs)}>Open moment<ArrowRight size={14}/></button>}
        </> : <>
          <div className="memory-inspector-top"><span className="memory-eyebrow">YOUR DAY, CONNECTED</span><Network size={13}/></div>
          <div className="memory-discovery-mark" aria-hidden="true"><i/><i/><i/><i/><i/><span><Network size={26} strokeWidth={1}/></span></div>
          <h3>Some things make more sense together.</h3>
          <p className="memory-selected-description">Find the context behind an app, the work around an agent session, or the moments your body remembers.</p>
          <div className="memory-guide"><div><span>01</span><p><strong>Follow a connection</strong>Select a node to see what happened around it.</p></div><div><span>02</span><p><strong>Notice the overlap</strong>Lines connect activity recorded at the same time.</p></div><div><span>03</span><p><strong>Go back to the moment</strong>Open the timeline with its original context.</p></div></div>
          {graph.nodes.length > 0 && <div className="memory-start-here"><span className="memory-eyebrow">A PLACE TO START</span>{graph.nodes.filter(node => node.kind === 'app').slice(0, 2).map(node => <button key={node.id} type="button" onClick={() => selectNode(node.id)}><span className="memory-start-icon"><Command size={13}/></span><span>{node.label}<small>{duration(node.seconds)} in your timeline</small></span><ArrowUpRight size={13}/></button>)}</div>}
          <p className="memory-source-note">Built from the selected timeline. Connections show shared context, not cause.</p>
        </>}
      </aside>
    </div>
  </section>
}
