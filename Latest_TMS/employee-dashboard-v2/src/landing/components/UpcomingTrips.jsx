import { useEffect, useMemo, useState } from 'react'
import { kf } from '../../sdk/index.js'

const APP_ID = 'Expense_and_Travel_Management_A00'
const PAGE_SIZE = 2000
const MAX_PAGES = 15
const TRAVEL_PROCESS_KEY = 'Travel_Management_A02'
const TRAVEL_REPORT_ID = 'All_Items_A00'
const EMAIL_COL = 'Column_lc0S2wfw8l'
/** Travel booking city fields (All Items report) */
const FROM_CITY_COL = 'Column_1qX1HxE34f'
const TO_CITY_COL = 'Column_6VWxLVKxdg'
/** Travel booking departure field (All Items report). */
const DEPARTURE_COL = 'Column_T7yk_UT6Hk'
const PER_PAGE = 7
/** Same travel booking popup as employee dashboard (`index.jsx`). */
const TRAVEL_BOOKING_POPUP_ID = 'Popup_rCILSrY8KF'
/** Full list target page (MIS table). */
const TRAVEL_LIST_PAGE_ID = 'Travel_Request_MIS_Table_A00'

/** Same id resolution as `extractPopupIds` in `PendingApprovalsWidget.jsx`. */
function extractTravelPopupIds(row) {
    const firstCtx = Array.isArray(row?._current_context) && row._current_context.length ? row._current_context[0] : null
    const instanceId =
        row?.Column_RzqotquBQV ||
        row?._id ||
        row?.InstanceId ||
        row?.instance_id ||
        ''
    const activityId =
        row?.Column_eFd2LUqnSP ||
        row?._activity_instance_id ||
        row?._context_activity_instance_id ||
        row?._activityInstanceId ||
        row?._activity_id ||
        row?._context_activity_id ||
        firstCtx?._context_activity_instance_id ||
        firstCtx?._context_activity_id ||
        ''

    return {
        instanceId: instanceId ? String(instanceId) : '',
        activityId: activityId ? String(activityId) : '',
    }
}

/** Like `resolveIdsFromListPayload` for travel in PendingApprovalsWidget — report rows often lack activity instance id; myitems maps instance _id → _activity_instance_id. */
function resolveTravelPopupIds(row, instanceActivityMap) {
    const ids = extractTravelPopupIds(row)
    const idFromCols = ids.instanceId
    const idFromRow = row?._id ? String(row._id) : ''
    const instanceId = idFromRow || idFromCols
    let activityId = ids.activityId
    if (!activityId && instanceId) {
        if (idFromRow && instanceActivityMap[idFromRow]) activityId = instanceActivityMap[idFromRow]
        else if (idFromCols && instanceActivityMap[idFromCols]) activityId = instanceActivityMap[idFromCols]
    }
    return { instanceId, activityId }
}

function isTravelBookingBooked(row) {
    const statusRaw = String(row?.['Column_iujlmrkz00'] || row?.['Column_hx4B-_JQjZ'] || '').toLowerCase()
    return statusRaw.includes('booked') || statusRaw.includes('complete') || statusRaw.includes('confirm')
}

function toText(val) {
    if (val === null || val === undefined) return ''
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
    if (typeof val === 'object') {
        return String(val.Name ?? val.name ?? val.Value ?? val.value ?? val.Text ?? val.text ?? '')
    }
    return String(val)
}

function parseTime(raw) {
    if (raw === null || raw === undefined || raw === '') return null
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.getTime()
    if (typeof raw === 'string' && raw.includes('-')) {
        const t = new Date(raw).getTime()
        return Number.isNaN(t) ? null : t
    }
    return null
}

