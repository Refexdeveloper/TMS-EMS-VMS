import React, { useEffect, useState } from 'react'
import { playKpiClick } from './kpiFx.js'

const TONE_TO_VARIANT = {
  brand: 'all',
  success: 'approved',
  warn: 'overdue',
  danger: 'rejected',
  amber: 'returned',
  teal: 'pending_approval',
}

const svg = (className, children, strokeWidth = 2) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const ICONS = {
  all: svg('tfx-ico-doc', (
    <>
      <path d="M7 8.2h8.6A1.6 1.6 0 0 1 17.2 9.8v10.7H8.6A1.6 1.6 0 0 1 7 18.9V8.2Z" />
      <path d="M9.4 5.8h9.2A1.5 1.5 0 0 1 20.1 7.3v1" />
      <path d="M5.2 10.8v8.6A1.7 1.7 0 0 0 6.9 21.1" />
      <path className="line" d="M9.4 12.8h5.2" />
      <path className="line l2" d="M9.4 16.2h3.6" />
    </>
  )),
  approved: svg('tfx-ico-check', (
    <>
      <path d="M14 3H7.4A2 2 0 0 0 5.4 5v14A2 2 0 0 0 7.4 21H16.2A2 2 0 0 0 18.2 19V8Z" />
      <path d="M14 3v5h5.2" />
      <circle cx="12" cy="14.3" r="3.7" />
      <path className="tick" d="m10.3 14.3 1.4 1.4 2.6-2.7" />
    </>
  )),
  overdue: svg('tfx-ico-alarm', (
    <>
      <rect x="3.4" y="5.4" width="17.2" height="15.2" rx="2.1" />
      <path d="M8 3.6v3.6M16 3.6v3.6M3.4 10h17.2" />
      <circle cx="14.4" cy="15.6" r="3.1" />
      <path d="M14.4 14.1V15.7l1.4.8" />
    </>
  )),
  rejected: svg('tfx-ico-x', (
    <>
      <path d="M14 3H7.4A2 2 0 0 0 5.4 5v14A2 2 0 0 0 7.4 21H16.2A2 2 0 0 0 18.2 19V8Z" />
      <path d="M14 3v5h5.2" />
      <path d="m9.1 12.4 5.8 5.8M14.9 12.4l-5.8 5.8" />
    </>
  )),
  draft: svg('tfx-ico-nda', (
    <>
      <path d="M14 3H7.4A2 2 0 0 0 5.4 5v14A2 2 0 0 0 7.4 21H16.2A2 2 0 0 0 18.2 19V8Z" />
      <path d="M14 3v5h5.2" />
      <rect x="9.1" y="13.1" width="5.8" height="4.6" rx="0.9" />
      <path d="M10.4 13.1v-1.7a1.6 1.6 0 0 1 3.2 0v1.7" />
    </>
  )),
  returned: svg('tfx-ico-msa', (
    <>
      <path d="M8 7.8h9.6A1.7 1.7 0 0 1 19.3 9.5v10.6H9.7A1.7 1.7 0 0 1 8 18.4V7.8Z" />
      <path d="M5.8 10.2v8.4A1.9 1.9 0 0 0 7.7 20.5" />
      <path d="M10.4 12h5.4M10.4 15h4.2" />
      <path d="M10.2 18.2c1-1 2.6-1 3.6 0" />
    </>
  )),
  pending_approval: svg('tfx-ico-sow', (
    <>
      <rect x="6" y="4.4" width="12" height="16.2" rx="2" />
      <path d="M9 4.4h6v2.6H9z" />
      <path className="line" d="M9 11.2h6" />
      <path className="line l2" d="M9 14.4h4.2" />
      <path className="tick" d="m8.8 17.4 1.3 1.2 2.5-2.6" />
    </>
  )),
  payments: svg('tfx-ico-vendor', (
    <>
      <circle cx="8" cy="7.1" r="2.4" />
      <circle cx="16" cy="7.1" r="2.4" />
      <path d="M4.2 18.8c.4-3.3 2.4-5.1 3.8-5.1s2.5.6 3.3 1.7c.8-1.1 1.9-1.7 3.3-1.7s3.4 1.8 3.8 5.1" />
      <path d="M9.4 14.1 12 16.2l2.6-2.1" />
    </>
  )),
  ready: svg('tfx-ico-spend', (
    <>
      <path d="M14 3H7.4A2 2 0 0 0 5.4 5v14A2 2 0 0 0 7.4 21H16.2A2 2 0 0 0 18.2 19V8Z" />
      <path d="M14 3v5h5.2" />
      <path d="M9 12.2h5.4M9 15.4h5.4M11.7 12.2v5.4" />
      <path d="M9 12.2c1.7-1.2 3.7-1.2 5.4 0" />
    </>
  )),
}

