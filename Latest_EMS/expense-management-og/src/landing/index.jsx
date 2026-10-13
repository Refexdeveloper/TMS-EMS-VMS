import { useEffect, useMemo, useRef, useState } from 'react'
import { kf } from '../sdk/index.js'
import ExpenseTable from './components/ExpenseTable.jsx'
import ExpenseTypeCard from './components/ExpenseTypeCard.jsx'
import { ExpenseHeroArt } from './components/ExpenseGlyphs.jsx'
import { expenseTypeConfig } from './expenseTypeStyles.js'
import {
    expenseSubmittedIcon,
    expensePendingIcon,
    expenseApprovedIcon,
    expenseRejectedIcon,
    expenseDailyAllowanceIcon,
    expenseFoodClaimIcon,
    expenseLocalConveyanceIcon,
} from '../../../expense_icons/index.js'

const NEW_EXPENSE_POPUP_ID = 'Popup_vyIXSXCaRN'
const APP_ID = 'EMS_001_A00'
const EXPENSE_PROCESS_ID = 'Travel_Expense_A00'
const EXPENSE_REPORT_ID = 'All_Items_A02'
const EXPENSE_REPORT_FALLBACK_IDS = ['Travel_Expense_A00_All_Items','All_Items_A02']
const PAGE_SIZE = 2000
const MAX_PAGES = 20
/** Process field: requester email (`Requestor` / creator) — dashboard lists only this user's rows. */
const REQUESTER_EMAIL_COLUMN_ID = 'Column_FHro_zXoJL'
/** Process field `Final_Total_Amount` (Name: Total Amount). */
const FINAL_TOTAL_AMOUNT_COLUMN_ID = 'Column_K0V2X95byW'
/** Legacy total amount column on older reports. */
const LEGACY_TOTAL_AMOUNT_COLUMN_ID = 'Column_UptaH-heVN'
/** Deadlines (UTC / Z from API) shown in IST so wall-clock time matches the business. */
const EXPENSE_DATETIME_DISPLAY_TZ = 'Asia/Kolkata'
const EXPENSE_KPI_VARS = {
    submittedCount: 'total_expense_submitted_count',
    submittedAmount: 'total_expense_submitted_amount',
    pendingCount: 'total_expense_pending_count',
    pendingAmount: 'total_expense_pending_amount',
    approvedCount: 'total_expense_approved_count',
    approvedAmount: 'total_expense_approved_amount',
    rejectedCount: 'total_expense_rejected_count',
    rejectedAmount: 'total_expense_rejected_amount',
}
const COUNT_UP_MS = 1100

function openNewExpensePopup() {
    const client = typeof window !== 'undefined' && window.kf ? window.kf : kf
    if (!client?.app?.page?.openPopup) {
        console.warn('Kissflow SDK not ready')
        return
    }
    try {
        client.app.page.openPopup(NEW_EXPENSE_POPUP_ID, {})
    } catch (e) {
        console.error('openPopup failed', e)
        client.client?.showInfo?.('Unable to open the expense form.')
    }
}

/**
 * Union of workflow `myitems` list segments for the signed-in user (Kissflow role bucket).
 */
const MYITEMS_BUCKET_SEGMENTS = ['', 'inprogress', 'draft', 'completed', 'rejected', 'withdrawn']

async function fetchMyItemsBucketInstanceIds(apiGet, accountId) {
    const ids = new Set()
    const queryCore = `apply_preference=true&skip_aggregation=true&_application_id=${APP_ID}&page_number=`

    for (const segment of MYITEMS_BUCKET_SEGMENTS) {
        const pathBase = `/process/2/${accountId}/${EXPENSE_PROCESS_ID}/myitems${segment ? `/${segment}` : ''}`
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = `${pathBase}?${queryCore}${page}&page_size=${PAGE_SIZE}`
            let resp
            try {
                resp = await apiGet(url)
            } catch {
                break
            }
            const rows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
            for (const item of rows) {
                const id = cellToId(item?._id)
                if (id) ids.add(id)
            }
            if (rows.length < PAGE_SIZE) break
        }
    }
    return ids
}

function expenseKpiVariableName(scope, baseName) {
    return scope === 'team' ? `team_${baseName}` : baseName
}