function formatDeparture(dateString) {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '—'
    const day = date.getDate()
    const month = date.toLocaleString('default', { month: 'short' })
    const year = date.getFullYear()

    let dayString = day.toString()
    if (day > 10 && day < 20) {
        dayString += 'th'
    } else {
        const lastDigit = day % 10
        switch (lastDigit) {
            case 1:
                dayString += 'st'
                break
            case 2:
                dayString += 'nd'
                break
            case 3:
                dayString += 'rd'
                break
            default:
                dayString += 'th'
        }
    }
    return `${dayString} ${month} ${year}`
}

/** One line for compact cards: "Wed, 15th Apr 2026" */
function formatDepartureOneLine(dateString) {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '—'
    const shortDay = date.toLocaleString('en-US', { weekday: 'short' })
    return `${shortDay}, ${formatDeparture(dateString)}`
}

function findColumnId(columns, fieldIdCandidates) {
    for (const fid of fieldIdCandidates) {
        const col = columns.find((c) => c?.FieldId === fid)
        if (col?.Id) return col.Id
    }
    const lower = (s) => String(s || '').toLowerCase()
    const byName = columns.find((c) => {
        const n = lower(c?.Name)
        return fieldIdCandidates.some((fid) => lower(fid) === lower(c?.FieldId)) || (n.includes('request') && n.includes('id'))
    })
    return byName?.Id || ''
}

function findDepartureColumnId(columns) {
    const fromFieldIds = [
        'FS_Departure_Date',
        'Column_T7yk_UT6Hk',
        'Departure_date',
        'Departure_Date',
        'Common_from_date',
        'common_departure_date',
        'Date_of_departure',
    ]
    const id = findColumnId(columns, fromFieldIds)
    if (id) return id
    const byLabel = columns.find((c) => {
        const n = String(c?.Name || '').toLowerCase()
        return (n.includes('departure') && n.includes('date')) || n === 'departure'
    })
    return byLabel?.Id || ''
}

