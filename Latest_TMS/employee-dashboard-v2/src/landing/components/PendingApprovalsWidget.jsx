import { useEffect, useMemo, useRef, useState } from 'react'
import { kf } from '../../sdk/index.js'
import CurrentStepBadges from './CurrentStepBadges.jsx'
import SlaCell from './SlaCell.jsx'
import { getEmptyPeriodState, requestedDateInPeriod } from './RecordsPeriodPicker.jsx'
import RecordsExportMenu from './RecordsExportMenu.jsx'
import { buildProcessCsv, downloadRecordsCsv } from '../../lib/exportRecordsCsv.js'
import {
    customPendingRequestsIcon,
    customTravelBookingIcon,
    customTravelAdvanceIcon,
    customTravelExpenseIcon,
} from '../../../../raghul_icons/index.js'

const APP_ID = 'Expense_and_Travel_Management_A00'
const PAGE_SIZE = 2000
const MAX_PAGES = 15
const TABS = [
    { key: 'travel', label: 'Travel Booking', short: 'Booking', processId: 'Travel_Management_A02', reportId: 'All_Items_A00', popup: 'Popup_rCILSrY8KF', color: '#1E88E5', glow: 'rgba(30,136,229,0.45)', icon: customTravelBookingIcon },
    { key: 'advance', label: 'Travel Advance', short: 'Advance', processId: 'Advance_Payment_Request_Process_A01', reportId: 'ALL_ITEMS_WITH_TABLE_A00', popup: 'Popup_J0C5lIdWCL', color: '#43A047', glow: 'rgba(67,160,71,0.45)', icon: customTravelAdvanceIcon },
    { key: 'expense', label: 'Travel Expense', short: 'Expense', processId: 'Expense_Management_A03', reportId: 'All_Items_MK_A00', popup: 'Popup_E4xarw8lLE', color: '#FB8C00', glow: 'rgba(251,140,0,0.45)', icon: customTravelExpenseIcon },
]

/** Same parent views as mis-table: Drafts live under My Items → Draft. */
const SCOPE_TABS = [
    { key: 'myItems', label: 'My Items' },
    { key: 'myTasks', label: 'My Tasks' },
    { key: 'participated', label: 'Participated' },
]

const MY_ITEMS_STATUSES = [
    { key: 'Draft', label: 'Drafts' },
    { key: 'InProgress', label: 'In Progress' },
    { key: 'Completed', label: 'Completed' },
    { key: 'Withdrawn', label: 'Withdrawn' },
    { key: 'Rejected', label: 'Rejected' },
]

const ALL_MY_ITEMS_STATUS_KEYS = MY_ITEMS_STATUSES.map((st) => st.key)
const SUBMITTED_STATUS_KEYS = ['Draft', 'InProgress', 'Withdrawn', 'Rejected']

function statusesForInsightBucket(bucket) {
    if (bucket === 'claimed') return ['Completed']
    if (bucket === 'submitted') return SUBMITTED_STATUS_KEYS
    if (bucket === 'total') return ALL_MY_ITEMS_STATUS_KEYS
    return null
}

const HIDDEN_COLUMNS = ['Column_BliavHBah3', 'Column_RzqotquBQV', 'Column_eFd2LUqnSP']

/**
 * Preference columns so pending/myitems return form FieldIds (not just Name/_created_by).
 * Without this POST + apply_preference=true, Trip Type / From / To / Amount stay empty.
 */
const PREFERENCE_COLUMNS = {
    travel: [
        { Id: 'Travel_Request_ID', Model: 'Travel_Management_A02' },
        { Id: 'Travel_Request_ID_1', Model: 'Travel_Management_A02' },
        { Id: 'Purpose_of_Travel', Model: 'Travel_Management_A02' },
        { Id: 'OnewayRound_tripNot_applicable', Model: 'Travel_Management_A02' },
        { Id: 'Travel_Type', Model: 'Travel_Management_A02' },
        { Id: 'Trip_Type', Model: 'Travel_Management_A02' },
        { Id: 'Travel_Mode', Model: 'Travel_Management_A02' },
        { Id: 'Departure_Date', Model: 'Travel_Management_A02' },
        { Id: 'From_Date', Model: 'Travel_Management_A02' },
        { Id: 'To_Date', Model: 'Travel_Management_A02' },
        { Id: 'FS_Departure_Date', Model: 'Travel_Management_A02' },
        { Id: 'Boarding_from', Model: 'Travel_Management_A02' },
        { Id: 'Destination_to_1', Model: 'Travel_Management_A02' },
        { Id: 'FS_From_City', Model: 'Travel_Management_A02' },
        { Id: 'FS_To_City', Model: 'Travel_Management_A02' },
        { Id: 'FS_Booking_Amount_1', Model: 'Travel_Management_A02' },
        { Id: 'FS_Booking_Amount', Model: 'Travel_Management_A02' },
        { Id: 'FS_Total_Fare_1', Model: 'Travel_Management_A02' },
        { Id: 'MC_Route_Summary', Model: 'Travel_Management_A02' },
        { Id: 'MC_Total_Booking_Amount', Model: 'Travel_Management_A02' },
        { Id: 'Employee_Details', Model: 'Travel_Management_A02' },
        { Id: 'Created_By', Model: 'Travel_Management_A02' },
        { Id: 'Name', Model: 'Travel_Management_A02' },
        { Id: '_created_by', Model: 'Travel_Management_A02' },
        { Id: '_current_step', Model: 'Travel_Management_A02' },
        { Id: '_status', Model: 'Travel_Management_A02' },
        { Id: 'SLA_Deadline', Model: 'Travel_Management_A02' },
    ],
    advance: [
        { Id: 'Advance_Request_ID', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Name', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Requested_Date', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Date_1', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Created_at_date', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: '_created_by', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'created_by_user_id', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'List_of_Travel_Requests_lookup', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'link_a_travel', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Advance_amount_value', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Final_amount', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Advance_Amount', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'advance_amount_in_number', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'Advance_Purpose', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: '_current_step', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'current_step', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: '_status', Model: 'Advance_Payment_Request_Process_A01' },
        { Id: 'SLA_Deadline', Model: 'Advance_Payment_Request_Process_A01' },
    ],
    expense: [
        { Id: 'Expense_ID', Model: 'Expense_Management_A03' },
        { Id: 'Name', Model: 'Expense_Management_A03' },
        { Id: 'Expense_Date', Model: 'Expense_Management_A03' },
        { Id: '_created_by', Model: 'Expense_Management_A03' },
        { Id: 'Expense_Type', Model: 'Expense_Management_A03' },
        { Id: 'Expense_Category', Model: 'Expense_Management_A03' },
        { Id: 'Total_Claimable_Amount', Model: 'Expense_Management_A03' },
        { Id: 'Total_Amount', Model: 'Expense_Management_A03' },
        { Id: 'Expense_Amount', Model: 'Expense_Management_A03' },
        { Id: 'Total_Reimbursable_Amount_single', Model: 'Expense_Management_A03' },
        { Id: '_current_step', Model: 'Expense_Management_A03' },
        { Id: '_status', Model: 'Expense_Management_A03' },
        { Id: 'current_step_status', Model: 'Expense_Management_A03' },
        { Id: 'SLA_Deadline', Model: 'Expense_Management_A03' },
    ],
}

async function postWorkflowStepPreference({ accountId, processId, viewId, columns, viewType = 'WorkflowStep' }) {
    if (!accountId || !processId || !viewId || !columns?.length) return null
    const prefUrl = `/common/2/${accountId}/preference/${processId}/${viewType}/${viewId}/?_application_id=${APP_ID}`
    try {
        return await kf.api(prefUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                AppId: processId,
                ConfigJson: { Columns: columns, Filter: {}, Sort: [] },
                ViewId: viewId,
                ViewType: viewType,
            }),
        })
    } catch (e) {
        console.warn('Preference POST failed', viewId, e)
        return null
    }
}

/** Deadline cells: IST wall time (same as expense-management `index.jsx`). */
const EXPENSE_DATETIME_DISPLAY_TZ = 'Asia/Kolkata'

const EXPENSE_TYPE_STYLE = {
    allowance: { icon: 'ri-sun-line', colorFrom: '#EE6A31', colorTo: '#F59E21', text: '#EE6A31' },
    food: { icon: 'ri-restaurant-2-line', colorFrom: '#139B49', colorTo: '#7dc244', text: '#139B49' },
    local: { icon: 'ri-taxi-line', colorFrom: '#2879b6', colorTo: '#1D9AD4', text: '#2879b6' },
    other: { icon: 'ri-file-list-3-line', colorFrom: '#64748b', colorTo: '#94a3b8', text: '#64748b' },
}

const ADVANCE_REPORT_FIELD_IDS = {
    requestId: 'Column_gmgjecOFBH',
    requestedDate: 'Column_RmtnLwNoFB',
    requestor: 'Column_9XVj5RhJI0',
    linkToTravel: 'Column_ctQorHPmAU',
    advanceAmount: 'Column_rMCWa-_7NO',
    currentStep: 'Column_LTs78WRTDp',
    slaDeadline: 'Column_Wc-2EfDPkD',
}

const ADVANCE_PROCESS_FIELD_IDS = {
    requestId: 'Advance_Request_ID',
    requestedDate: 'Requested_Date',
    requestor: 'created_by_user_id',
    linkToTravel: 'List_of_Travel_Requests_lookup',
    advanceAmount: 'Advance_amount_value',
    currentStep: '_current_step',
    slaDeadline: 'SLA_Deadline',
}

const EXPENSE_REPORT_FIELD_IDS = {
    expenseId: 'Column_9Y8-uPPDVi',
    requestDate: 'Column_gJidmn-kAv',
    requestor: 'Column_rCBEwniBuE',
    expenseType: 'Column_XcXTxxA4-C',
    totalAmount: 'Column_Nvns1CPpfI',
    currentStep: 'Column_bzLJNkKQZO',
    slaDeadline: 'Column_KD_a7365Yi',
}

const EXPENSE_PROCESS_FIELD_IDS = {
    expenseId: 'Expense_ID',
    requestDate: 'Expense_Date',
    requestor: '_created_by',
    expenseType: 'Expense_Type',
    totalAmount: 'Total_Claimable_Amount',
    currentStep: '_current_step',
    slaDeadline: 'SLA_Deadline',
}

const TRAVEL_FIELD_IDS = {
    requestId: 'Column_DRz-V78ZHe',
    /** Common Departure_Date for oneWay / roundTrip / multiCity */
    departureDate: 'Column_HQjIt021s2',
    /** Legacy FS departure (fallback) */
    departureDateLegacy: 'Column_T7yk_UT6Hk',
    requestor: 'Column_MfwZaTYIE8',
    from: 'Column_1qX1HxE34f',
    to: 'Column_6VWxLVKxdg',
    bookingAmount: 'Column_S7qHj2qlIJ',
    currentStep: 'Column_z0s-oAG3rN',
    slaDeadline: 'Column_3l8DHla3JD',
    /** Travel_Type — oneWay | roundTrip | multiCity */
    travelType: 'Column_WHUJTy6aCd',
    /** Multi-city total booking amount */
    mcBookingAmount: 'Column_emdSnf_50o',
    /** Multi-city route e.g. MAA → DEL → BOM */
    mcRouteSummary: 'Column_wLODKWpmSS',
}

/** Process FieldIds written by Travel Booking Save Draft / report enrichment */
const TRAVEL_PROCESS_FIELD_IDS = {
    requestId: 'Travel_Request_ID',
    departureDate: 'Departure_Date',
    departureDateLegacy: 'FS_Departure_Date',
    requestor: '_created_by',
    from: 'Boarding_from',
    to: 'Destination_to_1',
    bookingAmount: 'FS_Booking_Amount_1',
    currentStep: '_current_step',
    slaDeadline: 'SLA_Deadline',
    travelType: 'OnewayRound_tripNot_applicable',
    mcBookingAmount: 'MC_Total_Booking_Amount',
    mcRouteSummary: 'MC_Route_Summary',
}

function readTravelRowValue(row, key) {
    const colKey = TRAVEL_FIELD_IDS[key]
    const fieldKey = TRAVEL_PROCESS_FIELD_IDS[key]
    const colVal = colKey ? row?.[colKey] : undefined
    if (colVal !== undefined && colVal !== null && colVal !== '') return colVal
    const fieldVal = fieldKey ? row?.[fieldKey] : undefined
    if (fieldVal !== undefined && fieldVal !== null && fieldVal !== '') return fieldVal
    return undefined
}

function readTravelDeparture(row) {
    return (
        readTravelRowValue(row, 'departureDate') ??
        readTravelRowValue(row, 'departureDateLegacy') ??
        row?.From_Date ??
        row?.FS_Departure_Date ??
        row?.Common_from_date
    )
}

function readTravelFrom(row) {
    return (
        readTravelRowValue(row, 'from') ??
        row?.FS_From_City ??
        row?.Boarding_from ??
        row?.common_From ??
        row?.Boarding
    )
}

function readTravelTo(row) {
    return (
        readTravelRowValue(row, 'to') ??
        row?.FS_To_City ??
        row?.Destination_to_1 ??
        row?.common_To ??
        row?.Destination_1
    )
}

function readTravelAmount(row) {
    return (
        readTravelRowValue(row, 'bookingAmount') ??
        row?.FS_Booking_Amount_1 ??
        row?.FS_Booking_Amount ??
        row?.FS_Total_Fare_1 ??
        row?.FS_Total_Fare ??
        row?.Booking_Amount_1
    )
}

function readTravelTypeRaw(row) {
    return (
        readTravelRowValue(row, 'travelType') ??
        row?.Travel_Type ??
        row?.Trip_Type ??
        row?.OnewayRound_tripNot_applicable ??
        row?.FS_Trip_Type ??
        row?.travel_type ??
        row?.tripType
    )
}

function readTravelRequestor(row) {
    return (
        readTravelRowValue(row, 'requestor') ??
        row?._created_by ??
        row?.Created_By ??
        row?.Employee_Details
    )
}