async function resolveActivityIdFromMyitems(client, instanceId) {
    const accountId = client?.account?._id
    if (!accountId || !instanceId || typeof client?.api !== 'function') return ''

    const apiGet = async (url) => {
        try {
            return await client.api(url)
        } catch {
            const fallbackUrl = url.replace(/([?&])_application_id=[^&]+&?/g, '$1').replace(/[?&]$/, '')
            return await client.api(fallbackUrl)
        }
    }

    const needle = String(instanceId).trim()
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `/process/2/${accountId}/${EXPENSE_PROCESS_ID}/myitems?apply_preference=true&skip_aggregation=true&_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
        let resp
        try {
            resp = await apiGet(url)
        } catch {
            break
        }
        const rows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
        if (!rows.length) break
        const hit = rows.find((r) => String(r?._id || '').trim() === needle)
        if (hit) {
            const aid = firstNonEmptyCellId(
                hit._activity_instance_id,
                hit._context_activity_instance_id,
                hit.activity_instance_id
            )
            if (aid) return aid
        }
        if (rows.length < PAGE_SIZE) break
    }
    return ''
}

/** Opens expense popup with workflow context (same popup as new claim, with instance + activity). */
async function openExpenseRecordPopup(expense) {
    const client = typeof window !== 'undefined' && window.kf ? window.kf : kf
    if (!client?.app?.page?.openPopup) {
        console.warn('Kissflow SDK not ready')
        return
    }
    const instanceId = String(expense?.instanceId || '').trim()
    const activityInstanceId = String(expense?.activityId || '').trim()
    if (!instanceId) {
        console.warn('Expense record popup: missing instance id', { expense })
        client.client?.showInfo?.('Unable to open this record: missing instance id.')
        return
    }

    let resolvedActivityId = activityInstanceId
    if (!resolvedActivityId) {
        resolvedActivityId = await resolveActivityIdFromMyitems(client, instanceId)
    }
    if (!resolvedActivityId) {
        console.warn('Expense record popup: missing activity instance id', { expense, instanceId })
        client.client?.showInfo?.('Unable to open this record: missing activity instance id.')
        return
    }

    try {
        // Same shape as mis-table handleRowClick: instance_id + activity_instance_id from workflow row.
        const popupParams = { instance_id: instanceId }
        const actId = activityInstanceId || resolvedActivityId
        if (actId) popupParams.activity_instance_id = actId
        const p = client.app.page.openPopup(NEW_EXPENSE_POPUP_ID, {
            ...popupParams,
            ActivityID: actId,
            InstanceId: instanceId,
            ActivityInstanceId: actId,
            ActivityId: actId,
            activityId: actId,
            InstanceID: instanceId,
            activity_id: actId,
            width: 960,
            height: 720,
            popupWidth: '960px',
            popupHeight: '720px',
        })
        if (p && typeof p.catch === 'function') {
            p.catch((err) => {
                console.error('openPopup (record) rejected', err)
                client.client?.showInfo?.('Unable to open the expense record.')
            })
        }
    } catch (e) {
        console.error('openPopup (record) failed', e)
        client.client?.showInfo?.('Unable to open the expense record.')
    }
}

function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'string') {
        // Handle currency strings like "133 INR", "1,234.50 USD", etc.
        const cleaned = value.replace(/,/g, '').trim()
        const match = cleaned.match(/-?\d+(\.\d+)?/)
        if (!match) return 0
        const n = Number(match[0])
        return Number.isFinite(n) ? n : 0
    }
    return 0
}

function toText(val) {
    if (val === null || val === undefined) return ''
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
    if (Array.isArray(val)) return val.map((v) => toText(v)).filter(Boolean).join(', ')
    if (typeof val === 'object') return Object.values(val).map((v) => toText(v)).filter(Boolean).join(' ')
    return ''
}

function firstNonEmpty(...values) {
    for (const value of values) {
        const text = toText(value).trim()
        if (text) return text
    }
    return ''
}

/** Normalized requester email for row filter (prefers process column `Column_FHro_zXoJL`). */
function rowRequesterEmailNormalized(row) {
    const raw = firstNonEmpty(
        row?.[REQUESTER_EMAIL_COLUMN_ID],
        row?.['Column_a-8I2k2UHf'],
        row?.['Column_MRYktp6pbh'],
        row?.['Column_Q6XpVIJkx8']
    )
    return String(raw).trim().toLowerCase()
}

/** Per-row grand total: workflow FieldIds, report Column_* ids, then legacy totals. */
function readReportRowFinalTotalNumber(row) {
    const r = row || {}
    if (Object.prototype.hasOwnProperty.call(r, FINAL_TOTAL_AMOUNT_COLUMN_ID)) {
        return toNumber(r[FINAL_TOTAL_AMOUNT_COLUMN_ID])
    }
    if (Object.prototype.hasOwnProperty.call(r, LEGACY_TOTAL_AMOUNT_COLUMN_ID)) {
        return toNumber(r[LEGACY_TOTAL_AMOUNT_COLUMN_ID])
    }
    if (Object.prototype.hasOwnProperty.call(r, 'Total_Claimable_Amount')) {
        return toNumber(r.Total_Claimable_Amount)
    }
    if (Object.prototype.hasOwnProperty.call(r, 'Total_Amount')) {
        return toNumber(r.Total_Amount)
    }
    if (Object.prototype.hasOwnProperty.call(r, 'Column_Nvns1CPpfI')) {
        return toNumber(r['Column_Nvns1CPpfI'])
    }
    return toNumber(r['Column_i5c4mW26zr'] ?? r['Column_UuNsKaDi3w'] ?? 0)
}

/** Report cells are usually strings; Kissflow may return objects for some field types — normalize to one id string. */
function cellToId(val) {
    if (val === null || val === undefined) return ''
    if (typeof val === 'string' || typeof val === 'number') return String(val).trim()
    if (Array.isArray(val)) {
        for (const item of val) {
            const id = cellToId(item)
            if (id) return id
        }
        return ''
    }
    if (typeof val === 'object') {
        const nested = firstNonEmpty(val._id, val.Id, val.id, val.Value, val.value, val.Name)
        if (nested) return String(nested).trim()
        const joined = toText(val).trim()
        return joined && !/\s{2,}/.test(joined) ? joined : ''
    }
    return ''
}

function firstNonEmptyCellId(...values) {
    for (const value of values) {
        const id = cellToId(value)
        if (id) return id
    }
    return ''
}

function extractWorkflowIds(row) {
    // Workflow APIs (myitems / pending) expose _id + _activity_instance_id — same as mis-table row click.
    const instanceId = firstNonEmptyCellId(
        row?._id,
        row?.['Column_91BoCqxdrj'],
        row?.['Column_8XrHEO4X8-'],
        row?.Instance_ID,
        row?.['Column_ZXpYbEPFpE'],
        row?.['Column_OrmP2ePmbO']
    )

    let activityId = firstNonEmptyCellId(
        row?._activity_instance_id,
        row?._context_activity_instance_id,
        row?.['Column_vnB1xmmZpG'],
        row?.['Column_pAA9dvypE0'],
        row?.['Column_-m8SkD6Q3k'],
        row?.Activity_Instance_ID,
        row?.activity_id,
        row?.ActivityId,
        row?.activityInstanceId,
        row?.activity_instance_id
    )

    if (!activityId) {
        const rowObj = row && typeof row === 'object' ? row : {}
        activityId =
            Object.keys(rowObj)
                .filter((k) => /activity.*instance|instance.*activity|activity.?id/i.test(String(k)))
                .map((k) => cellToId(rowObj?.[k]))
                .find(Boolean) || ''
    }

    return { instanceId, activityId }
}

function normalizeStatus(statusRaw) {
    const s = String(statusRaw || '').toLowerCase().replace(/\s+/g, '')
    if (s.includes('reject')) return 'rejected'
    if (s.includes('approve') || s.includes('complete') || s.includes('paid') || s.includes('booked')) return 'approved'
    if (s.includes('inprogress') || s.includes('pending') || s.includes('progress') || s.includes('review') || s.includes('submitted')) {
        return 'pending'
    }
    return 'pending'
}

/** _current_step / Column_6KQUHRHKEZ — plain string or rare object shape from report. */
function extractCurrentStepText(row) {
    const raw = row?.['Column_6KQUHRHKEZ'] ?? row?._current_step ?? row?.Current_step ?? row?.current_step
    if (raw === null || raw === undefined) return ''
    if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim()
    if (typeof raw === 'object') {
        const named = raw.Name ?? raw.name ?? raw.Value ?? raw.value ?? raw.Label ?? raw.label
        if (named != null && typeof named !== 'object') return String(named).trim()
    }
    return toText(raw).trim()
}

function toDateText(value) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

/** Raw value from report DateTime cells (string, epoch, or Kissflow { Value, DisplayValue }). */
function extractDateTimeRaw(value) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'string' || typeof value === 'number') return value
    if (typeof value === 'object') {
        const nested =
            value.Value ??
            value.value ??
            value.DisplayValue ??
            value.displayValue ??
            value.Name ??
            value.name ??
            value._isostring ??
            value._display_value
        if (nested != null && typeof nested !== 'object') return nested
        if (typeof value._year === 'number') {
            const y = value._year
            const mo = value._month ?? 1
            const day = value._date ?? 1
            const h = value._hour ?? 0
            const mi = value._minute ?? 0
            const s = value._second ?? 0
            return new Date(y, mo - 1, day, h, mi, s).toISOString()
        }
    }
    return null
}

let _deadlineDateTimeFormatter
function getDeadlineDisplayFormatter() {
    if (!_deadlineDateTimeFormatter) {
        _deadlineDateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
            timeZone: EXPENSE_DATETIME_DISPLAY_TZ,
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        })
    }
    return _deadlineDateTimeFormatter
}

/** Deadline cell: India wall time (no IST label); 12-hour with uppercase AM/PM. */
function formatDeadlineCell(value) {
    const raw = extractDateTimeRaw(value)
    if (raw == null) return ''
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) {
        if (typeof raw === 'string' && raw.trim()) return raw.trim()
        return toText(value).trim()
    }
    let s = getDeadlineDisplayFormatter().format(d)
    s = s.replace(/\b([ap]m)\b/gi, (_, ap) => ap.toUpperCase())
    s = s.replace(/\s+(?:IST|GMT[+-][\d:]+|UTC)\b/gi, '').trim()
    return s
}

function toDateTimeText(value) {
    return formatDeadlineCell(value)
}

/** Epoch ms for countdown / sorting, from report date or DateTime raw cell. */
function dateRawToMs(raw) {
    if (raw === null || raw === undefined || raw === '') return null
    const extracted = extractDateTimeRaw(raw)
    const candidate = extracted !== null && extracted !== undefined ? extracted : raw
    if (candidate === null || candidate === undefined || candidate === '') return null
    const d = new Date(typeof candidate === 'object' ? toText(candidate) : candidate)
    return Number.isNaN(d.getTime()) ? null : d.getTime()
}

function extractTypeList(rawTypeValue) {
    if (rawTypeValue === null || rawTypeValue === undefined || rawTypeValue === '') return []
    if (Array.isArray(rawTypeValue)) {
        return rawTypeValue.flatMap((v) => extractTypeList(v)).filter(Boolean)
    }
    if (typeof rawTypeValue === 'object') {
        const named =
            rawTypeValue.Name ||
            rawTypeValue.name ||
            rawTypeValue.Label ||
            rawTypeValue.label ||
            rawTypeValue.Value ||
            rawTypeValue.value ||
            rawTypeValue.Text ||
            rawTypeValue.text
        if (named) return extractTypeList(named)
        if (Array.isArray(rawTypeValue.Values) || Array.isArray(rawTypeValue.values)) {
            return extractTypeList(rawTypeValue.Values || rawTypeValue.values)
        }
        return extractTypeList(toText(rawTypeValue))
    }
    const text = String(rawTypeValue).trim()
    if (!text) return []
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
        try {
            return extractTypeList(JSON.parse(text))
        } catch {
            /* fall through and split as text */
        }
    }
    return text
        .split(/[,;|\n]+/)
        .map((x) => x.replace(/^["'\s]+|["'\s]+$/g, '').trim())
        .filter(Boolean)
}

function normalizeTypeKey(typeName) {
    const t = String(typeName || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
    if (!t) return ''
    if (t.includes('food')) return 'food'
    if (t.includes('local') || t.includes('conveyance') || t.includes('taxi') || t.includes('cab')) return 'local'
    if (t.includes('daily') || t.includes('allowance') || t.includes('per diem') || t.includes('perdiem')) return 'allowance'
    return ''
}

function canonicalTypeName(typeName) {
    const key = normalizeTypeKey(typeName)
    if (key === 'food') return 'Food Claim'
    if (key === 'local') return 'Local Conveyance'
    if (key === 'allowance') return 'Daily Allowance'
    return ''
}

function readTypedAmount(row, currentId, legacyId) {
    const current = toNumber(row?.[currentId])
    if (current > 0) return current
    return toNumber(row?.[legacyId])
}

function collectCanonicalTypes(row) {
    const addInto = (target, raw) => {
        for (const token of extractTypeList(raw)) {
            const name = canonicalTypeName(token)
            if (name && !target.includes(name)) target.push(name)
        }
    }

    const fromNamed = []
    addInto(fromNamed, row?.Expense_Type)
    addInto(fromNamed, row?.Expense_Type_1)
    addInto(fromNamed, row?.Expense_Category)
    if (fromNamed.length) return fromNamed

    const fromColumns = []
    addInto(fromColumns, row?.['Column_QvkPQesvWe'])
    addInto(fromColumns, row?.['Column_psPlJl58v_'])
    addInto(fromColumns, row?.['Column_XcXTxxA4-C'])
    addInto(fromColumns, row?.['Column_H3zuOgPyy9'])
    if (fromColumns.length) return fromColumns

    const fromScan = []
    if (row && typeof row === 'object') {
        for (const [key, val] of Object.entries(row)) {
            if (!/(expense.?type|expense.?category|claim.?type)/i.test(key)) continue
            addInto(fromScan, val)
        }
    }
    if (fromScan.length) return fromScan

    const inferred = []
    if (readTypedAmount(row, 'Column__TAcTPEAKs', 'Column_Ou-RDnYBLe') > 0) inferred.push('Food Claim')
    if (readTypedAmount(row, 'Column_xZXMgYqgvI', 'Column_MVAKsLQmBE') > 0) inferred.push('Local Conveyance')
    if (readTypedAmount(row, 'Column_133Ac5B7-c', 'Column_z3v7c3Rof8') > 0) inferred.push('Daily Allowance')
    return inferred
}

function rowHasType(row, normalizedKey) {
    if (!row || !normalizedKey) return false
    if (normalizedKey === 'food') return Boolean(row.hasFoodType)
    if (normalizedKey === 'local') return Boolean(row.hasLocalType)
    if (normalizedKey === 'allowance') return Boolean(row.hasAllowanceType)
    return false
}

function resolveAmountByTypes(row, types) {
    const normalizedKeys = (types || []).map((t) => normalizeTypeKey(t)).filter(Boolean)
    const finalTotalAmount = readReportRowFinalTotalNumber(row)
    const hasCurrentTypeAmountCols =
        Object.prototype.hasOwnProperty.call(row || {}, 'Column__TAcTPEAKs') ||
        Object.prototype.hasOwnProperty.call(row || {}, 'Column_xZXMgYqgvI') ||
        Object.prototype.hasOwnProperty.call(row || {}, 'Column_133Ac5B7-c')

    // IMPORTANT: when current report ids exist, only use those ids.
    // This prevents food/local/daily type totals from accidentally inheriting legacy/total fields.
    const foodAmount = hasCurrentTypeAmountCols
        ? toNumber(row?.['Column__TAcTPEAKs'])
        : toNumber(row?.['Column__TAcTPEAKs'] ?? row?.['Column_Ou-RDnYBLe'])
    const localAmount = hasCurrentTypeAmountCols
        ? toNumber(row?.['Column_xZXMgYqgvI'])
        : toNumber(row?.['Column_xZXMgYqgvI'] ?? row?.['Column_MVAKsLQmBE'])
    const allowanceAmount = hasCurrentTypeAmountCols
        ? toNumber(row?.['Column_133Ac5B7-c'])
        : toNumber(row?.['Column_133Ac5B7-c'] ?? row?.['Column_z3v7c3Rof8'])

    const hasFood = normalizedKeys.includes('food')
    const hasLocal = normalizedKeys.includes('local')
    const hasAllowance = normalizedKeys.includes('allowance')

    // Guard by selected Expense_Type so per-type totals never inherit unrelated amount columns.
    const amountByType = {
        food: hasFood ? foodAmount : 0,
        local: hasLocal ? localAmount : 0,
        allowance: hasAllowance ? allowanceAmount : 0,
    }

    let typedAmount = 0
    if (hasFood) typedAmount += foodAmount
    if (hasLocal) typedAmount += localAmount
    if (hasAllowance) typedAmount += allowanceAmount

    // Prefer Final_Total_Amount when available since it represents per-claim grand total.
    if (finalTotalAmount > 0) return { total: finalTotalAmount, amountByType }
    if (typedAmount > 0) return { total: typedAmount, amountByType }

    // Fallback order when typed amounts are empty/unavailable.
    return {
        total: toNumber(
        row?.['Column_NAu6qx-1qR'] ??
            row?.['Column_22ed2qY-JL'] ??
            row?.['Column_C5TNz-1TDs'] ??
            row?.['Column_5N-Ti7YuZP'] ??
            row?.['Column_ZIkPs2oa51']
        ),
        amountByType,
    }
}

/** Per-request total from `Final_Total_Amount`, then legacy total column, then older numeric fields / typed sum. */
function resolveClaimTotalAmount(row, amountResolved) {
    const r = row || {}
    if (
        Object.prototype.hasOwnProperty.call(r, FINAL_TOTAL_AMOUNT_COLUMN_ID) ||
        Object.prototype.hasOwnProperty.call(r, LEGACY_TOTAL_AMOUNT_COLUMN_ID) ||
        Object.prototype.hasOwnProperty.call(r, 'Total_Claimable_Amount') ||
        Object.prototype.hasOwnProperty.call(r, 'Total_Amount')
    ) {
        return readReportRowFinalTotalNumber(row)
    }
    const fromOlderNumeric = readReportRowFinalTotalNumber(row)
    if (fromOlderNumeric > 0) return fromOlderNumeric
    return toNumber(amountResolved?.total)
}

async function safeSetVariable(name, value) {
    const client = (typeof window !== 'undefined' && window.kf) || kf
    if (!client?.app?.setVariable || !name) return
    try {
        await client.app.setVariable(name, value)
    } catch (e) {
        console.warn(`Unable to set app variable: ${name}`, e)
    }
}

/** My Items status segments — same casing as mis-table `/myitems/{status}`. */
const MYITEMS_API_STATUSES = ['Draft', 'InProgress', 'Completed', 'Rejected', 'Withdrawn']

/** Preference columns for myitems / pending endpoints (mis-table WorkflowStep style). */
const EXPENSE_WORKFLOW_PREFERENCE_COLUMNS = [
    { Id: 'Expense_ID', Model: EXPENSE_PROCESS_ID },
    { Id: 'Expense_Date', Model: EXPENSE_PROCESS_ID },
    { Id: 'Expense_Type', Model: EXPENSE_PROCESS_ID },
    { Id: 'Expense_Category', Model: EXPENSE_PROCESS_ID },
    { Id: 'Total_Claimable_Amount', Model: EXPENSE_PROCESS_ID },
    { Id: 'Total_Amount', Model: EXPENSE_PROCESS_ID },
    { Id: 'Total_Reimbursable_Amount_single', Model: EXPENSE_PROCESS_ID },
    { Id: '_created_by', Model: EXPENSE_PROCESS_ID },
    { Id: '_created_at', Model: EXPENSE_PROCESS_ID },
    { Id: '_modified_at', Model: EXPENSE_PROCESS_ID },
    { Id: '_current_step', Model: EXPENSE_PROCESS_ID },
    { Id: '_current_assigned_to', Model: EXPENSE_PROCESS_ID },
    { Id: '_status', Model: EXPENSE_PROCESS_ID },
    { Id: 'current_step_status', Model: EXPENSE_PROCESS_ID },
    { Id: 'SLA_Deadline', Model: EXPENSE_PROCESS_ID },
]

function normalizeStepsList(resp) {
    return Array.isArray(resp) ? resp : resp?.Data ?? resp?.data ?? []
}

async function postWorkflowStepPreference(apiCall, accountId, viewId) {
    const prefUrl = `/common/2/${accountId}/preference/${EXPENSE_PROCESS_ID}/WorkflowStep/${viewId}/?_application_id=${APP_ID}`
    try {
        await apiCall(prefUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                AppId: EXPENSE_PROCESS_ID,
                ConfigJson: { Columns: EXPENSE_WORKFLOW_PREFERENCE_COLUMNS, Filter: {}, Sort: [] },
                ViewId: viewId,
                ViewType: 'WorkflowStep',
            }),
        })
    } catch (e) {
        console.warn('WorkflowStep preference failed:', viewId, e)
    }
}

async function fetchReportEnrichmentMap(apiGet, accountId) {
    const map = new Map()
    for (const reportId of EXPENSE_REPORT_FALLBACK_IDS) {
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = `/process-report/2/${accountId}/${EXPENSE_PROCESS_ID}/${reportId}?_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
            let resp
            try {
                resp = await apiGet(url)
            } catch {
                break
            }
            const rows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
            if (!rows.length) break
            for (const r of rows) {
                const id = cellToId(r?._id)
                if (id && !map.has(id)) map.set(id, r)
            }
            if (rows.length < PAGE_SIZE) break
        }
        if (map.size) break
    }
    return map
}