const CONTRACT_MARKS = [
  svg('', <><path d="M14 2.5H7A2.5 2.5 0 0 0 4.5 5v14A2.5 2.5 0 0 0 7 21.5h10a2.5 2.5 0 0 0 2.5-2.5V8z" /><path d="M14 2.5V8h5.5" /><path d="M8 13.5h5M8 17h3.5" /></>),
  svg('', <><path d="M14.6 9a3.3 3.3 0 1 0-4.7 4.7L7 16.6 9.1 18.7l2.9-2.9A3.3 3.3 0 0 0 14.6 9Z" /><path d="m13.2 10.4 1.6 1.6" /></>),
  svg('', <><circle cx="8.2" cy="10.2" r="2.4" /><path d="M8.2 12.6v6.6M8.2 16.2h2.2" /><path d="M13.2 8.6h6.6v8.8H13.2z" /><path d="M15 8.6V7.4h3v1.2" /></>),
  svg('', <><circle cx="8" cy="8.4" r="2" /><circle cx="16" cy="8.4" r="2" /><path d="M4.8 18.2c.3-2.6 1.9-4 3.2-4s2 .5 2.8 1.4c.8-.9 1.6-1.4 2.8-1.4s2.9 1.4 3.2 4" /></>),
  svg('', <><circle cx="12" cy="12" r="8" /><path d="m8.6 12.2 2.3 2.3 4.6-5" /></>),
]
const SPARKS = [
  'M0 34 C12 30,18 36,30 30 S48 26,56 28 S70 8,80 10 S92 4,100 2',
  'M0 36 C10 34,20 32,32 28 S50 30,60 24 S76 10,86 8 S96 6,100 4',
  'M0 32 C14 34,22 30,34 30 S52 34,62 24 S78 12,86 10 S96 4,100 3',
  'M0 34 C12 32,24 34,36 28 S54 30,64 22 S78 14,88 12 S96 6,100 5',
  'M0 36 C14 32,24 34,34 30 S52 24,62 26 S76 10,86 8 S96 4,100 2',
  'M0 34 C12 34,22 32,34 32 S52 30,60 26 S74 10,84 10 S94 6,100 4',
]

const DEFAULT_SUB = {
  all: (n) => (n ? 'All your contracts' : 'No contracts yet'),
  approved: (n) => (n ? 'Currently active' : 'None active yet'),
  overdue: (n) => (n ? 'Nearing expiry' : 'Nothing expiring'),
  rejected: (n) => (n ? 'Past end date' : 'None expired'),
  returned: (n) => (n ? 'Needs attention' : 'All complete'),
  draft: (n) => (n ? 'Missing documents' : 'All on file'),
  pending_approval: (n) => (n ? 'Awaiting documents' : 'All on file'),
  payments: (n) => (n ? 'Registered vendors' : 'No vendors yet'),
  ready: (n) => (n ? 'Ready to proceed' : 'Nothing ready'),
}

function useCountUp(target, duration = 900) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const safe = Number(target) || 0
    if (!safe) {
      setN(0)
      return undefined
    }
    let raf = 0
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      setN(Math.round(safe * (1 - (1 - t) ** 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return n
}

export default function P2pKpiCard({
  label,
  value,
  icon = 'ri-dashboard-line',
  tone = 'brand',
  variant: variantProp,
  index = 0,
  selected = false,
  onClick,
  extra = null,
  total = 0,
  subtitle,
  live = false,
  chart = 'marks',
  displayValue,
  percent,
  footText,
}) {
  const variant = variantProp || TONE_TO_VARIANT[tone] || 'all'
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''))
  const safeValue = Number.isFinite(numeric) ? numeric : 0
  const shown = useCountUp(displayValue ? 0 : safeValue)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), index * 90 + 850)
    return () => window.clearTimeout(t)
  }, [index])

  const pct =
    percent != null
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : total > 0
        ? Math.min(100, Math.round((safeValue / total) * 100))
        : 0

  const sub = subtitle ?? (DEFAULT_SUB[variant] ? DEFAULT_SUB[variant](safeValue) : '')

  const handleClick = (e) => {
    playKpiClick(variant, e.currentTarget)
    onClick?.()
  }

  const handleMove = (e) => {
    if (!window.matchMedia('(hover: hover)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
    el.classList.add('tilting')
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 10}deg) translateY(-6px)`
  }

  const handleLeave = (e) => {
    e.currentTarget.classList.remove('tilting')
    e.currentTarget.style.transform = ''
  }

  const spark = SPARKS[index % SPARKS.length]

  return (
    <div
      className={`tfx-kpi ${variant}${selected ? ' selected' : ''}${entered ? ' tfx-entered' : ''}`}
      style={{ '--i': index }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick(e)
        }
      }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <span className="tfx-kpi-shine" aria-hidden />
      <span className="tfx-kpi-spot" aria-hidden />
      <div className="tfx-kpi-head">
        <div className="tfx-kpi-icon">
          {ICONS[variant] || <i className={icon} aria-hidden />}
        </div>
        <div className="tfx-kpi-title">
          <h3>{label}</h3>
          <span>
            {live ? <i className="tfx-live-dot" /> : null}
            {sub}
          </span>
        </div>
        <span className="tfx-kpi-chip" title="Share of total">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M14 7l5 5-5 5" />
          </svg>
          {pct}%
        </span>
      </div>
      <div className="tfx-kpi-body">
        <div>
          <div className="tfx-kpi-num">{displayValue ?? shown}</div>
          <div className="tfx-kpi-foot">
            {footText ?? (
              <>
                <b>{pct}%</b> of {total} total
              </>
            )}
          </div>
        </div>
        {chart === 'spark' ? (
          <svg className="tfx-kpi-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={`spk-${variant}-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".32" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="area" d={`${spark} L100 40 L0 40 Z`} fill={`url(#spk-${variant}-${index})`} />
            <path className="line" d={spark} pathLength={1} />
            <circle className="dot" cx="100" cy="2" r="2.4" />
          </svg>
        ) : (
          <div className="tfx-kpi-marks" aria-hidden>
            {CONTRACT_MARKS.map((mark, n) => (
              <span key={n} style={{ '--n': n }}>{mark}</span>
            ))}
          </div>
        )}
      </div>
      <div className="tfx-kpi-extra">
        {extra || <span className="tfx-kpi-extra-spacer" aria-hidden />}
      </div>
      <div className="tfx-kpi-progress">
        <div className="track">
          <span className="fill" style={{ '--p': `${pct}%` }} />
        </div>
        <em>{pct}%</em>
      </div>
    </div>
  )
}

export function P2pHeaderFx() {
  return (
    <span className="p2p-header-bubbles" aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
