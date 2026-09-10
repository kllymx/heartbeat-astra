import { useId } from 'react'
import './signal-orb.css'

// The contour geometry is fixed; calculate it once rather than on every live tick.
const contours = Array.from({ length: 46 }, (_, ring) => {
    const points = Array.from({ length: 161 }, (_, step) => {
      const theta = step / 160 * Math.PI * 2
      const r = 68 + ring * 1.8
      const wave = Math.sin(theta * 3 + ring * 0.105) * 12 + Math.cos(theta * 5 - ring * 0.09) * 4
      const x = 200 + Math.cos(theta) * (r + wave)
      const y = 190 + Math.sin(theta) * (r + wave) * 0.91
      return `${step ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
    return points + ' Z'
})

export default function SignalOrb({ bpm, focus, active = true }: { bpm: number | null; focus: number; active?: boolean }) {
  const id = useId().replace(/:/g, '')
  const lines = contours.map((path, ring) => <path key={ring} d={path} fill="none" stroke={`url(#orb-${id})`} strokeWidth={ring % 8 === 0 ? 1.1 : 0.65} opacity={0.2 + Math.sin(ring / 46 * Math.PI) * 0.65}/>)
  return <div className={`astra-orb ${active ? 'astra-orb--active' : ''}`} aria-label={`Signal portrait: ${bpm === null ? 'heart rate unavailable' : `${Math.round(bpm)} beats per minute`}, focus ${focus}`}>
    <svg viewBox="0 0 400 380" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`orb-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#577c82"/><stop offset=".4" stopColor="#88e8d4"/><stop offset=".7" stopColor="#4caaab"/><stop offset="1" stopColor="#f9af85"/></linearGradient>
        <radialGradient id={`glow-${id}`}><stop stopColor="#4a9d8d" stopOpacity=".12"/><stop offset="1" stopColor="#4a9d8d" stopOpacity="0"/></radialGradient>
      </defs>
      <circle cx="200" cy="190" r="179" fill={`url(#glow-${id})`}/>
      <g className="astra-orb__mesh">{lines}</g>
      <circle cx="200" cy="190" r="173" fill="none" stroke="#98beb2" strokeOpacity=".09" strokeDasharray="2 7"/>
      <path d="M16 190h15M369 190h15M200 8v15M200 357v15" stroke="#88b4a8" strokeOpacity=".35"/>
      <circle cx="340" cy="88" r="3" fill="#b4ecda"/>
    </svg>
    <div className="astra-orb__value"><span className="astra-eyebrow">HEART RATE</span><strong>{bpm === null ? '—' : Math.round(bpm)}<span>BPM</span></strong><span className="astra-orb__caption">{active ? 'A portrait of your rhythm' : 'No signal available'}</span></div>
  </div>
}