function enrichWorkflowRowWithReport(workflowRow, reportRow) {
    if (!reportRow || typeof reportRow !== 'object') return workflowRow
    const next = { ...workflowRow }
    for (const key of Object.keys(reportRow)) {
        if (!key.startsWith('Column_')) continue
        const cur = next[key]
        const fromReport = reportRow[key]
        if ((cur === undefined || cur === null || cur === '') && fromReport != null && fromReport !== '') {
            next[key] = fromReport
        }
    }
    return next
}

/** Me scope — all myitems across workflow statuses (mis-table My Items). */
async function fetchMyItemsRows(apiGet, apiCall, accountId) {
    const allRows = []
    const seen = new Set()

    for (const status of MYITEMS_API_STATUSES) {
        await postWorkflowStepPreference(apiCall, accountId, status)
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = `/process/2/${accountId}/${EXPENSE_PROCESS_ID}/myitems/${status}?page_number=${page}&page_size=${PAGE_SIZE}&apply_preference=true&_application_id=${APP_ID}`
            let resp
            try {
                resp = await apiGet(url)
            } catch {
                break
            }
            const rows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
            if (!rows.length) break
            for (const row of rows) {
                const id = cellToId(row?._id)
                if (!id || seen.has(id)) continue
                seen.add(id)
                allRows.push(row)
            }
            if (rows.length < PAGE_SIZE) break
        }
    }
    return allRows
}

