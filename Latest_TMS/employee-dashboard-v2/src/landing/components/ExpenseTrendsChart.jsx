import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo, useState, useEffect } from 'react'
import { kf } from '../../sdk/index.js'
import {
    customTravelBookingIcon,
    customTravelAdvanceIcon,
    customTravelExpenseIcon,
} from '../../../../raghul_icons/index.js'

const APP_ID = 'Expense_and_Travel_Management_A00'
const PAGE_SIZE = 2000
const MAX_PAGES = 15
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const EXPENSE_REPORT = {
    processId: 'Expense_Management_A03',
    reportId: 'All_Items_MK_A00',
    dateColId: 'Column_gJidmn-kAv',
    amountColId: 'Column_UyJCJpXn5Y',
}

const ADVANCE_REPORT = {
    processId: 'Advance_Payment_Request_Process_A01',
    reportId: 'ALL_ITEMS_WITH_TABLE_A00',
    dateColId: 'Column_RmtnLwNoFB',
    amountColId: 'Column_rMCWa-_7NO',
}

const TRAVEL_REPORT = {
    processId: 'Travel_Management_A02',
    reportId: 'All_Items_A00',
    dateColId: 'Column_nkXmq53c-i',
    bookedAmountColId: 'Column_PQUfwzpDbz',
}

function isTravelBookingBooked(row) {
    const statusRaw = String(row?.['Column_iujlmrkz00'] || row?.['Column_hx4B-_JQjZ'] || '').toLowerCase()
    return statusRaw.includes('booked') || statusRaw.includes('complete') || statusRaw.includes('confirm')
}

function buildListUrl({ accountId, processId, reportId, pageNumber }) {
    const params = new URLSearchParams()
    params.set('_application_id', APP_ID)
    params.set('$status', 'Completed')
    params.set('page_number', String(pageNumber))
    params.set('page_size', String(PAGE_SIZE))
    return `/process-report/2/${accountId}/${processId}/${reportId}?${params.toString()}`
}

function parseAmount(raw) {
    if (raw === null || raw === undefined || raw === '') return 0
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
    if (typeof raw === 'string') {
        const m = raw.match(/-?\d+(\.\d+)?/)
        return m ? Number(m[0]) || 0 : 0
    }
    if (typeof raw === 'object') {
        const v = raw?.value ?? raw?.Value ?? raw?.amount ?? raw?.Amount
        return parseAmount(v)
    }
    return 0
}

function monthIndexFromDate(raw) {
    if (raw === null || raw === undefined || raw === '') return null

    const n = Number(raw)
    if (!Number.isNaN(n) && n >= 1 && n <= 12) return n - 1

    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.getMonth()

    if (typeof raw === 'string' && raw.includes('-')) {
        const parts = raw.split('-')
        if (parts.length === 3) {
            const mm = Number(parts[1])
            if (!Number.isNaN(mm) && mm >= 1 && mm <= 12) return mm - 1
        }
    }

    if (typeof raw === 'string') {
        const idx = MONTHS.findIndex((m) => m.toLowerCase() === raw.trim().slice(0, 3).toLowerCase())
        if (idx >= 0) return idx
    }

    return null
}

async function fetchAllRows({ accountId, processId, reportId }) {
    const all = []
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = buildListUrl({ accountId, processId, reportId, pageNumber: page })
        const resp = await kf.api(url)
        const rows = resp?.Data || []
        if (!rows.length) break
        all.push(...rows)
        if (rows.length < PAGE_SIZE) break
    }
    return all
}

function sumByMonth(rows, dateColId, amountColId) {
    const totals = Array(12).fill(0)
    for (const r of rows) {
        const mi = monthIndexFromDate(r?.[dateColId])
        if (mi === null) continue
        totals[mi] += parseAmount(r?.[amountColId])
    }
    return totals.map((v) => Math.round(v * 100) / 100)
}

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white rounded-xl px-4 py-3 animate-scale-in" style={{ border: '1px solid #f0f0f0', boxShadow: '0 12px 40px rgba(0,0,0,0.12)' }}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{label} 2026</p>
                {payload.map((p) => (
                    <div key={p.dataKey} className="flex items-center gap-2 mb-1 last:mb-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                        <p className="text-xs text-gray-600">
                            {p.name}: <span className="font-bold" style={{ color: p.color }}>₹{p.value.toLocaleString('en-IN')}</span>
                        </p>
                    </div>
                ))}
            </div>
        )
    }
    return null
}

const ranges = [
    { label: 'Last Quarter', months: 3, icon: 'ri-calendar-event-line' },
    { label: 'Last 6 Months', months: 6, icon: 'ri-calendar-2-line' },
    { label: 'This Year', months: 12, icon: 'ri-calendar-check-line' },
]

const series = [
    { key: 'travel', name: 'Travel Booking', color: '#1E88E5', gradId: 'blueGrad', icon: customTravelBookingIcon },
    { key: 'advance', name: 'Travel Advance', color: '#43A047', gradId: 'greenGrad', icon: customTravelAdvanceIcon },
    { key: 'expense', name: 'Travel Expense', color: '#FB8C00', gradId: 'orangeGrad', icon: customTravelExpenseIcon },
]

