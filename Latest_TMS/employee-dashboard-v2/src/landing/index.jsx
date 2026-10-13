import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { kf } from './../sdk/index.js'
import { dashboardCardStats } from '../mocks/advances.js'
// import ExpenseTrendsChart from './components/ExpenseTrendsChart.jsx'
// import UpcomingTrips from './components/UpcomingTrips.jsx'
import PendingApprovalsWidget from './components/PendingApprovalsWidget.jsx'
import RecordsPeriodPicker, { getEmptyPeriodState } from './components/RecordsPeriodPicker.jsx'
import {
    flightIcon,
    customTravelBookingIcon,
    customTravelAdvanceIcon,
    customTravelExpenseIcon,
} from '../../../raghul_icons/index.js'

const APP_ID = 'Expense_and_Travel_Management_A00'
const L1_MANAGER_DASHBOARD_PAGE_ID = 'Approver_Dashboard_V2_A00'
const PAGE_SIZE = 2000
const MAX_PAGES = 15

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]

const EXPENSE_REPORT = {
    processId: 'Expense_Management_A03',
    reportId: 'All_Items_MK_A00',
    dateColId: 'Column_msE_PUucAP',
    amountColId: 'Column_Nvns1CPpfI',
}

// Travel Expense (All_Items_MK_A00) – provided ids
const EXPENSE_COL_IDS = {
    currentStep: 'Column_bzLJNkKQZO',
    status: 'Column_nEtxbnvlrc',
    type: 'Column_XcXTxxA4-C',
}

const ADVANCE_REPORT = {
    processId: 'Advance_Payment_Request_Process_A01',
    reportId: 'ALL_ITEMS_WITH_TABLE_A00',
    dateColId: 'Column_RmtnLwNoFB',
    amountColId: 'Column_rMCWa-_7NO',
}

// Popups
const POPUPS = {
    expense: 'Popup_E4xarw8lLE',
    advance: 'Popup_J0C5lIdWCL',
    travel: 'Popup_rCILSrY8KF',
}

const PENDING_COUNT_TABS = [
    {
        key: 'travel',
        processId: 'Travel_Management_A02',
        reportId: 'All_Items_A00',
    },
    {
        key: 'advance',
        processId: 'Advance_Payment_Request_Process_A01',
        reportId: 'ALL_ITEMS_WITH_TABLE_A00',
    },
    {
        key: 'expense',
        processId: 'Expense_Management_A03',
        reportId: 'All_Items_MK_A00',
    },
]

const CARD_FOCUS = {
    'travel-total': { processKey: 'travel', bucket: 'total', label: 'Total requests' },
    'travel-claimed': { processKey: 'travel', bucket: 'claimed', label: 'Booked' },
    'advances-submitted': { processKey: 'advance', bucket: 'submitted', label: 'Submitted' },
    'advances-claimed': { processKey: 'advance', bucket: 'claimed', label: 'Claimed' },
    'expenses-submitted': { processKey: 'expense', bucket: 'submitted', label: 'Submitted' },
    'expenses-claimed': { processKey: 'expense', bucket: 'claimed', label: 'Claimed' },
}

const mainCards = [
    {
        key: 'travel',
        label: 'Travel Booking',
        icon: 'ri-flight-takeoff-line',
        iconAsset: customTravelBookingIcon,
        popupKey: 'travel',
        color: '#1E88E5',
        colorLight: 'rgba(30,136,229,0.12)',
        gradient: 'linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)',
        shadow: 'rgba(30,136,229,0.3)',
        data: dashboardCardStats.travel,
    },
    {
        key: 'advances',
        label: 'Travel Advance',
        icon: 'ri-wallet-3-line',
        iconAsset: customTravelAdvanceIcon,
        popupKey: 'advance',
        color: '#43A047',
        colorLight: 'rgba(67,160,71,0.12)',
        gradient: 'linear-gradient(135deg, #43A047 0%, #66BB6A 100%)',
        shadow: 'rgba(67,160,71,0.3)',
        data: dashboardCardStats.advances,
    },
    {
        key: 'expenses',
        label: 'Travel Expense',
        icon: 'ri-receipt-line',
        iconAsset: customTravelExpenseIcon,
        popupKey: 'expense',
        color: '#FB8C00',
        colorLight: 'rgba(251,140,0,0.12)',
        gradient: 'linear-gradient(135deg, #FB8C00 0%, #FFA726 100%)',
        shadow: 'rgba(251,140,0,0.3)',
        data: dashboardCardStats.expenses,
    },
]

function formatINR(amount) {
    return '₹\u00A0' + amount.toLocaleString('en-IN')
}

const COUNT_UP_MS = 1000