/** My Team scope — pending tasks from all workflow steps (mis-table My Tasks). */
async function fetchPendingTaskRows(apiGet, apiCall, accountId) {
    const allRows = []
    const seen = new Set()
    const countUrl = `/process/2/${accountId}/${EXPENSE_PROCESS_ID}/pending/activity/count?_application_id=${APP_ID}`
    let stepsResp
    try {
        stepsResp = await apiGet(countUrl)
    } catch {
        return allRows
    }
    const steps = normalizeStepsList(stepsResp)

    for (const step of steps) {
        const activityId = cellToId(step?._id)
        if (!activityId) continue

        await postWorkflowStepPreference(apiCall, accountId, activityId)

        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = `/process/2/${accountId}/${EXPENSE_PROCESS_ID}/pending/${activityId}?apply_preference=true&page_number=${page}&page_size=${PAGE_SIZE}&skip_aggregation=true&_application_id=${APP_ID}`
            let resp
            try {
                resp = await apiGet(url)
            } catch {
                break
            }
            const rows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
            if (!rows.length) break
            for (const row of rows) {
                const id = cellToId(row?._id)
                if (!id || seen.has(id)) continue
                seen.add(id)
                allRows.push(row)
            }
            if (rows.length < PAGE_SIZE) break
        }
    }
    return allRows
}

