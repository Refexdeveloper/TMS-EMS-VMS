import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AOS from 'aos'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { kf as kfImport, KissflowSDKContext } from './sdk/index.js'
import { getApiBase } from './apiBase.js'
import {
  buildContractAdminApiPaths,
  buildTotalVendorsReportCountPath,
  buildVendorMasterApiPaths,
  resolveKfContractApplicationId,
  resolveKfContractProcessId,
} from './kfContractPaths.js'
import { resolveKfAccountId } from './kfLeadPaths.js'
import { formatStatusForDisplay, isDocAvailable, mapKfContractItem } from './kfContractItemMap.js'
import { useSlaDeadlineMeta, slaDeadlineTitle } from './slaMeta.js'
import SlaCell from './SlaCell.jsx'

export { mapKfContractItem } from './kfContractItemMap.js'
import { useMediaQuery } from './hooks/useMediaQuery.js'
import {
  vmsPageClass,
  vmsPageInnerClass,
  vmsSectionShellClass,
  vmsSectionHeaderClass,
  vmsSectionTitleClass,
  vmsSectionSubtitleClass,
  vmsSearchInputClass,
  vmsGhostBtnClass,
  vmsTableHeadClass,
  vmsTableHeadCellClass,
  vmsTableRowClass,
  vmsTableDivideClass,
  vmsExpandBtnClass,
  vmsMobileCardClass,
  vmsPaginationBarClass,
  vmsPaginationBtnClass,
  vmsVendorRowClass,
  vmsVendorMobileCardClass,
  vmsAccordionShellClass,
  vmsWorkflowStepClass,
  vmsHeaderShellClass,
  vmsAvatarClass,
  vmsRoleAccentClass,
  vmsBrandIconWrapClass,
  vmsBrandKpiAccent,
  vmsBrandProgressBarClass,
  vmsContractTypeIcon,
  vmsTypeChipClass,
  vmsColIconClass,
} from './vms/vmsTheme.js'
import P2pKpiCard, { P2pHeaderFx } from './vms/P2pKpiCard.jsx'

const EXPIRY_SOON_DAYS = 30