function readTravelRequestId(row) {
    return (
        readTravelRowValue(row, 'requestId') ??
        row?.Travel_Request_ID ??
        row?.Travel_Request_ID_1 ??
        row?._name ??
        row?.Name ??
        row?._id
    )
}

async function safeKfApi(url, options) {
    if (!url || url.includes('undefined') || url.includes('null')) return null
    try {
        return await kf.api(url, options)
    } catch (e) {
        console.warn('API failed', url, e)
        return null
    }
}

/** Travel All_Items_A00 → Map(instanceId → report row) for enriching My Items / My Tasks */
async function fetchTravelAllItemsReportMap(accountId) {
    const map = new Map()
    if (!accountId) return map
    const processId = 'Travel_Management_A02'
    const reportId = 'All_Items_A00'
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `/process-report/2/${accountId}/${processId}/${reportId}?_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
        const resp = await safeKfApi(url)
        const rows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
        if (!rows.length) break
        for (const r of rows) {
            const id = String(r?._id || '').trim()
            if (id) map.set(id, r)
        }
        if (rows.length < PAGE_SIZE) break
    }
    return map
}

/**
 * Merge process-report + list row so Column_* and FieldIds both exist.
 * My Items/pending often omit form fields; All_Items_A00 has the mapped columns.
 */
function enrichTravelRowWithReport(listRow, reportRow) {
    if (!listRow || typeof listRow !== 'object') return listRow
    const next = { ...listRow }
    if (!reportRow || typeof reportRow !== 'object') return next

    // Prefer report values for known travel columns / FieldIds when list cell is empty
    const keys = new Set([
        ...Object.keys(reportRow),
        TRAVEL_FIELD_IDS.requestId,
        TRAVEL_FIELD_IDS.requestor,
        TRAVEL_FIELD_IDS.from,
        TRAVEL_FIELD_IDS.to,
        TRAVEL_FIELD_IDS.bookingAmount,
        TRAVEL_FIELD_IDS.travelType,
        TRAVEL_FIELD_IDS.departureDate,
        TRAVEL_FIELD_IDS.departureDateLegacy,
        TRAVEL_FIELD_IDS.currentStep,
        TRAVEL_FIELD_IDS.slaDeadline,
        TRAVEL_FIELD_IDS.mcRouteSummary,
        TRAVEL_FIELD_IDS.mcBookingAmount,
        TRAVEL_PROCESS_FIELD_IDS.requestId,
        TRAVEL_PROCESS_FIELD_IDS.requestor,
        TRAVEL_PROCESS_FIELD_IDS.from,
        TRAVEL_PROCESS_FIELD_IDS.to,
        TRAVEL_PROCESS_FIELD_IDS.bookingAmount,
        TRAVEL_PROCESS_FIELD_IDS.travelType,
        TRAVEL_PROCESS_FIELD_IDS.departureDate,
        TRAVEL_PROCESS_FIELD_IDS.departureDateLegacy,
        'Boarding_from',
        'Destination_to_1',
        'FS_From_City',
        'FS_To_City',
        'FS_Booking_Amount_1',
        'FS_Booking_Amount',
        'OnewayRound_tripNot_applicable',
        'Travel_Type',
        'Trip_Type',
        'Departure_Date',
        'From_Date',
        'Travel_Request_ID',
        'Name',
        '_created_by',
        '_current_step',
        'SLA_Deadline',
    ])

    for (const key of keys) {
        const reportVal = reportRow[key]
        if (reportVal === undefined || reportVal === null || reportVal === '') continue
        const cur = next[key]
        if (cur === undefined || cur === null || cur === '') {
            next[key] = reportVal
        }
    }

    // Always overlay trip-critical report columns (same as approver widget)
    for (const key of [
        TRAVEL_FIELD_IDS.travelType,
        TRAVEL_FIELD_IDS.departureDate,
        TRAVEL_FIELD_IDS.mcRouteSummary,
        TRAVEL_FIELD_IDS.mcBookingAmount,
        TRAVEL_FIELD_IDS.from,
        TRAVEL_FIELD_IDS.to,
        TRAVEL_FIELD_IDS.bookingAmount,
    ]) {
        if (reportRow[key] != null && reportRow[key] !== '') next[key] = reportRow[key]
    }

    return next
}

/** GET single process item — fills fields preference/report still miss */
async function fetchTravelItemDetail(accountId, instanceId, activityInstanceId) {
    if (!accountId || !instanceId) return null
    const base = `/process/2/${accountId}/Travel_Management_A02/${instanceId}`
    if (activityInstanceId) {
        const withAct = await safeKfApi(
            `${base}/${activityInstanceId}?_application_id=${APP_ID}`,
        )
        if (withAct && typeof withAct === 'object') return withAct
    }
    return safeKfApi(`${base}?_application_id=${APP_ID}`)
}

function travelRowNeedsDetail(row) {
    const from = toText(readTravelFrom(row)).trim()
    const to = toText(readTravelTo(row)).trim()
    const amount = toNumber(readTravelAmount(row))
    const trip = normalizeTravelTypeKey(readTravelTypeRaw(row))
    return !from || !to || (!amount && !trip)
}

async function fetchProcessReportMap(accountId, processId, reportId) {
    const map = new Map()
    if (!accountId || !processId || !reportId) return map
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `/process-report/2/${accountId}/${processId}/${reportId}?_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
        const resp = await safeKfApi(url)
        const rows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
        if (!rows.length) break
        for (const r of rows) {
            const id = String(r?._id || '').trim()
            if (id) map.set(id, r)
        }
        if (rows.length < PAGE_SIZE) break
    }
    return map
}

function fetchAdvanceAllItemsReportMap(accountId) {
    return fetchProcessReportMap(accountId, 'Advance_Payment_Request_Process_A01', 'ALL_ITEMS_WITH_TABLE_A00')
}

function fetchExpenseAllItemsReportMap(accountId) {
    return fetchProcessReportMap(accountId, 'Expense_Management_A03', 'All_Items_MK_A00')
}

function fillEmptyKeysFromReport(listRow, reportRow, keys) {
    if (!listRow || typeof listRow !== 'object') return listRow
    const next = { ...listRow }
    if (!reportRow || typeof reportRow !== 'object') return next
    for (const key of keys) {
        const reportVal = reportRow[key]
        if (reportVal === undefined || reportVal === null || reportVal === '') continue
        const cur = next[key]
        if (cur === undefined || cur === null || cur === '') next[key] = reportVal
    }
    return next
}

function enrichAdvanceRowWithReport(listRow, reportRow) {
    if (!reportRow || typeof reportRow !== 'object') return listRow
    const next = fillEmptyKeysFromReport(listRow, reportRow, [
        ADVANCE_REPORT_FIELD_IDS.requestId,
        ADVANCE_REPORT_FIELD_IDS.requestedDate,
        ADVANCE_REPORT_FIELD_IDS.requestor,
        ADVANCE_REPORT_FIELD_IDS.linkToTravel,
        ADVANCE_REPORT_FIELD_IDS.advanceAmount,
        ADVANCE_REPORT_FIELD_IDS.currentStep,
        ADVANCE_REPORT_FIELD_IDS.slaDeadline,
        ADVANCE_PROCESS_FIELD_IDS.requestId,
        ADVANCE_PROCESS_FIELD_IDS.requestedDate,
        ADVANCE_PROCESS_FIELD_IDS.requestor,
        ADVANCE_PROCESS_FIELD_IDS.linkToTravel,
        ADVANCE_PROCESS_FIELD_IDS.advanceAmount,
        ADVANCE_PROCESS_FIELD_IDS.currentStep,
        ADVANCE_PROCESS_FIELD_IDS.slaDeadline,
        'Advance_Amount',
        'Final_amount',
        'Name',
        '_created_by',
    ])
    const linkKey = ADVANCE_REPORT_FIELD_IDS.linkToTravel
    if (reportRow[linkKey] != null && reportRow[linkKey] !== '') next[linkKey] = reportRow[linkKey]
    return next
}

function enrichExpenseRowWithReport(listRow, reportRow) {
    if (!reportRow || typeof reportRow !== 'object') return listRow
    const next = fillEmptyKeysFromReport(listRow, reportRow, [
        EXPENSE_REPORT_FIELD_IDS.expenseId,
        EXPENSE_REPORT_FIELD_IDS.requestDate,
        EXPENSE_REPORT_FIELD_IDS.requestor,
        EXPENSE_REPORT_FIELD_IDS.expenseType,
        EXPENSE_REPORT_FIELD_IDS.totalAmount,
        EXPENSE_REPORT_FIELD_IDS.currentStep,
        EXPENSE_REPORT_FIELD_IDS.slaDeadline,
        EXPENSE_PROCESS_FIELD_IDS.expenseId,
        EXPENSE_PROCESS_FIELD_IDS.requestDate,
        EXPENSE_PROCESS_FIELD_IDS.requestor,
        EXPENSE_PROCESS_FIELD_IDS.expenseType,
        EXPENSE_PROCESS_FIELD_IDS.totalAmount,
        EXPENSE_PROCESS_FIELD_IDS.currentStep,
        EXPENSE_PROCESS_FIELD_IDS.slaDeadline,
        'Expense_Category',
        'Total_Amount',
        'Name',
        '_created_by',
    ])
    for (const key of [EXPENSE_REPORT_FIELD_IDS.expenseType, EXPENSE_REPORT_FIELD_IDS.slaDeadline]) {
        if (reportRow[key] != null && reportRow[key] !== '') next[key] = reportRow[key]
    }
    return next
}

function normalizeTravelTypeKey(raw) {
    const s = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '')
    if (s === 'multicity' || s.includes('multi')) return 'multiCity'
    if (s === 'roundtrip' || s.includes('round')) return 'roundTrip'
    if (s === 'oneway' || s.includes('one')) return 'oneWay'
    return ''
}

function travelTypeLabel(key) {
    if (key === 'multiCity') return 'Multi-City'
    if (key === 'roundTrip') return 'Round Trip'
    if (key === 'oneWay') return 'One Way'
    return '—'
}

function tripRouteIconName(key) {
    if (key === 'roundTrip') return 'ri-arrow-left-right-line'
    if (key === 'multiCity') return 'ri-route-line'
    return 'ri-arrow-right-line'
}

function TripRouteIcon({ tripTypeKey, label }) {
    const kind = tripTypeKey || 'oneWay'
    return (
        <span
            className={`trip-route-icon is-${kind}`}
            title={label || travelTypeLabel(tripTypeKey)}
            aria-hidden="true"
        >
            <i className={tripRouteIconName(tripTypeKey)} />
        </span>
    )
}

function splitTravelRoute(entry) {
    if (entry?.isMultiCity) {
        const raw = String(entry.routeSummary || entry.fromText || '')
        const parts = raw
            .split(/\s*(?:→|->|—|-)\s*/)
            .map((part) => part.trim())
            .filter(Boolean)
        if (parts.length >= 2) {
            return { from: parts[0], to: parts[parts.length - 1] }
        }
        return { from: raw || '—', to: '—' }
    }
    return { from: entry?.fromText || '—', to: entry?.toTextValue || '—' }
}

function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'string') {
        const cleaned = value.replace(/,/g, '').trim()
        const match = cleaned.match(/-?\d+(\.\d+)?/)
        if (!match) return 0
        const n = Number(match[0])
        return Number.isFinite(n) ? n : 0
    }
    return 0
}

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
            value._display_value ??
            value.ISOString ??
            value.isoString ??
            value.UTC_ShortDateTime ??
            value.utcShortDateTime ??
            value.ShortDateTime ??
            value.shortDateTime
        if (nested != null && typeof nested !== 'object' && String(nested).trim() !== '') return nested

        // Kissflow DateTime cells often use numeric OR string parts (_year/_month/_date).
        const y = Number(value._year ?? value.Year ?? value.year)
        if (Number.isFinite(y) && y > 0) {
            const mo = Number(value._month ?? value.Month ?? value.month ?? 1)
            const day = Number(value._date ?? value.Day ?? value.day ?? value._day ?? 1)
            const h = Number(value._hour ?? value.Hour ?? value.hour ?? 0)
            const mi = Number(value._minute ?? value.Minute ?? value.minute ?? 0)
            const s = Number(value._second ?? value.Second ?? value.second ?? 0)
            const monthIndex = Number.isFinite(mo) && mo > 0 ? mo - 1 : 0
            const d = new Date(
                y,
                monthIndex,
                Number.isFinite(day) && day > 0 ? day : 1,
                Number.isFinite(h) ? h : 0,
                Number.isFinite(mi) ? mi : 0,
                Number.isFinite(s) ? s : 0,
            )
            if (!Number.isNaN(d.getTime())) return d.toISOString()
        }
    }
    return null
}