/** Map a workflow or report row into the expense table / KPI shape. */
function mapSourceRowToExpenseItem(row, rowIndex) {
    const { instanceId, activityId } = extractWorkflowIds(row)

    const status = normalizeStatus(
        row?.['Column_nw-IoZqtdq'] ||
            row?.['Column_R_EVlbEjcR'] ||
            row?.['Column_OKfAToBUfv'] ||
            row?.current_step_status ||
            row?._status ||
            ''
    )
    const types = collectCanonicalTypes(row)
    const amountResolved = resolveAmountByTypes(row, types)
    const amount = resolveClaimTotalAmount(row, amountResolved)
    const normalizedTypeKeys = types.map((t) => normalizeTypeKey(t)).filter(Boolean)
    const hasFoodType = normalizedTypeKeys.includes('food')
    const hasLocalType = normalizedTypeKeys.includes('local')
    const hasAllowanceType = normalizedTypeKeys.includes('allowance')

    const foodAmountExact = readTypedAmount(row, 'Column__TAcTPEAKs', 'Column_Ou-RDnYBLe')
    const localAmountExact = readTypedAmount(row, 'Column_xZXMgYqgvI', 'Column_MVAKsLQmBE')
    const allowanceAmountExact = readTypedAmount(row, 'Column_133Ac5B7-c', 'Column_z3v7c3Rof8')
    const strictTypeAmounts = {
        food: hasFoodType ? foodAmountExact : 0,
        local: hasLocalType ? localAmountExact : 0,
        allowance: hasAllowanceType ? allowanceAmountExact : 0,
    }
    const typedSum = strictTypeAmounts.food + strictTypeAmounts.local + strictTypeAmounts.allowance
    const typeCount = [hasFoodType, hasLocalType, hasAllowanceType].filter(Boolean).length
    if (typedSum <= 0 && amount > 0 && typeCount === 1) {
        if (hasFoodType) strictTypeAmounts.food = amount
        if (hasLocalType) strictTypeAmounts.local = amount
        if (hasAllowanceType) strictTypeAmounts.allowance = amount
    }

    const requestorText =
        toText(row?.['Column_96nwf9g2dv']) ||
        toText(row?.['Column_DAnX1xnvAs']?.Name || row?.['Column_DAnX1xnvAs']) ||
        toText(row?.['Column_rCBEwniBuE']) ||
        toText(row?._created_by?.Name || row?._created_by?.Email || row?._created_by) ||
        toText(row?.[REQUESTER_EMAIL_COLUMN_ID]) ||
        toText(row?.['Column_a-8I2k2UHf']) ||
        'Employee'
    const receipt =
        Boolean(row?.['Column_POeXx74WyO']) ||
        Boolean(row?.['Column_M8U_l8Ort_']) ||
        Boolean(row?.['Column_A5HORI8pjz']) ||
        Boolean(row?.['Column_ab_DLweU-1']) ||
        Boolean(row?.['Column_iW335tvGJF'])

    const deadlineRawCell =
        row?.['Column_rHZ784lMPG'] ??
        row?.['Column_KsEgT6_ttR'] ??
        row?.['Column_KD_a7365Yi'] ??
        row?.SLA_Deadline ??
        row?.Deadline ??
        row?.deadline
    const requestedRawForWindow =
        row?.['Column_xc6CvHpPnI'] ??
        row?.['Column_-ELLfNxnxC'] ??
        row?.['Column_C89QfaMa51'] ??
        row?.['Column_gJidmn-kAv'] ??
        row?.Expense_Date ??
        row?._created_at

    const deadlineAtMs = dateRawToMs(deadlineRawCell)
    const windowStartAtMs = dateRawToMs(requestedRawForWindow)
    const listSortMs =
        dateRawToMs(row?._modified_at) ??
        dateRawToMs(row?._created_at) ??
        windowStartAtMs ??
        deadlineAtMs ??
        0

    return {
        id:
            toText(row?.['Column_IgkVjlJE4v']) ||
            toText(row?.['Column_9Y8-uPPDVi']) ||
            toText(row?.['Column_UCS-qeHrKV']) ||
            toText(row?.Expense_ID) ||
            toText(row?._name || row?.Name) ||
            toText(row?._id) ||
            `ROW-${rowIndex + 1}`,
        date: toDateText(
            row?.['Column_fayFfVp5jb'] ||
                row?.['Column_gJidmn-kAv'] ||
                row?.Expense_Date ||
                row?._created_at ||
                row?.['Column_xc6CvHpPnI'] ||
                row?.['Column_-ELLfNxnxC'] ||
                row?.['Column_C89QfaMa51']
        ),
        category: types.join(', ') || '—',
        categories: types,
        description: toText(row?.['Column_rn7J4m2w3z']) || toText(row?.['Column_5Re-T9BNU6']) || 'Expense item',
        amount,
        typeAmounts: strictTypeAmounts,
        foodAmount: strictTypeAmounts.food,
        localAmount: strictTypeAmounts.local,
        allowanceAmount: strictTypeAmounts.allowance,
        hasFoodType,
        hasLocalType,
        hasAllowanceType,
        status,
        receipt,
        employee: requestorText,
        instanceId,
        activityId,
        deadline: toDateTimeText(deadlineRawCell),
        deadlineAtMs,
        windowStartAtMs,
        listSortMs,
        currentStep: extractCurrentStepText(row),
    }
}

/** First app role name — same resolution as employee-dashboard-v2. */
function resolveCurrentRoleName(client) {
    const u = client?.user
    const appRoles = Array.isArray(u?.AppRoles) ? u.AppRoles : Array.isArray(u?.Roles) ? u.Roles : Array.isArray(u?.roles) ? u.roles : []
    const raw = appRoles[0]
    if (typeof raw === 'string') return raw
    if (raw && typeof raw === 'object') return raw.Name || raw.name || ''
    return ''
}

function isEmployeeRole(roleName) {
    return String(roleName || '').trim().toLowerCase() === 'employee'
}

/** Labels for **Me** scope — standard employee view (no role-specific wording). */
const EXPENSE_ROLE_COPY_ME_DEFAULT = {
    summaryApprovedLabel: 'Approved',
    summaryPendingLabel: 'Pending Review',
    showRejectedSummaryCard: true,
    typeApprovedLabel: 'Approved',
    pendingListTitle: 'Overall Pending Request',
}

/** Summary / type-card / list titles by Kissflow app role when **My Team** is selected. */
function resolveExpenseDashboardRoleCopy(roleName) {
    const r = String(roleName || '').trim().toLowerCase()
    const isTreasury = r.includes('treasury') && (r.includes('executive') || r.includes('manager'))
    const isFinanceApprover = r.includes('finance') && r.includes('approver')
    const isFinanceExecutive = r.includes('finance') && r.includes('executive')

    if (isTreasury) {
        return {
            summaryApprovedLabel: 'Paid',
            summaryPendingLabel: 'Pending Payments',
            showRejectedSummaryCard: false,
            typeApprovedLabel: 'Paid',
            pendingListTitle: 'Overall Pending Request',
        }
    }
    if (isFinanceApprover) {
        return {
            summaryApprovedLabel: 'Approved',
            summaryPendingLabel: 'Pending Review',
            showRejectedSummaryCard: true,
            typeApprovedLabel: 'Approved',
            pendingListTitle: 'Overall Pending Approvals',
        }
    }
    if (isFinanceExecutive) {
        return {
            summaryApprovedLabel: 'Validated',
            summaryPendingLabel: 'Pending Review',
            showRejectedSummaryCard: true,
            typeApprovedLabel: 'Validated',
            pendingListTitle: 'Overall Pending Request',
        }
    }
    return { ...EXPENSE_ROLE_COPY_ME_DEFAULT }
}

/** Kissflow page variable: `me` | `team` — use later for report filters / dashboard layout. */
const EXPENSE_DASHBOARD_SCOPE_VAR = 'expense_dashboard_scope'

function formatINR(amount) {
    return `\u20B9${Math.round(toNumber(amount)).toLocaleString('en-IN')}`
}

function useCountUp(endValue, duration = COUNT_UP_MS) {
    const [display, setDisplay] = useState(0)
    const displayRef = useRef(0)

    useEffect(() => {
        const to = Math.round(toNumber(endValue))
        const from = displayRef.current
        let raf = 0
        const t0 = performance.now()
        const easeOutCubic = (t) => 1 - (1 - t) ** 3

        const step = (now) => {
            const t = Math.min(1, (now - t0) / duration)
            const v = from + (to - from) * easeOutCubic(t)
            const rounded = Math.round(v)
            setDisplay(rounded)
            displayRef.current = rounded
            if (t < 1) raf = requestAnimationFrame(step)
            else {
                displayRef.current = to
                setDisplay(to)
            }
        }
        raf = requestAnimationFrame(step)
        return () => cancelAnimationFrame(raf)
    }, [duration, endValue])

    return display
}