async function fetchAllTravelRows(accountId, applicationId, processId) {
    const all = []
    let columns = []
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `/process-report/2/${accountId}/${processId}/${TRAVEL_REPORT_ID}?_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
        const resp = await kf.api(url)
        if (page === 1 && Array.isArray(resp?.Columns)) columns = resp.Columns
        const rows = Array.isArray(resp?.Data) ? resp.Data : []
        if (!rows.length) break
        all.push(...rows)
        if (rows.length < PAGE_SIZE) break
    }
    return { rows: all, columns }
}

export default function UpcomingTrips({ onPopupClosed } = {}) {
    const accountId = useMemo(() => kf?.account?._id, [])
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState([])
    const [pageIndex, setPageIndex] = useState(0)
    const [travelProcessIdResolved, setTravelProcessIdResolved] = useState(TRAVEL_PROCESS_KEY)
    const [travelFallbackActivityId, setTravelFallbackActivityId] = useState('')
    const [travelInstanceActivityMap, setTravelInstanceActivityMap] = useState({})
    const [fieldMap, setFieldMap] = useState({
        from: '',
        to: '',
        departure: '',
        requestId: '',
    })

    useEffect(() => {
        const fetchData = async () => {
            try {
                const applicationId = kf?.app?._id
                const accountId = kf?.account?._id
                if (!applicationId || !accountId) {
                    setLoading(false)
                    return
                }

                let travelProcessId = await kf.app.getVariable('travel_process_id')

                if (!travelProcessId) {
                    const processList = await kf.api(`/flow/2/${accountId}/process?_application_id=${applicationId}`)
                    const travelProcess = (processList || []).find((item) => item?.Name === 'Travel Management')
                    travelProcessId = travelProcess?._id || TRAVEL_PROCESS_KEY
                    if (travelProcessId) await kf.app.setVariable('travel_process_id', travelProcessId)
                }

                setTravelProcessIdResolved(travelProcessId || TRAVEL_PROCESS_KEY)

                const { rows: allRows, columns } = await fetchAllTravelRows(accountId, applicationId, travelProcessId)

                const fromId = findColumnId(columns, ['FS_From_City', 'Column_1qX1HxE34f', 'common_From', 'Common_From', 'Boarding', 'boarding_from']) || FROM_CITY_COL
                const toId = findColumnId(columns, ['FS_To_City', 'Column_6VWxLVKxdg', 'common_To', 'Common_To', 'Destination', 'common_destination']) || TO_CITY_COL
                const reqId = findColumnId(columns, [
                    'Request_ID',
                    'Request_id',
                    'Request_sequence',
                    'Sequence_Number',
                    'Item_Number',
                ])
                const departureId = findDepartureColumnId(columns) || DEPARTURE_COL

                setFieldMap({
                    from: fromId,
                    to: toId,
                    departure: departureId,
                    requestId: reqId,
                })
                const userEmail = String(kf?.user?.Email || '').trim().toLowerCase()

                const startOfToday = new Date()
                startOfToday.setHours(0, 0, 0, 0)
                const todayMs = startOfToday.getTime()

                const bookedMine = allRows.filter((row) => {
                    const rowEmail = String(row?.[EMAIL_COL] || '').trim().toLowerCase()
                    if (userEmail && rowEmail !== userEmail) return false
                    return isTravelBookingBooked(row)
                })

                const withDeparture = bookedMine
                    .map((row) => {
                        const depRaw = row?.[departureId]
                        const t = parseTime(depRaw)
                        return { row, t }
                    })
                    .filter(({ t }) => t !== null && t >= todayMs)
                    .sort((a, b) => a.t - b.t)

                setRows(withDeparture.map(({ row }) => row))
            } catch (error) {
                console.error('Error fetching upcoming trips:', error)
                setRows([])
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    useEffect(() => {
        const loadTravelActivityContext = async () => {
            const applicationId = kf?.app?._id
            if (!accountId || !applicationId || !kf?.api) return
            const processId = travelProcessIdResolved || TRAVEL_PROCESS_KEY
            try {
                const map = {}
                const url = `/process/2/${accountId}/${processId}/pending/activity/count?_application_id=${APP_ID}`
                const resp = await kf.api(url)
                const list = Array.isArray(resp) ? resp : resp?.Data ?? resp?.data ?? []
                const first = Array.isArray(list) ? list.find((x) => x?._id) : null
                setTravelFallbackActivityId(first?._id ? String(first._id) : '')

                if (Array.isArray(list)) {
                    for (const act of list) {
                        const aid = act?._id
                        if (!aid) continue
                        const pendingUrl = `/process/2/${accountId}/${processId}/pending/${aid}?_application_id=${APP_ID}&page_number=1&page_size=${PAGE_SIZE}`
                        const pendingResp = await kf.api(pendingUrl)
                        const pendingRows = pendingResp?.Data || pendingResp?.data || []
                        if (!Array.isArray(pendingRows)) continue
                        for (const r of pendingRows) {
                            const iId = r?._id ? String(r._id) : ''
                            const aInst = r?._activity_instance_id ? String(r._activity_instance_id) : ''
                            if (iId && aInst) map[iId] = aInst
                        }
                    }
                }

                for (let page = 1; page <= MAX_PAGES; page++) {
                    const myItemsUrl = `/process/2/${accountId}/${processId}/myitems?apply_preference=true&skip_aggregation=true&_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
                    const myItemsResp = await kf.api(myItemsUrl)
                    const myItemsRows = myItemsResp?.Data || myItemsResp?.data || []
                    if (!Array.isArray(myItemsRows) || !myItemsRows.length) break
                    for (const item of myItemsRows) {
                        const iId = item?._id ? String(item._id) : ''
                        const aInst = item?._activity_instance_id ? String(item._activity_instance_id) : ''
                        if (iId && aInst && !map[iId]) map[iId] = aInst
                    }
                    if (myItemsRows.length < PAGE_SIZE) break
                }
                setTravelInstanceActivityMap(map)
            } catch (e) {
                console.warn('Upcoming trips: travel activity context fetch failed', e)
                setTravelFallbackActivityId('')
                setTravelInstanceActivityMap({})
            }
        }
        loadTravelActivityContext()
    }, [accountId, travelProcessIdResolved])

    const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE) || 1)

    useEffect(() => {
        setPageIndex((i) => {
            const max = Math.max(0, Math.ceil(rows.length / PER_PAGE) - 1)
            return Math.min(i, max)
        })
    }, [rows.length])

    const visibleRows = useMemo(
        () => rows.slice(pageIndex * PER_PAGE, pageIndex * PER_PAGE + PER_PAGE),
        [rows, pageIndex],
    )

    const showPagination = rows.length > PER_PAGE
    const rangeStart = rows.length === 0 ? 0 : pageIndex * PER_PAGE + 1
    const rangeEnd = Math.min(rows.length, pageIndex * PER_PAGE + PER_PAGE)

    const viewMoreTravels = () => {
        if (!TRAVEL_LIST_PAGE_ID || !kf?.app?.openPage) return
        kf.app.openPage(TRAVEL_LIST_PAGE_ID)
    }

    const openTravelBookingForRow = (row) => {
        if (!TRAVEL_BOOKING_POPUP_ID || !kf?.app?.page?.openPopup) return
        const { instanceId, activityId } = resolveTravelPopupIds(row, travelInstanceActivityMap)
        if (!instanceId) {
            kf?.client?.showInfo?.('Unable to open this trip: missing record id.')
            return
        }
        const activityInstanceId = activityId || ''
        const fallbackActivityId = travelFallbackActivityId
        const resolvedActivityId = activityInstanceId || fallbackActivityId
        if (!resolvedActivityId) {
            kf?.client?.showInfo?.('Unable to open this trip: missing workflow activity context.')
            return
        }
        try {
            try {
                window.__KF_DASH_POPUP_SEQ__ = Number(window.__KF_DASH_POPUP_SEQ__ || 0) + 1
                window.__KF_DASH_POPUP_OPENED_AT__ = Date.now()
            } catch {
                // ignore
            }
            const p = kf.app.page.openPopup(TRAVEL_BOOKING_POPUP_ID, {
                ActivityID: resolvedActivityId,
                InstanceId: instanceId,
                ActivityInstanceId: activityInstanceId || resolvedActivityId,
                ActivityId: resolvedActivityId,
                activityId: resolvedActivityId,
                InstanceID: instanceId,
                instance_id: instanceId,
                activity_instance_id: activityInstanceId || resolvedActivityId,
                width: 960,
                height: 720,
                popupWidth: '960px',
                popupHeight: '720px',
            })
            if (p && typeof p.catch === 'function') {
                p.catch((e) => {
                    console.error('Upcoming trips popup open failed', e)
                    kf?.client?.showInfo?.('Unable to open travel booking.')
                })
            }
            // Parent dashboard refreshes on focus/visibility regain.
            if (typeof onPopupClosed === 'function') setTimeout(() => onPopupClosed(), 1500)
        } catch (e) {
            console.error('Upcoming trips popup open failed', e)
            kf?.client?.showInfo?.('Unable to open travel booking.')
        }
    }

    const getRequestIdDisplay = (item) => {
        const col = fieldMap.requestId
        const v = col ? item?.[col] : null
        let s = toText(v).trim()
        if (!s) s = toText(item?.Column_RzqotquBQV).trim()
        if (s) return s
        const name = item?._name || item?.Name
        if (name) return String(name)
        const id = item?._id
        if (id) return `REQ-${String(id).slice(-8)}`
        return '—'
    }

    return (
        <div
            className="rounded-lg sm:rounded-xl overflow-hidden max-w-full bg-white"
            style={{
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 8px rgba(15, 23, 42, 0.05)',
            }}
        >
            <div className="px-2 sm:px-3 py-1.5 sm:py-2 flex flex-wrap items-start justify-between gap-1.5 border-b">
                <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-tight">My Upcoming Trips</h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 leading-tight">(Booked Trips)</p>
                </div>
                <button
                    type="button"
                    className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded text-sky-700 bg-white border border-sky-200 hover:bg-sky-50 active:scale-[0.98] transition min-h-[26px]"
                    onClick={viewMoreTravels}
                >
                    Full list
                </button>
            </div>

            <div className="px-1.5 sm:px-2 py-1.5">
                {loading ? (
                    <div className="rounded-md border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
                        {[0, 1, 2, 3, 4].map((idx) => (
                            <div key={idx} className="animate-pulse px-2 py-2 flex gap-2 items-center">
                                <div className="w-10 shrink-0 rounded bg-slate-100 h-7" />
                                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                    <div className="h-3 flex-[0_1_28%] rounded bg-slate-50" />
                                    <div className="flex-1 h-px bg-slate-100 min-w-[8px]" />
                                    <div className="h-3 w-24 shrink-0 rounded bg-slate-100" />
                                    <div className="flex-1 h-px bg-slate-100 min-w-[8px]" />
                                    <div className="h-3 flex-[0_1_28%] rounded bg-slate-50" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : visibleRows.length > 0 ? (
                    <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <ul className="divide-y divide-slate-100">
                            {visibleRows.map((item, idx) => {
                                const fromVal = fieldMap.from ? toText(item?.[fieldMap.from]).trim() || '—' : '—'
                                const toVal = fieldMap.to ? toText(item?.[fieldMap.to]).trim() || '—' : '—'
                                const depRaw = item?.[fieldMap.departure]
                                const reqId = getRequestIdDisplay(item)

                                return (
                                    <li
                                        key={item?._id || `${pageIndex}-${idx}`}
                                        className="p-0 animate-fade-in-up"
                                        style={{ animationDelay: `${idx * 30}ms` }}
                                    >
                                        <button
                                            type="button"
                                            className="w-full text-left px-2 py-1.5 sm:py-2 flex gap-2 items-center min-w-0 transition-colors hover:bg-sky-50/90 active:bg-sky-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-inset"
                                            onClick={() => openTravelBookingForRow(item)}
                                            aria-label={`Open travel booking, reference ${reqId}`}
                                        >
                                            <div className="flex items-center justify-center w-[3rem] sm:w-[3.5rem] shrink-0 border-r border-slate-100 pr-1.5">
                                                <span className="inline-flex max-w-full items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-1 py-0.5 text-[8px] sm:text-[9px] font-mono font-semibold text-sky-900 text-center leading-tight break-all line-clamp-3">
                                                    {reqId}
                                                </span>
                                            </div>

                                            <div className="flex-1 min-w-0 flex items-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto">
                                                <span
                                                    className="inline-flex items-center gap-0.5 min-w-0 shrink max-w-[32%] sm:max-w-[34%]"
                                                    title={`From ${fromVal}`}
                                                >
                                                    <i
                                                        className="ri-flight-takeoff-line text-sm text-sky-600 flex-shrink-0"
                                                        aria-hidden
                                                    />
                                                    <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap shrink-0">From</span>
                                                    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-900 truncate min-w-0">
                                                        {fromVal}
                                                    </span>
                                                </span>

                                                <div
                                                    className="flex-1 min-w-[10px] border-t border-dashed border-slate-300 self-center shrink"
                                                    aria-hidden
                                                />

                                                <span
                                                    className="inline-flex items-center gap-0.5 sm:gap-1 shrink-0 px-0.5 min-w-0 max-w-[38%] justify-center"
                                                    title={formatDepartureOneLine(depRaw)}
                                                >
                                                    <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 whitespace-nowrap shrink-0">Departure</span>
                                                    <span className="text-[10px] sm:text-[11px] font-bold tabular-nums text-sky-800 truncate">
                                                        <span className="sm:hidden">{formatDeparture(depRaw)}</span>
                                                        <span className="hidden sm:inline">{formatDepartureOneLine(depRaw)}</span>
                                                    </span>
                                                </span>

                                                <div
                                                    className="flex-1 min-w-[10px] border-t border-dashed border-slate-300 self-center shrink"
                                                    aria-hidden
                                                />

                                                <span
                                                    className="inline-flex items-center gap-0.5 min-w-0 shrink max-w-[32%] sm:max-w-[34%] justify-end"
                                                    title={`To ${toVal}`}
                                                >
                                                    <i
                                                        className="ri-flight-land-line text-sm text-amber-600 flex-shrink-0"
                                                        aria-hidden
                                                    />
                                                    <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap shrink-0">To</span>
                                                    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-900 truncate min-w-0 text-right">
                                                        {toVal}
                                                    </span>
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>

                        {showPagination ? (
                            <div
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-2 py-1.5 border-t border-slate-200 bg-slate-50/60"
                                role="navigation"
                                aria-label="Trip pages"
                            >
                                <p className="text-[10px] sm:text-[11px] text-slate-600 text-center sm:text-left tabular-nums w-full sm:w-auto font-medium">
                                    {rangeStart}–{rangeEnd} of {rows.length}
                                </p>
                                <div className="flex items-center justify-center gap-1 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        className="flex-1 sm:flex-initial min-h-[32px] sm:min-h-[30px] min-w-[40px] px-2 rounded-md text-[10px] sm:text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition"
                                        disabled={pageIndex <= 0}
                                        onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                                        aria-label="Previous page"
                                    >
                                        <span className="sm:hidden">← Prev</span>
                                        <span className="hidden sm:inline">Previous</span>
                                    </button>
                                    <span className="tabular-nums text-[10px] sm:text-[11px] font-bold text-slate-600 px-1.5 min-w-[2.75rem] text-center">
                                        {pageIndex + 1} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className="flex-1 sm:flex-initial min-h-[32px] sm:min-h-[30px] min-w-[40px] px-2 rounded-md text-[10px] sm:text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition"
                                        disabled={pageIndex >= totalPages - 1}
                                        onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                                        aria-label="Next page"
                                    >
                                        <span className="sm:hidden">Next →</span>
                                        <span className="hidden sm:inline">Next</span>
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div
                        className="rounded-lg sm:rounded-xl px-3 py-6 sm:py-8 text-center"
                        style={{
                            border: '1px dashed #cbd5e1',
                            background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)',
                        }}
                    >
                        <div className="mx-auto mb-4 relative w-[100px] h-[88px] sm:w-[120px] sm:h-[100px]">
                            <svg viewBox="0 0 120 100" className="w-full h-full" aria-hidden="true">
                                <defs>
                                    <linearGradient id="utSky" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#e0f2fe" />
                                        <stop offset="100%" stopColor="#f0f9ff" />
                                    </linearGradient>
                                </defs>
                                <ellipse cx="60" cy="78" rx="52" ry="6" fill="#e2e8f0" opacity="0.6" />
                                <rect x="8" y="18" width="104" height="52" rx="10" fill="url(#utSky)" stroke="#bae6fd" strokeWidth="1" />
                                <path d="M8 38h104" stroke="#e0f2fe" strokeWidth="1" />
                                <text x="60" y="32" textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="Inter, Plus Jakarta Sans, system-ui, sans-serif" fontWeight="600">
                                    DEPARTURES
                                </text>
                                <path
                                    d="M28 58 L52 52 L92 58"
                                    fill="none"
                                    stroke="#94a3b8"
                                    strokeWidth="1.5"
                                    strokeDasharray="4 3"
                                    opacity="0.7"
                                />
                                <g transform="translate(52, 44)">
                                    <path
                                        d="M-4 8 L8 4 L10 -2 L14 -2 L12 4 L16 6 L-2 10 Z"
                                        fill="#0284c7"
                                        opacity="0.95"
                                    />
                                </g>
                            </svg>
                        </div>
                        <p className="text-sm sm:text-base font-bold text-slate-800">No upcoming departures</p>
                        <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                            Booked trips with a departure from today onward appear in this list.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