export default function ExpenseTrendsChart() {
    const [activeRange, setActiveRange] = useState(0)
    const [hidden, setHidden] = useState([])
    const [expenseData, setExpenseData] = useState(Array(12).fill(0))
    const [advanceData, setAdvanceData] = useState(Array(12).fill(0))
    const [travelData, setTravelData] = useState(Array(12).fill(0))
    const userEmail = String(kf?.user?.Email || '').trim().toLowerCase()

    const toggle = (key) => setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

    useEffect(() => {
        const load = async () => {
            const accountId = kf?.account?._id
            if (!accountId) return

            let expTotals = Array(12).fill(0)
            let advTotals = Array(12).fill(0)
            let trvTotals = Array(12).fill(0)

            try {
                const expRows = await fetchAllRows({
                    accountId,
                    processId: EXPENSE_REPORT.processId,
                    reportId: EXPENSE_REPORT.reportId,
                })
                const myExpRows = expRows.filter((r) => String(r?.['Column_OpIELajxeZ'] || '').trim().toLowerCase() === userEmail)
                expTotals = sumByMonth(myExpRows, EXPENSE_REPORT.dateColId, EXPENSE_REPORT.amountColId)
            } catch (e) {
                console.warn('Expense fetch failed, showing zeros:', e)
            }

            try {
                const advRows = await fetchAllRows({
                    accountId,
                    processId: ADVANCE_REPORT.processId,
                    reportId: ADVANCE_REPORT.reportId,
                })
                const myAdvRows = advRows.filter((r) => String(r?.['Column_V1IbWdYHUL'] || '').trim().toLowerCase() === userEmail)
                advTotals = sumByMonth(myAdvRows, ADVANCE_REPORT.dateColId, ADVANCE_REPORT.amountColId)
            } catch (e) {
                console.warn('Advance fetch failed, showing zeros:', e)
            }

            try {
                const trvRows = await fetchAllRows({
                    accountId,
                    processId: TRAVEL_REPORT.processId,
                    reportId: TRAVEL_REPORT.reportId,
                })
                const myTravelRows = trvRows.filter((r) => String(r?.['Column_lc0S2wfw8l'] || '').trim().toLowerCase() === userEmail)
                const bookedTravelRows = myTravelRows.filter(isTravelBookingBooked)
                trvTotals = sumByMonth(
                    bookedTravelRows,
                    TRAVEL_REPORT.dateColId,
                    TRAVEL_REPORT.bookedAmountColId,
                )
            } catch (e) {
                console.warn('Travel fetch failed, showing zeros:', e)
            }

            setExpenseData(expTotals)
            setAdvanceData(advTotals)
            setTravelData(trvTotals)
        }

        load()
        const stopWatching = kf?.context?.watchParams?.(() => {
            load()
        })

        return () => {
            if (typeof stopWatching === 'function') stopWatching()
        }
    }, [])

    const chartData = useMemo(() => {
        const selectedMonths = ranges[activeRange]?.months || 12
        const thisMonth = new Date().getMonth()

        const points = []
        for (let i = selectedMonths - 1; i >= 0; i--) {
            const monthIndex = (thisMonth - i + 12) % 12
            points.push({
                month: MONTHS[monthIndex],
                expense: expenseData[monthIndex] || 0,
                advance: advanceData[monthIndex] || 0,
                travel: travelData[monthIndex] || 0,
            })
        }
        return points
    }, [activeRange, expenseData, advanceData, travelData])

    return (
        <div className="bg-white rounded-lg sm:rounded-2xl p-1.5 sm:p-4 lg:p-5 h-full" style={{ border: '1px solid #f0f0f0', boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-2.5 sm:mb-4">
                <div>
                    <h3 className="text-[10px] sm:text-sm font-bold text-gray-800">Monthly Trends</h3>
                    <p className="text-[8px] sm:text-xs text-gray-400 mt-0.5">Travel Booking · Travel Advance · Travel Expense overview</p>
                </div>
                <div className="w-full overflow-hidden sm:w-auto">
                    <div className="trend-range-tabs flex w-full items-center rounded-xl sm:w-auto">
                    {ranges.map((r, i) => (
                        <button
                            key={r.label}
                            onClick={() => setActiveRange(i)}
                            className={`trend-range-tab ${activeRange === i ? 'is-active' : ''}`}
                        >
                            <i className={r.icon} aria-hidden="true" />
                            <span>{r.label}</span>
                        </button>
                    ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-4 mb-2.5 sm:mb-4">
                {series.map((s) => {
                    const isHidden = hidden.includes(s.key)
                    return (
                        <button
                            key={s.key}
                            onClick={() => toggle(s.key)}
                            className={`trend-series-tab ${isHidden ? 'is-muted' : 'is-active'}`}
                            style={{ '--series-color': s.color }}
                        >
                            <span className="trend-series-icon" aria-hidden="true">
                                <span className="trend-series-glow" />
                                <span className="trend-series-shine" />
                                <img src={s.icon} alt="" />
                            </span>
                            <span>{s.name}</span>
                        </button>
                    )
                })}
            </div>

            <ResponsiveContainer width="100%" height={155}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <defs>
                        {series.map((s) => (
                            <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={s.color} stopOpacity={0.2} />
                                <stop offset="95%" stopColor={s.color} stopOpacity={0.01} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#f0f0f0', strokeWidth: 1 }} />
                    {series.map((s) => (
                        <Area
                            key={s.key}
                            type="monotone"
                            dataKey={s.key}
                            name={s.name}
                            stroke={s.color}
                            strokeWidth={hidden.includes(s.key) ? 0 : 2.5}
                            fill={`url(#${s.gradId})`}
                            fillOpacity={hidden.includes(s.key) ? 0 : 1}
                            dot={false}
                            activeDot={hidden.includes(s.key) ? false : { r: 5, strokeWidth: 2, stroke: '#fff', fill: s.color }}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