function AnimatedInt({ value }) {
    const n = useCountUp(value)
    return n.toLocaleString('en-IN')
}

function AnimatedINR({ value, className, style }) {
    const n = useCountUp(value)
    return (
        <span className={className} style={style}>
            {formatINR(n)}
        </span>
    )
}

function MobileWelcomeCard({
    greetingText,
    userName,
    showTeamScopeToggle,
    expenseDashboardScope,
    onScopeChange,
    onRefresh,
    showCreate,
    createOpen,
    onToggleCreate,
    onCreate,
}) {
    return (
        <section className="mobile-welcome" aria-label="Welcome">
            <h1 className="mobile-welcome-title">
                {greetingText}, {userName}
            </h1>
            <div className="mobile-welcome-actions">
                <div className="mobile-welcome-scope" role="group" aria-label="Expense dashboard scope">
                    {[
                        { id: 'me', label: 'Me', color: '#1E88E5' },
                        { id: 'team', label: 'My team', color: '#43A047' },
                    ].map((opt) => {
                        const restricted = opt.id === 'team' && !showTeamScopeToggle
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                className={`mobile-welcome-scope-btn${expenseDashboardScope === opt.id ? ' is-active' : ''}`}
                                style={{ '--scope-accent': opt.color }}
                                onClick={() => {
                                    if (restricted) return
                                    onScopeChange(opt.id)
                                }}
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
                    {showCreate ? (
                        <button
                            type="button"
                            className={`mobile-welcome-icon-btn${createOpen ? ' is-open' : ''}`}
                            aria-label={createOpen ? 'Close create menu' : 'Create a new expense'}
                            aria-expanded={createOpen}
                            onClick={onToggleCreate}
                        >
                            <i className={`ri-add-line${createOpen ? ' is-open' : ''}`} aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            </div>
            {showCreate && createOpen ? (
                <div className="mobile-welcome-creates" role="menu" aria-label="Create expense">
                    <button
                        type="button"
                        role="menuitem"
                        className="mobile-welcome-create-item"
                        style={{ '--satellite-accent': '#1E88E5' }}
                        onClick={onCreate}
                    >
                        New Expense
                    </button>
                </div>
            ) : null}
        </section>
    )
}

function buildSummaryCards(kpi, roleCopy) {
    const pendingLabel = roleCopy?.summaryPendingLabel ?? 'Pending Review'
    const approvedLabel = roleCopy?.summaryApprovedLabel ?? 'Approved'
    const showRejected = roleCopy?.showRejectedSummaryCard !== false

    const cards = [
        {
            key: 'submitted',
            label: 'Total Submitted',
            hint: 'All expense claims',
            amount: kpi.submittedAmount,
            count: kpi.submittedCount,
            iconSrc: expenseSubmittedIcon,
            from: '#f0f7ff',
            border: 'rgba(30, 136, 229, 0.2)',
            accentRaw: '#1E88E5',
        },
        {
            key: 'pending',
            label: pendingLabel,
            hint: 'Requires your attention',
            amount: kpi.pendingAmount,
            count: kpi.pendingCount,
            iconSrc: expensePendingIcon,
            from: '#fffbeb',
            border: 'rgba(251, 140, 0, 0.22)',
            accentRaw: '#FB8C00',
        },
        {
            key: 'approved',
            label: approvedLabel,
            hint: 'Cleared for payout',
            amount: kpi.approvedAmount,
            count: kpi.approvedCount,
            iconSrc: expenseApprovedIcon,
            from: '#ecf8f0',
            border: 'rgba(67, 160, 71, 0.2)',
            accentRaw: '#43A047',
        },
    ]
    if (showRejected) {
        cards.push({
            key: 'rejected',
            label: 'Rejected',
            hint: 'Needs resubmission',
            amount: kpi.rejectedAmount,
            count: kpi.rejectedCount,
            iconSrc: expenseRejectedIcon,
            from: '#fef2f2',
            border: 'rgba(229, 57, 53, 0.2)',
            accentRaw: '#E53935',
        })
    }
    return cards
}

/** Map expense type normalized key -> custom icon image src from expense_icons */
const EXPENSE_TYPE_ICON_MAP = {
    allowance: expenseDailyAllowanceIcon,
    food: expenseFoodClaimIcon,
    local: expenseLocalConveyanceIcon,
}

export function DefaultLandingComponent() {
    const [searchQuery, setSearchQuery] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [activeTypeFilter, setActiveTypeFilter] = useState(null)
    const [kpi, setKpi] = useState({
        submittedCount: 0,
        submittedAmount: 0,
        pendingCount: 0,
        pendingAmount: 0,
        approvedCount: 0,
        approvedAmount: 0,
        rejectedCount: 0,
        rejectedAmount: 0,
    })
    const [liveExpenseList, setLiveExpenseList] = useState([])
    const [dataError, setDataError] = useState('')
    /** `me` = personal view (show New Expense); `team` = manager view (hide New Expense). */
    const [expenseDashboardScope, setExpenseDashboardScope] = useState('me')
    const [recordsFocus, setRecordsFocus] = useState(null)
    const [refreshNonce, setRefreshNonce] = useState(0)
    const [createOpen, setCreateOpen] = useState(false)
    const dashboardFetchSeqRef = useRef(0)
    const recordsSectionRef = useRef(null)
    const recordsPulseTimerRef = useRef(null)
    const typeCards = useMemo(() => {
        return expenseTypeConfig.map((base) => {
            const normalizedKey = normalizeTypeKey(base.type)
            const rowsForType = liveExpenseList.filter((r) => rowHasType(r, normalizedKey))
            const totalForType = rowsForType.reduce((s, r) => s + toNumber(r?.typeAmounts?.[normalizedKey]), 0)
            return {
                ...base,
                iconSrc: EXPENSE_TYPE_ICON_MAP[normalizedKey],
                policyLabel: 'Live',
                policyNote: 'Live data from workflow APIs',
                monthlyLimit: Math.max(1, totalForType),
                usedAmount: totalForType,
            }
        })
    }, [liveExpenseList])

    useEffect(() => {
        const seq = ++dashboardFetchSeqRef.current
        const scopeTeam = expenseDashboardScope === 'team'

        const fetchKpi = async () => {
            const client = (typeof window !== 'undefined' && window.kf) || kf
            if (!client?.api || !client?.app?.setVariable) return
            try {
                setDataError('')
                const accountId = client?.account?._id
                if (!accountId) return

                // Do not block KPI loading if a variable is unavailable.
                await safeSetVariable('User_email_ID', client?.user?.Email || '')
                await safeSetVariable('expense_process_id', EXPENSE_PROCESS_ID)

                const apiCall = async (url, options) => {
                    try {
                        return await client.api(url, options)
                    } catch {
                        const fallbackUrl = url.replace(/([?&])_application_id=[^&]+&?/g, '$1').replace(/[?&]$/, '')
                        return await client.api(fallbackUrl, options)
                    }
                }
                const apiGet = (url) => apiCall(url)

                let submittedCount = 0
                let submittedAmount = 0
                let pendingCount = 0
                let pendingAmount = 0
                let approvedCount = 0
                let approvedAmount = 0
                let rejectedCount = 0
                let rejectedAmount = 0
                const mappedRows = []

                // Me -> myitems (mis-table My Items). My Team -> pending/mytasks (mis-table My Tasks).
                const workflowRows = scopeTeam
                    ? await fetchPendingTaskRows(apiGet, apiCall, accountId)
                    : await fetchMyItemsRows(apiGet, apiCall, accountId)

                const reportMap = await fetchReportEnrichmentMap(apiGet, accountId)

                if (!workflowRows.length) {
                    setDataError(
                        scopeTeam
                            ? 'No pending tasks found for your role. Check pending/activity/count and workflow step assignment.'
                            : 'No items found in myitems. Submit an expense or check myitems/status/count.'
                    )
                } else {
                    setDataError('')
                }

                for (let i = 0; i < workflowRows.length; i++) {
                    const rawRow = workflowRows[i]
                    const instanceKey = cellToId(rawRow?._id)
                    const reportRow = instanceKey ? reportMap.get(instanceKey) : null
                    const row = enrichWorkflowRowWithReport(rawRow, reportRow)
                    const item = mapSourceRowToExpenseItem(row, i)
                    const amount = toNumber(item.amount)

                    submittedCount += 1
                    submittedAmount += amount
                    if (item.status === 'approved') {
                        approvedCount += 1
                        approvedAmount += amount
                    } else if (item.status === 'rejected') {
                        rejectedCount += 1
                        rejectedAmount += amount
                    } else {
                        pendingCount += 1
                        pendingAmount += amount
                    }
                    mappedRows.push(item)
                }

                // Keep submitted totals consistent with the same filtered live rows used in list/cards.
                submittedCount = pendingCount + approvedCount + rejectedCount
                submittedAmount = pendingAmount + approvedAmount + rejectedAmount

                mappedRows.sort((a, b) => {
                    const now = Date.now()
                    const rawA = a?.deadlineAtMs > 0 ? a.deadlineAtMs : 0
                    const rawB = b?.deadlineAtMs > 0 ? b.deadlineAtMs : 0
                    const breachedA = rawA > 0 && rawA < now
                    const breachedB = rawB > 0 && rawB < now
                    if (breachedA !== breachedB) return breachedA ? 1 : -1
                    if (breachedA && breachedB) return (b.listSortMs || 0) - (a.listSortMs || 0)
                    const na = rawA > 0 ? rawA : Number.POSITIVE_INFINITY
                    const nb = rawB > 0 ? rawB : Number.POSITIVE_INFINITY
                    if (na !== nb) return na - nb
                    return (b.listSortMs || 0) - (a.listSortMs || 0)
                })

                const next = {
                    submittedCount: Math.round(submittedCount),
                    submittedAmount: Math.round(submittedAmount),
                    pendingCount: Math.round(pendingCount),
                    pendingAmount: Math.round(pendingAmount),
                    approvedCount: Math.round(approvedCount),
                    approvedAmount: Math.round(approvedAmount),
                    rejectedCount: Math.round(rejectedCount),
                    rejectedAmount: Math.round(rejectedAmount),
                }

                const kpiScope = scopeTeam ? 'team' : 'me'
                await Promise.all([
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.submittedCount), next.submittedCount),
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.submittedAmount), next.submittedAmount),
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.pendingCount), next.pendingCount),
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.pendingAmount), next.pendingAmount),
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.approvedCount), next.approvedCount),
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.approvedAmount), next.approvedAmount),
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.rejectedCount), next.rejectedCount),
                    safeSetVariable(expenseKpiVariableName(kpiScope, EXPENSE_KPI_VARS.rejectedAmount), next.rejectedAmount),
                ])

                if (seq !== dashboardFetchSeqRef.current) return
                setKpi(next)
                setLiveExpenseList(mappedRows)
            } catch (error) {
                console.error('Failed to fetch expense dashboard data', error)
                if (seq === dashboardFetchSeqRef.current) {
                    setDataError(error?.message || 'Failed to fetch live data from workflow APIs')
                }
            }
        }
        fetchKpi()
    }, [expenseDashboardScope, refreshNonce])

    useEffect(() => {
        void safeSetVariable(EXPENSE_DASHBOARD_SCOPE_VAR, expenseDashboardScope)
    }, [expenseDashboardScope])

    const roleClient = typeof window !== 'undefined' && window.kf ? window.kf : kf
    const currentRoleNameResolved = resolveCurrentRoleName(roleClient)
    const expenseRoleCopy = useMemo(() => {
        if (expenseDashboardScope !== 'team') return EXPENSE_ROLE_COPY_ME_DEFAULT
        return resolveExpenseDashboardRoleCopy(currentRoleNameResolved)
    }, [expenseDashboardScope, currentRoleNameResolved])
    const summaryCardItems = useMemo(() => buildSummaryCards(kpi, expenseRoleCopy), [kpi, expenseRoleCopy])

    const handleTypeCardSelect = (type) => {
        const next = activeTypeFilter === type ? null : type
        setActiveTypeFilter(next)
        setCategoryFilter(next ?? 'all')
        setRecordsFocus(null)
    }

    const scrollToRecords = () => {
        const align = () => {
            const el = recordsSectionRef.current
            if (!el) return
            const root = typeof document !== 'undefined' ? document.querySelector('.rootDiv') || null : null
            const offset = 16
            if (root) {
                const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - offset
                root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
                return
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        requestAnimationFrame(() => requestAnimationFrame(align))
    }

    const handleSummarySelect = (focusKey) => {
        if (recordsFocus?.key === focusKey) {
            setRecordsFocus(null)
            return
        }
        const token = Date.now()
        setRecordsFocus({ key: focusKey, token, pulse: true })
        scrollToRecords()
        if (recordsPulseTimerRef.current) clearTimeout(recordsPulseTimerRef.current)
        recordsPulseTimerRef.current = setTimeout(() => {
            setRecordsFocus((prev) => (prev?.token === token ? { ...prev, pulse: false } : prev))
        }, 2400)
    }

    useEffect(
        () => () => {
            if (recordsPulseTimerRef.current) clearTimeout(recordsPulseTimerRef.current)
        },
        [],
    )

    const tableStatusFilter = recordsFocus?.key && recordsFocus.key !== 'submitted' ? recordsFocus.key : null

    const userName = (kf && kf.user && kf.user.Name) || ''
    const showTeamScopeToggle = !isEmployeeRole(currentRoleNameResolved)
    const now = new Date()
    const currentDateLabel = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
    const hour = now.getHours()
    const greetingText = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'

    return (
        <div className="min-h-screen bg-gray-50 overflow-y-auto">
            <div className="p-1.5 pb-6 sm:p-4 lg:p-6">
            <MobileWelcomeCard
                greetingText={greetingText}
                userName={userName}
                showTeamScopeToggle={showTeamScopeToggle}
                expenseDashboardScope={expenseDashboardScope}
                onScopeChange={setExpenseDashboardScope}
                onRefresh={() => setRefreshNonce((n) => n + 1)}
                showCreate={!showTeamScopeToggle || expenseDashboardScope === 'me'}
                createOpen={createOpen}
                onToggleCreate={() => setCreateOpen((open) => !open)}
                onCreate={() => {
                    setCreateOpen(false)
                    openNewExpensePopup()
                }}
            />
            {/* Hero Banner — matches approvers-dashboard-v2 design */}
            <div
                className="expense-hero rounded-xl sm:rounded-2xl mb-2.5 sm:mb-6 relative animate-fade-in-up border border-white/80"
                style={{ background: 'radial-gradient(circle at 72% 10%, rgba(255,255,255,0.18), transparent 28%), linear-gradient(105deg, #2f87c8 0%, #51a6d8 58%, #7dbfe4 100%)' }}
            >
                <div className="expense-hero-art" aria-hidden="true">
                    <span className="expense-hero-cloud expense-hero-cloud-one" />
                    <span className="expense-hero-cloud expense-hero-cloud-two" />
                    <span className="expense-hero-cloud expense-hero-cloud-three" />
                    <svg className="expense-hero-coin-trail" viewBox="0 0 250 60">
                        <path d="M4 43 C48 4, 82 52, 121 22 S190 12, 222 32" />
                    </svg>
                    <ExpenseHeroArt />
                </div>

                <div className="expense-hero-content relative z-10">
                    <div className="expense-hero-main">
                        <div className="expense-hero-head">
                            <span className="expense-hero-date">
                                <span className="expense-hero-date-short">{now.toLocaleDateString('en-US', { weekday: 'short' })} {now.getDate()} {now.toLocaleDateString('en-US', { month: 'short' })}</span>
                                <span className="expense-hero-date-long">{currentDateLabel}</span>
                            </span>
                            {showTeamScopeToggle && (
                                <div
                                    className="expense-hero-scope expense-hero-scope--bar inline-flex flex-shrink-0 gap-0.5 rounded-xl p-0.5"
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)' }}
                                    role="group"
                                    aria-label="Expense dashboard scope"
                                >
                                    {[
                                        { id: 'me', label: 'Me', short: 'Me' },
                                        { id: 'team', label: 'My Team', short: 'Team' },
                                    ].map((opt) => {
                                        const active = expenseDashboardScope === opt.id
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setExpenseDashboardScope(opt.id)}
                                                className="expense-hero-scope-btn"
                                                style={
                                                    active
                                                        ? { background: 'rgba(255,255,255,0.95)', color: '#0D1F3C', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }
                                                        : { background: 'transparent', color: 'rgba(255,255,255,0.75)' }
                                                }
                                            >
                                                <span className="expense-hero-scope-short">{opt.short}</span>
                                                <span className="expense-hero-scope-long">
                                                    {opt.id === 'team' ? <>My<br />Team</> : opt.label}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="expense-hero-copy">
                            <h1 className="expense-hero-title">
                                <span className="expense-hero-greeting">{greetingText}</span>
                                <span className="expense-hero-name">{userName}! {'\u{1F44B}'}</span>
                            </h1>
                            <p className="expense-hero-subtitle">
                                Track, submit and manage all your expense claims
                            </p>
                        </div>
                    </div>

                    <div className="expense-hero-aside gap-3">
                        {(!showTeamScopeToggle || expenseDashboardScope === 'me') && (
                            <button
                                type="button"
                                onClick={() => openNewExpensePopup()}
                                className="satellite-action btn-press"
                                style={{ '--satellite-accent': '#1E88E5' }}
                            >
                                <span className="satellite-action-label">
                                    <i className="ri-add-line text-sm" />
                                    New Expense
                                </span>
                            </button>
                        )}
                        {showTeamScopeToggle && (
                            <div
                                className="expense-hero-scope expense-hero-scope--aside inline-flex flex-shrink-0 gap-0.5 rounded-xl p-0.5"
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)' }}
                                role="group"
                                aria-label="Expense dashboard scope"
                            >
                                {[
                                    { id: 'me', label: 'Me', short: 'Me' },
                                    { id: 'team', label: 'My Team', short: 'Team' },
                                ].map((opt) => {
                                    const active = expenseDashboardScope === opt.id
                                    return (
                                        <button
                                            key={`aside-${opt.id}`}
                                            type="button"
                                            onClick={() => setExpenseDashboardScope(opt.id)}
                                            className="expense-hero-scope-btn"
                                            style={
                                                active
                                                    ? { background: 'rgba(255,255,255,0.95)', color: '#0D1F3C', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }
                                                    : { background: 'transparent', color: 'rgba(255,255,255,0.75)' }
                                            }
                                        >
                                            <span className="expense-hero-scope-short">{opt.short}</span>
                                            <span className="expense-hero-scope-long">
                                                {opt.id === 'team' ? <>My<br />Team</> : opt.label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary KPI Cards — approvers-dashboard-v2 summary-kpi-card */}
            {dataError && (
                <div className="mb-4 text-xs p-3 rounded-lg" style={{ color: '#B42318', background: '#FFFBFA', border: '1px solid #FDA29B' }}>
                    {dataError}
                </div>
            )}
            <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6 ${summaryCardItems.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
            >
                {summaryCardItems.map((s, idx) => (
                    <div
                        key={s.key}
                        className={`summary-kpi-card min-w-0 animate-fade-in-up${recordsFocus?.key === s.key ? ' is-active' : ''}`}
                        style={{
                            '--summary-accent': s.accentRaw,
                            '--summary-border': s.border,
                            background: `radial-gradient(ellipse 90% 85% at 0% 0%, ${s.from} 0%, transparent 58%), radial-gradient(ellipse 65% 60% at 100% 100%, ${s.from} 0%, transparent 54%), #fff`,
                            animationDelay: `${idx * 70}ms`,
                        }}
                        onClick={() => handleSummarySelect(s.key)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                handleSummarySelect(s.key)
                            }
                        }}
                    >
                        <div className="summary-kpi-head">
                            <div className="summary-status-icon" aria-hidden="true">
                                <span className="summary-icon-glow" />
                                <span className="summary-icon-shine" />
                                <img src={s.iconSrc} alt="" />
                            </div>
                            <div className="summary-kpi-title">
                                <p title={s.label}>{s.label}</p>
                                <span>{s.hint}</span>
                            </div>
                            <div className={`summary-total${recordsFocus?.key === s.key ? ' is-active' : ''}`}>
                                <AnimatedINR value={s.amount} />
                                <span>
                                    <AnimatedInt value={s.count} /> claims
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mb-4 sm:mb-6">
                <div className="flex items-center justify-between mb-4 animate-fade-in-up delay-200">
                    <div>
                        <h2 className="text-base font-black text-gray-900">Expense Claim Types</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Click a card to filter claims by type</p>
                    </div>
                    {activeTypeFilter && (
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTypeFilter(null)
                                setCategoryFilter('all')
                            }}
                            className="records-insight-clear btn-press"
                            style={{ '--records-accent': '#FB8C00' }}
                        >
                            <i className="ri-filter-off-line text-xs" />
                            {' '}Clear filter
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
                    {typeCards.map((cfg, i) => (
                        <ExpenseTypeCard
                            key={cfg.type}
                            {...cfg}
                            animDelay={i * 120 + 250}
                            isActive={activeTypeFilter === cfg.type}
                            onSelect={() => handleTypeCardSelect(cfg.type)}
                            claims={liveExpenseList.filter((e) => rowHasType(e, normalizeTypeKey(cfg.type)))}
                        />
                    ))}
                </div>
            </div>

            {/* Records Panel Table — matches approvers-dashboard-v2 / employee-dashboard-v2 */}
            <div ref={recordsSectionRef} className="animate-fade-in-up delay-400 scroll-mt-4">
                <ExpenseTable
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    activeTypeFilter={activeTypeFilter}
                    setActiveTypeFilter={setActiveTypeFilter}
                    statusFilter={tableStatusFilter}
                    insightPulse={Boolean(recordsFocus?.pulse)}
                    onClearInsight={() => setRecordsFocus(null)}
                    expenseRoleCopy={expenseRoleCopy}
                    expenseList={liveExpenseList}
                    onRowClick={(e) => void openExpenseRecordPopup(e)}
                />
            </div>
            </div>
        </div>
    )
}