function hasUsableDateTimeCell(value) {
    if (value === undefined || value === null || value === '') return false
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim() !== ''
    if (typeof value === 'object') return extractDateTimeRaw(value) != null
    return false
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

function dateRawToMs(raw) {
    if (raw === null || raw === undefined || raw === '') return null
    const extracted = extractDateTimeRaw(raw)
    const candidate = extracted !== null && extracted !== undefined ? extracted : raw
    if (candidate === null || candidate === undefined || candidate === '') return null
    const d = new Date(typeof candidate === 'object' ? toText(candidate) : candidate)
    return Number.isNaN(d.getTime()) ? null : d.getTime()
}

/** Expense/Advance Requested Date; Travel Booking uses created-at as the request date. */
function readRequestedAtMs(row, tabKey) {
    if (tabKey === 'expense') {
        return (
            dateRawToMs(row?.[EXPENSE_PROCESS_FIELD_IDS.requestDate]) ??
            dateRawToMs(row?.[EXPENSE_REPORT_FIELD_IDS.requestDate]) ??
            dateRawToMs(row?._created_at)
        )
    }
    if (tabKey === 'advance') {
        return (
            dateRawToMs(row?.[ADVANCE_PROCESS_FIELD_IDS.requestedDate]) ??
            dateRawToMs(row?.[ADVANCE_REPORT_FIELD_IDS.requestedDate]) ??
            dateRawToMs(row?._created_at)
        )
    }
    return dateRawToMs(row?._created_at) ?? dateRawToMs(row?._modified_at)
}

function toDateText(value) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

/** Departure Date column: "04 Aug, 2026" for all travel trip types. */
function formatDepartureDateDisplay(value) {
    if (value === null || value === undefined || value === '') return ''
    const raw = extractDateTimeRaw(value) ?? value
    const d = new Date(typeof raw === 'object' ? toText(raw) : raw)
    if (Number.isNaN(d.getTime())) {
        const s = String(raw || '').trim()
        // Already ISO date-only → format parts directly to avoid TZ shift
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            const day = m[3]
            const month = months[Number(m[2]) - 1] || m[2]
            return `${day} ${month}, ${m[1]}`
        }
        return s
    }
    // Use calendar parts in local time for Date objects from ISO date-only (UTC midnight)
    // Prefer ISO YYYY-MM-DD slice when available to keep "04 Aug, 2026" stable.
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.trim())) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const [y, mo, day] = raw.trim().slice(0, 10).split('-')
        return `${day} ${months[Number(mo) - 1] || mo}, ${y}`
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const day = String(d.getDate()).padStart(2, '0')
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    return `${day} ${month}, ${year}`
}

const EMPTY_EXPENSE_FIELD_IDS = {
    ...EXPENSE_REPORT_FIELD_IDS,
}

// Travel Expense status (provided)
const EXPENSE_STATUS_COL_ID = 'Column_nEtxbnvlrc'

/** Expense column ids are fixed for All_Items_MK_A00, with FieldId lookup from report Columns. */
function findReportColumnId(cols, fieldIdCandidates, namePattern, fallback) {
    const list = Array.isArray(cols) ? cols : []
    for (const fid of fieldIdCandidates) {
        const byField = list.find((c) => String(c?.FieldId || '') === fid)
        if (byField?.Id) return byField.Id
        const byId = list.find((c) => String(c?.Id || '') === fid)
        if (byId?.Id) return byId.Id
    }
    if (namePattern) {
        const byName = list.find((c) => namePattern.test(String(c?.Name || '')))
        if (byName?.Id) return byName.Id
    }
    return fallback
}

function resolveExpenseFieldIds(rawCols) {
    return {
        expenseId: findReportColumnId(
            rawCols,
            ['Expense_ID', EMPTY_EXPENSE_FIELD_IDS.expenseId],
            /expense\s*id|request\s*id/i,
            EMPTY_EXPENSE_FIELD_IDS.expenseId,
        ),
        requestDate: findReportColumnId(
            rawCols,
            ['Expense_Date', 'Request_Date', EMPTY_EXPENSE_FIELD_IDS.requestDate],
            /request(ed)?\s*date|expense\s*date/i,
            EMPTY_EXPENSE_FIELD_IDS.requestDate,
        ),
        requestor: findReportColumnId(
            rawCols,
            ['_created_by', 'Requestor', EMPTY_EXPENSE_FIELD_IDS.requestor],
            /requestor|created\s*by/i,
            EMPTY_EXPENSE_FIELD_IDS.requestor,
        ),
        expenseType: findReportColumnId(
            rawCols,
            ['Expense_Type', EMPTY_EXPENSE_FIELD_IDS.expenseType],
            /expense\s*type/i,
            EMPTY_EXPENSE_FIELD_IDS.expenseType,
        ),
        totalAmount: findReportColumnId(
            rawCols,
            ['Total_Claimable_Amount', 'Column_Nvns1CPpfI', EMPTY_EXPENSE_FIELD_IDS.totalAmount],
            /total\s*claimable|total\s*amount/i,
            EMPTY_EXPENSE_FIELD_IDS.totalAmount,
        ),
        currentStep: findReportColumnId(
            rawCols,
            ['_current_step', 'Current_step', EMPTY_EXPENSE_FIELD_IDS.currentStep],
            /current\s*step/i,
            EMPTY_EXPENSE_FIELD_IDS.currentStep,
        ),
        slaDeadline: findReportColumnId(
            rawCols,
            ['SLA_Deadline', 'Column_KD_a7365Yi', EMPTY_EXPENSE_FIELD_IDS.slaDeadline],
            /sla\s*deadline|^deadline$/i,
            EMPTY_EXPENSE_FIELD_IDS.slaDeadline,
        ),
    }
}

function extractCurrentStepText(row, colId) {
    const raw =
        colId && row?.[colId] !== undefined && row?.[colId] !== null && row?.[colId] !== ''
            ? row[colId]
            : row?.['Column_6KQUHRHKEZ'] ?? row?._current_step ?? row?.Current_step ?? row?.current_step
    if (raw === null || raw === undefined) return ''
    if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim()
    if (typeof raw === 'object') {
        const named = raw.Name ?? raw.name ?? raw.Value ?? raw.value ?? raw.Label ?? raw.label
        if (named != null && typeof named !== 'object') return String(named).trim()
    }
    return toText(raw).trim()
}

function extractSlaDeadlineRaw(row, slaColId, fallbackColIds = []) {
    const keys = [
        slaColId,
        ...fallbackColIds,
        'SLA_Deadline',
        'Column_KD_a7365Yi',
        'Deadline',
        'SLA',
    ].filter(Boolean)

    for (const key of keys) {
        const v = row?.[key]
        if (hasUsableDateTimeCell(v)) return v
    }

    // Last resort: scan row keys that look like SLA/deadline columns.
    if (row && typeof row === 'object') {
        for (const [key, v] of Object.entries(row)) {
            if (!/sla|deadline/i.test(key)) continue
            if (hasUsableDateTimeCell(v)) return v
        }
    }

    const ctx = row?._current_context
    if (Array.isArray(ctx) && ctx.length && ctx[0]?.ExpectedAt) return ctx[0].ExpectedAt
    return null
}

function normalizeExpenseTypeKey(name) {
    const t = String(name || '').trim().toLowerCase()
    if (!t) return 'other'
    if (t.includes('daily') || t.includes('allowance')) return 'allowance'
    if (t.includes('food')) return 'food'
    if (t.includes('local') || t.includes('conveyance')) return 'local'
    return 'other'
}

function formatINR(amount) {
    return `₹${Math.round(toNumber(amount)).toLocaleString('en-IN')}`
}

function MobileField({ label, children, stacked = false }) {
    if (stacked) {
        return (
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span className="mb-1 block text-slate-500">{label}</span>
                <div className="min-w-0">{children}</div>
            </div>
        )
    }
    return (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
            <span className="shrink-0 text-slate-500">{label}</span>
            <div className="min-w-0 truncate text-right font-medium text-slate-800">{children}</div>
        </div>
    )
}

function MobileRecordCard({ title, subtitle, amount, onOpen, children, selected = false, selectSlot = null }) {
    return (
        <div className={`expense-record-card${selected ? ' is-selected' : ''}`}>
            {selectSlot ? <div className="expense-record-card-select">{selectSlot}</div> : null}
            <button type="button" className="expense-record-card-body" onClick={onOpen}>
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="min-w-0 flex-1">
                        {title}
                        {subtitle}
                    </div>
                    {amount != null ? <span className="record-amount shrink-0 pt-0.5">{amount}</span> : null}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px]">{children}</div>
            </button>
        </div>
    )
}

function ExpenseMobileCard({ entry, accent, onOpen, selected, selectSlot }) {
    const tkey = normalizeExpenseTypeKey(entry.expenseType)
    const cfg = EXPENSE_TYPE_STYLE[tkey] || EXPENSE_TYPE_STYLE.other
    return (
        <MobileRecordCard
            selected={selected}
            selectSlot={selectSlot}
            onOpen={onOpen}
            amount={formatINR(entry.totalAmount)}
            title={
                <span className="record-id-badge inline-block max-w-full truncate" title={entry.expenseId}>
                    {entry.expenseId}
                </span>
            }
            subtitle={
                <div className="mt-2 flex min-w-0 items-center gap-2">
                    <div className="record-type-icon">
                        <i className={`${cfg.icon} text-white text-sm`} />
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-800">{entry.expenseType || '—'}</p>
                </div>
            }
        >
            <MobileField label="Requestor">{entry.requestorText || '—'}</MobileField>
            <MobileField label="Requested">{entry.requestDateStr || '—'}</MobileField>
            <MobileField label="Current step" stacked>
                <CurrentStepBadges text={entry.currentStep} size="sm" accent={accent} />
            </MobileField>
            <MobileField label="SLA" stacked>
                <SlaCell deadlineAtMs={entry.deadlineAtMs} deadlineLabel={entry.deadlineText} size="sm" />
            </MobileField>
        </MobileRecordCard>
    )
}

function AdvanceMobileCard({ entry, accent, onOpen, selected, selectSlot }) {
    return (
        <MobileRecordCard
            selected={selected}
            selectSlot={selectSlot}
            onOpen={onOpen}
            amount={formatINR(entry.advanceAmount)}
            title={<p className="truncate text-sm font-semibold text-slate-800">{entry.requestorText || 'Advance request'}</p>}
            subtitle={<p className="mt-0.5 truncate text-[10px] text-slate-500">{entry.requestedDateStr || '—'}</p>}
        >
            <MobileField label="Link to travel">{entry.linkToTravelText || '—'}</MobileField>
            <MobileField label="Current step" stacked>
                <CurrentStepBadges text={entry.currentStep} size="sm" accent={accent} />
            </MobileField>
            <MobileField label="SLA" stacked>
                <SlaCell deadlineAtMs={entry.deadlineAtMs} deadlineLabel={entry.deadlineText} size="sm" />
            </MobileField>
        </MobileRecordCard>
    )
}

function TravelMobileCard({ entry, accent, onOpen, selected, selectSlot }) {
    const route = splitTravelRoute(entry)
    return (
        <MobileRecordCard
            selected={selected}
            selectSlot={selectSlot}
            onOpen={onOpen}
            amount={formatINR(entry.bookingAmount)}
            title={<p className="truncate text-sm font-semibold text-slate-800">{entry.requestorText || 'Travel booking'}</p>}
            subtitle={
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="travel-type-badge">{entry.tripTypeLabel}</span>
                    <span className="text-[10px] text-slate-500">{entry.departureDateStr || '—'}</span>
                </div>
            }
        >
            <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span className="min-w-0 truncate font-semibold text-slate-800">{route.from}</span>
                <TripRouteIcon tripTypeKey={entry.travelTypeKey} label={entry.tripTypeLabel} />
                <span className="min-w-0 truncate text-right font-semibold text-slate-800">{route.to}</span>
            </div>
            <MobileField label="Current step" stacked>
                <CurrentStepBadges text={entry.currentStep} size="sm" accent={accent} />
            </MobileField>
            <MobileField label="SLA" stacked>
                <SlaCell deadlineAtMs={entry.deadlineAtMs} deadlineLabel={entry.deadlineText} size="sm" />
            </MobileField>
        </MobileRecordCard>
    )
}

function GenericMobileCard({ row, cols, onOpen, selected, selectSlot }) {
    const first = cols[0]
    const rest = cols.slice(1)
    return (
        <MobileRecordCard
            selected={selected}
            selectSlot={selectSlot}
            onOpen={onOpen}
            title={
                <p className="truncate text-sm font-semibold text-slate-800">
                    {first ? toText(row?.[first.Id]) || first.Name : 'Record'}
                </p>
            }
        >
            {rest.map((c) => (
                <MobileField key={c.Id} label={c.Name}>
                    {toText(row?.[c.Id]) || '—'}
                </MobileField>
            ))}
        </MobileRecordCard>
    )
}

function DraftSelectBox({ id, checked, onToggle, label }) {
    return (
        <input
            type="checkbox"
            className="draft-checkbox"
            aria-label={label}
            checked={checked}
            disabled={!id}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggle(id)}
        />
    )
}

function buildExpenseRowView(row, ids) {
    const expenseId =
        (ids.expenseId ? toText(row[ids.expenseId]).trim() : '') ||
        toText(row?.[EXPENSE_PROCESS_FIELD_IDS.expenseId]).trim() ||
        toText(row?._name || row?.Name) ||
        toText(row?._id).slice(-8) ||
        '—'

    const requestRaw =
        (ids.requestDate ? row?.[ids.requestDate] : null) ??
        row?.[EXPENSE_PROCESS_FIELD_IDS.requestDate] ??
        row?.[EXPENSE_REPORT_FIELD_IDS.requestDate] ??
        null
    const requestDateStr =
        (requestRaw !== undefined && requestRaw !== null && requestRaw !== '' ? toDateText(extractDateTimeRaw(requestRaw) ?? requestRaw) : '') ||
        toDateText(row?._created_at)

    const windowStartAtMs =
        dateRawToMs(requestRaw) ?? dateRawToMs(row?._created_at) ?? dateRawToMs(row?._modified_at) ?? null

    const expenseTypeRaw = toText(
        (ids.expenseType ? row[ids.expenseType] : null) ??
            row?.[EXPENSE_REPORT_FIELD_IDS.expenseType] ??
            row?.[EXPENSE_PROCESS_FIELD_IDS.expenseType] ??
            row?.Expense_Category,
    ).trim()
    const expenseType = expenseTypeRaw || '—'

    const requestorText = toText(
        (ids.requestor ? row?.[ids.requestor] : null) ??
            row?.[EXPENSE_PROCESS_FIELD_IDS.requestor] ??
            row?.[EXPENSE_REPORT_FIELD_IDS.requestor],
    ).trim()

    let totalAmount = 0
    if (ids.totalAmount && row[ids.totalAmount] !== undefined && row[ids.totalAmount] !== null && row[ids.totalAmount] !== '') {
        totalAmount = toNumber(row[ids.totalAmount])
    } else {
        totalAmount = toNumber(
            row?.[EXPENSE_REPORT_FIELD_IDS.totalAmount] ??
                row?.[EXPENSE_PROCESS_FIELD_IDS.totalAmount] ??
                row?.Total_Claimable_Amount ??
                row?.['Column_UyJCJpXn5Y'] ??
                row?.Total_Amount ??
                0,
        )
    }

    const currentStep = extractCurrentStepText(row, ids.currentStep || EXPENSE_PROCESS_FIELD_IDS.currentStep)

    const slaRaw = extractSlaDeadlineRaw(row, ids.slaDeadline, [
        EXPENSE_REPORT_FIELD_IDS.slaDeadline,
        EXPENSE_PROCESS_FIELD_IDS.slaDeadline,
        'Column_KD_a7365Yi',
        'SLA_Deadline',
    ])
    const deadlineAtMs = dateRawToMs(slaRaw)
    const deadlineText = slaRaw != null && slaRaw !== '' ? formatDeadlineCell(slaRaw) : ''

    // Created-time for tie-break after SLA urgency sort.
    const listSortMs =
        dateRawToMs(row?._created_at) ?? windowStartAtMs ?? dateRawToMs(row?._modified_at) ?? deadlineAtMs ?? 0

    return {
        expenseId,
        requestDateStr,
        requestorText,
        expenseType,
        totalAmount,
        currentStep,
        deadlineText,
        deadlineAtMs,
        windowStartAtMs,
        listSortMs,
    }
}

