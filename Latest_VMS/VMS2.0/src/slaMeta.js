/**
 * SLA pill meta — same rules as LeadsTable (Latest Leads): deadline datetime or numeric seconds/ms countdown.
 *
 * Severity tiers:
 *   🟢 more than 24h remaining · 🟡 less than 24h · 🟠 less than 1h · 🔴 breached (label prefixed with "+")
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const SLA_PILL_STYLES = {
  ok: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border border-amber-200',
  urgent: 'bg-orange-100 text-orange-700 border border-orange-200',
  breached: 'bg-red-100 text-red-700 border border-red-200',
  none: 'bg-slate-100 text-slate-700 border border-slate-200',
}

const SLA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "16 Jul 2026, 11:27:25 AM" from an epoch-ms number or parseable date string. */
export function formatSlaDeadlineDisplay(deadlineMsOrLike) {
  if (deadlineMsOrLike == null || deadlineMsOrLike === '') return ''
  // Pure-numeric strings are countdown seconds/ms, not an absolute date.
  if (typeof deadlineMsOrLike === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(deadlineMsOrLike.trim())) return ''
  // Small numbers are countdown durations, not epoch-ms timestamps.
  if (typeof deadlineMsOrLike === 'number' && deadlineMsOrLike < 1e12) return ''
  const d = typeof deadlineMsOrLike === 'number' ? new Date(deadlineMsOrLike) : new Date(String(deadlineMsOrLike).trim())
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  return `${d.getDate()} ${SLA_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`
}

/** Compact duration with only the required units: "45m", "12h", "2d 6h", "122d 21h". */
export function formatSlaDuration(ms) {
  const totalSecs = Math.max(0, Math.floor(Math.abs(ms) / 1000))
  const days = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  if (mins > 0) return `${mins}m`
  return `${secs}s`
}

const SLA_EMPTY_META = { label: '—', icon: '', pill: SLA_PILL_STYLES.none, breached: false, deadlineDisplay: '' }

function slaMetaFromRemaining(remainingMs, deadlineMs) {
  const deadlineDisplay = deadlineMs != null ? formatSlaDeadlineDisplay(deadlineMs) : ''
  if (remainingMs <= 0) {
    return {
      label: `+${formatSlaDuration(-remainingMs)}`,
      icon: '🔴',
      pill: SLA_PILL_STYLES.breached,
      breached: true,
      deadlineDisplay,
    }
  }
  const urgent = remainingMs < 60 * 60 * 1000
  const warning = remainingMs < 24 * 60 * 60 * 1000
  return {
    label: `${formatSlaDuration(remainingMs)} left`,
    icon: urgent ? '🟠' : warning ? '🟡' : '🟢',
    pill: urgent ? SLA_PILL_STYLES.urgent : warning ? SLA_PILL_STYLES.warning : SLA_PILL_STYLES.ok,
    breached: false,
    deadlineDisplay,
  }
}

export function computeSlaMeta(rowKey, deadlineLike, nowTick, durationRefMap) {
  const rawStr = String(deadlineLike ?? '').trim()
  const rawNum =
    typeof deadlineLike === 'number'
      ? deadlineLike
      : rawStr && /^[0-9]+(\.[0-9]+)?$/.test(rawStr)
        ? Number(rawStr)
        : null

  const key = rowKey ? String(rowKey) : ''

  if (key && rawNum != null && Number.isFinite(rawNum)) {
    const seconds = rawNum > 100000 ? Math.round(rawNum / 1000) : Math.round(rawNum)
    if (seconds <= 0) return slaMetaFromRemaining(seconds * 1000, nowTick + seconds * 1000)

    if (!durationRefMap.has(key)) {
      durationRefMap.set(key, { startMs: nowTick, initialSeconds: seconds })
    }
    const rec = durationRefMap.get(key)
    if (rec && Math.abs(rec.initialSeconds - seconds) > 2) {
      durationRefMap.set(key, { startMs: nowTick, initialSeconds: seconds })
    }
    const cur = durationRefMap.get(key) || { startMs: nowTick, initialSeconds: seconds }
    const deadlineMs = cur.startMs + cur.initialSeconds * 1000
    return slaMetaFromRemaining(deadlineMs - nowTick, deadlineMs)
  }

  if (!rawStr) return SLA_EMPTY_META
  const d = new Date(rawStr)
  if (Number.isNaN(d.getTime())) return SLA_EMPTY_META

  return slaMetaFromRemaining(d.getTime() - nowTick, d.getTime())
}