function VmsSection({ title, subtitle, icon, headerRight, accent = 'brand', className = '', bodyClassName = 'p-2.5 md:p-4', children, ...props }) {
  return (
    <section className={vmsSectionShellClass(className)} {...props}>
      {(title || subtitle || headerRight) && (
        <div className={`flex flex-col gap-2 md:flex-row md:items-center md:justify-between ${vmsSectionHeaderClass(accent)}`}>
          <div className="min-w-0">
            {title ? (
              <h2 className={`${vmsSectionTitleClass()} inline-flex items-center gap-2.5`}>
                {icon ? <span className={vmsBrandIconWrapClass()}><i className={`${icon} text-base`} /></span> : null}
                <span>{title}</span>
              </h2>
            ) : null}
            {subtitle ? <p className={vmsSectionSubtitleClass()}>{subtitle}</p> : null}
          </div>
          {headerRight ? <div className="w-full md:w-auto shrink-0">{headerRight}</div> : null}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

// —— UI constants (same visual language as polished VMS2.0) ——
const CONTRACT_TYPE_DATA_FALLBACK = [
  { name: 'AMC', value: 8, color: '#17a2b4' },
  { name: 'Rental', value: 5, color: '#0f6b7a' },
  { name: 'One-Time', value: 3, color: '#5cc3cf' },
  { name: 'MSA', value: 2, color: '#f59e0b' },
  { name: 'MSSA', value: 2, color: '#e11d48' },
]

const STATUS_CHART_COLORS = {
  Active: '#16a34a',
  Draft: '#5cc3cf',
  Rejected: '#ef4444',
  Expired: '#94a3b8',
}

function riskFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return 'Unknown'
  if (score >= 80) return 'Low'
  if (score >= 60) return 'Medium'
  return 'High'
}

function riskPillClass(risk) {
  if (risk === 'Low') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (risk === 'Medium') return 'bg-amber-100 text-amber-900 border-amber-200'
  if (risk === 'Unknown') return 'bg-slate-100 text-slate-700 border-slate-200'
  return 'bg-rose-100 text-rose-800 border-rose-200'
}

function trendArrowClass(trend) {
  if (trend === 'Improving') return 'text-emerald-600'
  if (trend === 'Declining') return 'text-rose-600'
  if (trend === 'No Data') return 'text-slate-400'
  return 'text-slate-500'
}

function modeString(arr) {
  const counts = {}
  let best = ''
  let bestN = 0
  for (const x of arr) {
    if (!x) continue
    const k = String(x)
    counts[k] = (counts[k] || 0) + 1
    if (counts[k] > bestN) {
      bestN = counts[k]
      best = k
    }
  }
  return best
}

function normalizeVendorKey(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function stringifyKfRole(abc) {
  if (!abc) return ''
  if (typeof abc === 'string') return abc.trim()
  if (Array.isArray(abc)) {
    for (const x of abc) {
      const s = stringifyKfRole(x)
      if (s) return s
    }
    return ''
  }
  if (typeof abc === 'object') {
    const n = abc.Name ?? abc.name ?? abc._name ?? abc.Title ?? abc.title ?? abc.Role ?? abc.role ?? ''
    return String(n || '').trim()
  }
  return ''
}

function sortValueForVendorRow(row, key) {
  if (key === 'score') {
    if (row.score != null && !Number.isNaN(Number(row.score))) return Number(row.score)
    return -1
  }
  if (key === 'contractCount') return Number(row.contractCount || 0)
  return String(row[key] || '').toLowerCase()
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysFromNow(days) {
  const t = startOfDay(new Date())
  t.setDate(t.getDate() + days)
  return t
}

function daysBetween(from, to) {
  const a = startOfDay(from).getTime()
  const b = startOfDay(to).getTime()
  return Math.floor((b - a) / (24 * 60 * 60 * 1000))
}

function statusBarBucket(statusLabel) {
  const s = String(statusLabel).toLowerCase().replace(/\s+/g, '')
  if (s.includes('active')) return 'Active'
  if (s.includes('reject')) return 'Rejected'
  if (s.includes('draft')) return 'Draft'
  if (s.includes('expir')) return 'Expired'
  if (s.includes('progress') || s.includes('complet')) return 'Active'
  return 'Draft'
}

function isWorkflowExpiredStatus(statusLabel) {
  return String(statusLabel).toLowerCase().includes('expir')
}

function isDateExpired(c) {
  if (!c.endDateObj) return false
  return startOfDay(c.endDateObj) < startOfDay(new Date())
}

function isExpiringSoon(c) {
  if (!c.endDateObj || isDateExpired(c)) return false
  const now = startOfDay(new Date())
  const limit = daysFromNow(EXPIRY_SOON_DAYS)
  const e = startOfDay(c.endDateObj)
  return e >= now && e <= limit
}

function getTimeGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function isActiveLike(c) {
  const b = statusBarBucket(c.businessStatus || c.status)
  if (b === 'Rejected' || b === 'Draft') return false
  if (isWorkflowExpiredStatus(c.businessStatus || c.status) || isDateExpired(c)) return false
  return b === 'Active'
}

/** Kissflow count APIs often return `{ Count: n }` (sometimes nested under `data`). */
function parseKfCountResponse(response) {
  const r = response?.data ?? response
  const raw = r?.Count ?? r?.count ?? r?.Total ?? r?.total
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const n = parseInt(String(raw ?? '').replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function buildVendorPerformanceRows(contracts, vendorMasterRows = []) {
  const byName = new Map()
  for (const c of contracts) {
    const name = (c.vendor && String(c.vendor).trim()) || 'Unknown'
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(c)
  }
  const rows = []
  const vendorMasterMap = new Map()
  vendorMasterRows.forEach((v) => {
    const key = normalizeVendorKey(v.name)
    if (key) vendorMasterMap.set(key, v)
  })

  for (const list of byName.values()) {
    const vendorName = (list[0].vendor && String(list[0].vendor).trim()) || 'Unknown'
    const avg = (key) => {
      const nums = list.map((x) => x[key]).filter((x) => x != null && typeof x === 'number' && !Number.isNaN(x))
      if (!nums.length) return null
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
    }
    const tat = avg('tatPct')
    const pm = avg('pmPct')
    const service = avg('servicePct')
    const response = avg('responsePct')
    const overall = avg('overallPct')
    const parts = [tat, pm, service, response].filter((x) => x != null && typeof x === 'number' && !Number.isNaN(x))
    let score = overall
    if (score == null && parts.length) {
      score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
    }

    const trends = list.map((x) => x.trendLabel).filter(Boolean)
    const trendVotes = { Improving: 0, Stable: 0, Declining: 0 }
    trends.forEach((t) => {
      if (t in trendVotes) trendVotes[t] += 1
    })
    let trend = 'No Data'
    if (trends.length) {
      trend = Object.entries(trendVotes).sort((a, b) => b[1] - a[1])[0][0]
    }

    const master = vendorMasterMap.get(normalizeVendorKey(vendorName)) || null
    const cats = list.map((x) => x.vendorCategory).filter(Boolean)
    const category =
      modeString(cats) ||
      master?.category ||
      master?.vendorCategory ||
      master?.vendorType ||
      master?.industry ||
      String(list[0]?.contractType || 'General')

    rows.push({
      key: vendorName,
      vendorName,
      contractCount: list.length,
      category,
      score,
      trend,
      risk: riskFromScore(score),
      tat,
      pm,
      service,
      response,
      vendorStatus: master?.status || '',
    })
  }
  return rows.sort((a, b) => {
    const as = a.score
    const bs = b.score
    if (as == null && bs == null) return 0
    if (as == null) return 1
    if (bs == null) return -1
    return bs - as
  })
}

function vendorAiInsight(v) {
  if (!v || v.score == null || Number.isNaN(Number(v.score))) return ''
  const name = v.vendorName
  if (v.score >= 90) return `${name} is a top performer. Consider preferential terms at next contract renewal.`
  if (v.score >= 75) return `${name} meets expectations. Monitor SLA adherence before renewal.`
  if (v.score >= 60) return `${name} shows gaps in turnaround or service. Schedule a performance review.`
  return `${name} is in the risk zone. Review contracts and consider remediation or replacement.`
}

function VendorScoreRing({ score }) {
  const has = score != null && !Number.isNaN(Number(score))
  const r = 17
  const c = 22
  if (!has) {
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" strokeDasharray="3 4" />
        <text x={c} y={c + 4} textAnchor="middle" className="fill-slate-400 font-medium" style={{ fontSize: 8 }}>
          —
        </text>
      </svg>
    )
  }
  const pct = Math.max(0, Math.min(100, Math.round(Number(score))))
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0" aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text x={c} y={c + 4} textAnchor="middle" className="fill-slate-800 font-semibold" style={{ fontSize: 11 }}>
        {pct}
      </text>
    </svg>
  )
}

function VendorPerfMetricCard({ label, value }) {
  const has = value != null && !Number.isNaN(Number(value))
  const pct = has ? Math.max(0, Math.min(100, Math.round(Number(value)))) : null
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-3 ${has ? '' : 'border-dashed'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold transition-colors duration-300 ${has ? 'text-slate-800' : 'text-slate-400'}`}>{has ? `${pct}%` : 'No Data'}</p>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-200/80 overflow-hidden">
        {has ? (
          <div className={`h-full rounded-full ${vmsBrandProgressBarClass()} transition-[width] duration-500 ease-out`} style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full rounded-full bg-slate-300/60 transition-[width] duration-500 ease-out" style={{ width: '0%' }} title="No data" />
        )}
      </div>
    </div>
  )
}

const VMS_KPI_SUMMARY = [
  {
    label: 'Total Contracts',
    key: 'total',
    icon: 'ri-file-copy-2-line',
    tone: 'brand',
    variant: 'all',
    accent: { borderClass: 'border border-[#bfe6ec]', iconBg: 'bg-[#e6f6f8]', iconColor: 'text-[#17a2b4]', valueClass: 'text-gray-900' },
  },
  {
    label: 'Active Contracts',
    key: 'active',
    icon: 'ri-file-check-line',
    tone: 'success',
    variant: 'approved',
    accent: { borderClass: 'border border-emerald-100', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', valueClass: 'text-gray-900' },
  },
  {
    label: 'Expiring Soon',
    key: 'expiring',
    icon: 'ri-calendar-schedule-line',
    segmented: true,
    tone: 'warn',
    variant: 'overdue',
    live: true,
    accent: vmsBrandKpiAccent(),
  },
  {
    label: 'Expired',
    key: 'expired',
    icon: 'ri-calendar-close-line',
    tone: 'danger',
    variant: 'rejected',
    accent: { borderClass: 'border border-rose-100', iconBg: 'bg-rose-50', iconColor: 'text-rose-600', valueClass: 'text-gray-900' },
  },
  {
    label: 'NDA Missing',
    key: 'ndaMiss',
    icon: 'ri-lock-2-line',
    tone: 'amber',
    variant: 'draft',
    accent: { borderClass: 'border border-amber-100', iconBg: 'bg-amber-50', iconColor: 'text-amber-600', valueClass: 'text-gray-900' },
  },
  {
    label: 'MSA Missing',
    key: 'msaMiss',
    icon: 'ri-stack-line',
    tone: 'warn',
    variant: 'returned',
    accent: { borderClass: 'border border-orange-100', iconBg: 'bg-orange-50', iconColor: 'text-orange-600', valueClass: 'text-gray-900' },
  },
  {
    label: 'SOW Missing',
    key: 'sowMiss',
    icon: 'ri-clipboard-line',
    tone: 'teal',
    variant: 'pending_approval',
    accent: { borderClass: 'border border-slate-200/80', iconBg: 'bg-[#e6f6f8]', iconColor: 'text-[#17a2b4]', valueClass: 'text-[#0F172A]' },
  },
  {
    label: 'Total Vendors',
    key: 'vendors',
    icon: 'ri-handshake-line',
    tone: 'brand',
    variant: 'payments',
    accent: vmsBrandKpiAccent(),
  },
]

const TYPE_FALLBACK_COLORS = ['#17a2b4', '#0f6b7a', '#0b5361', '#f59e0b', '#e11d48', '#0084AD', '#22C55E']

function StatCard({
  item,
  delay = 0,
  value,
  total = 0,
  expiringWindow = '90',
  onExpiringWindowChange,
  onClick,
  selected = false,
}) {
  return (
    <P2pKpiCard
      label={item.label}
      value={value}
      icon={item.icon}
      tone={item.tone || 'brand'}
      variant={item.variant}
      live={item.live}
      total={item.key === 'vendors' ? value : total}
      index={Math.round(delay / 40)}
      selected={selected}
      onClick={onClick}
      extra={item.segmented ? (
        <div className="tfx-kpi-windows">
          {['30', '60', '90'].map((w) => (
            <button
              key={w}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onExpiringWindowChange?.(w)
              }}
              className={expiringWindow === w ? 'is-on' : ''}
            >
              {w}d
            </button>
          ))}
        </div>
      ) : null}
    />
  )
}

function statusClass(s) {
  const t = String(s).toLowerCase()
  if (t.includes('active') || t.includes('progress')) return 'text-emerald-600'
  if (t.includes('draft')) return 'text-rose-500'
  if (t.includes('reject')) return 'text-red-500'
  return 'text-slate-500'
}

function statusPillClass(status) {
  const s = String(status || '').trim().toLowerCase().replace(/\s+/g, '')
  if (s.includes('completed') || s.includes('active')) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (s.includes('rejected')) return 'bg-red-100 text-red-700 border-red-200'
  if (s.includes('withdrawn')) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (s.includes('draft')) return 'bg-gray-100 text-gray-700 border-gray-200'
  if (s.includes('progress')) return 'bg-[#e6f6f8] text-[#0f6b7a] border-[#bfe6ec]'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function statusTrackerSteps(contract) {
  const status = String(contract?.status || '').toLowerCase()
  const hasExpiredDate = !!contract?.endDateObj && startOfDay(contract.endDateObj) < startOfDay(new Date())
  if (status.includes('rejected')) {
    return [
      { title: 'Drafted', status: 'Completed' },
      { title: 'Review', status: 'Completed' },
      { title: 'Rejected', status: 'Rejected' },
      { title: 'Closed', status: 'Not Started' },
    ]
  }
  if (status.includes('withdrawn')) {
    return [
      { title: 'Drafted', status: 'Completed' },
      { title: 'Review', status: 'Completed' },
      { title: 'Withdrawn', status: 'Withdrawn' },
      { title: 'Closed', status: 'Not Started' },
    ]
  }
  if (status.includes('draft')) {
    return [
      { title: 'Drafted', status: 'In Progress' },
      { title: 'Review', status: 'Not Started' },
      { title: 'Active', status: 'Not Started' },
      { title: 'Closure', status: 'Not Started' },
    ]
  }
  if (hasExpiredDate || status.includes('expired')) {
    return [
      { title: 'Drafted', status: 'Completed' },
      { title: 'Review', status: 'Completed' },
      { title: 'Active', status: 'Completed' },
      { title: 'Expired', status: 'Completed' },
    ]
  }
  return [
    { title: 'Drafted', status: 'Completed' },
    { title: 'Review', status: 'Completed' },
    { title: 'Active', status: 'In Progress' },
    { title: 'Closure', status: 'Not Started' },
  ]
}

function stepStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('completed')) return 'bg-emerald-600 text-white'
  if (s.includes('in progress')) return 'bg-[#17a2b4] text-white'
  if (s.includes('rejected')) return 'bg-red-600 text-white'
  if (s.includes('withdrawn')) return 'bg-orange-500 text-white'
  return 'bg-gray-500 text-white'
}

/** Readable label for workflow step status (mobile-friendly; avoids camelCase like NotStarted). */
function formatStepStatusLabel(raw) {
  const t = String(raw || '').trim()
  if (!t) return '—'
  const compact = t.toLowerCase().replace(/\s+/g, '')
  if (compact === 'notstarted') return 'Not started'
  if (compact === 'inprogress') return 'In progress'
  if (compact === 'skipped') return 'Skipped'
  if (compact === 'withdrawn') return 'Withdrawn'
  return t
}

function flattenProgressSteps(progress) {
  const apiSteps = Array.isArray(progress?.Steps) ? progress.Steps : []
  if (!apiSteps.length) return []
  const out = []
  apiSteps.forEach((s) => {
    const title = s?.Name || s?.Id || 'Step'
    const status = formatStatusForDisplay(s?._status || s?.Status || '')
    out.push({ title, status: status || 'In Progress' })
    const nestedProcesses = Array.isArray(s?.Process) ? s.Process : []
    nestedProcesses.forEach((p) => {
      const nestedSteps = Array.isArray(p?.Steps) ? p.Steps : []
      nestedSteps.forEach((n) => {
        const nTitle = n?.Name || n?.Id || p?.ProcessName || 'Step'
        const nStatus = formatStatusForDisplay(n?._status || n?.Status || '')
        out.push({ title: nTitle, status: nStatus || 'In Progress' })
      })
    })
  })
  return out
}

function ComplianceSummaryCustomTooltip({ active, payload }) {
  if (!(active && payload && payload.length)) return null
  const data = payload[0]
  const name = data.name ?? data.payload?.name ?? ''
  const value = data.value ?? data.payload?.value
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontSize: '12px',
      }}
    >
      <p style={{ fontWeight: 600 }}>{name}</p>
      <p style={{ marginTop: 4 }}>{value}%</p>
    </div>
  )
}

function makeComplianceActiveShape(hidden) {
  return function ComplianceActiveShape(props) {
    const {
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle,
      endAngle,
      fill,
      payload,
    } = props
    if (payload?.name && hidden[payload.name]) return null
    const or = Number(outerRadius) || 0
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={or + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={2}
        style={{ filter: 'drop-shadow(0 6px 14px rgba(37, 99, 235, 0.35))' }}
      />
    )
  }
}

function ExpiringContractsTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-sm shadow-lg shadow-slate-400/20 backdrop-blur-sm">
      <p className="font-semibold text-slate-800">{row.label}</p>
      <p className="mt-1 text-slate-600">
        <span className="text-lg font-bold text-[#0f6b7a]">{row.value}</span>
        <span className="text-slate-500"> contracts</span>
      </p>
    </div>
  )
}

function ContractSlaBadge({ rowKey, slaDeadline }) {
  const getSlaMeta = useSlaDeadlineMeta()
  const meta = getSlaMeta(rowKey, slaDeadline)
  return <SlaCell meta={meta} title={slaDeadlineTitle(slaDeadline)} />
}

function TypePieActiveShape(props) {
  return <Sector {...props} outerRadius={(props.outerRadius || 92) + 8} />
}

const ContractsByTypeChart = React.memo(function ContractsByTypeChart({
  contractTypeData,
  activeTypeIndex,
  onActiveTypeIndexChange,
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center gap-4 lg:flex-row">
      <div className="h-[210px] w-full max-w-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={contractTypeData}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={92}
              paddingAngle={1}
              isAnimationActive={false}
              activeIndex={activeTypeIndex}
              activeShape={TypePieActiveShape}
              onMouseEnter={(_, idx) => onActiveTypeIndexChange(idx)}
              onClick={(_, idx) => onActiveTypeIndexChange(idx)}
            >
              {contractTypeData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [v, n]} isAnimationActive={false} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full space-y-2">
        {contractTypeData.map((row) => (
          <div key={row.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} />
              <span>{row.name}</span>
            </div>
            <span className="font-semibold text-slate-800">{row.value}</span>
          </div>
        ))}
        {contractTypeData[activeTypeIndex] && (
          <div className="mt-3 rounded-xl border border-[#bfe6ec] bg-[#e6f6f8]/60 px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold">{contractTypeData[activeTypeIndex].name}</span>
            : {contractTypeData[activeTypeIndex].value} contracts
          </div>
        )}
      </div>
    </div>
  )
})

const ContractsByStatusChart = React.memo(function ContractsByStatusChart({ statusData, isMdUp }) {
  return (
    <div className="h-[230px] md:h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={statusData}
          margin={isMdUp ? { top: 8, right: 8, left: 0, bottom: 4 } : { top: 8, right: 8, left: 8, bottom: 10 }}
          barCategoryGap={isMdUp ? '28%' : '30%'}
        >
          <CartesianGrid stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="name"
            interval={0}
            axisLine={false}
            tickLine={false}
            tickMargin={6}
            padding={isMdUp ? undefined : { left: 8, right: 16 }}
            tickFormatter={(v) => {
              if (isMdUp) return v
              if (v === 'Rejected') return 'Rej'
              if (v === 'Expired') return 'Exp'
              return v
            }}
            tick={{ fill: '#374151', fontSize: isMdUp ? 12 : 10 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7280', fontSize: isMdUp ? 11 : 10 }}
            width={isMdUp ? 34 : 30}
          />
          <Tooltip isAnimationActive={false} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={isMdUp ? 46 : 34} isAnimationActive={false}>
            {statusData.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})

const ExpiringContractsChart = React.memo(function ExpiringContractsChart({
  expiryTrend,
  expiryBuckets,
  isMdUp,
  loading,
  hasContractData,
}) {
  if (!hasContractData) {
    return (
      <div className="flex min-h-[220px] items-center justify-center px-4 text-center text-sm text-slate-500">
        {loading ? 'Loading contract data…' : 'No contract data available'}
      </div>
    )
  }
  return (
    <>
      <div className="h-[220px] md:h-[240px] w-full min-h-[190px] md:min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={expiryTrend}
            margin={isMdUp ? { top: 10, right: 20, left: 40, bottom: 34 } : { top: 8, right: 20, left: 6, bottom: 20 }}
          >
            <defs>
              <linearGradient id="expiryLineStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#5cc3cf" />
                <stop offset="100%" stopColor="#0f6b7a" />
              </linearGradient>
              <linearGradient id="expiryAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#17a2b4" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#5fe0e6" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#4b5563', fontSize: isMdUp ? 11 : 10 }}
              tickFormatter={(v) => {
                if (isMdUp) return v
                if (v === 'Due in 30 Days') return '30D'
                if (v === 'Due in 60 Days') return '60D'
                if (v === 'Due in 90 Days') return '90D'
                return 'Expired'
              }}
              interval={0}
              angle={0}
              textAnchor="middle"
              height={isMdUp ? 42 : 30}
              tickMargin={isMdUp ? 10 : 8}
              scale="point"
              padding={{ left: 0, right: 0 }}
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: isMdUp ? 11 : 10 }} allowDecimals={false} width={isMdUp ? 36 : 28} />
            <Tooltip content={<ExpiringContractsTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} isAnimationActive={false} />
            <Area type="monotone" dataKey="value" stroke="none" fill="url(#expiryAreaFill)" isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="url(#expiryLineStroke)"
              strokeWidth={3}
              dot={{ r: 4, fill: '#0f6b7a', stroke: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 8, fill: '#17a2b4', stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1.5 md:mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs md:text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-emerald-500" /> Due in 30 Days: {expiryBuckets.next30}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-[#17a2b4]" /> Due in 60 Days: {expiryBuckets.next60}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-[#5cc3cf]" /> Due in 90 Days: {expiryBuckets.next90}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-rose-500" /> Expired: {expiryBuckets.expired}</span>
      </div>
    </>
  )
})

export default function VMS2_0() {
  const isMdUp = useMediaQuery('(min-width: 768px)')
  const { kf: kfFromContext, sdkReady } = useContext(KissflowSDKContext)
  const kfInstance = kfFromContext ?? (typeof window !== 'undefined' ? window.kf : null) ?? kfImport ?? null
  /** Stable primitives — avoid churn when Kissflow passes a new `kf` object identity each render. */
  const contractIdsSig = `${resolveKfAccountId(kfInstance)}|${resolveKfContractApplicationId(kfInstance)}|${resolveKfContractProcessId(kfInstance)}`
  const vendorAccountSig = `${resolveKfAccountId(kfInstance)}`

  const kfRef = useRef(kfInstance)
  kfRef.current = kfInstance

  const [apiRows, setApiRows] = useState(null)
  const [loading, setLoading] = useState(true)
  /** Total vendors from Vendor Master form report count API; null = use unique vendors on contracts. */
  const [vendorTotalFromReport, setVendorTotalFromReport] = useState(null)
  const [vendorMasterRows, setVendorMasterRows] = useState([])
  const [user, setUser] = useState(null)
  const [roleName, setRoleName] = useState('')
  const [expandedContractId, setExpandedContractId] = useState('')
  const [expandedProgress, setExpandedProgress] = useState(null)
  const [expandedProgressLoading, setExpandedProgressLoading] = useState(false)
  const [expiringWindow, setExpiringWindow] = useState('90')
  const [activeKpiCardId, setActiveKpiCardId] = useState('total')
  const [activeTypeIndex, setActiveTypeIndex] = useState(0)
  const [vpVendorFilter, setVpVendorFilter] = useState('')
  const [latestContractsQuery, setLatestContractsQuery] = useState('')
  const [vpSortKey, setVpSortKey] = useState('score')
  const [vpSortDir, setVpSortDir] = useState('desc')
  const [compliancePieActiveIndex, setCompliancePieActiveIndex] = useState(null)
  const [complianceLegendHidden, setComplianceLegendHidden] = useState(() => ({
    Compliant: false,
    'Missing Docs': false,
  }))

  useEffect(() => {
    AOS.init({ duration: 700, once: true, offset: 24, easing: 'ease-out-cubic' })
  }, [])

  useEffect(() => {
    if (!sdkReady) return
    const sdk = kfRef.current
    if (!sdk?.user) return
    setUser((prev) => {
      if (prev && (prev._id || prev.Name)) return prev
      const u = sdk.user
      return {
        _id: u._id,
        Name: u.Name,
        FirstName: u.FirstName || (u.Name && String(u.Name).split(/\s+/)[0]) || 'User',
        LastName: u.LastName,
        Email: u.Email,
        Role: u.Role,
        Roles: u.Roles,
        Groups: u.Groups,
        _user_type: u._user_type || u.Groups?.[0]?.Name || u.Roles?.[0]?.Name || 'User',
      }
    })
    const role = stringifyKfRole(
      sdk.user?.Role ||
      sdk.context?.user?.Role ||
      sdk.user?.Roles?.[0] ||
      sdk.context?.user?.Roles?.[0] ||
      '',
    )
    if (role) setRoleName(String(role).trim())
  }, [sdkReady, contractIdsSig])

  useEffect(() => {
    if (!sdkReady) return
    const sdk = kfRef.current
    if (!sdk?.user) return
    let cancelled = false
    const abc =
      sdk.user?.Role ||
      sdk.context?.user?.Role ||
      sdk.user?.Roles?.[0] ||
      sdk.context?.user?.Roles?.[0] ||
      null
    const roleFromSdk = stringifyKfRole(abc)
    const roleToStore = String(abc?.Name || roleFromSdk || '').trim()
    if (roleToStore) setRoleName(roleToStore)
    if (!sdk.app) return

    async function run() {
      try {
        if (!roleToStore) return
        await sdk.app.setVariable('user_role_name', roleToStore)
        const variableName = await sdk.app.getVariable('user_role_name')
        const variableRole = String(variableName || '').trim()
        const resolvedRole =
          variableRole && variableRole.toLowerCase() !== 'user'
            ? variableRole
            : String(roleToStore || '').trim()
        if (!resolvedRole || cancelled) return
        setRoleName(resolvedRole)
      } catch (e) {
        if (!cancelled) console.warn('VMS role setup failed:', e?.message || e)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, contractIdsSig])

  const userFetchSigRef = useRef('')

  useEffect(() => {
    if (!sdkReady) return
    const paths = buildContractAdminApiPaths(kfRef.current)
    if (!paths) return
    const sdk = kfRef.current
    const userId = sdk?.user?._id || sdk?.context?.user?._id
    if (!userId) return
    const fetchSig = `${paths.accountId}|${userId}`
    if (userFetchSigRef.current === fetchSig) return
    userFetchSigRef.current = fetchSig

    const path = `${paths.userPathPrefix}${userId}${paths.userPathSuffix}`
    let cancelled = false
    async function run() {
      try {
        let response
        if (sdk?.api) {
          const resp = await sdk.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(getApiBase() + path, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) return
          response = await res.json()
        }
        if (!cancelled && response && (response._id || response.Name)) {
          setUser(response)
          const role =
            stringifyKfRole(response?.Role) ||
            stringifyKfRole(response?.Roles?.[0]) ||
            String(response?._user_type || '').trim()
          if (role && String(role).trim().toLowerCase() !== 'user') {
            setRoleName(String(role).trim())
          }
        }
      } catch (e) {
        if (!cancelled) console.warn('VMS user fetch failed:', e?.message || e)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, contractIdsSig])

  const contractFetchSigRef = useRef('')
  const contractShowSpinnerRef = useRef(true)
  const contractFetchInFlightRef = useRef(false)
  const contractDataLoadedSigRef = useRef('')

  useEffect(() => {
    if (!sdkReady) return
    const paths = buildContractAdminApiPaths(kfRef.current)
    if (!paths) {
      setLoading(false)
      return
    }
    const fetchSig = `${paths.accountId}|${paths.applicationId}|${paths.processId}`
    if (fetchSig !== contractFetchSigRef.current) {
      contractFetchSigRef.current = fetchSig
      contractDataLoadedSigRef.current = ''
      contractShowSpinnerRef.current = true
      setApiRows(null)
    }
    if (contractDataLoadedSigRef.current === fetchSig || contractFetchInFlightRef.current) return

    let cancelled = false
    contractFetchInFlightRef.current = true
    if (contractShowSpinnerRef.current) setLoading(true)

    async function fetchOnePage() {
      const path = paths.getContractItemsPath(1, 1000)
      const kf = kfRef.current
      if (kf?.api) {
        const resp = await kf.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
        return resp?.data ?? resp ?? null
      }
      const res = await fetch(getApiBase() + path, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`Contracts HTTP ${res.status}`)
      return res.json()
    }

    async function run() {
      try {
        const response = await fetchOnePage()
        if (cancelled) return
        const data = response?.Data ?? response?.data ?? (Array.isArray(response) ? response : null)
        const list = Array.isArray(data) ? data : []
        const mapped = []
        for (let i = 0; i < list.length; i += 1) {
          const row = mapKfContractItem(list[i])
          if (row) mapped.push(row)
        }
        if (mapped.length) {
          setApiRows(mapped)
        } else {
          setApiRows([])
        }
        contractDataLoadedSigRef.current = fetchSig
      } catch (e) {
        if (!cancelled) {
          console.warn('Contract dashboard fetch failed:', e?.message || e)
          setApiRows([])
        }
      } finally {
        contractFetchInFlightRef.current = false
        if (!cancelled) {
          setLoading(false)
          contractShowSpinnerRef.current = false
        }
      }
    }
    run()
    return () => {
      cancelled = true
      contractFetchInFlightRef.current = false
    }
  }, [sdkReady, contractIdsSig])

  const vendorCountLoadedSigRef = useRef('')

  useEffect(() => {
    if (!sdkReady) return
    const countPath = buildTotalVendorsReportCountPath(kfRef.current)
    if (!countPath) {
      setVendorTotalFromReport(null)
      return
    }
    if (vendorCountLoadedSigRef.current === countPath) return
    vendorCountLoadedSigRef.current = countPath

    let cancelled = false

    async function fetchVendorCount() {
      try {
        let response
        const kf = kfRef.current
        if (kf?.api) {
          response = await kf.api(countPath, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
        } else {
          const res = await fetch(getApiBase() + countPath, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) throw new Error(`Vendor count HTTP ${res.status}`)
          response = await res.json()
        }
        if (cancelled) return
        const n = parseKfCountResponse(response)
        setVendorTotalFromReport(n)
      } catch (e) {
        if (!cancelled) {
          console.warn('Vendor master count fetch failed:', e?.message || e)
          setVendorTotalFromReport(null)
        }
      }
    }
    fetchVendorCount()
    return () => { cancelled = true }
  }, [sdkReady, contractIdsSig])

  const vendorListLoadedSigRef = useRef('')
  const vendorListFetchSigRef = useRef('')
  const vendorFetchInFlightRef = useRef(false)

  useEffect(() => {
    if (!sdkReady) return
    const paths = buildVendorMasterApiPaths(kfRef.current)
    if (!paths) {
      setVendorMasterRows([])
      return
    }
    const fetchSig = `${paths.accountId}|${paths.applicationId}|${paths.processId}`
    if (fetchSig !== vendorListFetchSigRef.current) {
      vendorListFetchSigRef.current = fetchSig
      vendorListLoadedSigRef.current = ''
    }
    if (vendorListLoadedSigRef.current === fetchSig || vendorFetchInFlightRef.current) return

    let cancelled = false
    vendorFetchInFlightRef.current = true

    function mapVendor(item) {
      if (!item || typeof item !== 'object') return null
      const name = String(item.Vendor_Name || item.Name || '').trim()
      if (!name) return null
      return {
        id: item._id || '',
        name,
        category: item.Vendor_Category || item.Type || '',
        vendorCategory: item.Vendor_Category || '',
        vendorType: item.Vendor_Type || '',
        industry: item.Industry || '',
        status: item.Vendor_Status || '',
        raw: item,
      }
    }

    async function run() {
      try {
        const path = paths.getVendorItemsPath(1, 1000)
        let response
        const kf = kfRef.current
        if (kf?.api) {
          const resp = await kf.api(path, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(getApiBase() + path, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) throw new Error(`Vendor list HTTP ${res.status}`)
          response = await res.json()
        }
        if (cancelled) return
        const data = response?.Data ?? response?.data ?? (Array.isArray(response) ? response : null)
        const list = Array.isArray(data) ? data : []
        const mapped = list.map(mapVendor).filter(Boolean)
        setVendorMasterRows(mapped)
        vendorListLoadedSigRef.current = fetchSig
      } catch (e) {
        if (!cancelled) {
          console.warn('Vendor master list fetch failed:', e?.message || e)
          setVendorMasterRows([])
        }
      } finally {
        vendorFetchInFlightRef.current = false
      }
    }
    run()
    return () => {
      cancelled = true
      vendorFetchInFlightRef.current = false
    }
  }, [sdkReady, vendorAccountSig])

  const contracts = useMemo(() => {
    if (apiRows != null) return apiRows
    return []
  }, [apiRows])

  const hasContractData = contracts.length > 0

  const vendorPerformanceRows = useMemo(
    () => buildVendorPerformanceRows(contracts, vendorMasterRows),
    [contracts, vendorMasterRows],
  )
  const filteredVendorPerformanceRows = useMemo(() => {
    const list = vendorPerformanceRows.filter((row) => {
      return !vpVendorFilter || String(row.vendorName || '').toLowerCase().includes(vpVendorFilter.toLowerCase())
    })
    const sorted = [...list].sort((a, b) => {
      const av = sortValueForVendorRow(a, vpSortKey)
      const bv = sortValueForVendorRow(b, vpSortKey)
      if (av > bv) return vpSortDir === 'asc' ? 1 : -1
      if (av < bv) return vpSortDir === 'asc' ? -1 : 1
      return 0
    })
    return sorted
  }, [vendorPerformanceRows, vpVendorFilter, vpSortKey, vpSortDir])
  const [selectedVendorKey, setSelectedVendorKey] = useState(null)

  const resolvedVendorKey = useMemo(() => {
    if (!filteredVendorPerformanceRows.length) return null
    if (selectedVendorKey && filteredVendorPerformanceRows.some((r) => r.key === selectedVendorKey)) {
      return selectedVendorKey
    }
    return filteredVendorPerformanceRows[0].key
  }, [filteredVendorPerformanceRows, selectedVendorKey])

  const selectedVendor = useMemo(
    () => filteredVendorPerformanceRows.find((r) => r.key === resolvedVendorKey) ?? null,
    [filteredVendorPerformanceRows, resolvedVendorKey],
  )
  const toggleVendorSort = (key) => {
    if (vpSortKey === key) {
      setVpSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setVpSortKey(key)
      setVpSortDir('asc')
    }
  }

  const radarChartData = useMemo(() => {
    if (!selectedVendor) return []
    const isAmcCategory = String(selectedVendor.category || '').trim().toLowerCase() === 'amc'
    const axes = isMdUp
      ? [
          { subject: 'TAT', score: selectedVendor.tat },
          ...(isAmcCategory ? [{ subject: 'PM Adherence', score: selectedVendor.pm }] : []),
          { subject: 'Service', score: selectedVendor.service },
          { subject: 'Response', score: selectedVendor.response },
        ]
      : [
          { subject: 'TAT Adherence', score: selectedVendor.tat },
          ...(isAmcCategory ? [{ subject: 'PM Adherence', score: selectedVendor.pm }] : []),
          { subject: 'Service Rate', score: selectedVendor.service },
          { subject: 'Response Rate', score: selectedVendor.response },
        ]
    return axes.filter((d) => d.score != null && !Number.isNaN(Number(d.score)))
  }, [selectedVendor, isMdUp])

  const expiryBuckets = useMemo(() => {
    const out = { next30: 0, next60: 0, next90: 0, expired: 0 }
    const today = new Date()
    contracts.forEach((c) => {
      if (!c.endDateObj) return
      const diff = daysBetween(today, c.endDateObj)
      if (diff < 0) out.expired += 1
      else if (diff <= 30) out.next30 += 1
      else if (diff <= 60) out.next60 += 1
      else if (diff <= 90) out.next90 += 1
    })
    return out
  }, [contracts])

  const kpis = useMemo(() => {
    const total = contracts.length
    const active = contracts.filter(isActiveLike).length
    const expiring =
      expiringWindow === '30'
        ? expiryBuckets.next30
        : expiringWindow === '60'
          ? (expiryBuckets.next30 + expiryBuckets.next60)
          : (expiryBuckets.next30 + expiryBuckets.next60 + expiryBuckets.next90)
    const expired = expiryBuckets.expired
    const ndaMiss = contracts.filter((c) => !isDocAvailable(c.nda)).length
    const msaMiss = contracts.filter((c) => !isDocAvailable(c.msa)).length
    const sowMiss = contracts.filter((c) => !isDocAvailable(c.sow)).length
    const vendorsFromContracts = new Set(contracts.map((c) => c.vendor).filter(Boolean)).size
    const vendors =
      vendorMasterRows.length > 0
        ? vendorMasterRows.length
        : (vendorTotalFromReport != null ? vendorTotalFromReport : vendorsFromContracts)
    return { total, active, expiring, expired, ndaMiss, msaMiss, sowMiss, vendors }
  }, [contracts, vendorTotalFromReport, vendorMasterRows, expiryBuckets, expiringWindow])

  const contractTypeData = useMemo(() => {
    const map = {}
    contracts.forEach((c) => {
      const t = String(c.contractType || 'Other').trim() || 'Other'
      map[t] = (map[t] || 0) + 1
    })
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
    if (!entries.length) {
      return CONTRACT_TYPE_DATA_FALLBACK
    }
    return entries.map(([name, value], i) => ({
      name,
      value,
      color: TYPE_FALLBACK_COLORS[i % TYPE_FALLBACK_COLORS.length],
    }))
  }, [contracts])

  const statusData = useMemo(() => {
    const keys = ['Active', 'Draft', 'Rejected', 'Expired']
    const counts = { Active: 0, Draft: 0, Rejected: 0, Expired: 0 }
    contracts.forEach((c) => {
      const b = statusBarBucket(c.businessStatus || c.status)
      if (b in counts) counts[b] += 1
      else counts.Draft += 1
    })
    return keys.map((name) => ({
      name,
      value: counts[name],
      color: STATUS_CHART_COLORS[name],
    }))
  }, [contracts])

  const docRows = useMemo(() => {
    const mk = (label, icon, iconClass, getter) => {
      const present = contracts.filter((c) => isDocAvailable(getter(c))).length
      const missing = contracts.length - present
      return { doc: label, icon, iconClass, present, missing, count: missing }
    }
    return [
      mk('NDA', 'ri-lock-2-line', 'text-[#17a2b4]', (c) => c.nda),
      mk('MSA', 'ri-stack-line', 'text-emerald-600', (c) => c.msa),
      mk('SOW', 'ri-clipboard-line', 'text-[#17a2b4]', (c) => c.sow),
    ]
  }, [contracts])

  const expiryTrend = useMemo(() => {
    return [
      { label: 'Due in 30 Days', value: expiryBuckets.next30 },
      { label: 'Due in 60 Days', value: expiryBuckets.next60 },
      { label: 'Due in 90 Days', value: expiryBuckets.next90 },
      { label: 'Expired', value: expiryBuckets.expired },
    ]
  }, [expiryBuckets])

  const filteredContractsForTable = useMemo(() => {
    const list = [...contracts]
    if (activeKpiCardId === 'total') return list
    if (activeKpiCardId === 'active') return list.filter(isActiveLike)
    if (activeKpiCardId === 'expiring') {
      const today = new Date()
      const maxDays = expiringWindow === '30' ? 30 : expiringWindow === '60' ? 60 : 90
      return list.filter((c) => c.endDateObj && daysBetween(today, c.endDateObj) >= 0 && daysBetween(today, c.endDateObj) <= maxDays)
    }
    if (activeKpiCardId === 'expired') return list.filter((c) => isWorkflowExpiredStatus(c.businessStatus || c.status) || isDateExpired(c))
    if (activeKpiCardId === 'ndaMiss') return list.filter((c) => !isDocAvailable(c.nda))
    if (activeKpiCardId === 'msaMiss') return list.filter((c) => !isDocAvailable(c.msa))
    if (activeKpiCardId === 'sowMiss') return list.filter((c) => !isDocAvailable(c.sow))
    return list
  }, [contracts, activeKpiCardId, expiringWindow])

  const latestContractsAll = useMemo(() => {
    return [...filteredContractsForTable]
      .sort((a, b) => {
        const ta = a.createdDateObj?.getTime()
        const tb = b.createdDateObj?.getTime()
        const hasA = ta != null && !Number.isNaN(ta)
        const hasB = tb != null && !Number.isNaN(tb)
        if (!hasA && !hasB) return 0
        if (!hasA) return 1
        if (!hasB) return -1
        return tb - ta
      })
  }, [filteredContractsForTable])

  const latestContractsFiltered = useMemo(() => {
    const list = Array.isArray(latestContractsAll) ? latestContractsAll : []
    const q = String(latestContractsQuery || '').trim().toLowerCase()
    if (!q) return list
    return list.filter((row) => {
      const title = String(row?.contractTitle || '').toLowerCase()
      const vendor = String(row?.vendor || '').toLowerCase()
      const type = String(row?.contractType || '').toLowerCase()
      const status = String(row?.status || row?.businessStatus || '').toLowerCase()
      const value = String(row?.valueDisplay || '').toLowerCase()
      return (
        (title && title.includes(q)) ||
        (vendor && vendor.includes(q)) ||
        (type && type.includes(q)) ||
        (status && status.includes(q)) ||
        (value && value.includes(q))
      )
    })
  }, [latestContractsAll, latestContractsQuery])

  const LATEST_CONTRACTS_PER_PAGE = 10
  const [latestContractsPage, setLatestContractsPage] = useState(1)
  const latestContractsTotalPages = Math.max(1, Math.ceil(latestContractsFiltered.length / LATEST_CONTRACTS_PER_PAGE))
  const latestContractsPageSafe = Math.min(latestContractsPage, latestContractsTotalPages)
  const latestContractsPageRows = useMemo(() => {
    const start = (latestContractsPageSafe - 1) * LATEST_CONTRACTS_PER_PAGE
    return latestContractsFiltered.slice(start, start + LATEST_CONTRACTS_PER_PAGE)
  }, [latestContractsFiltered, latestContractsPageSafe])

  useEffect(() => {
    setLatestContractsPage(1)
    setExpandedContractId('')
  }, [activeKpiCardId, expiringWindow, latestContractsQuery])

  const handleActiveTypeIndexChange = useCallback((idx) => {
    setActiveTypeIndex(idx)
  }, [])

  useEffect(() => {
    setActiveTypeIndex((idx) => {
      if (!contractTypeData.length) return 0
      return idx >= contractTypeData.length ? 0 : idx
    })
  }, [contractTypeData.length])

  const progressFetchKeyRef = useRef('')
  const progressFetchInFlightRef = useRef(false)
  const progressDataLoadedRef = useRef('')

  useEffect(() => {
    if (!expandedContractId) {
      progressFetchKeyRef.current = ''
      progressDataLoadedRef.current = ''
      setExpandedProgress(null)
      setExpandedProgressLoading(false)
      return
    }
    const paths = buildContractAdminApiPaths(kfRef.current)
    if (!paths) return

    const fetchKey = `${paths.processId}|${expandedContractId}`
    if (progressDataLoadedRef.current === fetchKey) return
    if (progressFetchInFlightRef.current && progressFetchKeyRef.current === fetchKey) return
    progressFetchKeyRef.current = fetchKey

    const sdk = kfRef.current
    const instanceId = encodeURIComponent(String(expandedContractId))
    const progressPath = `/process/2/${paths.accountId}/${paths.processId}/${instanceId}/progress`
    let cancelled = false
    progressFetchInFlightRef.current = true
    setExpandedProgressLoading(true)

    async function run() {
      try {
        let response
        if (sdk?.api) {
          const resp = await sdk.api(progressPath, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(getApiBase() + progressPath, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) throw new Error(`Progress HTTP ${res.status}`)
          response = await res.json()
        }
        if (!cancelled) {
          setExpandedProgress(response)
          progressDataLoadedRef.current = fetchKey
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Contract progress fetch failed:', e?.message || e)
          setExpandedProgress(null)
        }
      } finally {
        progressFetchInFlightRef.current = false
        if (!cancelled) setExpandedProgressLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
      progressFetchInFlightRef.current = false
    }
  }, [expandedContractId, contractIdsSig])

  const compliance = useMemo(() => {
    const total = contracts.length
    const gradCompliant = 'url(#complianceGradCompliant)'
    const gradMissing = 'url(#complianceGradMissing)'
    if (!total) {
      return {
        pct: 0,
        compliantCount: 0,
        missingCount: 0,
        slices: [
          { name: 'Compliant', value: 0, count: 0, color: '#17a2b4', fill: gradCompliant },
          { name: 'Missing Docs', value: 0, count: 0, color: '#f59e0b', fill: gradMissing },
        ],
      }
    }
    const compliantN = contracts.filter((c) => isDocAvailable(c.nda) && isDocAvailable(c.msa) && isDocAvailable(c.sow)).length
    const missingN = total - compliantN
    const pct = Math.round((compliantN / total) * 100)
    const missingPct = 100 - pct
    return {
      pct,
      compliantCount: compliantN,
      missingCount: missingN,
      slices: [
        { name: 'Compliant', value: pct, count: compliantN, color: '#17a2b4', fill: gradCompliant },
        { name: 'Missing Docs', value: missingPct, count: missingN, color: '#f59e0b', fill: gradMissing },
      ],
    }
  }, [contracts])

  const complianceCenterLabel = useMemo(() => {
    const { pct, slices, compliantCount, missingCount } = compliance
    const totalContracts = contracts.length
    const s0 = slices[0]
    const s1 = slices[1]
    if (compliancePieActiveIndex === 0) {
      return {
        main: `${s0.value}%`,
        sub: 'Compliant',
        detail: `${s0.count} contracts`,
      }
    }
    if (compliancePieActiveIndex === 1) {
      return {
        main: `${s1.value}%`,
        sub: 'Missing Docs',
        detail: `${s1.count} contracts`,
      }
    }
    return {
      main: `${pct}%`,
      sub: 'Compliant',
      detail: totalContracts ? `${compliantCount} of ${totalContracts} contracts` : 'No contracts',
    }
  }, [compliance, compliancePieActiveIndex, contracts.length])

  const complianceActiveShape = useMemo(
    () => makeComplianceActiveShape(complianceLegendHidden),
    [complianceLegendHidden],
  )

  const renderContractValueExpansionGrid = useCallback((row, expanded, steps, progress) => {
    const stackNarrow = !isMdUp
    return (
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3 md:gap-4 items-stretch">
      <div className="h-full">
        <div className={`h-full p-3 sm:p-4 max-md:min-w-0 max-md:p-0 ${vmsAccordionShellClass()}`}>
          <div
            className={
              stackNarrow
                ? 'mb-4 flex flex-col gap-2 min-w-0'
                : 'mb-4 flex items-start justify-between gap-3'
            }
          >
            <div className="min-w-0 w-full">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#17a2b4]/80">Contract Details</p>
              <p className="mt-1 text-base font-semibold text-slate-900 break-words [overflow-wrap:anywhere]">{row.contractTitle || '—'}</p>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-full border w-fit max-w-full ${stackNarrow ? 'self-start' : 'shrink-0'} ${statusPillClass(row.status)}`}
            >
              {row.status || 'In Progress'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="rounded-lg bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Vendor</p>
              <p className="text-sm font-semibold text-slate-900 break-words">{row.vendor || '—'}</p>
            </div>
            <div className="rounded-lg bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Contract Type</p>
              <p className="text-sm font-semibold text-slate-900 break-words">
                <span className={vmsTypeChipClass()}>
                  <i className={`${vmsContractTypeIcon(row.contractType)} text-[12px]`} aria-hidden />
                  {row.contractType || '—'}
                </span>
              </p>
            </div>
            <div className="rounded-lg bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Contract Value</p>
              <p className="text-sm font-semibold text-slate-900 break-words">{row.valueDisplay || '—'}</p>
            </div>
            <div className="rounded-lg bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Created</p>
              <p className="text-sm font-semibold text-slate-900 break-words">{row.createdDateDisplay || '—'}</p>
            </div>
            <div className="rounded-lg bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">End Date</p>
              <p className="text-sm font-semibold text-slate-900 break-words">{row.endDate || '—'}</p>
            </div>
            <div className="rounded-lg bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Documents</p>
              <p className="text-sm font-semibold text-slate-900">
                NDA {isDocAvailable(row.nda) ? '✓' : '✗'} · MSA {isDocAvailable(row.msa) ? '✓' : '✗'} · SOW {isDocAvailable(row.sow) ? '✓' : '✗'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={`h-full w-full min-w-0 p-3 sm:p-4 max-md:p-0 ${vmsAccordionShellClass()}`}>
        <div
          className={
            stackNarrow
              ? 'mb-2.5 flex flex-row items-center justify-between gap-3 min-w-0'
              : 'mb-4 flex items-center justify-between gap-2'
          }
        >
          <p className="text-sm font-semibold text-slate-800 min-w-0 inline-flex items-center gap-2">
            <i className="ri-route-line text-[#17a2b4]" />
            Workflow Progress
          </p>
          <p className="text-xs text-slate-500 shrink-0 tabular-nums">{expandedProgressLoading && expanded ? 'Loading…' : `${progress}% complete`}</p>
        </div>
        <div className={`min-w-0 w-full ${stackNarrow ? 'space-y-2.5' : 'space-y-3'}`}>
          {expanded && expandedProgressLoading && (
            <div className="py-4 text-xs text-slate-500">
              <i className="ri-loader-4-line animate-spin mr-1" />
              Fetching live workflow progress...
            </div>
          )}
          {stackNarrow
            ? steps.map((step, idx) => (
                <div
                  key={`${step.title}-${idx}`}
                  className={`w-full min-w-0 ${vmsWorkflowStepClass()} ${idx === 0 ? 'mt-0' : 'mt-2'}`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#17a2b4] ring-4 ring-[#e6f6f8]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-slate-800 leading-snug break-words">
                        {step.title}
                      </p>
                      <div className="mt-2">
                        <span className={`inline-flex max-w-full items-center px-2.5 py-1 rounded-full text-[11px] font-semibold leading-snug ${stepStatusBadgeClass(step.status)}`}>
                          {formatStepStatusLabel(step.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            : steps.map((step, idx) => {
                const isLast = idx === steps.length - 1
                const isDone = String(step.status).toLowerCase().includes('completed')
                return (
                  <div key={`${step.title}-${idx}`} className="relative flex items-start gap-3 pl-1 min-w-0 w-full">
                    <div className="relative mt-0.5 w-5 flex justify-center shrink-0">
                      {!isLast && (
                        <span className={`absolute top-6 bottom-[-14px] left-1/2 -translate-x-1/2 border-l-2 ${isDone ? 'border-emerald-300' : 'border-dashed border-slate-300'}`} />
                      )}
                      <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center ${isDone ? 'bg-emerald-500 text-white' : 'border border-slate-300 bg-white text-slate-500'}`}>
                        {isDone ? <i className="ri-check-line text-[10px]" /> : <span className="text-[9px] font-bold">{idx + 1}</span>}
                      </div>
                    </div>
                    <div className={`min-w-0 flex-1 basis-0 ${vmsWorkflowStepClass()}`}>
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <p className="text-sm font-medium text-slate-700 min-w-0 break-words">{step.title}</p>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold leading-snug ${stepStatusBadgeClass(step.status)}`}
                        >
                          {formatStepStatusLabel(step.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
        </div>
      </div>
    </div>
    )
  }, [expandedProgressLoading, isMdUp])

  const firstName =
    user?.FirstName ||
    (user?.Name && String(user.Name).split(/\s+/)[0]) ||
    'User'
  const displayRole =
    roleName ||
    user?.Role?.Name?.trim() ||
    user?._user_type ||
    user?.Groups?.[0]?.Name ||
    user?.Roles?.[0]?.Name ||
    'User'
  const greeting = getTimeGreeting()

  return (
    <div className={vmsPageClass}>
      <div className={vmsPageInnerClass}>
        <section className={vmsHeaderShellClass()} data-aos="fade-down">
          <P2pHeaderFx />
          <div className="relative z-[1] flex items-center gap-3 min-w-0">
            <div className={vmsAvatarClass()}>
              {(firstName || 'U').charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-base sm:text-xl font-semibold tracking-tight text-slate-900 truncate">{greeting}, {firstName}</p>
              <p className="text-xs sm:text-sm text-slate-500 truncate">
                Logged in as <span className={vmsRoleAccentClass()}>{displayRole}</span>
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch gap-3 sm:gap-3.5">
          {VMS_KPI_SUMMARY.map((item, idx) => {
            const v = kpis[item.key]
            return (
              <StatCard
                key={item.label}
                item={item}
                delay={idx * 40}
                value={v}
                total={kpis.total}
                expiringWindow={expiringWindow}
                onExpiringWindowChange={setExpiringWindow}
                onClick={() => setActiveKpiCardId(item.key)}
                selected={activeKpiCardId === item.key}
              />
            )
          })}
        </div>

        <VmsSection
          className="mt-3 md:mt-4"
          title="Latest Contracts"
          icon="ri-file-paper-2-line"
          accent="brand"
          bodyClassName="p-0 md:p-0"
          data-aos="fade-up"
          headerRight={(
            <div className="w-full md:w-[360px] flex items-center gap-2">
              <div className="relative flex-1 min-w-0 group">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none group-focus-within:text-[#17a2b4]" />
                <input
                  type="text"
                  value={latestContractsQuery}
                  onChange={(e) => setLatestContractsQuery(e.target.value)}
                  placeholder="Search contracts"
                  className={vmsSearchInputClass()}
                />
                {latestContractsQuery ? (
                  <button
                    type="button"
                    onClick={() => setLatestContractsQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full text-slate-500 hover:bg-[#e6f6f8] transition-colors flex items-center justify-center"
                    aria-label="Clear latest contracts search"
                    title="Clear"
                  >
                    <i className="ri-close-line text-lg" />
                  </button>
                ) : null}
              </div>
              {latestContractsQuery ? (
                <button type="button" onClick={() => setLatestContractsQuery('')} className={vmsGhostBtnClass()}>
                  Clear
                </button>
              ) : null}
            </div>
          )}
        >
          <div className="md:hidden space-y-3 w-full min-w-0 p-2.5">
            {latestContractsPageRows.map((row) => {
              const key = String(row._id || row.contractTitle)
              const expanded = expandedContractId === key
              const liveSteps = expanded && expandedContractId === key ? flattenProgressSteps(expandedProgress) : []
              const steps = liveSteps.length ? liveSteps : statusTrackerSteps(row)
              const doneCount = steps.filter((s) => String(s.status).toLowerCase().includes('completed')).length
              const progress = Math.round((doneCount / Math.max(1, steps.length)) * 100)
              return (
                <article key={key} className={vmsMobileCardClass(expanded)}>
                  <div className="flex w-full min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedContractId(expanded ? '' : key)}
                      className={vmsExpandBtnClass(expanded)}
                      aria-label={`View details for ${row.contractTitle || 'contract'}`}
                    >
                      <i className={`${expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-lg`} />
                    </button>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <h3 className="text-[15px] font-bold text-slate-900 leading-snug break-words [overflow-wrap:anywhere]">
                        {row.contractTitle || '—'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1.5 break-words [overflow-wrap:anywhere]">
                        {row.vendor || '—'}
                      </p>
                      <div className="mt-2.5">
                        <span
                          className={`inline-flex max-w-full items-center px-2.5 py-1 text-[11px] font-medium rounded-full border leading-snug ${statusPillClass(row.status)}`}
                        >
                          {row.status || 'In Progress'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5 grid grid-cols-2 gap-x-2.5 gap-y-2.5 text-[13px] text-slate-800 w-full min-w-0">
                    <div className="min-w-0 col-span-1">
                      <p className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><i className="ri-money-rupee-circle-line text-[#17a2b4]" aria-hidden />Value</p>
                      <p className="font-semibold tabular-nums break-words [overflow-wrap:anywhere]">{row.valueDisplay || '—'}</p>
                    </div>
                    <div className="min-w-0 col-span-1">
                      <p className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><i className="ri-price-tag-3-line text-[#17a2b4]" aria-hidden />Type</p>
                      <p className="font-semibold break-words [overflow-wrap:anywhere]">
                        <span className={vmsTypeChipClass()}>
                          <i className={`${vmsContractTypeIcon(row.contractType)} text-[12px]`} aria-hidden />
                          {row.contractType || '—'}
                        </span>
                      </p>
                    </div>
                    <div className="min-w-0 col-span-1">
                      <p className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><i className="ri-calendar-line text-[#17a2b4]" aria-hidden />Created</p>
                      <p className="font-semibold break-words [overflow-wrap:anywhere]">{row.createdDateDisplay || '—'}</p>
                    </div>
                    <div className="min-w-0 col-span-1">
                      <p className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><i className="ri-timer-flash-line text-[#17a2b4]" aria-hidden />SLA</p>
                      <p className="font-semibold">
                        <ContractSlaBadge rowKey={String(row._id || row.contractTitle || '')} slaDeadline={row.slaDeadline} />
                      </p>
                    </div>
                    <div className="min-w-0 col-span-1">
                      <p className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><i className="ri-calendar-close-line text-[#17a2b4]" aria-hidden />End Date</p>
                      <p className="font-semibold break-words">{row.endDate || '—'}</p>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3.5 pt-3.5 border-t border-[#bfe6ec]/80 min-w-0 bg-[#e6f6f8]/40 rounded-xl px-2 py-2">
                      <div className="p-0 sm:p-4 min-w-0 w-full max-md:overflow-visible md:overflow-x-hidden max-md:bg-transparent max-md:border-0 max-md:shadow-none">
                        {renderContractValueExpansionGrid(row, expanded, steps, progress)}
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <div className="hidden md:block overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full text-left table-auto min-w-[980px]">
              <thead>
                <tr className={vmsTableHeadClass()}>
                  <th className={`${vmsTableHeadCellClass()} w-[240px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-file-paper-2-line ${vmsColIconClass()}`} aria-hidden />Contract</span></th>
                  <th className={`${vmsTableHeadCellClass()} w-[140px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-building-2-line ${vmsColIconClass()}`} aria-hidden />Vendor</span></th>
                  <th className={`${vmsTableHeadCellClass()} w-[130px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-money-rupee-circle-line ${vmsColIconClass()}`} aria-hidden />Value</span></th>
                  <th className={`${vmsTableHeadCellClass()} w-[110px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-price-tag-3-line ${vmsColIconClass()}`} aria-hidden />Type</span></th>
                  <th className={`${vmsTableHeadCellClass()} w-[120px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-flag-line ${vmsColIconClass()}`} aria-hidden />Status</span></th>
                  <th className={`${vmsTableHeadCellClass()} w-[150px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-calendar-line ${vmsColIconClass()}`} aria-hidden />Created</span></th>
                  <th className={`${vmsTableHeadCellClass()} w-[120px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-timer-flash-line ${vmsColIconClass()}`} aria-hidden />SLA</span></th>
                  <th className={`${vmsTableHeadCellClass()} w-[120px]`}><span className="inline-flex items-center gap-1.5"><i className={`ri-calendar-close-line ${vmsColIconClass()}`} aria-hidden />End Date</span></th>
                </tr>
              </thead>
              <tbody className={`${vmsTableDivideClass()} bg-white text-sm`}>
                {latestContractsPageRows.map((row) => {
                  const key = String(row._id || row.contractTitle)
                  const expanded = expandedContractId === key
                  const liveSteps = expanded && expandedContractId === key ? flattenProgressSteps(expandedProgress) : []
                  const steps = liveSteps.length ? liveSteps : statusTrackerSteps(row)
                  const doneCount = steps.filter((s) => String(s.status).toLowerCase().includes('completed')).length
                  const progress = Math.round((doneCount / Math.max(1, steps.length)) * 100)
                  return (
                    <React.Fragment key={key}>
                      <tr className={vmsTableRowClass(expanded)}>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => setExpandedContractId(expanded ? '' : key)}
                              className={vmsExpandBtnClass(expanded, true)}
                              aria-label={`View details for ${row.contractTitle || 'contract'}`}
                            >
                              <i className={`${expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-lg`} />
                            </button>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{row.contractTitle || '—'}</p>
                              <p className="mt-0.5 text-xs text-slate-500 truncate">{row.vendor || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 truncate">{row.vendor || '—'}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-slate-900 whitespace-nowrap">{row.valueDisplay}</td>
                        <td className="px-4 py-3">
                          <span className={vmsTypeChipClass()}>
                            <i className={`${vmsContractTypeIcon(row.contractType)} text-[12px]`} aria-hidden />
                            {row.contractType || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2.5 py-0.5 text-[11px] font-medium rounded-full border ${statusPillClass(row.status)}`}>
                            {row.status || 'In Progress'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.createdDateDisplay || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <ContractSlaBadge rowKey={String(row._id || row.contractTitle || '')} slaDeadline={row.slaDeadline} />
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.endDate}</td>
                      </tr>
                      {expanded && (
                        <tr className="bg-[#e6f6f8]/70">
                          <td colSpan={8} className="p-0">
                            <div className="px-4 py-3 border-t border-[#bfe6ec]/70">
                              {renderContractValueExpansionGrid(row, expanded, steps, progress)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination for Latest Contracts */}
          <div className={vmsPaginationBarClass()}>
            <p className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-semibold text-slate-700">
                {latestContractsFiltered.length === 0 ? 0 : (latestContractsPageSafe - 1) * LATEST_CONTRACTS_PER_PAGE + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(latestContractsPageSafe * LATEST_CONTRACTS_PER_PAGE, latestContractsFiltered.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-700">{latestContractsFiltered.length}</span>
            </p>
            <div className="flex items-center gap-1 justify-end">
              <button
                type="button"
                onClick={() => { setLatestContractsPage((p) => Math.max(1, p - 1)); setExpandedContractId('') }}
                disabled={latestContractsPageSafe <= 1}
                className={vmsPaginationBtnClass(false)}
                aria-label="Previous page"
              >
                <i className="ri-arrow-left-s-line" />
              </button>
              {Array.from({ length: Math.min(5, latestContractsTotalPages) }).map((_, i) => {
                const pageNum =
                  latestContractsTotalPages <= 5
                    ? i + 1
                    : latestContractsPageSafe <= 3
                      ? i + 1
                      : latestContractsPageSafe >= latestContractsTotalPages - 2
                        ? latestContractsTotalPages - 4 + i
                        : latestContractsPageSafe - 2 + i
                const active = pageNum === latestContractsPageSafe
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => { setLatestContractsPage(pageNum); setExpandedContractId('') }}
                    className={vmsPaginationBtnClass(active)}
                    aria-label={`Page ${pageNum}`}
                  >
                    {pageNum}
                  </button>
                )
              })}
              {latestContractsTotalPages > 5 && latestContractsPageSafe < latestContractsTotalPages - 2 ? (
                <span className="px-1 text-slate-400">…</span>
              ) : null}
              {latestContractsTotalPages > 5 ? (
                <button
                  type="button"
                  onClick={() => { setLatestContractsPage(latestContractsTotalPages); setExpandedContractId('') }}
                  className={vmsPaginationBtnClass(latestContractsPageSafe === latestContractsTotalPages)}
                  aria-label={`Page ${latestContractsTotalPages}`}
                >
                  {latestContractsTotalPages}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => { setLatestContractsPage((p) => Math.min(latestContractsTotalPages, p + 1)); setExpandedContractId('') }}
                disabled={latestContractsPageSafe >= latestContractsTotalPages}
                className={vmsPaginationBtnClass(false)}
                aria-label="Next page"
              >
                <i className="ri-arrow-right-s-line" />
              </button>
            </div>
          </div>
        </VmsSection>

        {/* Charts, vendor performance, and analytics — re-enable when needed */}
        {false && (
        <>
        <div className="mt-5" data-aos="fade-up">
          <div className={`mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between ${vmsHeaderShellClass()} !mb-3`}>
            <div>
              <h2 className={vmsSectionTitleClass()}>Vendor Performance</h2>
              <p className={vmsSectionSubtitleClass()}>
                Admin · Monitoring Mode ·{' '}
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#bfe6ec] bg-[#e6f6f8] px-3 py-1.5 text-xs font-semibold text-[#0f6b7a]">
              <i className="ri-pulse-line" aria-hidden />
              Ratings from contract fields (TAT · PM · Service · Response)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className={`${vmsSectionShellClass('xl:col-span-5 md:min-h-0 xl:h-[430px] flex flex-col')} p-0`}>
              <div className={`grid grid-cols-1 gap-2 border-b border-slate-100/90 ${vmsSectionHeaderClass('slate')} !py-2.5`}>
                <input
                  value={vpVendorFilter}
                  onChange={(e) => setVpVendorFilter(e.target.value)}
                  placeholder="Filter vendor"
                  className={`${vmsSearchInputClass()} !min-h-[38px] !rounded-xl !pl-3`}
                />
              </div>

              <div className="md:hidden p-2 space-y-2.5">
                {filteredVendorPerformanceRows.map((row) => {
                  const sel = selectedVendorKey === row.key
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSelectedVendorKey(row.key)}
                      className={vmsVendorMobileCardClass(sel)}
                    >
                      <div className="flex flex-row items-start justify-between gap-3 w-full min-w-0">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-slate-900 leading-snug break-words whitespace-normal">
                            {row.vendorName}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">
                            {row.contractCount} contract{row.contractCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <VendorScoreRing score={row.score} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-[#e6f6f8] px-2.5 py-1 text-xs font-semibold text-[#0f6b7a]">
                          {row.category}
                        </span>
                        <span className={`text-xs font-semibold ${trendArrowClass(row.trend)}`}>
                          {row.trend === 'Improving' && '↑ Improving'}
                          {row.trend === 'Stable' && '→ Stable'}
                          {row.trend === 'Declining' && '↓ Declining'}
                          {row.trend === 'No Data' && 'No Data'}
                        </span>
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${riskPillClass(row.risk)}`}>
                          {row.risk}
                        </span>
                      </div>
                    </button>
                  )
                })}
                {!filteredVendorPerformanceRows.length && (
                  <div className="px-2 py-10 text-center text-sm text-slate-500">No vendor rows yet.</div>
                )}
              </div>

              <div className="hidden md:block flex-1 min-h-0 overflow-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className={vmsTableHeadClass()}>
                      <th className="px-3 py-2.5">
                        <button type="button" onClick={() => toggleVendorSort('vendorName')} className="inline-flex items-center gap-1">
                          Vendor <i className={`ri-arrow-${vpSortKey === 'vendorName' && vpSortDir === 'asc' ? 'up' : 'down'}-s-line`} />
                        </button>
                      </th>
                      <th className="px-3 py-2.5">
                        <button type="button" onClick={() => toggleVendorSort('category')} className="inline-flex items-center gap-1">
                          Category <i className={`ri-arrow-${vpSortKey === 'category' && vpSortDir === 'asc' ? 'up' : 'down'}-s-line`} />
                        </button>
                      </th>
                      <th className="px-3 py-2.5">
                        <button type="button" onClick={() => toggleVendorSort('score')} className="inline-flex items-center gap-1">
                          Score <i className={`ri-arrow-${vpSortKey === 'score' && vpSortDir === 'asc' ? 'up' : 'down'}-s-line`} />
                        </button>
                      </th>
                      {/* Trend column — re-enable when needed
                      <th className="px-3 py-2.5">
                        <button type="button" onClick={() => toggleVendorSort('trend')} className="inline-flex items-center gap-1">
                          Trend <i className={`ri-arrow-${vpSortKey === 'trend' && vpSortDir === 'asc' ? 'up' : 'down'}-s-line`} />
                        </button>
                      </th>
                      */}
                      <th className="px-3 py-2.5">
                        <button type="button" onClick={() => toggleVendorSort('risk')} className="inline-flex items-center gap-1">
                          Risk <i className={`ri-arrow-${vpSortKey === 'risk' && vpSortDir === 'asc' ? 'up' : 'down'}-s-line`} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className={vmsTableDivideClass()}>
                    {filteredVendorPerformanceRows.map((row) => {
                      const sel = selectedVendorKey === row.key
                      return (
                        <tr
                          key={row.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedVendorKey(row.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedVendorKey(row.key)
                            }
                          }}
                          className={vmsVendorRowClass(sel)}
                        >
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-800">{row.vendorName}</div>
                            <div className="text-xs text-slate-500">
                              {row.contractCount} contract{row.contractCount !== 1 ? 's' : ''}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex rounded-full bg-[#e6f6f8] px-2 py-0.5 text-xs font-medium text-[#0f6b7a]">
                              {row.category}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <VendorScoreRing score={row.score} />
                          </td>
                          {/* Trend column — re-enable when needed
                          <td className={`px-3 py-3 text-xs font-medium ${trendArrowClass(row.trend)}`}>
                            {row.trend === 'Improving' && '↑ Improving'}
                            {row.trend === 'Stable' && '→ Stable'}
                            {row.trend === 'Declining' && '↓ Declining'}
                            {row.trend === 'No Data' && 'No Data'}
                          </td>
                          */}
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${riskPillClass(row.risk)}`}>
                              {row.risk}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {!filteredVendorPerformanceRows.length && (
                <div className="hidden md:block px-4 py-8 text-center text-sm text-slate-500">No vendor rows yet.</div>
              )}
            </div>

            <div className={`${vmsSectionShellClass('xl:col-span-7 md:min-h-0 xl:h-[430px] flex items-center max-md:py-5')} p-4 overflow-hidden`}>
              {selectedVendor ? (
                <div key={resolvedVendorKey} className="w-full vms-vendor-panel-in">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#17a2b4]/80">Selected Vendor</p>
                      <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-800 transition-colors duration-300">{selectedVendor.vendorName}</h3>
                      <p className="text-xs text-slate-500">Averaged from {selectedVendor.contractCount} contract(s)</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="hidden md:inline-flex rounded-full bg-gradient-to-r from-[#17a2b4] to-[#0f6b7a] px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                        AI Insight
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors duration-300 ${riskPillClass(selectedVendor.risk)}`}>
                        {selectedVendor.risk}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-2">
                    <div
                      className={`h-[240px] w-full min-h-[220px] max-md:min-h-[300px] max-md:h-[300px] ${!isMdUp ? 'max-md:overflow-visible' : ''}`}
                    >
                      {radarChartData.length === 0 ? (
                        <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 text-center text-sm text-slate-500">
                          Not enough metric data for a radar chart (all values missing).
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%" className={!isMdUp ? '[&_.recharts-surface]:overflow-visible' : undefined}>
                          <RadarChart
                            key={resolvedVendorKey}
                            cx="50%"
                            cy="50%"
                            outerRadius={isMdUp ? '78%' : '50%'}
                            margin={isMdUp ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 28, right: 32, bottom: 28, left: 32 }}
                            data={radarChartData}
                          >
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis
                              dataKey="subject"
                              tick={{ fill: '#475569', fontSize: isMdUp ? 11 : 9 }}
                              tickLine={isMdUp}
                            />
                            <PolarRadiusAxis angle={40} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: isMdUp ? 10 : 9 }} />
                            <Radar
                              name="Score"
                              dataKey="score"
                              stroke="#17a2b4"
                              fill="#17a2b4"
                              fillOpacity={0.45}
                              strokeWidth={2}
                              connectNulls={false}
                              isAnimationActive
                              animationDuration={380}
                              animationEasing="ease-out"
                            />
                            <Tooltip formatter={(v) => [`${v}%`, 'Score']} isAnimationActive={false} />
                          </RadarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                      <VendorPerfMetricCard key={`tat-${resolvedVendorKey}`} label="TAT Adherence" value={selectedVendor.tat} />
                      {String(selectedVendor.category || '').trim().toLowerCase() === 'amc' && (
                        <VendorPerfMetricCard key={`pm-${resolvedVendorKey}`} label="PM Adherence" value={selectedVendor.pm} />
                      )}
                      <VendorPerfMetricCard key={`svc-${resolvedVendorKey}`} label="Service Rate" value={selectedVendor.service} />
                      <VendorPerfMetricCard key={`rsp-${resolvedVendorKey}`} label="Response Rate" value={selectedVendor.response} />
                    </div>
                  </div>

                </div>
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">Select a vendor from the list.</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
          <VmsSection
            className="xl:col-span-7"
            title="Contracts by Type"
            icon="ri-pie-chart-2-line"
            accent="brandAlt"
            bodyClassName="p-4"
            data-aos="zoom-in"
          >
            <ContractsByTypeChart
              contractTypeData={contractTypeData}
              activeTypeIndex={activeTypeIndex}
              onActiveTypeIndexChange={handleActiveTypeIndexChange}
            />
          </VmsSection>

          <VmsSection
            className="xl:col-span-5"
            title="Contracts by Status"
            icon="ri-bar-chart-grouped-line"
            accent="brand"
            bodyClassName="p-3 md:p-4"
            data-aos="zoom-in"
            data-aos-delay="80"
          >
            <ContractsByStatusChart statusData={statusData} isMdUp={isMdUp} />
          </VmsSection>

          {/* <div className="rounded-2xl border border-[#bfe6ec]/80 bg-gradient-to-r from-white/90 via-[#e6f6f8]/80 to-[#f3f8fb]/80 p-3 md:p-4 shadow-[0_10px_26px_rgba(15,107,122,0.10)] backdrop-blur-md xl:col-span-3" data-aos="zoom-in" data-aos-delay="140">
            <h2 className="mb-2.5 md:mb-3 text-base md:text-xl font-semibold text-slate-800">Document Availability</h2>
            <div className="rounded-md bg-slate-100 px-3 py-2 text-slate-500">
              <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.8fr] gap-1 text-sm font-medium">
                <span />
                <span className="text-center">✓</span>
                <span className="text-center text-rose-500">✖</span>
                <span className="text-center">#</span>
              </div>
            </div>
            <div className="mt-2 divide-y divide-slate-200">
              {docRows.map((r) => (
                <div
                  key={r.doc}
                  className="grid grid-cols-[1.2fr_.8fr_.8fr_.8fr] items-center gap-1 py-2 text-sm transition-colors hover:bg-slate-100/60"
                >
                  <div className="flex items-center gap-2 text-slate-700">
                    <i className={`${r.icon} ${r.iconClass}`} />
                    <span>{r.doc}</span>
                  </div>
                  <span className="text-center text-emerald-600 font-semibold">{r.present}</span>
                  <span className="text-center text-rose-500 font-semibold">{r.missing}</span>
                  <span className="text-center font-medium text-slate-700">{r.count}</span>
                </div>
              ))}
            </div>
          </div> */}
        </div>

        <VmsSection
          className="mt-3"
          title="Expiring Contracts"
          icon="ri-calendar-event-line"
          accent="rose"
          bodyClassName="p-3 md:p-4"
          data-aos="fade-up"
        >
          <ExpiringContractsChart
            expiryTrend={expiryTrend}
            expiryBuckets={expiryBuckets}
            isMdUp={isMdUp}
            loading={loading}
            hasContractData={hasContractData}
          />
        </VmsSection>
        </>
        )}

          {/* <div className="rounded-2xl border border-[#bfe6ec]/80 bg-gradient-to-r from-white/90 via-[#e6f6f8]/80 to-[#f3f8fb]/80 p-3 md:p-4 shadow-[0_10px_26px_rgba(15,107,122,0.10)] backdrop-blur-md xl:col-span-5" data-aos="fade-up" data-aos-delay="80">
            <h2 className="mb-2.5 md:mb-3 text-base md:text-xl font-semibold text-slate-800">Compliance Summary</h2>
            {!hasContractData ? (
              <div className="flex min-h-[220px] items-center justify-center px-4 text-center text-sm text-slate-500">
                {loading ? 'Loading contract data…' : 'No contract data available'}
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div
                    className="relative mx-auto h-[220px] w-[220px] shrink-0"
                    style={{
                      filter:
                        'drop-shadow(0 12px 28px rgba(37, 99, 235, 0.2)) drop-shadow(0 4px 12px rgba(245, 158, 11, 0.12))',
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          <linearGradient id="complianceGradCompliant" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#17a2b4" />
                            <stop offset="100%" stopColor="#0f6b7a" />
                          </linearGradient>
                          <linearGradient id="complianceGradMissing" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#d97706" />
                          </linearGradient>
                        </defs>
                        <Pie
                          data={compliance.slices}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={54}
                          outerRadius={84}
                          startAngle={90}
                          endAngle={-270}
                          paddingAngle={2}
                          isAnimationActive
                          animationDuration={800}
                          activeIndex={compliancePieActiveIndex === null ? undefined : compliancePieActiveIndex}
                          activeShape={complianceActiveShape}
                          onMouseEnter={(_, i) => setCompliancePieActiveIndex(i)}
                          onMouseLeave={() => setCompliancePieActiveIndex(null)}
                        >
                          {compliance.slices.map((c) => (
                            <Cell
                              key={c.name}
                              fill={c.fill}
                              fillOpacity={complianceLegendHidden[c.name] ? 0.22 : 1}
                              stroke="#ffffff"
                              strokeWidth={complianceLegendHidden[c.name] ? 1 : 1.5}
                              style={{
                                transition: 'fill-opacity 0.35s ease',
                              }}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={<ComplianceSummaryCustomTooltip />}
                          wrapperStyle={{ zIndex: 1000 }}
                          offset={28}
                          allowEscapeViewBox={{ x: true, y: true }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="px-2 text-center">
                        <div
                          className="text-[30px] font-semibold leading-none text-slate-800 transition-all duration-500 ease-out sm:text-[34px]"
                        >
                          {complianceCenterLabel.main}
                        </div>
                        <div className="mt-1.5 text-xs font-semibold text-slate-600 transition-all duration-500 ease-out">
                          {complianceCenterLabel.sub}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-500 transition-all duration-500 ease-out">
                          {complianceCenterLabel.detail}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full min-w-0 space-y-1 pr-0 text-sm sm:max-w-[220px]">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Legend · click to toggle</p>
                    {compliance.slices.map((c) => {
                      const hidden = complianceLegendHidden[c.name]
                      return (
                        <button
                          key={c.name}
                          type="button"
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/70 ${
                            hidden ? 'opacity-60' : ''
                          }`}
                          onClick={() =>
                            setComplianceLegendHidden((prev) => ({ ...prev, [c.name]: !prev[c.name] }))
                          }
                          aria-pressed={hidden}
                        >
                          <span className={`inline-flex min-w-0 items-center gap-2 text-slate-700 ${hidden ? 'line-through' : ''}`}>
                            <span
                              className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/80 shadow-sm"
                              style={{ background: c.name === 'Compliant' ? 'linear-gradient(135deg,#17a2b4,#0f6b7a)' : 'linear-gradient(135deg,#f59e0b,#d97706)' }}
                            />
                            <span className="truncate font-medium">{c.name}</span>
                          </span>
                          <span className="shrink-0 font-semibold text-slate-800">{c.value}%</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-slate-700"><span className="text-rose-500">⚠</span> {kpis.ndaMiss} contracts are missing NDAs</p>
                  <p className="flex items-center gap-2 text-slate-700"><span className="text-amber-500">🛡</span> {kpis.msaMiss} contracts are missing MSAs</p>
                  <p className="flex items-center gap-2 text-slate-700"><span className="text-yellow-500">⚠</span> {kpis.expiring} contracts expiring in next 90 days</p>
                </div>
              </>
            )}
          </div> */}
      </div>
    </div>
  )
}