function formatLinkToTravel(value) {
    if (value === null || value === undefined || value === '') return '—'
    let v = value
    if (typeof v === 'string') {
        const s = v.trim()
        if (!s || s === '{}' || s === '—') return '—'
        try {
            v = JSON.parse(s)
        } catch {
            return s
        }
    }
    if (typeof v !== 'object' || Array.isArray(v)) return toText(v).trim() || '—'

    const from = toText(v.From ?? v.from).trim()
    const to = toText(v.To ?? v.to).trim()
    const fromDate = toText(v['From date'] ?? v.fromDate ?? v.FromDate).trim()
    const toDate = toText(v['To date'] ?? v.toDate ?? v.ToDate).trim()
    const purpose = toText(v['Travel Purpose'] ?? v.travelPurpose).trim()

    const summary = []
    if (from || to) summary.push(`${from || '—'} → ${to || '—'}`)
    if (fromDate || toDate) summary.push(`${fromDate || 'N/A'} to ${toDate || 'N/A'}`)
    if (purpose) summary.push(purpose)
    if (summary.length) return summary.join(' | ')

    const flat = toText(v).trim()
    return flat || '—'
}

function buildAdvanceRowView(row) {
    const requestId =
        toText(row?.[ADVANCE_REPORT_FIELD_IDS.requestId]).trim() ||
        toText(row?.[ADVANCE_PROCESS_FIELD_IDS.requestId]).trim() ||
        toText(row?.Advance_Request_ID || row?._name || row?.Name).trim() ||
        '—'
    const requestedRaw =
        row?.[ADVANCE_REPORT_FIELD_IDS.requestedDate] ??
        row?.[ADVANCE_PROCESS_FIELD_IDS.requestedDate] ??
        row?.Date_1 ??
        row?.Created_at_date ??
        row?.requested_date
    const requestedDateStr =
        (requestedRaw !== undefined && requestedRaw !== null && requestedRaw !== ''
            ? toDateText(extractDateTimeRaw(requestedRaw) ?? requestedRaw)
            : '') || toDateText(row?._created_at)
    const linkToTravelText = formatLinkToTravel(
        row?.[ADVANCE_REPORT_FIELD_IDS.linkToTravel] ??
            row?.[ADVANCE_PROCESS_FIELD_IDS.linkToTravel] ??
            row?.link_a_travel,
    )
    const requestorText = toText(
        row?.[ADVANCE_REPORT_FIELD_IDS.requestor] ??
            row?.[ADVANCE_PROCESS_FIELD_IDS.requestor] ??
            row?._created_by,
    ).trim()
    const advanceAmount = toNumber(
        row?.[ADVANCE_REPORT_FIELD_IDS.advanceAmount] ??
            row?.[ADVANCE_PROCESS_FIELD_IDS.advanceAmount] ??
            row?.Final_amount ??
            row?.['Column_t1eY-VJcss'] ??
            row?.Advance_Amount ??
            row?.advance_amount_in_number,
    )
    const currentStep = extractCurrentStepText(
        row,
        ADVANCE_REPORT_FIELD_IDS.currentStep || ADVANCE_PROCESS_FIELD_IDS.currentStep,
    )

    const slaRaw = extractSlaDeadlineRaw(row, ADVANCE_REPORT_FIELD_IDS.slaDeadline, [
        ADVANCE_PROCESS_FIELD_IDS.slaDeadline,
        'SLA_Deadline',
        'Column_Wc-2EfDPkD',
    ])
    const deadlineAtMs = dateRawToMs(slaRaw)
    const deadlineText = slaRaw != null && slaRaw !== '' ? formatDeadlineCell(slaRaw) : ''
    const windowStartAtMs = dateRawToMs(requestedRaw) ?? dateRawToMs(row?._created_at) ?? dateRawToMs(row?._modified_at) ?? null
    // Created-time for tie-break after SLA urgency sort.
    const listSortMs =
        dateRawToMs(row?._created_at) ?? windowStartAtMs ?? dateRawToMs(row?._modified_at) ?? deadlineAtMs ?? 0

    return {
        requestId,
        requestedDateStr,
        requestorText,
        linkToTravelText,
        advanceAmount,
        currentStep,
        deadlineText,
        deadlineAtMs,
        windowStartAtMs,
        listSortMs,
    }
}

function buildTravelRowView(row) {
    const requestId = toText(readTravelRequestId(row)).trim() || '—'
    const travelTypeKey = normalizeTravelTypeKey(readTravelTypeRaw(row))
    const isMultiCity = travelTypeKey === 'multiCity'
    const tripTypeLabel = travelTypeLabel(travelTypeKey)

    const departureRaw = readTravelDeparture(row)
    const departureDateStr = formatDepartureDateDisplay(departureRaw) || '—'

    const routeSummary = toText(
        readTravelRowValue(row, 'mcRouteSummary') ?? row?.MC_Route_Summary ?? row?.mc_route_summary,
    ).trim()
    const fromText = isMultiCity
        ? routeSummary || toText(readTravelFrom(row)).trim() || '—'
        : toText(readTravelFrom(row)).trim() || '—'
    const toTextValue = isMultiCity ? '' : toText(readTravelTo(row)).trim() || '—'

    const bookingAmount = isMultiCity
        ? toNumber(
              readTravelRowValue(row, 'mcBookingAmount') ??
                  row?.MC_Total_Booking_Amount ??
                  row?.mc_total_booking_amount ??
                  readTravelAmount(row),
          )
        : toNumber(readTravelAmount(row))

    const requestorText = toText(readTravelRequestor(row)).trim()
    const currentStep = extractCurrentStepText(row, TRAVEL_FIELD_IDS.currentStep)

    const slaRaw = extractSlaDeadlineRaw(row, TRAVEL_FIELD_IDS.slaDeadline)
    const deadlineAtMs = dateRawToMs(slaRaw)
    const deadlineText = slaRaw != null && slaRaw !== '' ? formatDeadlineCell(slaRaw) : ''
    const windowStartAtMs = dateRawToMs(departureRaw) ?? dateRawToMs(row?._created_at) ?? dateRawToMs(row?._modified_at) ?? null
    // Created-time for tie-break after SLA urgency sort.
    const listSortMs =
        dateRawToMs(row?._created_at) ??
        dateRawToMs(row?._modified_at) ??
        windowStartAtMs ??
        deadlineAtMs ??
        0

    return {
        requestId,
        travelTypeKey,
        tripTypeLabel,
        isMultiCity,
        departureDateStr,
        requestorText,
        fromText,
        toTextValue,
        routeSummary: routeSummary || fromText,
        bookingAmount,
        currentStep,
        deadlineText,
        deadlineAtMs,
        windowStartAtMs,
        listSortMs,
    }
}

/** Aligns with SlaCell: red breached · orange/yellow about-to-end (<24h) · green safe. */
const SLA_ABOUT_TO_END_MS = 24 * 60 * 60 * 1000

/**
 * Pending list order:
 * 1. SLA about to end (<24h left) — soonest deadline first
 * 2. Breached SLA — least overrun / most recently breached first
 * 3. Safe SLA (≥24h left) — soonest deadline first
 * 4. No SLA
 * Tie-break within each group: most recently created first.
 */
function comparePendingBySlaThenRecent(a, b) {
    const now = Date.now()
    const rankA = getSlaSortRank(a, now)
    const rankB = getSlaSortRank(b, now)

    if (rankA.bucket !== rankB.bucket) return rankA.bucket - rankB.bucket
    if (rankA.urgencyMs !== rankB.urgencyMs) return rankA.urgencyMs - rankB.urgencyMs
    return (b?.listSortMs || 0) - (a?.listSortMs || 0)
}

function getSlaSortRank(entry, now) {
    const deadline = entry?.deadlineAtMs
    const created = entry?.listSortMs || 0

    if (deadline == null || !Number.isFinite(deadline)) {
        return { bucket: 3, urgencyMs: Number.POSITIVE_INFINITY, created }
    }

    if (now > deadline) {
        // Breached — after about-to-end; least overrun (most recently breached) first
        return { bucket: 1, urgencyMs: now - deadline, created }
    }

    const remaining = deadline - now
    if (remaining < SLA_ABOUT_TO_END_MS) {
        // About to end — TOP of list; least time left first
        return { bucket: 0, urgencyMs: remaining, created }
    }

    // Safe — soonest deadline first
    return { bucket: 2, urgencyMs: remaining, created }
}

function safeJson(v) {
    try {
        return JSON.stringify(v)
    } catch {
        return String(v)
    }
}

function toText(val) {
    if (val === null || val === undefined) return ''
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
    if (Array.isArray(val)) {
        if (!val.length) return ''
        const names = val.map((x) => x?.Name || x?.FileName || x?.name || x?.filename || safeJson(x)).filter(Boolean)
        return names.length ? names.join(', ') : `${val.length} items`
    }
    if (typeof val === 'object') return val?.Name || val?.name || val?.Email || val?.email || val?.Value || val?.value || val?.Text || val?.text || safeJson(val)
    return String(val)
}