function useCountUp(endValue, duration = COUNT_UP_MS) {
    const [display, setDisplay] = useState(0)
    useEffect(() => {
        const to = Number.isFinite(Number(endValue))
            ? Math.round(Number(endValue))
            : 0
        const from = 0
        const t0 = performance.now()
        let raf = 0
        const easeOutCubic = (t) => 1 - (1 - t) ** 3
        const step = (now) => {
            const t = Math.min(1, (now - t0) / duration)
            setDisplay(Math.round(from + (to - from) * easeOutCubic(t)))
            if (t < 1) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
        return () => cancelAnimationFrame(raf)
    }, [endValue, duration])
    return display
}

function AnimatedINR({ value }) {
    const n = useCountUp(value)
    return formatINR(n)
}

function AnimatedInt({ value }) {
    const n = useCountUp(value)
    return n.toLocaleString('en-IN')
}

function MobileWelcomeCard({
    greetingText,
    userName,
    scope,
    onScopeChange,
    onRefresh,
    teamDisabled,
    createOpen,
    onToggleCreate,
    onCreate,
    period,
    onPeriodChange,
}) {
    return (
        <section className="mobile-welcome" aria-label="Welcome">
            <h1 className="mobile-welcome-title">
                {greetingText}, {userName}
            </h1>
            <div className="mobile-welcome-actions">
                <div className="mobile-welcome-scope" role="group" aria-label="Dashboard scope">
                    {[
                        { id: 'me', label: 'Me', color: '#1E88E5' },
                        { id: 'team', label: 'My team', color: '#43A047' },
                    ].map((opt) => {
                        const restricted = opt.id === 'team' && teamDisabled
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                className={`mobile-welcome-scope-btn${scope === opt.id ? ' is-active' : ''}`}
                                style={{ '--scope-accent': opt.color }}
                                onClick={() => onScopeChange(opt.id)}
                                aria-disabled={restricted}
                                title={restricted ? 'Available for manager roles' : undefined}
                            >
                                {opt.label}
                            </button>
                        )
                    })}
                </div>
                <div className="mobile-welcome-tools">
                    <button
                        type="button"
                        className="mobile-welcome-icon-btn"
                        aria-label="Refresh dashboard"
                        onClick={onRefresh}
                    >
                        <i className="ri-refresh-line" aria-hidden="true" />
                    </button>
                    <RecordsPeriodPicker
                        variant="icon"
                        tone="light"
                        mode={period?.mode}
                        range={period?.range}
                        ranges={period?.ranges}
                        parts={period?.parts}
                        fyStartYear={period?.fyStartYear}
                        summaryLabel={period?.summaryLabel}
                        onChange={onPeriodChange}
                    />
                    <button
                        type="button"
                        className={`mobile-welcome-icon-btn${createOpen ? ' is-open' : ''}`}
                        aria-label={createOpen ? 'Close create menu' : 'Create a new request'}
                        aria-expanded={createOpen}
                        onClick={onToggleCreate}
                    >
                        <i className={`ri-add-line${createOpen ? ' is-open' : ''}`} aria-hidden="true" />
                    </button>
                </div>
            </div>
            {createOpen ? (
                <div className="mobile-welcome-creates" role="menu" aria-label="Create request">
                    {[
                        { key: 'travel', label: 'Travel Booking', color: '#1E88E5' },
                        { key: 'advance', label: 'Travel Advance', color: '#43A047' },
                        { key: 'expense', label: 'Travel Expense', color: '#FB8C00' },
                    ].map((action) => (
                        <button
                            key={action.key}
                            type="button"
                            role="menuitem"
                            className="mobile-welcome-create-item"
                            style={{ '--satellite-accent': action.color }}
                            onClick={() => onCreate?.(action.key)}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </section>
    )
}

export function DefaultLandingComponent() {
    const [actionOpen, setActionOpen] = useState(false)
    const [hoveredSat, setHoveredSat] = useState(null)
    const [isCompactHero, setIsCompactHero] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth <= 860 : false
    )
    const [scope, setScope] = useState('me')
    const [refreshNonce, setRefreshNonce] = useState(0)
    const [cardValues, setCardValues] = useState({
        expenseSubmittedAmount: 0,
        expenseSubmittedCount: 0,
        expenseClaimedAmount: 0,
        expenseClaimedCount: 0,
        advanceSubmittedAmount: 0,
        advanceSubmittedCount: 0,
        advanceClaimedAmount: 0,
        advanceClaimedCount: 0,
        travelSubmittedAmount: 0,
        travelSubmittedCount: 0,
        travelClaimedAmount: 0,
        travelClaimedCount: 0,
    })
    const [cardRecords, setCardRecords] = useState({
        travel: { total: [], submitted: [], claimed: [] },
        advance: { total: [], submitted: [], claimed: [] },
        expense: { total: [], submitted: [], claimed: [] },
    })
    const [pendingCounts, setPendingCounts] = useState({
        expense: 0,
        advance: 0,
        travel: 0,
    })
    const [recordsFocus, setRecordsFocus] = useState(null)
    const [recordsPeriod, setRecordsPeriod] = useState(() => getEmptyPeriodState())
    const recordsSectionRef = useRef(null)
    const recordsPulseTimerRef = useRef(null)
    /** Full user profile includes accurate `Company`; `kf.user.Company` may be empty — overwritten after `/user/2/...` fetch. */
    const [resolvedCompany, setResolvedCompany] = useState(() =>
        String(kf?.user?.Company || '').trim()
    )

    const userName = (kf && kf.user && kf.user.Name) || ''
    const userEmail = String(kf?.user?.Email || '')
        .trim()
        .toLowerCase()
    const accountId = kf?.account?._id
    const userId = String(kf?.user?._id || '').trim()

    const companyDisplayName = resolvedCompany.trim() || 'Refex Group'
    const userCompanyLower = companyDisplayName.toLowerCase()

    /** Venwind vs Refex branding — logos live in `public/` (Vite serves as `/filename.png`). */
    const companyLogoSrc = useMemo(() => {
        const c = userCompanyLower
        if (c === 'venwind refex power limited' || c.includes('venwind')) {
            return 'https://venwindrefex.com/Venwind_Logo_Final.png'
        }
        return 'https://refex.group/uploads/images/general/general/general-general-refexlogo-1770112732644-292185.png'
    }, [userCompanyLower])

    useEffect(() => {
        const media = window.matchMedia('(max-width: 860px)')
        const sync = () => setIsCompactHero(media.matches)
        sync()
        if (media.addEventListener) media.addEventListener('change', sync)
        else media.addListener(sync)
        return () => {
            if (media.removeEventListener) media.removeEventListener('change', sync)
            else media.removeListener(sync)
        }
    }, [])

    useEffect(() => {
        if (!accountId || !userId || typeof kf?.api !== 'function') return
        let cancelled = false
        ;(async () => {
            try {
                const url = `/user/2/${accountId}/${userId}`
                const resp = await kf.api(url, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                })
                const co = String(resp?.Company ?? '').trim()
                if (!cancelled && co) setResolvedCompany(co)
            } catch (e) {
                console.warn(
                    '[employee-dashboard] User profile fetch failed',
                    e
                )
            }
        })()
        return () => {
            cancelled = true
        }
    }, [accountId, userId])
    const appRoles = Array.isArray(kf?.user?.AppRoles)
        ? kf.user.AppRoles
        : Array.isArray(kf?.user?.Roles)
          ? kf.user.Roles
          : Array.isArray(kf?.user?.roles)
            ? kf.user.roles
            : []
    const currentRoleRaw = appRoles[0]
    const currentRoleName =
        typeof currentRoleRaw === 'string'
            ? currentRoleRaw
            : currentRoleRaw && typeof currentRoleRaw === 'object'
              ? currentRoleRaw.Name || currentRoleRaw.name || ''
              : ''
    // Keep both choices visible; team navigation remains role-gated.
    const canViewTeam =
        String(currentRoleName).trim().toLowerCase() !== 'employee'

    const now = new Date()
    const currentDateLabel = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
    const currentDateLabelShort = `${now.toLocaleDateString('en-US', { weekday: 'short' })} ${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'short' })}`
    const hour = now.getHours()
    const greetingText =
        hour < 12
            ? 'Good morning'
            : hour < 17
              ? 'Good afternoon'
              : hour < 21
                ? 'Good evening'
                : 'Good night'
    const totalPending =
        pendingCounts.expense + pendingCounts.advance + pendingCounts.travel

    const toNumber = (value) => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value === 'string') {
            const parsed = Number(
                String(value)
                    .replace(/,/g, '')
                    .replace(/[^\d.-]/g, '')
            )
            return Number.isFinite(parsed) ? parsed : 0
        }
        if (value && typeof value === 'object') {
            const inner =
                value.value ?? value.Value ?? value.amount ?? value.Amount
            return toNumber(inner)
        }
        return 0
    }

    const isMyRow = (row, emailColId) => {
        const rowEmail = String(row?.[emailColId] || '')
            .trim()
            .toLowerCase()
        if (!userEmail) return true
        return rowEmail === userEmail
    }

    useEffect(() => {
        const fetchCardsFromAllItems = async () => {
            try {
                if (!accountId || !kf?.api) return

                const fetchAllRows = async (processId, reportId) => {
                    const allRows = []
                    for (let page = 1; page <= MAX_PAGES; page++) {
                        const url = `/process-report/2/${accountId}/${processId}/${reportId}?_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
                        const resp = await kf.api(url)
                        const rows = Array.isArray(resp?.Data) ? resp.Data : []
                        if (!rows.length) break
                        allRows.push(...rows)
                        if (rows.length < PAGE_SIZE) break
                    }
                    return allRows
                }

                const expenseRows = await fetchAllRows(
                    EXPENSE_REPORT.processId,
                    EXPENSE_REPORT.reportId
                )
                const advanceRows = await fetchAllRows(
                    ADVANCE_REPORT.processId,
                    ADVANCE_REPORT.reportId
                )
                const travelRows = await fetchAllRows(
                    'Travel_Management_A02',
                    'All_Items_A00'
                )

                const expenseSubmittedRows = []
                const expenseClaimedRows = []
                let expenseSubmittedAmount = 0
                let expenseSubmittedCount = 0
                let expenseClaimedAmount = 0
                let expenseClaimedCount = 0
                for (const row of expenseRows) {
                    if (!isMyRow(row, 'Column_OpIELajxeZ')) continue
                    const amount = toNumber(
                        row?.['Column_Nvns1CPpfI'] ??
                            row?.['Column_UyJCJpXn5Y'] ??
                            row?.Total_Claimable_Amount ??
                            row?.['Column_ncznaD0xeN'] ??
                            row?.['Column_U1MuKst0Wc'] ??
                            0
                    )
                    const statusRaw = String(
                        row?.[EXPENSE_COL_IDS.status] || ''
                    )
                        .trim()
                        .toLowerCase()
                    // Employee dashboard rule: Completed => Claimed (only).
                    const isClaimed =
                        statusRaw === 'completed' ||
                        statusRaw.includes('completed')
                    if (isClaimed) {
                        expenseClaimedCount += 1
                        expenseClaimedAmount += amount
                        expenseClaimedRows.push(row)
                    } else {
                        expenseSubmittedCount += 1
                        expenseSubmittedAmount += amount
                        expenseSubmittedRows.push(row)
                    }
                }

                const advanceSubmittedRows = []
                const advanceClaimedRows = []
                let advanceSubmittedAmount = 0
                let advanceSubmittedCount = 0
                let advanceClaimedAmount = 0
                let advanceClaimedCount = 0
                for (const row of advanceRows) {
                    if (!isMyRow(row, 'Column_V1IbWdYHUL')) continue
                    const amount = toNumber(
                        row?.['Column_rMCWa-_7NO'] ?? row?.['Column_t1eY-VJcss']
                    )
                    const statusRaw = String(
                        row?.['Column_p9wbFBO6NA'] ||
                            row?.['Column_PdcYkpz3ei'] ||
                            ''
                    ).toLowerCase()
                    const isClaimed =
                        statusRaw.includes('approve') ||
                        statusRaw.includes('complete') ||
                        statusRaw.includes('paid')
                    if (isClaimed) {
                        advanceClaimedCount += 1
                        advanceClaimedAmount += amount
                        advanceClaimedRows.push(row)
                    } else {
                        advanceSubmittedCount += 1
                        advanceSubmittedAmount += amount
                        advanceSubmittedRows.push(row)
                    }
                }

                const travelSubmittedRows = []
                const travelClaimedRows = []
                let travelSubmittedAmount = 0
                let travelSubmittedCount = 0
                let travelClaimedAmount = 0
                let travelClaimedCount = 0
                for (const row of travelRows) {
                    if (!isMyRow(row, 'Column_lc0S2wfw8l')) continue
                    const statusRaw = String(
                        row?.['Column_iujlmrkz00'] ||
                            row?.['Column_hx4B-_JQjZ'] ||
                            ''
                    ).toLowerCase()
                    const isBooked =
                        statusRaw.includes('booked') ||
                        statusRaw.includes('complete') ||
                        statusRaw.includes('confirm')
                    if (isBooked) {
                        travelClaimedCount += 1
                        travelClaimedAmount += toNumber(
                            row?.['Column_PQUfwzpDbz']
                        )
                        travelClaimedRows.push(row)
                    } else {
                        travelSubmittedCount += 1
                        const submittedAmt = toNumber(
                            row?.['Column_TamP5ek9Lg'] ??
                                row?.['Column_nvRlT5FvRy'] ??
                                row?.['Column_c-kvPWMFjW']
                        )
                        travelSubmittedAmount += submittedAmt
                        travelSubmittedRows.push(row)
                    }
                }

                setCardRecords({
                    travel: {
                        submitted: travelSubmittedRows,
                        claimed: travelClaimedRows,
                        total: [...travelSubmittedRows, ...travelClaimedRows],
                    },
                    advance: {
                        submitted: advanceSubmittedRows,
                        claimed: advanceClaimedRows,
                        total: [...advanceSubmittedRows, ...advanceClaimedRows],
                    },
                    expense: {
                        submitted: expenseSubmittedRows,
                        claimed: expenseClaimedRows,
                        total: [...expenseSubmittedRows, ...expenseClaimedRows],
                    },
                })

                setCardValues({
                    expenseSubmittedAmount,
                    expenseSubmittedCount,
                    expenseClaimedAmount,
                    expenseClaimedCount,
                    advanceSubmittedAmount,
                    advanceSubmittedCount,
                    advanceClaimedAmount,
                    advanceClaimedCount,
                    travelSubmittedAmount,
                    travelSubmittedCount,
                    travelClaimedAmount,
                    travelClaimedCount,
                })
            } catch (error) {
                console.error(
                    'Failed to fetch employee dashboard cards from All Items reports',
                    error
                )
            }
        }

        fetchCardsFromAllItems()
    }, [accountId, userEmail, refreshNonce])

    useEffect(() => {
        const fetchPendingCounts = async () => {
            if (!accountId || !kf?.api) return
            try {
                const next = {}
                for (const t of PENDING_COUNT_TABS) {
                    let count = 0
                    for (let page = 1; page <= MAX_PAGES; page++) {
                        const url = `/process-report/2/${accountId}/${t.processId}/${t.reportId}?_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
                        const resp = await kf.api(url)
                        const rows = Array.isArray(resp?.Data) ? resp.Data : []
                        if (!rows.length) break
                        for (const row of rows) {
                            const include =
                                t.key === 'expense'
                                    ? isMyRow(row, 'Column_OpIELajxeZ')
                                    : t.key === 'advance'
                                      ? isMyRow(row, 'Column_V1IbWdYHUL')
                                      : isMyRow(row, 'Column_lc0S2wfw8l')
                            if (!include) continue
                            const statusRaw =
                                t.key === 'expense'
                                    ? String(
                                          row?.[EXPENSE_COL_IDS.status] || ''
                                      )
                                          .trim()
                                          .toLowerCase()
                                    : t.key === 'advance'
                                      ? String(
                                            row?.['Column_p9wbFBO6NA'] ||
                                                row?.['Column_PdcYkpz3ei'] ||
                                                ''
                                        ).toLowerCase()
                                      : String(
                                            row?.['Column_iujlmrkz00'] ||
                                                row?.['Column_hx4B-_JQjZ'] ||
                                                ''
                                        ).toLowerCase()
                            if (
                                statusRaw &&
                                (statusRaw.includes('reject') ||
                                    statusRaw.includes('cancel') ||
                                    statusRaw.includes('complete') ||
                                    statusRaw.includes('approve') ||
                                    statusRaw.includes('booked') ||
                                    statusRaw.includes('paid'))
                            )
                                continue
                            count += 1
                        }
                        if (rows.length < PAGE_SIZE) break
                    }
                    next[t.key] = count
                }
                setPendingCounts(next)
            } catch (error) {
                console.error('Failed to fetch pending counts', error)
            }
        }

        fetchPendingCounts()
    }, [accountId, userEmail, refreshNonce])

    const refreshAll = () => setRefreshNonce((n) => n + 1)

    const scrollToRecords = useCallback(() => {
        const align = () => {
            const el = recordsSectionRef.current
            if (!el) return
            const root =
                typeof document !== 'undefined'
                    ? document.querySelector('.rootDiv') ||
                      el.closest('[data-scroll-root]') ||
                      null
                    : null
            const offset = 16
            if (root) {
                const top =
                    el.getBoundingClientRect().top -
                    root.getBoundingClientRect().top +
                    root.scrollTop -
                    offset
                root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
                return
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        requestAnimationFrame(() => requestAnimationFrame(align))
    }, [])

    const clearRecordsFocus = useCallback(() => {
        setRecordsFocus(null)
        if (recordsPulseTimerRef.current) {
            clearTimeout(recordsPulseTimerRef.current)
            recordsPulseTimerRef.current = null
        }
    }, [])

    const handleMetricClick = useCallback(
        (focusKey) => {
            const focus = CARD_FOCUS[focusKey]
            if (!focus) return
            if (recordsFocus?.key === focusKey) {
                clearRecordsFocus()
                return
            }
            const token = Date.now()
            const rows = cardRecords?.[focus.processKey]?.[focus.bucket] || []
            setRecordsFocus({
                key: focusKey,
                token,
                pulse: true,
                ...focus,
                rows,
            })
            scrollToRecords()
            if (recordsPulseTimerRef.current) clearTimeout(recordsPulseTimerRef.current)
            recordsPulseTimerRef.current = setTimeout(() => {
                setRecordsFocus((prev) =>
                    prev?.token === token ? { ...prev, pulse: false } : prev,
                )
            }, 2400)
        },
        [cardRecords, clearRecordsFocus, recordsFocus?.key, scrollToRecords],
    )

    useEffect(
        () => () => {
            if (recordsPulseTimerRef.current) clearTimeout(recordsPulseTimerRef.current)
        },
        [],
    )

    useEffect(() => {
        setRecordsFocus((prev) => {
            if (!prev?.processKey || !prev?.bucket) return prev
            const nextRows = cardRecords?.[prev.processKey]?.[prev.bucket]
            if (!Array.isArray(nextRows) || prev.rows === nextRows) return prev
            return { ...prev, rows: nextRows }
        })
    }, [cardRecords])

    const markPopupOpened = () => {
        try {
            window.__KF_DASH_POPUP_SEQ__ =
                Number(window.__KF_DASH_POPUP_SEQ__ || 0) + 1
            window.__KF_DASH_POPUP_OPENED_AT__ = Date.now()
        } catch {
            // ignore
        }
    }

    useEffect(() => {
        const events = kf?.events || kf?.event
        if (!events || typeof events.on !== 'function') return

        const handle = () => refreshAll()
        try {
            events.on('afterTaskSave', handle)
            events.on('afterFormSubmit', handle)
            events.on?.('afterFormSave', handle)
            events.on?.('afterItemSave', handle)
        } catch (e) {
            console.warn('kf events subscription failed', e)
        }

        return () => {
            if (typeof events.off !== 'function') return
            try {
                events.off('afterTaskSave', handle)
                events.off('afterFormSubmit', handle)
                events.off?.('afterFormSave', handle)
                events.off?.('afterItemSave', handle)
            } catch {
                // ignore
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId])

    useEffect(() => {
        let lastHandledSeq = Number(window.__KF_DASH_POPUP_SEQ__ || 0)
        const shouldHandle = () => {
            const seq = Number(window.__KF_DASH_POPUP_SEQ__ || 0)
            const openedAt = Number(window.__KF_DASH_POPUP_OPENED_AT__ || 0)
            if (!seq || seq === lastHandledSeq) return false
            // treat "returning from popup" only if popup was opened recently
            if (!openedAt || Date.now() - openedAt > 10 * 60 * 1000) {
                lastHandledSeq = seq
                return false
            }
            lastHandledSeq = seq
            return true
        }

        const onFocus = () => {
            if (shouldHandle()) refreshAll()
        }
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && shouldHandle())
                refreshAll()
        }

        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVisibility)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const openPopup = (type) => {
        const popupId = POPUPS[type]
        if (!popupId) return
        try {
            markPopupOpened()
            kf.app.page.openPopup(popupId)
            setActionOpen(false)
            setTimeout(refreshAll, 1500)
        } catch (e) {
            console.error('openPopup failed', e)
            return
        }
    }

    const openManagerDashboard = async () => {
        try {
            kf.app.openPage(L1_MANAGER_DASHBOARD_PAGE_ID)
        } catch (e) {
            console.error('Failed to open manager dashboard page', e)
        }
    }

    const handleEmployeeScopeSwitch = async (nextScope) => {
        if (nextScope === 'team' && !canViewTeam) {
            setScope('me')
            kf?.client?.showInfo?.('My Team is available for manager roles.')
            return
        }
        setScope(nextScope)
        if (nextScope === 'team') {
            await openManagerDashboard()
        }
    }

    return (
        <div className="min-h-screen overflow-y-auto bg-gradient-to-b from-[#edf1ff] via-[#f6f8ff] to-[#F3F6FB]">
            <div className="mx-auto max-w-[1800px] space-y-3 p-1.5 pb-6 sm:space-y-4 sm:p-4 lg:space-y-6 lg:p-6">
                <MobileWelcomeCard
                    greetingText={greetingText}
                    userName={userName}
                    scope={scope}
                    onScopeChange={handleEmployeeScopeSwitch}
                    onRefresh={refreshAll}
                    teamDisabled={!canViewTeam}
                    createOpen={actionOpen}
                    onToggleCreate={() => setActionOpen((open) => !open)}
                    onCreate={openPopup}
                    period={recordsPeriod}
                    onPeriodChange={setRecordsPeriod}
                />
                <div
                    className={`travel-hero rounded-xl sm:rounded-2xl relative animate-fade-in-up border border-white/80 ${actionOpen ? 'is-create-open' : ''}`}
                    style={{
                        background:
                            'radial-gradient(circle at 72% 10%, rgba(255,255,255,0.18), transparent 28%), linear-gradient(105deg, #2f87c8 0%, #51a6d8 58%, #7dbfe4 100%)',
                    }}
                >
                    <div className="travel-hero-art" aria-hidden="true">
                        <span className="travel-cloud travel-cloud-one" />
                        <span className="travel-cloud travel-cloud-two" />
                        <span className="travel-cloud travel-cloud-three" />
                        <svg className="travel-flight-path" viewBox="0 0 250 60">
                            <path d="M4 43 C48 4, 82 52, 121 22 S190 12, 222 32" />
                        </svg>
                        <img className="travel-hero-plane" src={flightIcon} alt="" />
                        <span className="travel-hero-quote">“New places.<br />Greater possibilities.”</span>
                    </div>

                    <div className="travel-hero-content relative z-10">
                        <div className="travel-hero-main">
                            <div className="travel-hero-head">
                                <span className="travel-hero-date">
                                    <span className="travel-hero-date-short">{currentDateLabelShort}</span>
                                    <span className="travel-hero-date-long">{currentDateLabel}</span>
                                </span>
                                <div
                                    className="travel-hero-scope travel-hero-scope--bar inline-flex rounded-xl p-0.5 gap-0.5"
                                    style={{
                                        background: 'rgba(0,0,0,0.22)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                    }}
                                    role="group"
                                    aria-label="Dashboard scope"
                                >
                                    {[
                                        { id: 'me', label: 'Me', short: 'Me' },
                                        { id: 'team', label: 'My Team', short: 'Team' },
                                    ].map((opt) => {
                                        const active = scope === opt.id
                                        const restricted = opt.id === 'team' && !canViewTeam
                                        return (
                                            <button
                                                key={`bar-${opt.id}`}
                                                type="button"
                                                onClick={() => handleEmployeeScopeSwitch(opt.id)}
                                                aria-disabled={restricted}
                                                title={restricted ? 'Available for manager roles' : undefined}
                                                className="travel-hero-scope-btn"
                                                style={
                                                    active
                                                        ? {
                                                              background: 'rgba(255,255,255,0.95)',
                                                              color: '#0D1F3C',
                                                              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                          }
                                                        : {
                                                              background: 'transparent',
                                                              color: restricted
                                                                  ? 'rgba(255,255,255,0.46)'
                                                                  : 'rgba(255,255,255,0.78)',
                                                          }
                                                }
                                            >
                                                <span className="travel-hero-scope-short">{opt.short}</span>
                                                <span className="travel-hero-scope-long">
                                                    {opt.id === 'team' ? <>My<br />Team</> : opt.label}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div className="travel-hero-copy">
                            <h1 className="travel-hero-title">
                                <span className="travel-hero-greeting">{greetingText}</span>
                                <span className="travel-hero-name">{userName}! 👋</span>
                            </h1>
                            <p className="travel-hero-company">
                                {companyDisplayName || 'Refex Group'}
                                    {/* You have{' '} */}
                                    {/* <span className="font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(238,106,49,0.35)', color: '#ffc9a0' }}>
                                    {totalPending} pending requests
                                </span>
                                {' '}(
                                <span className="font-semibold" style={{ color: '#9DD4FF' }}>Travel Booking {pendingCounts.travel}</span>,{' '}
                                <span className="font-semibold" style={{ color: '#BFF59A' }}>Travel Advance {pendingCounts.advance}</span>,{' '}
                                <span className="font-semibold" style={{ color: '#FFD2B5' }}>Travel Expense {pendingCounts.expense}</span>
                                ). */}
                            </p>
                            </div>
                        </div>

                        <div className="travel-hero-aside">
                            <div className="travel-hero-period">
                                <RecordsPeriodPicker
                                    variant="icon"
                                    tone="hero"
                                    mode={recordsPeriod.mode}
                                    range={recordsPeriod.range}
                                    ranges={recordsPeriod.ranges}
                                    parts={recordsPeriod.parts}
                                    fyStartYear={recordsPeriod.fyStartYear}
                                    summaryLabel={recordsPeriod.summaryLabel}
                                    onChange={setRecordsPeriod}
                                />
                            </div>
                            {isCompactHero ? (
                                <div className={`create-tray ${actionOpen ? 'is-open' : ''}`}>
                                    <button
                                        type="button"
                                        className="create-tray-toggle"
                                        aria-label={actionOpen ? 'Close create menu' : 'Create a new request'}
                                        aria-expanded={actionOpen}
                                        onClick={() => setActionOpen((open) => !open)}
                                    >
                                        <i className={`ri-add-line ${actionOpen ? 'is-open' : ''}`} aria-hidden="true" />
                                        <span>{actionOpen ? 'Close' : 'New request'}</span>
                                    </button>
                                    {actionOpen ? (
                                        <div className="create-tray-list" role="menu" aria-label="Create request">
                                            {[
                                                { key: 'travel', label: 'Travel Booking', color: '#1E88E5', to: '#42A5F5' },
                                                { key: 'advance', label: 'Travel Advance', color: '#43A047', to: '#66BB6A' },
                                                { key: 'expense', label: 'Travel Expense', color: '#FB8C00', to: '#FFA726' },
                                            ].map((action) => (
                                                <button
                                                    key={action.key}
                                                    type="button"
                                                    role="menuitem"
                                                    className="create-tray-item"
                                                    style={{
                                                        '--satellite-accent': action.color,
                                                        '--satellite-accent-to': action.to,
                                                    }}
                                                    onClick={() => openPopup(action.key)}
                                                >
                                                    {action.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                            <div
                                className={`satellite-create ${actionOpen ? 'is-open' : ''}`}
                                onMouseEnter={() => setActionOpen(true)}
                                onMouseLeave={() => {
                                    setActionOpen(false)
                                    setHoveredSat(null)
                                }}
                            >
                            <div
                                className={`satellite-orbit relative origin-right ${actionOpen ? 'is-open' : ''}`}
                            >
                                <button
                                    onClick={() => openPopup('travel')}
                                    onMouseEnter={() => setHoveredSat(0)}
                                    onMouseLeave={() => setHoveredSat(null)}
                                    className="absolute flex items-center gap-2 cursor-pointer whitespace-nowrap rounded-xl satellite-pill satellite-action"
                                    style={{
                                        '--satellite-accent': '#2879b6',
                                        '--satellite-accent-to': '#3a9ad9',
                                        height: '32px',
                                        padding: '0 12px 0 7px',
                                        top: '43px',
                                        right: '18px',
                                        background:
                                            'linear-gradient(135deg, #2879b6, #3a9ad9)',
                                        boxShadow:
                                            hoveredSat === 0
                                                ? '0 0 0 4px rgba(40,121,182,0.35), 0 0 28px rgba(40,121,182,1)'
                                                : actionOpen
                                                  ? '0 0 0 3px rgba(40,121,182,0.25), 0 0 20px rgba(40,121,182,0.85)'
                                                  : 'none',
                                        transform: actionOpen
                                            ? `translate(-105px, -40px) scale(${hoveredSat === 0 ? 1.1 : 1})`
                                            : 'translate(0px, 0px) scale(0)',
                                        opacity: actionOpen ? 1 : 0,
                                        transition:
                                            'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
                                        transitionDelay: actionOpen
                                            ? '0ms'
                                            : '80ms',
                                        zIndex: hoveredSat === 0 ? 25 : 20,
                                        transformOrigin: 'right center',
                                    }}
                                >
                                    <span className="satellite-action-label">
                                        Travel Booking
                                    </span>
                                </button>

                                <button
                                    onClick={() => openPopup('advance')}
                                    onMouseEnter={() => setHoveredSat(1)}
                                    onMouseLeave={() => setHoveredSat(null)}
                                    className="absolute flex items-center gap-2 cursor-pointer whitespace-nowrap rounded-xl satellite-pill satellite-action"
                                    style={{
                                        '--satellite-accent': '#7dc244',
                                        '--satellite-accent-to': '#a3d96a',
                                        height: '32px',
                                        padding: '0 12px 0 7px',
                                        top: '43px',
                                        right: '18px',
                                        background:
                                            'linear-gradient(135deg, #7dc244, #a3d96a)',
                                        boxShadow:
                                            hoveredSat === 1
                                                ? '0 0 0 4px rgba(125,194,68,0.35), 0 0 28px rgba(125,194,68,1)'
                                                : actionOpen
                                                  ? '0 0 0 3px rgba(125,194,68,0.25), 0 0 20px rgba(125,194,68,0.85)'
                                                  : 'none',
                                        transform: actionOpen
                                            ? `translate(-115px, 0px) scale(${hoveredSat === 1 ? 1.1 : 1})`
                                            : 'translate(0px, 0px) scale(0)',
                                        opacity: actionOpen ? 1 : 0,
                                        transition:
                                            'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
                                        transitionDelay: actionOpen
                                            ? '65ms'
                                            : '45ms',
                                        zIndex: hoveredSat === 1 ? 25 : 20,
                                        transformOrigin: 'right center',
                                    }}
                                >
                                    <span className="satellite-action-label">
                                        Travel Advance
                                    </span>
                                </button>

                                <button
                                    onClick={() => openPopup('expense')}
                                    onMouseEnter={() => setHoveredSat(2)}
                                    onMouseLeave={() => setHoveredSat(null)}
                                    className="absolute flex items-center gap-2 cursor-pointer whitespace-nowrap rounded-xl satellite-pill satellite-action"
                                    style={{
                                        '--satellite-accent': '#ee6a31',
                                        '--satellite-accent-to': '#f5924e',
                                        height: '32px',
                                        padding: '0 12px 0 7px',
                                        top: '43px',
                                        right: '18px',
                                        background:
                                            'linear-gradient(135deg, #ee6a31, #f5924e)',
                                        boxShadow:
                                            hoveredSat === 2
                                                ? '0 0 0 4px rgba(238,106,49,0.35), 0 0 28px rgba(238,106,49,1)'
                                                : actionOpen
                                                  ? '0 0 0 3px rgba(238,106,49,0.25), 0 0 20px rgba(238,106,49,0.85)'
                                                  : 'none',
                                        transform: actionOpen
                                            ? `translate(-105px, 40px) scale(${hoveredSat === 2 ? 1.1 : 1})`
                                            : 'translate(0px, 0px) scale(0)',
                                        opacity: actionOpen ? 1 : 0,
                                        transition:
                                            'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
                                        transitionDelay: actionOpen
                                            ? '130ms'
                                            : '0ms',
                                        zIndex: hoveredSat === 2 ? 25 : 20,
                                        transformOrigin: 'right center',
                                    }}
                                >
                                    <span className="satellite-action-label">
                                        Travel Expense
                                    </span>
                                </button>

                                {actionOpen && (
                                    <span
                                        className="absolute rounded-full pointer-events-none animate-ping-once"
                                        style={{
                                            width: '52px',
                                            height: '52px',
                                            top: '33px',
                                            right: '14px',
                                            border: '1.5px solid rgba(255,255,255,0.4)',
                                        }}
                                    />
                                )}

                                <button
                                    type="button"
                                    className="satellite-hub absolute rounded-full flex items-center justify-center cursor-pointer"
                                    aria-label={actionOpen ? 'Close create menu' : 'Open create menu'}
                                    aria-expanded={actionOpen}
                                    onClick={() => setActionOpen((open) => !open)}
                                    style={{
                                        width: '44px',
                                        height: '44px',
                                        top: '37px',
                                        right: '18px',
                                        background: actionOpen
                                            ? 'rgba(255,255,255,0.30)'
                                            : 'rgba(255,255,255,0.18)',
                                        border: '2px solid rgba(255,255,255,0.38)',
                                        backdropFilter: 'blur(12px)',
                                        boxShadow: actionOpen
                                            ? '0 0 0 7px rgba(255,255,255,0.07), 0 6px 22px rgba(0,0,0,0.28)'
                                            : '0 4px 16px rgba(0,0,0,0.22)',
                                        transition:
                                            'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                                        zIndex: 30,
                                    }}
                                >
                                    <i
                                        className="ri-add-line text-white"
                                        style={{
                                            fontSize: '22px',
                                            display: 'block',
                                            transition:
                                                'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                                            transform: actionOpen
                                                ? 'rotate(135deg)'
                                                : 'rotate(0deg)',
                                        }}
                                    />
                                </button>
                            </div>
                            </div>
                            )}

                            <div
                                className="travel-hero-scope travel-hero-scope--aside inline-flex rounded-xl p-0.5 gap-0.5"
                                style={{
                                    background: 'rgba(0,0,0,0.22)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                }}
                                role="group"
                                aria-label="Dashboard scope"
                            >
                                {[
                                    { id: 'me', label: 'Me', short: 'Me' },
                                    { id: 'team', label: 'My Team', short: 'Team' },
                                ].map((opt) => {
                                    const active = scope === opt.id
                                    const restricted = opt.id === 'team' && !canViewTeam
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => handleEmployeeScopeSwitch(opt.id)}
                                            aria-disabled={restricted}
                                            title={restricted ? 'Available for manager roles' : undefined}
                                            className="travel-hero-scope-btn"
                                            style={
                                                active
                                                    ? {
                                                          background: 'rgba(255,255,255,0.95)',
                                                          color: '#0D1F3C',
                                                          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                      }
                                                    : {
                                                          background: 'transparent',
                                                          color: restricted
                                                              ? 'rgba(255,255,255,0.46)'
                                                              : 'rgba(255,255,255,0.78)',
                                                      }
                                            }
                                        >
                                            <span className="travel-hero-scope-short">{opt.short}</span>
                                            <span className="travel-hero-scope-long">
                                                {opt.id === 'team' ? <>My<br />Team</> : opt.label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 sm:gap-4 lg:gap-5 mb-2.5 sm:mb-6">
                    {mainCards.map((card, idx) =>
                        (() => {
                            const isTravel = card.key === 'travel'
                            const submittedAmount =
                                card.key === 'expenses'
                                    ? cardValues.expenseSubmittedAmount
                                    : card.key === 'advances'
                                      ? cardValues.advanceSubmittedAmount
                                      : cardValues.travelSubmittedAmount
                            const submittedCount =
                                card.key === 'expenses'
                                    ? cardValues.expenseSubmittedCount
                                    : card.key === 'advances'
                                      ? cardValues.advanceSubmittedCount
                                      : cardValues.travelSubmittedCount
                            const claimedAmount =
                                card.key === 'expenses'
                                    ? cardValues.expenseClaimedAmount
                                    : card.key === 'advances'
                                      ? cardValues.advanceClaimedAmount
                                      : cardValues.travelClaimedAmount
                            const claimedCount =
                                card.key === 'expenses'
                                    ? cardValues.expenseClaimedCount
                                    : card.key === 'advances'
                                      ? cardValues.advanceClaimedCount
                                      : cardValues.travelClaimedCount
                            const travelBookingTotalCount = isTravel
                                ? cardValues.travelSubmittedCount +
                                  cardValues.travelClaimedCount
                                : 0
                            const submittedLabel = isTravel
                                ? 'Total'
                                : 'Submitted'
                            const claimedLabel = isTravel ? 'Booked' : 'Claimed'
                            const submittedFocusKey = `${card.key}-${isTravel ? 'total' : 'submitted'}`
                            const claimedFocusKey = `${card.key}-claimed`
                            const submittedActive = recordsFocus?.key === submittedFocusKey
                            const claimedActive = recordsFocus?.key === claimedFocusKey

                            return (
                                <div
                                    key={card.key}
                                    className="employee-kpi-card rounded-lg sm:rounded-2xl card-lift animate-fade-in-up"
                                    style={{
                                        background: '#ffffff',
                                        border: `1px solid ${card.color}26`,
                                        boxShadow: `0 10px 24px ${card.shadow.replace('0.3', '0.14')}`,
                                        animationDelay: `${idx * 90}ms`,
                                        '--kpi-accent': card.color,
                                        '--kpi-soft': card.colorLight,
                                        '--glow-color': card.shadow.replace(
                                            '0.3',
                                            '0.32'
                                        ),
                                    }}
                                >
                                    <div
                                        className="employee-kpi-head px-2 sm:px-5 pt-2 sm:pt-4 pb-1.5 sm:pb-3 flex items-center justify-between"
                                        style={{
                                            borderBottom: '1px solid #E6ECF4',
                                            background: card.colorLight,
                                        }}
                                    >
                                        <div className="flex items-center">
                                            <span
                                                className="font-bold text-[13px] sm:text-sm tracking-normal sm:tracking-wide"
                                                style={{ color: '#101828' }}
                                            >
                                                {card.label}
                                            </span>
                                        </div>
                                        <div className="flex">
                                            <button
                                                type="button"
                                                className="w-9 h-9 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center card-icon"
                                                style={{
                                                    background: '#ffffff',
                                                    border: `1px solid ${card.color}3A`,
                                                }}
                                                aria-label={`Create ${card.label}`}
                                                title={`Create ${card.label}`}
                                                onClick={() => openPopup(card.popupKey)}
                                            >
                                                <span className="card-icon-glow" aria-hidden="true" />
                                                <span className="card-icon-shine" aria-hidden="true" />
                                                <img className="card-icon-image" src={card.iconAsset} alt="" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="employee-kpi-body grid grid-cols-2">
                                        <button
                                            type="button"
                                            className={`employee-kpi-metric px-2 sm:px-5 py-2 sm:py-4 text-left ${submittedActive ? 'is-active' : ''}`}
                                            aria-pressed={submittedActive}
                                            onClick={() => handleMetricClick(submittedFocusKey)}
                                            style={{
                                                borderRight:
                                                    '1px solid #E6ECF4',
                                                background: submittedActive
                                                    ? card.colorLight
                                                    : '#FCFDFE',
                                            }}
                                        >
                                            <div className="flex items-center gap-1 mb-1 sm:mb-2">
                                                <div
                                                    className="w-1.5 h-1.5 rounded-full"
                                                    style={{
                                                        background: card.color,
                                                    }}
                                                />
                                                <span className="text-[#475467] text-[10px] sm:text-xs font-medium uppercase tracking-wide sm:tracking-wider">
                                                    {submittedLabel}
                                                </span>
                                            </div>
                                            {isTravel ? (
                                                <>
                                                    <p className="kpi-amount text-[#101828] text-[15px] sm:text-xl font-bold leading-tight animate-count-up tabular-nums">
                                                        <AnimatedInt
                                                            value={
                                                                travelBookingTotalCount
                                                            }
                                                        />
                                                    </p>
                                                    <div className="mt-1 sm:mt-2 flex items-center gap-1">
                                                        <div
                                                            className="w-3 h-3 sm:w-5 sm:h-5 flex items-center justify-center rounded"
                                                            style={{
                                                                background:
                                                                    card.colorLight,
                                                            }}
                                                        >
                                                            <i
                                                                className="ri-file-list-3-line text-[8px] sm:text-xs"
                                                                style={{
                                                                    color: card.color,
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="text-[#344054] text-[11px] sm:text-xs font-semibold">
                                                            {travelBookingTotalCount ===
                                                            1
                                                                ? 'Request'
                                                                : 'Requests'}
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="kpi-amount text-[#101828] text-[15px] sm:text-xl font-bold leading-tight animate-count-up">
                                                        <AnimatedINR
                                                            value={
                                                                submittedAmount
                                                            }
                                                        />
                                                    </p>
                                                    <p className="kpi-currency text-[#667085] text-[10px] sm:text-xs mt-0.5">
                                                        INR
                                                    </p>
                                                    <div className="mt-1 sm:mt-2 flex items-center gap-1">
                                                        <div
                                                            className="w-3 h-3 sm:w-5 sm:h-5 flex items-center justify-center rounded"
                                                            style={{
                                                                background:
                                                                    card.colorLight,
                                                            }}
                                                        >
                                                            <i
                                                                className="ri-file-list-3-line text-[8px] sm:text-xs"
                                                                style={{
                                                                    color: card.color,
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="text-[#344054] text-[11px] sm:text-xs font-semibold">
                                                            <AnimatedInt
                                                                value={
                                                                    submittedCount
                                                                }
                                                            />{' '}
                                                            Requests
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            className={`employee-kpi-metric px-2 sm:px-5 py-2 sm:py-4 text-left ${claimedActive ? 'is-active' : ''}`}
                                            aria-pressed={claimedActive}
                                            onClick={() => handleMetricClick(claimedFocusKey)}
                                            style={{
                                                background: claimedActive
                                                    ? card.colorLight
                                                    : '#FFFFFF',
                                            }}
                                        >
                                            <div className="flex items-center gap-1 mb-1 sm:mb-2">
                                                <div
                                                    className="w-1.5 h-1.5 rounded-full"
                                                    style={{
                                                        background: card.color,
                                                    }}
                                                />
                                                <span className="text-[#475467] text-[10px] sm:text-xs font-medium uppercase tracking-wide sm:tracking-wider">
                                                    {claimedLabel}
                                                </span>
                                            </div>
                                            <p className="kpi-amount text-[#101828] text-[15px] sm:text-xl font-bold leading-tight animate-count-up">
                                                <AnimatedINR
                                                    value={claimedAmount}
                                                />
                                            </p>
                                            <p className="kpi-currency text-[#667085] text-[10px] sm:text-xs mt-0.5">
                                                INR
                                            </p>
                                            <div className="mt-1 sm:mt-2 flex items-center gap-1">
                                                <div
                                                    className="w-3 h-3 sm:w-5 sm:h-5 flex items-center justify-center rounded"
                                                    style={{
                                                        background:
                                                            card.colorLight,
                                                    }}
                                                >
                                                    <i
                                                        className="ri-checkbox-circle-line text-[8px] sm:text-xs"
                                                        style={{
                                                            color: card.color,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[#344054] text-[11px] sm:text-xs font-semibold">
                                                    <AnimatedInt
                                                        value={claimedCount}
                                                    />{' '}
                                                    {isTravel
                                                        ? claimedCount === 1
                                                            ? 'Request'
                                                            : 'Requests'
                                                        : 'Requests'}
                                                </span>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )
                        })()
                    )}
                </div>

                {/*
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 sm:gap-4 mb-4">
                    <div className="col-span-1 xl:col-span-3 animate-fade-in-up delay-300">
                        <ExpenseTrendsChart key={`trends-${refreshNonce}`} />
                    </div>
                    <div className="col-span-1 xl:col-span-2 animate-fade-in-up delay-400">
                        <UpcomingTrips
                            key={`trips-${refreshNonce}`}
                            onPopupClosed={refreshAll}
                        />
                    </div>
                </div>
                */}

                <div ref={recordsSectionRef} className="animate-fade-in-up delay-500 scroll-mt-4">
                    <PendingApprovalsWidget
                        key={`pending-${refreshNonce}`}
                        onPopupClosed={refreshAll}
                        insightFilter={recordsFocus}
                        onClearInsight={clearRecordsFocus}
                        period={recordsPeriod}
                    />
                </div>
            </div>
        </div>
    )
}