function cleanIsoTimestamp(iso) {
  const raw = String(iso || '').trim()
  if (!raw) return ''
  const trimmedMicros = raw.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3})\d+(Z|[+-]\d{2}:\d{2})?$/,
    '$1$2',
  )
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmedMicros)) return trimmedMicros
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(trimmedMicros)) return `${trimmedMicros}Z`
  return trimmedMicros
}

function parseIsoMs(isoLike) {
  const cleaned = cleanIsoTimestamp(isoLike)
  if (!cleaned) return null
  const d = new Date(cleaned)
  const t = d.getTime()
  return Number.isNaN(t) ? null : t
}

const SLA_OUTCOME_WITHIN = {
  label: 'Closed Within SLA',
  icon: '🟢',
  pill: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  withinSla: true,
}
const SLA_OUTCOME_BREACHED = {
  label: 'SLA Breached',
  icon: '🔴',
  pill: 'bg-red-100 text-red-700 border border-red-200',
  withinSla: false,
}

/**
 * SLA outcome meta for a completed lead.
 * - If deadlineLike is numeric seconds/ms remaining, treat >0 as within SLA else breached.
 * - If deadlineLike is a datetime, compare completedAt <= deadline.
 */
export function computeCompletedSlaOutcomeMeta(completedAtLike, deadlineLike) {
  const rawStr = String(deadlineLike ?? '').trim()
  const rawNum =
    typeof deadlineLike === 'number'
      ? deadlineLike
      : rawStr && /^[0-9]+(\.[0-9]+)?$/.test(rawStr)
        ? Number(rawStr)
        : null

  if (rawNum != null && Number.isFinite(rawNum)) {
    const seconds = rawNum > 100000 ? Math.round(rawNum / 1000) : Math.round(rawNum)
    return seconds > 0 ? SLA_OUTCOME_WITHIN : SLA_OUTCOME_BREACHED
  }

  const completedAtMs = parseIsoMs(completedAtLike)
  if (!completedAtMs || !rawStr) return null

  const deadlineMs = parseIsoMs(rawStr)
  if (!deadlineMs) return null

  return completedAtMs <= deadlineMs ? SLA_OUTCOME_WITHIN : SLA_OUTCOME_BREACHED
}

/** Resolve completion timestamp from common Kissflow lead row fields. */
export function resolveLeadCompletedAt(lead) {
  return (
    lead?.completedAt ??
    lead?._completed_at ??
    lead?.Completed_at ??
    lead?.Completed_At ??
    lead?.completed_at ??
    lead?.modifiedAt ??
    lead?._modified_at ??
    lead?.Modified_at ??
    null
  )
}

/** True when lead workflow status is Completed (case/spacing tolerant). */
export function isLeadStatusCompleted(statusLike) {
  const s = String(statusLike || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  return s === 'completed' || s === 'complete'
}

/** 1s ticker + stable countdown refs — use for contract/lead SLA columns. */
export function useSlaDeadlineMeta() {
  const slaDurationRef = useRef(new Map())
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return useCallback(
    (rowKey, deadlineLike) => computeSlaMeta(rowKey ? String(rowKey) : '', deadlineLike, nowTick, slaDurationRef.current),
    [nowTick],
  )
}

export function slaDeadlineTitle(deadlineLike) {
  if (deadlineLike == null || deadlineLike === '') return undefined
  if (typeof deadlineLike === 'number') return undefined
  const s = String(deadlineLike).trim()
  if (!s || /^[0-9]+(\.[0-9]+)?$/.test(s)) return undefined
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return undefined
    return `Deadline: ${d.toLocaleString('en-IN')}`
  } catch {
    return undefined
  }
}