function extractPopupIds(row) {
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

function isPendingStatus(text) {
    const s = String(text || '').toLowerCase()
    if (!s) return true
    if (s.includes('reject') || s.includes('cancel') || s.includes('complete') || s.includes('approve') || s.includes('booked') || s.includes('paid')) return false
    return s.includes('pending') || s.includes('progress') || s.includes('review') || s.includes('approval') || s.includes('desk')
}

export default function PendingApprovalsWidget({
    onPopupClosed,
    insightFilter = null,
    onClearInsight,
    period: periodProp = null,
} = {}) {
    const accountId = useMemo(() => kf?.account?._id, [])
    const [scopeKey, setScopeKey] = useState('myItems')
    const [myItemsStatus, setMyItemsStatus] = useState('Draft')
    const [activeKey, setActiveKey] = useState('travel')
    const activeTab = useMemo(() => TABS.find((t) => t.key === activeKey) || TABS[0], [activeKey])
    const [counts, setCounts] = useState({ expense: 0, advance: 0, travel: 0 })
    const [statusCounts, setStatusCounts] = useState({})
    const [steps, setSteps] = useState([])
    const [activeStepId, setActiveStepId] = useState('')
    const [countsReady, setCountsReady] = useState(false)
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState([])
    const [cols, setCols] = useState([])
    const [rawCols, setRawCols] = useState([])
    const [tabActivityIds, setTabActivityIds] = useState({ expense: '', advance: '', travel: '' })
    const [tabInstanceActivityMap, setTabInstanceActivityMap] = useState({ expense: {}, advance: {}, travel: {} })
    const [error, setError] = useState('')
    const [searchId, setSearchId] = useState('')
    const [periodLocal, setPeriodLocal] = useState(() => getEmptyPeriodState())
    const period = periodProp || periodLocal
    const [currentPage, setCurrentPage] = useState(1)
    const [selectedDraftIds, setSelectedDraftIds] = useState(() => new Set())
    const [deletingDrafts, setDeletingDrafts] = useState(false)
    const [exportingCsv, setExportingCsv] = useState(false)
    const [insightStatuses, setInsightStatuses] = useState(null)
    const pageSize = 8
    const fetchSeqRef = useRef(0)

    const showSkeleton = loading
    const totalPending = (counts?.expense || 0) + (counts?.advance || 0) + (counts?.travel || 0)
    const showGlobalEmpty = countsReady && !loading && rows.length === 0 && !String(searchId || '').trim()

    const markPopupOpened = () => {
        try {
            window.__KF_DASH_POPUP_SEQ__ = Number(window.__KF_DASH_POPUP_SEQ__ || 0) + 1
            window.__KF_DASH_POPUP_OPENED_AT__ = Date.now()
        } catch {
            // ignore
        }
    }

    const paginateProcessApi = async (buildUrl) => {
        let allRows = []
        let allCols = []
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = buildUrl(page)
            const resp = await kf.api(url)
            const pageRows = Array.isArray(resp?.Data) ? resp.Data : Array.isArray(resp?.data) ? resp.data : []
            if (!allCols.length) allCols = resp?.Columns || resp?.columns || []
            if (!pageRows.length) break
            allRows = allRows.concat(pageRows)
            if (pageRows.length < PAGE_SIZE) break
        }
        return { allRows, allCols }
    }

    const fetchMyItemsStatusCounts = async (tab) => {
        if (!accountId || !tab) return {}
        try {
            const url = `/process/2/${accountId}/${tab.processId}/myitems/status/count?_application_id=${APP_ID}`
            const res = await kf.api(url)
            return {
                Draft: res?.Draft || 0,
                InProgress: res?.InProgress || 0,
                Completed: res?.Completed || 0,
                Withdrawn: res?.Withdrawn || 0,
                Rejected: res?.Rejected || 0,
            }
        } catch (e) {
            console.warn('My Items status count failed', tab.key, e)
            return {}
        }
    }

    const fetchProcessCounts = async () => {
        if (!accountId) return
        setCountsReady(false)
        try {
            if (scopeKey === 'myItems') {
                const results = await Promise.all(
                    TABS.map(async (t) => {
                        const sc = await fetchMyItemsStatusCounts(t)
                        const n = Array.isArray(insightStatuses) && insightStatuses.length
                            ? insightStatuses.reduce((sum, key) => sum + Number(sc?.[key] || 0), 0)
                            : Number(sc?.[myItemsStatus] || 0)
                        return { key: t.key, count: n, statusCounts: sc }
                    }),
                )
                const next = { expense: 0, advance: 0, travel: 0 }
                const byStatus = {}
                for (const r of results) {
                    next[r.key] = r.count
                    byStatus[r.key] = r.statusCounts
                }
                setCounts(next)
                setStatusCounts(byStatus)
            } else if (scopeKey === 'myTasks') {
                const results = await Promise.all(
                    TABS.map(async (t) => {
                        try {
                            const url = `/process/2/${accountId}/${t.processId}/pending/activity/count?_application_id=${APP_ID}`
                            const resp = await kf.api(url)
                            const list = Array.isArray(resp) ? resp : resp?.Data || resp?.data || []
                            const count = Array.isArray(list)
                                ? list.reduce((sum, s) => sum + (Number(s?.Count) || Number(s?.count) || 0), 0)
                                : 0
                            return { key: t.key, count, steps: Array.isArray(list) ? list : [] }
                        } catch {
                            return { key: t.key, count: 0, steps: [] }
                        }
                    }),
                )
                const next = { expense: 0, advance: 0, travel: 0 }
                for (const r of results) next[r.key] = r.count
                setCounts(next)
                const activeSteps = results.find((r) => r.key === activeKey)?.steps || []
                setSteps(activeSteps)
            } else {
                const results = await Promise.all(
                    TABS.map(async (t) => {
                        try {
                            const url = `/process/2/${accountId}/${t.processId}/participated/activity/count?_application_id=${APP_ID}`
                            const resp = await kf.api(url)
                            const list = Array.isArray(resp) ? resp : resp?.Data || resp?.data || []
                            const count = Array.isArray(list)
                                ? list.reduce((sum, s) => sum + (Number(s?.Count) || Number(s?.count) || 0), 0)
                                : 0
                            return { key: t.key, count, steps: Array.isArray(list) ? list : [] }
                        } catch {
                            return { key: t.key, count: 0, steps: [] }
                        }
                    }),
                )
                const next = { expense: 0, advance: 0, travel: 0 }
                for (const r of results) next[r.key] = r.count
                setCounts(next)
                const activeSteps = results.find((r) => r.key === activeKey)?.steps || []
                setSteps(activeSteps)
            }
        } catch (e) {
            console.error('Counts fetch failed:', e)
        } finally {
            setCountsReady(true)
        }
    }

    const fetchTabActivityIds = async () => {
        if (!accountId) return
        try {
            const next = { expense: '', advance: '', travel: '' }
            const maps = { expense: {}, advance: {}, travel: {} }
            await Promise.all(
                TABS.map(async (t) => {
                    try {
                        const url = `/process/2/${accountId}/${t.processId}/pending/activity/count?_application_id=${APP_ID}`
                        const resp = await kf.api(url)
                        const list = Array.isArray(resp) ? resp : resp?.Data ?? resp?.data ?? []
                        const first = Array.isArray(list) ? list.find((x) => x?._id) : null
                        next[t.key] = first?._id ? String(first._id) : ''

                        if (Array.isArray(list)) {
                            await Promise.all(
                                list.slice(0, 5).map(async (act) => {
                                    const activityId = act?._id
                                    if (!activityId) return
                                    const pendingUrl = `/process/2/${accountId}/${t.processId}/pending/${activityId}?_application_id=${APP_ID}&page_number=1&page_size=${PAGE_SIZE}`
                                    try {
                                        const pendingResp = await kf.api(pendingUrl)
                                        const pendingRows = pendingResp?.Data || pendingResp?.data || []
                                        if (!Array.isArray(pendingRows)) return
                                        for (const r of pendingRows) {
                                            const iId = r?._id ? String(r._id) : ''
                                            const aId = r?._activity_instance_id ? String(r._activity_instance_id) : ''
                                            if (iId && aId) maps[t.key][iId] = aId
                                        }
                                    } catch {
                                        // ignore
                                    }
                                }),
                            )
                        }

                        for (let page = 1; page <= 3; page++) {
                            const myItemsUrl = `/process/2/${accountId}/${t.processId}/myitems?apply_preference=true&skip_aggregation=true&_application_id=${APP_ID}&page_number=${page}&page_size=${PAGE_SIZE}`
                            let myItemsResp
                            try {
                                myItemsResp = await kf.api(myItemsUrl)
                            } catch {
                                break
                            }
                            const myItemsRows = myItemsResp?.Data || myItemsResp?.data || []
                            if (!Array.isArray(myItemsRows) || !myItemsRows.length) break
                            for (const item of myItemsRows) {
                                const iId = item?._id ? String(item._id) : ''
                                const aId = item?._activity_instance_id ? String(item._activity_instance_id) : ''
                                if (iId && aId && !maps[t.key][iId]) maps[t.key][iId] = aId
                            }
                            if (myItemsRows.length < PAGE_SIZE) break
                        }
                    } catch (e) {
                        console.warn('Activity id map failed for', t.key, e)
                    }
                }),
            )
            setTabActivityIds(next)
            setTabInstanceActivityMap(maps)
        } catch (e) {
            console.warn('Pending activity id fetch failed:', e)
        }
    }

    const fetchList = async (tab) => {
        if (!accountId || !tab) return
        const seq = ++fetchSeqRef.current
        setLoading(true)
        setError('')
        try {
            let allRows = []
            let allCols = []

            if (scopeKey === 'myItems') {
                const insightBucketStatuses =
                    insightFilter?.processKey === tab.key
                        ? statusesForInsightBucket(insightFilter.bucket)
                        : null
                const statuses = (
                    Array.isArray(insightBucketStatuses) && insightBucketStatuses.length
                        ? insightBucketStatuses
                        : Array.isArray(insightStatuses) && insightStatuses.length
                          ? insightStatuses
                          : [myItemsStatus || 'Draft']
                ).filter(Boolean)
                const prefCols = PREFERENCE_COLUMNS?.[tab.key] || []
                for (const status of statuses) {
                    if (prefCols.length) {
                        await postWorkflowStepPreference({
                            accountId,
                            processId: tab.processId,
                            viewId: status,
                            columns: prefCols,
                        })
                    }
                }
                const chunks = await Promise.all(
                    statuses.map((status) =>
                        paginateProcessApi(
                            (page) =>
                                `/process/2/${accountId}/${tab.processId}/myitems/${status}?page_number=${page}&page_size=${PAGE_SIZE}&apply_preference=true&skip_aggregation=true&_application_id=${APP_ID}`,
                        ),
                    ),
                )
                const seen = new Set()
                allRows = []
                allCols = []
                for (const chunk of chunks) {
                    if (!allCols.length) allCols = chunk.allCols
                    for (const row of chunk.allRows || []) {
                        const id = String(row?._id || '').trim()
                        if (id) {
                            if (seen.has(id)) continue
                            seen.add(id)
                        }
                        allRows.push(row)
                    }
                }
            } else if (scopeKey === 'myTasks') {
                let stepId = activeStepId
                if (!stepId) {
                    const countUrl = `/process/2/${accountId}/${tab.processId}/pending/activity/count?_application_id=${APP_ID}`
                    const resp = await kf.api(countUrl)
                    const list = Array.isArray(resp) ? resp : resp?.Data || resp?.data || []
                    const stepsList = Array.isArray(list) ? list : []
                    if (seq === fetchSeqRef.current) setSteps(stepsList)
                    stepId = stepsList[0]?._id ? String(stepsList[0]._id) : ''
                    if (seq === fetchSeqRef.current) setActiveStepId(stepId)
                }
                if (stepId) {
                    const prefCols = PREFERENCE_COLUMNS?.[tab.key] || []
                    if (prefCols.length) {
                        await postWorkflowStepPreference({
                            accountId,
                            processId: tab.processId,
                            viewId: stepId,
                            columns: prefCols,
                        })
                    }
                    const result = await paginateProcessApi(
                        (page) =>
                            `/process/2/${accountId}/${tab.processId}/pending/${stepId}?page_number=${page}&page_size=${PAGE_SIZE}&apply_preference=true&skip_aggregation=true&_application_id=${APP_ID}`,
                    )
                    allRows = result.allRows
                    allCols = result.allCols
                }
            } else {
                let stepId = activeStepId
                if (!stepId) {
                    const countUrl = `/process/2/${accountId}/${tab.processId}/participated/activity/count?_application_id=${APP_ID}`
                    const resp = await kf.api(countUrl)
                    const list = Array.isArray(resp) ? resp : resp?.Data || resp?.data || []
                    const stepsList = Array.isArray(list) ? list : []
                    if (seq === fetchSeqRef.current) setSteps(stepsList)
                    stepId = stepsList[0]?._id ? String(stepsList[0]._id) : ''
                    if (seq === fetchSeqRef.current) setActiveStepId(stepId)
                }
                if (stepId) {
                    const prefCols = PREFERENCE_COLUMNS?.[tab.key] || []
                    if (prefCols.length) {
                        await postWorkflowStepPreference({
                            accountId,
                            processId: tab.processId,
                            viewId: stepId,
                            columns: prefCols,
                            viewType: 'Participated',
                        })
                    }
                    const result = await paginateProcessApi(
                        (page) =>
                            `/process/2/${accountId}/${tab.processId}/participated/activity/${stepId}?page_number=${page}&page_size=${PAGE_SIZE}&apply_preference=true&skip_aggregation=true&_application_id=${APP_ID}`,
                    )
                    allRows = result.allRows
                    allCols = result.allCols
                }
            }

            if (seq !== fetchSeqRef.current) return
            const visibleCols = (allCols || []).filter((col) => !HIDDEN_COLUMNS.includes(col.Id))
            setCols(visibleCols)
            setRawCols(allCols)

            let finalRows = allRows
            if (tab.key === 'travel' && allRows.length) {
                const reportMap = await fetchTravelAllItemsReportMap(accountId)
                if (seq !== fetchSeqRef.current) return
                finalRows = allRows.map((row) => {
                    const id = String(row?._id || '').trim()
                    return enrichTravelRowWithReport(row, id ? reportMap.get(id) : null)
                })

                // For drafts still missing trip fields, hydrate from item GET (cap to keep UI snappy)
                const needDetail = finalRows
                    .map((row, idx) => ({ row, idx }))
                    .filter(({ row }) => travelRowNeedsDetail(row))
                    .slice(0, 25)

                if (needDetail.length) {
                    const hydrated = [...finalRows]
                    await Promise.all(
                        needDetail.map(async ({ row, idx }) => {
                            const instanceId = String(row?._id || '').trim()
                            const activityId = String(
                                row?._activity_instance_id ||
                                    row?._context_activity_instance_id ||
                                    '',
                            ).trim()
                            const detail = await fetchTravelItemDetail(accountId, instanceId, activityId)
                            if (detail && typeof detail === 'object') {
                                hydrated[idx] = enrichTravelRowWithReport(
                                    { ...row, ...detail },
                                    reportMap.get(instanceId),
                                )
                            }
                        }),
                    )
                    if (seq !== fetchSeqRef.current) return
                    finalRows = hydrated
                }
            } else if (tab.key === 'advance' && allRows.length) {
                const reportMap = await fetchAdvanceAllItemsReportMap(accountId)
                if (seq !== fetchSeqRef.current) return
                finalRows = allRows.map((row) => {
                    const id = String(row?._id || '').trim()
                    return enrichAdvanceRowWithReport(row, id ? reportMap.get(id) : null)
                })
            } else if (tab.key === 'expense' && allRows.length) {
                const reportMap = await fetchExpenseAllItemsReportMap(accountId)
                if (seq !== fetchSeqRef.current) return
                finalRows = allRows.map((row) => {
                    const id = String(row?._id || '').trim()
                    return enrichExpenseRowWithReport(row, id ? reportMap.get(id) : null)
                })
            }

            setRows(finalRows)
        } catch (e) {
            if (seq !== fetchSeqRef.current) return
            setError(e?.message || `Unable to fetch ${tab.label} items.`)
            setRows([])
            setCols([])
            setRawCols([])
        } finally {
            if (seq === fetchSeqRef.current) setLoading(false)
        }
    }

    useEffect(() => {
        if (!accountId) return
        fetchTabActivityIds()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId])

    useEffect(() => {
        if (!accountId) return
        setActiveStepId('')
        setSteps([])
        setCurrentPage(1)
        setSearchId('')
        fetchProcessCounts()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId, scopeKey, myItemsStatus, insightStatuses])

    useEffect(() => {
        if (!insightFilter?.token || !insightFilter?.processKey || !insightFilter?.bucket) {
            setInsightStatuses((prev) => (prev ? null : prev))
            return
        }
        const nextStatuses = statusesForInsightBucket(insightFilter.bucket)
        setScopeKey('myItems')
        setActiveKey(insightFilter.processKey)
        setMyItemsStatus(insightFilter.bucket === 'claimed' ? 'Completed' : 'InProgress')
        setInsightStatuses(nextStatuses)
        setCurrentPage(1)
        setSearchId('')
        setSelectedDraftIds(new Set())
        setError('')
        setLoading(true)
        if (Array.isArray(insightFilter.rows)) {
            setCounts((prev) => ({ ...prev, [insightFilter.processKey]: insightFilter.rows.length }))
        }
    }, [insightFilter?.token, insightFilter?.processKey, insightFilter?.bucket])

    const clearCardInsight = () => {
        setInsightStatuses(null)
        onClearInsight?.()
    }

    useEffect(() => {
        if (!accountId || !countsReady) return
        setCurrentPage(1)
        setSearchId('')
        fetchList(activeTab)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId, countsReady, activeTab.key, scopeKey, myItemsStatus, activeStepId, insightStatuses, insightFilter?.token])

    useEffect(() => {
        if (!accountId || scopeKey === 'myItems') return
        let cancelled = false
        ;(async () => {
            try {
                const url =
                    scopeKey === 'myTasks'
                        ? `/process/2/${accountId}/${activeTab.processId}/pending/activity/count?_application_id=${APP_ID}`
                        : `/process/2/${accountId}/${activeTab.processId}/participated/activity/count?_application_id=${APP_ID}`
                const resp = await kf.api(url)
                const list = Array.isArray(resp) ? resp : resp?.Data || resp?.data || []
                if (cancelled) return
                const stepsList = Array.isArray(list) ? list : []
                setSteps(stepsList)
                setActiveStepId((prev) => {
                    if (prev && stepsList.some((s) => String(s?._id) === String(prev))) return prev
                    return stepsList[0]?._id ? String(stepsList[0]._id) : ''
                })
            } catch (e) {
                if (!cancelled) {
                    setSteps([])
                    setActiveStepId('')
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [accountId, scopeKey, activeTab.processId, activeTab.key])

    const resolveIdsFromListPayload = (row) => {
        const ids = extractPopupIds(row)
        if (ids.instanceId && ids.activityId) return ids

        const colsByPattern = (pattern) =>
            (rawCols || []).filter((c) => pattern.test(String(c?.Name || ''))).map((c) => c.Id)

        const instanceCandidates = [
            ...colsByPattern(/instance.*id|request.*id|item.*id|record.*id|^id$/i),
            'Column_RzqotquBQV',
        ]
        const activityCandidates = [
            ...colsByPattern(/activity.*instance.*id|activity.*id|task.*id|workflow.*id|work item.*id/i),
            'Column_eFd2LUqnSP',
        ]

        const getFirstValue = (candidateIds) => {
            for (const colId of candidateIds) {
                const value = row?.[colId]
                if (value !== null && value !== undefined && String(value).trim() !== '') {
                    return String(value)
                }
            }
            return ''
        }

        const resolvedInstanceId = ids.instanceId || getFirstValue(instanceCandidates)
        const mappedActivityId =
            resolvedInstanceId && tabInstanceActivityMap?.[activeTab.key]?.[resolvedInstanceId]
                ? String(tabInstanceActivityMap[activeTab.key][resolvedInstanceId])
                : ''

        return {
            instanceId: resolvedInstanceId,
            activityId: ids.activityId || getFirstValue(activityCandidates) || mappedActivityId,
        }
    }

    const getRowId = (row, idx) => row?._id || row?.Column_RzqotquBQV || `${activeTab.key}-${idx}`
    const filteredRows = useMemo(() => {
        const q = String(searchId || '').trim().toLowerCase()
        const afterSearch = !q ? rows : rows.filter((row, idx) => String(getRowId(row, idx)).toLowerCase().includes(q))
        return afterSearch.filter((row) => requestedDateInPeriod(readRequestedAtMs(row, activeTab.key), period))
    }, [rows, searchId, activeTab.key, period])

    const expenseFieldIds = useMemo(() => resolveExpenseFieldIds(rawCols), [rawCols])

    const expenseViewRows = useMemo(() => {
        if (activeTab.key !== 'expense') return null
        const ids = expenseFieldIds || EMPTY_EXPENSE_FIELD_IDS
        const built = filteredRows.map((row) => {
            const view = buildExpenseRowView(row, ids)
            return { row, ...view }
        })
        built.sort(comparePendingBySlaThenRecent)
        return built
    }, [filteredRows, activeTab.key, expenseFieldIds])

    const advanceViewRows = useMemo(() => {
        if (activeTab.key !== 'advance') return null
        const built = filteredRows.map((row) => ({ row, ...buildAdvanceRowView(row) }))
        built.sort(comparePendingBySlaThenRecent)
        return built
    }, [filteredRows, activeTab.key])

    const travelViewRows = useMemo(() => {
        if (activeTab.key !== 'travel') return null
        const built = filteredRows.map((row) => ({ row, ...buildTravelRowView(row) }))
        built.sort(comparePendingBySlaThenRecent)
        return built
    }, [filteredRows, activeTab.key])

    const activeStatusCounts = useMemo(() => {
        const sc = statusCounts?.[activeKey] || {}
        return {
            Draft: Number(sc.Draft || 0),
            InProgress: Number(sc.InProgress || 0),
            Completed: Number(sc.Completed || 0),
            Withdrawn: Number(sc.Withdrawn || 0),
            Rejected: Number(sc.Rejected || 0),
        }
    }, [statusCounts, activeKey])

    const paginationLength =
        activeTab.key === 'expense' && expenseViewRows != null
            ? expenseViewRows.length
            : activeTab.key === 'advance' && advanceViewRows != null
              ? advanceViewRows.length
              : activeTab.key === 'travel' && travelViewRows != null
                ? travelViewRows.length
              : filteredRows.length
    const totalPages = Math.max(1, Math.ceil(paginationLength / pageSize))
    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize
        if (activeTab.key === 'expense' && expenseViewRows) {
            return expenseViewRows.slice(start, start + pageSize)
        }
        if (activeTab.key === 'advance' && advanceViewRows) {
            return advanceViewRows.slice(start, start + pageSize)
        }
        if (activeTab.key === 'travel' && travelViewRows) {
            return travelViewRows.slice(start, start + pageSize)
        }
        return filteredRows.slice(start, start + pageSize)
    }, [filteredRows, activeTab.key, expenseViewRows, advanceViewRows, travelViewRows, currentPage, pageSize])

    useEffect(() => {
        setCurrentPage(1)
        setSearchId('')
        setSelectedDraftIds(new Set())
        if (scopeKey !== 'myItems') setActiveStepId('')
        setLoading(true)
    }, [activeKey, scopeKey, myItemsStatus])

    useEffect(() => {
        setCurrentPage(1)
        setSelectedDraftIds(new Set())
    }, [period?.mode, period?.summaryLabel, period?.range?.from, period?.range?.to])

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages)
    }, [currentPage, totalPages])

    const showDraftBulkSelect = scopeKey === 'myItems' && myItemsStatus === 'Draft'
    const showRowSelect = paginationLength > 0
    const resolveDraftDeleteId = (row) =>
        String(row?._id ?? row?.InstanceID ?? row?.InstanceId ?? row?.id ?? '').trim()
    const rowFromView = (entry) => entry?.row || entry
    const draftPageRowIds = showRowSelect
        ? paginatedRows.map((entry) => resolveDraftDeleteId(rowFromView(entry))).filter(Boolean)
        : []
    const allDraftRowsSelected =
        draftPageRowIds.length > 0 && draftPageRowIds.every((id) => selectedDraftIds.has(id))
    const exportSourceRows =
        activeTab.key === 'expense' && expenseViewRows
            ? expenseViewRows
            : activeTab.key === 'advance' && advanceViewRows
              ? advanceViewRows
              : activeTab.key === 'travel' && travelViewRows
                ? travelViewRows
                : filteredRows

    const handleExportCsv = () => {
        if (exportingCsv) return
        const all = Array.isArray(exportSourceRows) ? exportSourceRows : []
        const chosen = selectedDraftIds.size
            ? all.filter((entry) => selectedDraftIds.has(resolveDraftDeleteId(rowFromView(entry))))
            : all
        if (!chosen.length) {
            kf?.client?.showInfo?.('No records to export.')
            return
        }
        setExportingCsv(true)
        try {
            if (activeTab.key === 'expense' || activeTab.key === 'advance' || activeTab.key === 'travel') {
                const mapped =
                    activeTab.key === 'travel'
                        ? chosen.map((entry) => {
                              const route = splitTravelRoute(entry)
                              return { ...entry, exportFrom: route.from, exportTo: route.to }
                          })
                        : chosen
                const payload = buildProcessCsv(activeTab.key, mapped, formatINR)
                downloadRecordsCsv({
                    ...payload,
                    filenameBase: `employee-${payload.filenameBase}`,
                })
            } else {
                const headers = (cols || []).map((c) => c.Name)
                downloadRecordsCsv({
                    filenameBase: 'employee-records',
                    headers,
                    rows: chosen.map((entry) => {
                        const row = rowFromView(entry)
                        const out = {}
                        ;(cols || []).forEach((c) => {
                            out[c.Name] = toText(row?.[c.Id])
                        })
                        return out
                    }),
                })
            }
        } catch (error) {
            console.warn('CSV export failed', error)
            kf?.client?.showInfo?.('Export failed. Please try again.')
        } finally {
            setExportingCsv(false)
        }
    }

    const toggleDraftSelection = (id) => {
        if (!id) return
        setSelectedDraftIds((previous) => {
            const next = new Set(previous)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAllDraftsOnPage = (checked) => {
        setSelectedDraftIds((previous) => {
            const next = new Set(previous)
            draftPageRowIds.forEach((id) => {
                if (checked) next.add(id)
                else next.delete(id)
            })
            return next
        })
    }

    const handleDeleteSelectedDrafts = async () => {
        const ids = Array.from(selectedDraftIds).filter(Boolean)
        if (!showDraftBulkSelect || !ids.length || deletingDrafts || !accountId) return

        const confirmed = window.confirm(
            `Delete ${ids.length} selected draft record(s)? This cannot be undone.`,
        )
        if (!confirmed) return

        const deleteOptions = { method: 'DELETE', headers: { Accept: 'application/json' } }
        const assertDeleted = (response) => {
            const status = Number(response?.status ?? response?.statusCode ?? 0)
            if (status >= 400 || response?.error || response?.errorCode || response?.Error) {
                throw new Error(response?.message || response?.error || 'Delete rejected')
            }
            return response
        }
        // Owners can delete their own drafts without process-admin rights; admin route is the fallback.
        const deleteDraft = async (id) => {
            const encodedId = encodeURIComponent(id)
            try {
                return assertDeleted(
                    await kf.api(`/process/2/${accountId}/${activeTab.processId}/${encodedId}`, deleteOptions),
                )
            } catch (ownerError) {
                console.warn('Draft owner delete failed, trying admin delete', id, ownerError)
                return assertDeleted(
                    await kf.api(
                        `/process/2/${accountId}/admin/${activeTab.processId}/${encodedId}`,
                        deleteOptions,
                    ),
                )
            }
        }

        setDeletingDrafts(true)
        try {
            const results = await Promise.allSettled(ids.map(deleteDraft))
            results.forEach((result, index) => {
                if (result.status === 'rejected') console.error('Draft delete failed', ids[index], result.reason)
            })
            const successIds = results
                .map((result, index) => (result.status === 'fulfilled' ? ids[index] : ''))
                .filter(Boolean)
            const failed = ids.length - successIds.length

            if (successIds.length) {
                setSelectedDraftIds((previous) => {
                    const next = new Set(previous)
                    successIds.forEach((id) => next.delete(id))
                    return next
                })
                await Promise.all([fetchProcessCounts(), fetchList(activeTab)])
            }

            if (failed) {
                window.alert(`${successIds.length} draft(s) deleted, ${failed} failed.`)
            } else if (successIds.length) {
                window.alert(`${successIds.length} draft(s) deleted successfully.`)
            }
        } catch (deleteError) {
            console.error('Draft delete failed', deleteError)
            window.alert('Delete failed. Please try again or contact support.')
        } finally {
            setDeletingDrafts(false)
        }
    }

    const handleRowClick = async (row) => {
        const { instanceId, activityId } = resolveIdsFromListPayload(row)
        if (!instanceId) {
            console.warn('Pending Approvals: missing popup ids', {
                tab: activeTab.key,
                instanceId,
                activityId,
                row,
            })
            kf?.client?.showInfo?.('Unable to open details for this record.')
            return
        }
        // Same strategy as LeadsManagementPage: prioritize activity-instance context
        // and keep broad aliases for popup compatibility.
        const activityInstanceId = activityId || ''
        const fallbackActivityId = tabActivityIds[activeTab.key] || ''
        const resolvedActivityId = activityInstanceId || fallbackActivityId
        if (!resolvedActivityId) {
            console.warn('Pending Approvals: missing activity instance id', {
                tab: activeTab.key,
                instanceId,
                row,
            })
            kf?.client?.showInfo?.('Unable to open this record: missing workflow activity context.')
            return
        }

        try {
            markPopupOpened()
            kf.app.page.openPopup(activeTab.popup, {
                ActivityID: resolvedActivityId,
                InstanceId: instanceId,
                ActivityInstanceId: activityInstanceId || resolvedActivityId,
                ActivityId: resolvedActivityId,
                activityId: resolvedActivityId,
                // Compatibility aliases
                InstanceID: instanceId,
                instance_id: instanceId,
                activity_instance_id: activityInstanceId || resolvedActivityId,
                width: 960,
                height: 720,
                popupWidth: '960px',
                popupHeight: '720px',
            })
            // Parent dashboard refreshes on focus/visibility regain.
            if (typeof onPopupClosed === 'function') {
                // still call after a short delay (covers cases where platform doesn't change focus)
                setTimeout(() => onPopupClosed(), 1500)
            }
        } catch (e) {
            console.error('Pending Approvals popup open failed', e)
            kf?.client?.showInfo?.('Unable to open details popup.')
        }
    }

    return (
        <div
            className={`records-panel overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(76,98,168,0.12)] sm:rounded-2xl lg:rounded-3xl${insightFilter?.pulse ? ' is-insight-pulse' : ''}${insightStatuses?.length ? ' is-insight-filtered' : ''}`}
            style={{ '--records-accent': activeTab.color }}
        >
            <div className="records-header flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-[#EEF4FF] px-3 py-3 sm:px-5 sm:py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="records-title-icon flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white sm:h-12 sm:w-12">
                            <img src={customPendingRequestsIcon} alt="" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[15px] font-semibold text-slate-900 sm:text-base">My Records</h3>
                            <p className="text-[11px] text-slate-500 sm:text-xs">
                                {insightFilter?.label
                                    ? `Showing ${insightFilter.label} · ${activeTab.label} (${rows.length})`
                                    : 'Drafts, items, tasks & participated · all processes'}
                            </p>
                        </div>
                        {insightFilter?.label ? (
                            <button
                                type="button"
                                className="records-insight-clear"
                                onClick={clearCardInsight}
                            >
                                Clear filter
                            </button>
                        ) : null}
                    </div>
                    <div className="w-full overflow-x-auto hide-scrollbar sm:w-auto">
                        <div className="inline-flex w-full min-w-max items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/95 p-1 shadow-sm sm:w-auto sm:rounded-xl">
                            {SCOPE_TABS.map((scope) => {
                                const isActive = scopeKey === scope.key
                                return (
                                    <button
                                        key={scope.key}
                                        type="button"
                                        onClick={() => {
                                            if (insightStatuses?.length) clearCardInsight()
                                            setScopeKey(scope.key)
                                        }}
                                        className={`records-scope-tab btn-press flex-1 cursor-pointer whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all sm:flex-none sm:rounded-lg sm:px-3 sm:py-1.5${isActive ? ' is-active' : ''}`}
                                        style={isActive ? undefined : { color: '#64748b', background: 'transparent' }}
                                    >
                                        {scope.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <div className="w-full overflow-x-auto hide-scrollbar">
                    <div className="records-process-tabs inline-flex w-full min-w-max items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/95 p-1 shadow-sm sm:rounded-xl">
                        {TABS.map((tab) => {
                            const isActive = activeKey === tab.key
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => {
                                        if (insightStatuses?.length && tab.key !== insightFilter?.processKey) {
                                            clearCardInsight()
                                        }
                                        setActiveKey(tab.key)
                                    }}
                                    className={`records-process-tab btn-press ${isActive ? 'is-active' : ''}`}
                                    style={{ '--tab-color': tab.color, '--tab-glow': tab.glow }}
                                >
                                    <span className="records-process-icon" aria-hidden="true">
                                        <span className="records-process-glow" />
                                        <span className="records-process-shine" />
                                        <img src={tab.icon} alt="" />
                                    </span>
                                    <span className="sm:hidden">{tab.short}</span>
                                    <span className="hidden sm:inline">{tab.label}</span>
                                    <span className="ml-1 opacity-80">({counts[tab.key] ?? 0})</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {scopeKey === 'myItems' ? (
                    <div className="w-full overflow-x-auto hide-scrollbar">
                        <div className="inline-flex min-w-max items-center gap-1.5">
                            {MY_ITEMS_STATUSES.map((st) => {
                                const isActive = insightStatuses?.length
                                    ? insightStatuses.includes(st.key)
                                    : myItemsStatus === st.key
                                const n = activeStatusCounts[st.key]
                                return (
                                    <button
                                        key={st.key}
                                        type="button"
                                        onClick={() => {
                                            if (insightStatuses?.length) clearCardInsight()
                                            setMyItemsStatus(st.key)
                                        }}
                                        className={`records-status-chip btn-press rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all sm:text-xs${isActive ? ' is-active' : ''}`}
                                    >
                                        {st.label}
                                        {n != null ? <span className="ml-1 opacity-70">{n}</span> : null}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ) : null}

                {(scopeKey === 'myTasks' || scopeKey === 'participated') && steps.length > 0 ? (
                    <div className="w-full overflow-x-auto hide-scrollbar">
                        <div className="inline-flex min-w-max items-center gap-1.5">
                            {steps.map((s) => {
                                const id = String(s?._id || '')
                                const isActive = String(activeStepId) === id
                                const label = s?.StepName || s?.Name || s?.name || 'Step'
                                const n = Number(s?.Count) || Number(s?.count) || 0
                                return (
                                    <button
                                        key={id || label}
                                        type="button"
                                        onClick={() => setActiveStepId(id)}
                                        className={`records-status-chip btn-press rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all sm:text-xs${isActive ? ' is-active' : ''}`}
                                    >
                                        {label}
                                        <span className="ml-1 opacity-70">{n}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="p-3 sm:p-4 lg:p-5">
            {selectedDraftIds.size > 0 ? (
                <div className="draft-bulk-toolbar mb-3" role="status">
                    <div className="draft-selection-count">
                        <span className="draft-selection-icon" aria-hidden="true">
                            <i className="ri-checkbox-multiple-line" />
                        </span>
                        <span>
                            <strong>{selectedDraftIds.size}</strong> selected
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="draft-clear-button"
                            onClick={() => setSelectedDraftIds(new Set())}
                            disabled={deletingDrafts}
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            className="draft-export-button"
                            onClick={handleExportCsv}
                            disabled={exportingCsv}
                        >
                            <i className="ri-file-excel-2-line" aria-hidden />
                            {exportingCsv ? 'Exporting…' : 'Export CSV'}
                        </button>
                        {showDraftBulkSelect ? (
                        <button
                            type="button"
                            className="draft-delete-button"
                            onClick={handleDeleteSelectedDrafts}
                            disabled={deletingDrafts}
                        >
                            <i
                                className={
                                    deletingDrafts
                                        ? 'ri-loader-4-line draft-delete-spinner'
                                        : 'ri-delete-bin-6-line'
                                }
                                aria-hidden="true"
                            />
                            {deletingDrafts ? 'Deleting…' : `Delete (${selectedDraftIds.size})`}
                        </button>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm focus-within:border-[#2879b6] focus-within:ring-2 focus-within:ring-[#2879b6]/20 sm:rounded-xl sm:py-2">
                    <i className="ri-search-line text-base text-slate-400 sm:text-sm" />
                    <input
                        value={searchId}
                        onChange={(e) => {
                            setSearchId(e.target.value)
                            setCurrentPage(1)
                        }}
                        placeholder="Search by ID..."
                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none sm:text-xs"
                    />
                </div>
                <RecordsExportMenu
                    exporting={exportingCsv}
                    selectedCount={selectedDraftIds.size}
                    totalCount={paginationLength}
                    onExportCsv={handleExportCsv}
                />
            </div>

            {showSkeleton ? (
                <div
                    className="rounded-xl overflow-hidden animate-pulse"
                    style={{
                        border: '1px solid rgba(226, 232, 240, 0.9)',
                        maxHeight: 5 * 52 + 44,
                    }}
                >
                    <div
                        style={{
                            height: 44,
                            borderBottom: '1px solid #EAECF0',
                            background: 'rgba(248, 250, 252, 0.95)',
                            display: 'grid',
                            gridTemplateColumns:
                                activeKey === 'expense' || activeKey === 'advance' || activeKey === 'travel'
                                    ? 'minmax(100px,1fr) minmax(88px,0.8fr) minmax(96px,0.9fr) minmax(120px,1.05fr) 0.7fr minmax(100px,1fr) minmax(100px,1fr) minmax(120px,1.05fr)'
                                    : '1.2fr 1fr 1fr 1fr',
                            gap: 10,
                            padding: '10px 12px',
                        }}
                    >
                        {Array.from({ length: activeKey === 'expense' ? 8 : activeKey === 'advance' ? 6 : activeKey === 'travel' ? 9 : 4 }, (_, i) => (
                            <div key={`sk-h-${i}`} style={{ height: 12, borderRadius: 6, background: '#E5E7EB' }} />
                        ))}
                    </div>

                    <div style={{ background: '#FFFFFF' }}>
                        {[0, 1, 2, 3, 4].map((r) => (
                            <div
                                key={`sk-r-${r}`}
                                style={{
                                    height: 52,
                                    borderBottom: r === 4 ? 'none' : '1px solid #F2F4F7',
                                    display: 'grid',
                                    gridTemplateColumns:
                                        activeKey === 'expense' || activeKey === 'advance' || activeKey === 'travel'
                                            ? 'minmax(100px,1fr) minmax(88px,0.8fr) minmax(96px,0.9fr) minmax(120px,1.05fr) 0.7fr minmax(100px,1fr) minmax(100px,1fr) minmax(120px,1.05fr)'
                                            : '1.2fr 1fr 1fr 1fr',
                                    gap: 10,
                                    padding: '10px 12px',
                                    alignItems: 'center',
                                }}
                            >
                                {Array.from({ length: activeKey === 'expense' ? 8 : activeKey === 'advance' ? 6 : activeKey === 'travel' ? 9 : 4 }, (__, c) => (
                                    <div
                                        key={`sk-c-${r}-${c}`}
                                        style={{
                                            height: 10,
                                            borderRadius: 999,
                                            background: c === 0 ? '#E5E7EB' : '#EDF1F5',
                                            width: c === 0 ? '85%' : c === 6 || c === 3 ? '60%' : '75%',
                                        }}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            ) : error ? (
                <div className="text-xs p-3 rounded-lg" style={{ color: '#B42318', background: '#FFFBFA', border: '1px solid #FDA29B' }}>
                    {error}
                </div>
            ) : showGlobalEmpty ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-sm sm:h-14 sm:w-14">
                        <i className="ri-inbox-2-line text-xl text-slate-400 sm:text-2xl" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">No records found</p>
                    <p className="mt-1 text-xs text-slate-500">
                        No {scopeKey === 'myItems' ? MY_ITEMS_STATUSES.find((s) => s.key === myItemsStatus)?.label || 'items' : scopeKey === 'myTasks' ? 'tasks' : 'participated items'} in this process.
                    </p>
                    <div className="mt-2 text-[10px] text-slate-400">Try another tab or process.</div>
                </div>
            ) : filteredRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <p className="text-sm font-semibold text-slate-800">No matching pending records</p>
                    <p className="mt-1 text-xs text-slate-500">Try a different ID, or clear the search or date filter.</p>
                </div>
            ) : activeKey === 'expense' ? (
                <>
                <div
                    className="records-desktop-table rounded-xl overflow-x-auto overflow-y-auto"
                    style={{
                        border: '1px solid rgba(226, 232, 240, 0.9)',
                        maxHeight: 5 * 52 + 44,
                    }}
                >
                    <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 1020 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                                {showRowSelect ? (
                                    <th className="draft-select-cell">
                                        <input
                                            type="checkbox"
                                            className="draft-checkbox"
                                            aria-label="Select all drafts on this page"
                                            checked={allDraftRowsSelected}
                                            onChange={(event) => toggleAllDraftsOnPage(event.target.checked)}
                                        />
                                    </th>
                                ) : null}
                                {[
                                    { label: 'Expense ID', align: 'left' },
                                    { label: 'Request Date', align: 'left' },
                                    { label: 'Requestor', align: 'left' },
                                    { label: 'Expense Type', align: 'left' },
                                    { label: 'Total Amount', align: 'right' },
                                    { label: 'Current step', align: 'left' },
                                    { label: 'SLA', align: 'left' },
                                ].map((h) => (
                                    <th
                                        key={h.label}
                                        className="text-[10px] sm:text-xs font-semibold text-[#475569] uppercase tracking-wider whitespace-nowrap px-3 py-2.5"
                                        style={{
                                            textAlign: h.align,
                                            background: 'rgba(248, 250, 252, 0.95)',
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 1,
                                        }}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.map((entry, idx) => {
                                const tkey = normalizeExpenseTypeKey(entry.expenseType)
                                const cfg = EXPENSE_TYPE_STYLE[tkey] || EXPENSE_TYPE_STYLE.other
                                const draftId = resolveDraftDeleteId(entry.row)
                                const isSelected = showRowSelect && selectedDraftIds.has(draftId)
                                return (
                                    <tr
                                        key={getRowId(entry.row, idx)}
                                        onClick={() => handleRowClick(entry.row)}
                                        className={`records-data-row cursor-pointer ${isSelected ? 'is-selected' : ''}`}
                                    >
                                        {showRowSelect ? (
                                            <td className="draft-select-cell">
                                                <input
                                                    type="checkbox"
                                                    className="draft-checkbox"
                                                    aria-label={`Select draft ${draftId}`}
                                                    checked={isSelected}
                                                    disabled={!draftId}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onChange={() => toggleDraftSelection(draftId)}
                                                />
                                            </td>
                                        ) : null}
                                        <td className="px-3 py-2.5 align-middle" style={{ fontSize: 12, color: '#101828' }}>
                                            <span
                                                className="record-id-badge inline-block max-w-[140px] truncate align-middle"
                                                title={entry.expenseId}
                                            >
                                                {entry.expenseId}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 align-middle text-[11px] sm:text-xs text-gray-500 whitespace-nowrap">
                                            {entry.requestDateStr || '—'}
                                        </td>
                                        <td className="px-3 py-2.5 align-middle max-w-[140px]">
                                            <span className="text-[11px] sm:text-xs text-gray-700 truncate block" title={entry.requestorText || ''}>
                                                {entry.requestorText || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 align-middle">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div
                                                    className="record-type-icon"
                                                >
                                                    <i className={`${cfg.icon} text-white text-sm`} />
                                                </div>
                                                <span className="record-type-label truncate min-w-0">
                                                    {entry.expenseType}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 align-middle text-right">
                                            <span className="record-amount">{formatINR(entry.totalAmount)}</span>
                                        </td>
                                        <td className="px-3 py-2.5 align-top max-w-[200px]">
                                            <CurrentStepBadges text={entry.currentStep} size="sm" accent={activeTab.color} />
                                        </td>
                                        <td className="px-3 py-2.5 align-top">
                                            <SlaCell deadlineAtMs={entry.deadlineAtMs} deadlineLabel={entry.deadlineText} size="sm" />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="records-mobile-cards space-y-2.5">
                    {paginatedRows.map((entry, idx) => {
                        const draftId = resolveDraftDeleteId(entry.row)
                        const isSelected = showRowSelect && selectedDraftIds.has(draftId)
                        return (
                            <ExpenseMobileCard
                                key={getRowId(entry.row, idx)}
                                entry={entry}
                                accent={activeTab.color}
                                selected={isSelected}
                                selectSlot={
                                    showRowSelect ? (
                                        <DraftSelectBox
                                            id={draftId}
                                            checked={isSelected}
                                            onToggle={toggleDraftSelection}
                                            label={`Select draft ${draftId}`}
                                        />
                                    ) : null
                                }
                                onOpen={() => handleRowClick(entry.row)}
                            />
                        )
                    })}
                </div>
                </>
            ) : activeKey === 'advance' ? (
                <>
                <div
                    className="records-desktop-table rounded-xl overflow-x-auto overflow-y-auto"
                    style={{
                        border: '1px solid rgba(226, 232, 240, 0.9)',
                        maxHeight: 5 * 52 + 44,
                    }}
                >
                    <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 980 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                                {showRowSelect ? (
                                    <th className="draft-select-cell">
                                        <input
                                            type="checkbox"
                                            className="draft-checkbox"
                                            aria-label="Select all drafts on this page"
                                            checked={allDraftRowsSelected}
                                            onChange={(event) => toggleAllDraftsOnPage(event.target.checked)}
                                        />
                                    </th>
                                ) : null}
                                {[
                                    // { label: 'Request ID', align: 'left' },
                                    { label: 'Requested Date', align: 'left' },
                                    { label: 'Requestor', align: 'left' },
                                    { label: 'Link To Travel', align: 'left' },
                                    { label: 'Advance Amount', align: 'right' },
                                    { label: 'Current step', align: 'left' },
                                    { label: 'SLA', align: 'left' },
                                ].map((h) => (
                                    <th
                                        key={h.label}
                                        className="text-[10px] sm:text-xs font-semibold text-[#475569] uppercase tracking-wider whitespace-nowrap px-3 py-2.5"
                                        style={{
                                            textAlign: h.align,
                                            background: 'rgba(248, 250, 252, 0.95)',
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 1,
                                        }}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.map((entry, idx) => (
                                <tr
                                    key={getRowId(entry.row, idx)}
                                    onClick={() => handleRowClick(entry.row)}
                                    className={`records-data-row cursor-pointer ${
                                        showRowSelect &&
                                        selectedDraftIds.has(resolveDraftDeleteId(entry.row))
                                            ? 'is-selected'
                                            : ''
                                    }`}
                                >
                                    {showRowSelect ? (
                                        <td className="draft-select-cell">
                                            <input
                                                type="checkbox"
                                                className="draft-checkbox"
                                                aria-label={`Select draft ${resolveDraftDeleteId(entry.row)}`}
                                                checked={selectedDraftIds.has(resolveDraftDeleteId(entry.row))}
                                                disabled={!resolveDraftDeleteId(entry.row)}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={() =>
                                                    toggleDraftSelection(resolveDraftDeleteId(entry.row))
                                                }
                                            />
                                        </td>
                                    ) : null}
                                    {/*
                                    <td className="px-3 py-2.5 align-middle" style={{ fontSize: 12, color: '#101828' }}>
                                        <span
                                            className="record-id-badge inline-block max-w-[160px] truncate align-middle"
                                            title={entry.requestId}
                                        >
                                            {entry.requestId}
                                        </span>
                                    </td>
                                    */}
                                    <td className="px-3 py-2.5 align-middle text-[11px] sm:text-xs text-gray-500 whitespace-nowrap">
                                        {entry.requestedDateStr || '—'}
                                    </td>
                                    <td className="px-3 py-2.5 align-middle max-w-[140px]">
                                        <span className="text-[11px] sm:text-xs text-gray-700 truncate block" title={entry.requestorText || ''}>
                                            {entry.requestorText || '—'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle max-w-[340px]">
                                        <span className="text-[11px] sm:text-xs text-gray-700 truncate block" title={entry.linkToTravelText}>
                                            {entry.linkToTravelText}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle text-right">
                                        <span className="record-amount">{formatINR(entry.advanceAmount)}</span>
                                    </td>
                                    <td className="px-3 py-2.5 align-top max-w-[220px]">
                                        <CurrentStepBadges text={entry.currentStep} size="sm" accent={activeTab.color} />
                                    </td>
                                    <td className="px-3 py-2.5 align-top">
                                        <SlaCell deadlineAtMs={entry.deadlineAtMs} deadlineLabel={entry.deadlineText} size="sm" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="records-mobile-cards space-y-2.5">
                    {paginatedRows.map((entry, idx) => {
                        const draftId = resolveDraftDeleteId(entry.row)
                        const isSelected = showRowSelect && selectedDraftIds.has(draftId)
                        return (
                            <AdvanceMobileCard
                                key={getRowId(entry.row, idx)}
                                entry={entry}
                                accent={activeTab.color}
                                selected={isSelected}
                                selectSlot={
                                    showRowSelect ? (
                                        <DraftSelectBox
                                            id={draftId}
                                            checked={isSelected}
                                            onToggle={toggleDraftSelection}
                                            label={`Select draft ${draftId}`}
                                        />
                                    ) : null
                                }
                                onOpen={() => handleRowClick(entry.row)}
                            />
                        )
                    })}
                </div>
                </>
            ) : activeKey === 'travel' ? (
                <>
                <div
                    className="records-desktop-table rounded-xl overflow-x-auto overflow-y-auto"
                    style={{
                        border: '1px solid rgba(226, 232, 240, 0.9)',
                        maxHeight: 5 * 52 + 44,
                    }}
                >
                    <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 1080 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                                {showRowSelect ? (
                                    <th className="draft-select-cell">
                                        <input
                                            type="checkbox"
                                            className="draft-checkbox"
                                            aria-label="Select all drafts on this page"
                                            checked={allDraftRowsSelected}
                                            onChange={(event) => toggleAllDraftsOnPage(event.target.checked)}
                                        />
                                    </th>
                                ) : null}
                                {[
                                    // { label: 'Request ID', align: 'left' },
                                    { label: 'Requestor', align: 'left' },
                                    { label: 'Trip Type', align: 'left' },
                                    { label: 'Departure Date', align: 'left' },
                                    { label: 'Source (From)', align: 'left' },
                                    { label: '', align: 'center', key: 'route-icon' },
                                    { label: 'Destination (To)', align: 'left' },
                                    { label: 'Booking Amount', align: 'right' },
                                    { label: 'Current step', align: 'left' },
                                    { label: 'SLA', align: 'left' },
                                ].map((h) => (
                                    <th
                                        key={h.key || h.label}
                                        className="text-[10px] sm:text-xs font-semibold text-[#475569] uppercase tracking-wider whitespace-nowrap px-3 py-2.5"
                                        style={{
                                            textAlign: h.align,
                                            background: 'rgba(248, 250, 252, 0.95)',
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 1,
                                        }}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.map((entry, idx) => {
                                const draftId = resolveDraftDeleteId(entry.row)
                                const isSelected = showRowSelect && selectedDraftIds.has(draftId)
                                return (
                                <tr
                                    key={getRowId(entry.row, idx)}
                                    onClick={() => handleRowClick(entry.row)}
                                    className={`records-data-row cursor-pointer ${isSelected ? 'is-selected' : ''}`}
                                >
                                    {showRowSelect ? (
                                        <td className="draft-select-cell">
                                            <input
                                                type="checkbox"
                                                className="draft-checkbox"
                                                aria-label={`Select draft ${draftId}`}
                                                checked={isSelected}
                                                disabled={!draftId}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={() => toggleDraftSelection(draftId)}
                                            />
                                        </td>
                                    ) : null}
                                    {/*
                                    <td className="px-3 py-2.5 align-middle" style={{ fontSize: 12, color: '#101828' }}>
                                        <span
                                            className="record-id-badge inline-block max-w-[160px] truncate align-middle"
                                            title={entry.requestId}
                                        >
                                            {entry.requestId}
                                        </span>
                                    </td>
                                    */}
                                    <td className="px-3 py-2.5 align-middle max-w-[140px]">
                                        <span className="text-[11px] sm:text-xs text-gray-700 truncate block" title={entry.requestorText || ''}>
                                            {entry.requestorText || '—'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                        <span
                                            className="travel-type-badge"
                                        >
                                            {entry.tripTypeLabel}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle text-[11px] sm:text-xs text-gray-500 whitespace-nowrap">
                                        {entry.departureDateStr || '—'}
                                    </td>
                                    {(() => {
                                        const route = splitTravelRoute(entry)
                                        return (
                                            <>
                                                <td className="px-3 py-2.5 align-middle">
                                                    <span className="text-[11px] sm:text-xs font-semibold text-gray-700" title={entry.routeSummary || route.from}>
                                                        {route.from}
                                                    </span>
                                                </td>
                                                <td className="px-1 py-2.5 align-middle text-center">
                                                    <TripRouteIcon tripTypeKey={entry.travelTypeKey} label={entry.tripTypeLabel} />
                                                </td>
                                                <td className="px-3 py-2.5 align-middle">
                                                    <span className="text-[11px] sm:text-xs font-semibold text-gray-700" title={entry.routeSummary || route.to}>
                                                        {route.to}
                                                    </span>
                                                </td>
                                            </>
                                        )
                                    })()}
                                    <td className="px-3 py-2.5 align-middle text-right whitespace-nowrap">
                                        <span className="record-amount">
                                            {formatINR(entry.bookingAmount)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-top max-w-[220px]">
                                        <CurrentStepBadges text={entry.currentStep} size="sm" accent={activeTab.color} />
                                    </td>
                                    <td className="px-3 py-2.5 align-top">
                                        <SlaCell deadlineAtMs={entry.deadlineAtMs} deadlineLabel={entry.deadlineText} size="sm" />
                                    </td>
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="records-mobile-cards space-y-2.5">
                    {paginatedRows.map((entry, idx) => {
                        const draftId = resolveDraftDeleteId(entry.row)
                        const isSelected = showRowSelect && selectedDraftIds.has(draftId)
                        return (
                            <TravelMobileCard
                                key={getRowId(entry.row, idx)}
                                entry={entry}
                                accent={activeTab.color}
                                selected={isSelected}
                                selectSlot={
                                    showRowSelect ? (
                                        <DraftSelectBox
                                            id={draftId}
                                            checked={isSelected}
                                            onToggle={toggleDraftSelection}
                                            label={`Select draft ${draftId}`}
                                        />
                                    ) : null
                                }
                                onOpen={() => handleRowClick(entry.row)}
                            />
                        )
                    })}
                </div>
                </>
            ) : (
                <>
                <div
                    className="records-desktop-table rounded-xl overflow-x-auto overflow-y-auto"
                    style={{
                        border: '1px solid rgba(226, 232, 240, 0.9)',
                        maxHeight: 5 * 52 + 44,
                    }}
                >
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                        <thead>
                            <tr>
                                {showRowSelect ? (
                                    <th className="draft-select-cell">
                                        <input
                                            type="checkbox"
                                            className="draft-checkbox"
                                            aria-label="Select all drafts on this page"
                                            checked={allDraftRowsSelected}
                                            onChange={(event) => toggleAllDraftsOnPage(event.target.checked)}
                                        />
                                    </th>
                                ) : null}
                                {cols.map((c) => (
                                    <th
                                        key={c.Id}
                                        style={{
                                            textAlign: 'left',
                                            padding: '10px 12px',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            borderBottom: '1px solid #EAECF0',
                                            background: 'rgba(248, 250, 252, 0.95)',
                                            whiteSpace: 'nowrap',
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 1,
                                        }}
                                    >
                                        {c.Name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.map((row, idx) => (
                                <tr
                                    key={getRowId(row, idx)}
                                    onClick={() => handleRowClick(row)}
                                    className={`records-data-row cursor-pointer ${
                                        showRowSelect &&
                                        selectedDraftIds.has(resolveDraftDeleteId(row))
                                            ? 'is-selected'
                                            : ''
                                    }`}
                                >
                                    {showRowSelect ? (
                                        <td className="draft-select-cell">
                                            <input
                                                type="checkbox"
                                                className="draft-checkbox"
                                                aria-label={`Select draft ${resolveDraftDeleteId(row)}`}
                                                checked={selectedDraftIds.has(resolveDraftDeleteId(row))}
                                                disabled={!resolveDraftDeleteId(row)}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={() =>
                                                    toggleDraftSelection(resolveDraftDeleteId(row))
                                                }
                                            />
                                        </td>
                                    ) : null}
                                    {cols.map((c) => (
                                        <td
                                            key={c.Id}
                                            style={{
                                                padding: '12px 12px',
                                                fontSize: 12,
                                                color: '#101828',
                                                verticalAlign: 'middle',
                                                maxWidth: 240,
                                                transition: 'padding 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                                            }}
                                        >
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {toText(row?.[c.Id]) || <span style={{ color: '#98A2B3' }}>—</span>}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="records-mobile-cards space-y-2.5">
                    {paginatedRows.map((row, idx) => {
                        const draftId = resolveDraftDeleteId(row)
                        const isSelected = showRowSelect && selectedDraftIds.has(draftId)
                        return (
                            <GenericMobileCard
                                key={getRowId(row, idx)}
                                row={row}
                                cols={cols}
                                selected={isSelected}
                                selectSlot={
                                    showRowSelect ? (
                                        <DraftSelectBox
                                            id={draftId}
                                            checked={isSelected}
                                            onToggle={toggleDraftSelection}
                                            label={`Select draft ${draftId}`}
                                        />
                                    ) : null
                                }
                                onOpen={() => handleRowClick(row)}
                            />
                        )
                    })}
                </div>
                </>
            )}
            {!showSkeleton && !error && filteredRows.length > 0 && (
                <div className="mt-2 sm:mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-[9px] sm:text-xs text-slate-500">
                        Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, paginationLength)} of {paginationLength}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                        >
                            <i className="ri-arrow-left-s-line" />
                        </button>
                        <span className="text-[9px] sm:text-xs text-slate-600 px-2 font-medium">
                            {currentPage}/{totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                        >
                            <i className="ri-arrow-right-s-line" />
                        </button>
                    </div>
                </div>
            )}
            </div>
        </div>
    )
}
