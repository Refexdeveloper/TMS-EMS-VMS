import React, { useState, useMemo, useEffect, useLayoutEffect, useContext, useRef } from 'react'
import { createPortal } from 'react-dom'
import { kf, KissflowSDKContext } from './sdk/index.js'
import { getApiBase } from './apiBase.js'
import {
  buildContractProcessApiPaths,
  resolveKfContractApplicationId,
  buildContractAdminApiPaths,
  buildTotalVendorsReportCountPath,
  buildVendorMasterApiPaths,
} from './kfContractPaths.js'
import { mapKfContractItem, contractStatusPillClass } from './kfContractItemMap.js'
import AOS from 'aos'
import {
  vmsPageClass,
  vmsPageInnerClass,
  vmsHeaderShellClass,
  vmsAvatarClass,
  vmsRoleAccentClass,
  vmsSectionShellClass,
  vmsSectionHeaderClass,
  vmsPrimaryBtnClass,
  vmsChipBtnClass,
  vmsSearchInputClass,
  vmsDangerBtnClass,
  vmsIconBtnClass,
  vmsGhostBtnClass,
  vmsSelectClass,
  vmsTableHeadClass,
  vmsTableHeadCellClass,
  vmsTableRowClass,
  vmsExpandBtnClass,
  vmsMobileCardClass,
  vmsPaginationBarClass,
  vmsPaginationBtnClass,
  vmsSegmentBtnClass,
  vmsContractTypeIcon,
  vmsTypeChipClass,
  vmsColIconClass,
} from './vms/vmsTheme.js'
import P2pKpiCard, { P2pHeaderFx } from './vms/P2pKpiCard.jsx'

function envVite(name) {
  try {
    const v = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]
    return v != null && String(v).trim() !== '' ? String(v).trim() : ''
  } catch {
    return ''
  }
}

/** New item + view details in Kissflow. Override with `VITE_KF_CONTRACT_POPUP_ID` if needed. */
const CONTRACT_WORKFLOW_POPUP_ID = 'Popup_6xSap6ocDi'

function resolveContractPopupId() {
  return envVite('VITE_KF_CONTRACT_POPUP_ID') || CONTRACT_WORKFLOW_POPUP_ID
}

/** Kissflow count APIs often return `{ Count: n }` (sometimes nested under `data`). */
function parseKfCountResponse(response) {
  const r = response?.data ?? response
  const raw = r?.Count ?? r?.count ?? r?.Total ?? r?.total
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const n = parseInt(String(raw ?? '').replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
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
    const n = abc.Name ?? abc._name ?? abc.Title ?? abc.title ?? abc.Role ?? abc.role ?? ''
    return n != null ? String(n).trim() : ''
  }
  return ''
}

const STATUS_TO_SEGMENT = {
  'Draft': 'draft',
  'In progress': 'inprogress',
  'Completed': 'completed',  // lowercase: myitems/completed
  'Withdrawn': 'withdrawn',
  'Rejected': 'rejected',
}

/** URL segment → label shown when API omits per-row status (matches myitems/{segment} request) */
const SEGMENT_TO_STATUS_LABEL = {
  draft: 'Draft',
  inprogress: 'In progress',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
  rejected: 'Rejected',
}

function stringifyKfFieldValue(val) {
  if (val == null) return ''
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    if (val.Name != null) return String(val.Name)
    if (val._name != null) return String(val._name)
    if (val.Title != null) return String(val.Title)
    if (val.value != null) return stringifyKfFieldValue(val.value)
    if (val.label != null) return String(val.label)
    if (Array.isArray(val) && val.length) return val.map(stringifyKfFieldValue).filter(Boolean).join(', ')
  }
  return ''
}

function getVal(item, keys, def = '') {
  const sources = [item, item?.Data, item?.data, item?._data, item?._source_data, item?._fields].filter(Boolean)
  for (const src of sources) {
    for (const k of keys) {
      const v = src?.[k]
      if (v !== undefined && v !== null && v !== '') return v
    }
    const lowerKeys = keys.map((k) => String(k).toLowerCase())
    for (const [k, v] of Object.entries(src || {})) {
      if (v !== undefined && v !== null && v !== '' && lowerKeys.includes(String(k).toLowerCase())) return v
    }
  }
  return def
}

/** Single Kissflow field row → raw contract amount if the label matches. */
function contractValueFromFieldRecord(f) {
  if (!f || typeof f !== 'object') return null
  const name = String(
    f.Name ??
      f.name ??
      f.Field_name ??
      f.field_name ??
      f.Title ??
      f.Label ??
      f.Display_name ??
      f.display_name ??
      '',
  )
    .toLowerCase()
    .replace(/\s+/g, '_')
  const isValueField =
    name &&
    (name.includes('contract_value') ||
      name.includes('contract_amount') ||
      name.includes('total_contract') ||
      (name.includes('contract') && name.includes('value')) ||
      name.includes('agreement_value') ||
      name.includes('total_value') ||
      name.includes('estimated_contract') ||
      /^value_of/.test(name))
  if (!isValueField) return null
  const raw =
    f.Value ??
    f.value ??
    f.Selected_Value ??
    f.selected_value ??
    f.Result ??
    f.result ??
    f.Field_value ??
    f.field_value ??
    f.Default_value ??
    f.default_value
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw === 'object' && raw.value != null) return raw.value
  return raw
}

function extractContractValueRawFromFieldsBlob(fields) {
  if (fields == null) return null
  if (Array.isArray(fields)) {
    for (const f of fields) {
      const v = contractValueFromFieldRecord(f)
      if (v != null) return v
    }
    return null
  }
  if (typeof fields === 'object') {
    for (const f of Object.values(fields)) {
      const v = contractValueFromFieldRecord(f)
      if (v != null) return v
    }
  }
  return null
}

/**
 * Pending / task list payloads often omit top-level Contract_Value and store the amount only under
 * `_fields` (array **or** id-keyed object), under `Data._fields`, or inside `_current_context[]`.
 */
function extractContractValueRawFromFields(item) {
  if (!item || typeof item !== 'object') return null
  const buckets = [item, item.Data, item.data, item._data, item._source_data]
  if (Array.isArray(item._current_context)) {
    for (const c of item._current_context) {
      if (c && typeof c === 'object') buckets.push(c)
    }
  }
  for (const b of buckets) {
    if (!b || typeof b !== 'object') continue
    const v =
      extractContractValueRawFromFieldsBlob(b._fields) ??
      extractContractValueRawFromFieldsBlob(b.fields) ??
      extractContractValueRawFromFieldsBlob(b._field_values) ??
      extractContractValueRawFromFieldsBlob(b.field_values)
    if (v != null) return v
  }
  return null
}

/** Last resort: scan flat keys on item / Data / context (handles auto-renamed Kissflow columns). */
function extractContractValueLooseFromItem(item) {
  if (!item || typeof item !== 'object') return null
  const buckets = [item, item.Data, item.data, item._data, item._source_data]
  if (Array.isArray(item._current_context)) {
    for (const c of item._current_context) {
      if (c && typeof c === 'object') buckets.push(c)
    }
  }
  for (const src of buckets) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue
    for (const [k, v] of Object.entries(src)) {
      if (!k || k.startsWith('_')) continue
      if (k === 'fields') continue
      const lk = String(k).toLowerCase()
      if (lk.includes('payment') && lk.includes('type')) continue
      const looksLikeContractValue =
        (lk.includes('contract') && (lk.includes('value') || lk.includes('amount'))) ||
        lk === 'total_value' ||
        lk === 'agreement_value' ||
        lk.includes('total_contract_value') ||
        lk.includes('estimated_contract_value')
      if (!looksLikeContractValue) continue
      if (v === undefined || v === null || v === '') continue
      if (typeof v === 'object' && v.value != null) return v.value
      return v
    }
  }
  return null
}

function formatStatusForDisplay(raw) {
  if (raw == null || raw === '') return ''
  const t = String(raw).trim()
  const norm = t.replace(/\s+/g, '')
  const map = {
    InProgress: 'In progress',
    inprogress: 'In progress',
    INPROGRESS: 'In progress',
    Draft: 'Draft',
    draft: 'Draft',
    Completed: 'Completed',
    completed: 'Completed',
    Withdrawn: 'Withdrawn',
    withdrawn: 'Withdrawn',
    Rejected: 'Rejected',
    rejected: 'Rejected',
    Active: 'Active',
    active: 'Active',
    Expired: 'Expired',
    expired: 'Expired',
  }
  return map[t] || map[norm] || t
}

function getStatusBadgeClass(status) {
  // Keep this aligned with VMS2.0 status pills (Latest Contracts).
  const s = String(formatStatusForDisplay(status) || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (s.includes('completed') || s.includes('active')) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (s.includes('rejected')) return 'bg-red-100 text-red-700 border-red-200'
  if (s.includes('withdrawn')) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (s.includes('draft')) return 'bg-gray-100 text-gray-700 border-gray-200'
  if (s.includes('expired')) return 'bg-slate-100 text-slate-700 border-slate-200'
  if (s.includes('progress')) return 'bg-[#17a2b4]/10 text-[#17a2b4] border-[#17a2b4]/25'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

/**
 * Prefer real API fields (_status, _current_step, etc.); if missing, use list URL segment
 * (same record set as myitems/draft | inprogress | …).
 */
function resolveStatusFromItem(item, listUrlSegment) {
  let raw =
    item._status ??
    item.Status ??
    item.status ??
    item._workflow_status ??
    item.Workflow_status
  if (raw == null || String(raw).trim() === '') {
    const step = item._current_step ?? item.Current_step ?? item.current_step
    if (step != null && typeof step === 'object') {
      raw = step.Name ?? step._name ?? step.Title ?? step.Step_name
    } else if (step != null) {
      raw = step
    }
  }
  if (raw != null && String(raw).trim() !== '') {
    return formatStatusForDisplay(raw)
  }
  if (listUrlSegment && SEGMENT_TO_STATUS_LABEL[listUrlSegment]) {
    return SEGMENT_TO_STATUS_LABEL[listUrlSegment]
  }
  return 'Draft'
}

function parseContractValueDisplay(raw) {
  if (raw == null || raw === '') return '—'
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(raw)
    } catch {
      return String(raw)
    }
  }
  if (typeof raw === 'object' && raw.value != null) return parseContractValueDisplay(raw.value)
  const s = String(raw).replace(/[^0-9.-]/g, '')
  const n = parseFloat(s)
  if (Number.isFinite(n)) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
    } catch {
      return String(raw)
    }
  }
  return stringifyKfFieldValue(raw) || '—'
}

function formatContractDateUs(raw) {
  if (raw == null || raw === '') return '—'
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
  }
  const s = String(raw).trim()
  return s || '—'
}

function parsePercentField(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    const n = raw > 0 && raw <= 1 ? Math.round(raw * 100) : Math.round(raw)
    return Math.max(0, Math.min(100, n))
  }
  const s = String(raw).replace(/%/g, '').replace(/,/g, '').trim()
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  const x = n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n)
  return Math.max(0, Math.min(100, x))
}

function formatYesNoLabel(val) {
  if (val == null || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  const s = String(val).trim().toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(s)) return 'Yes'
  if (['no', 'n', 'false', '0'].includes(s)) return 'No'
  return String(val)
}

function summarizeContractDocuments(val) {
  if (val == null || val === '') return 'No attachments'
  if (Array.isArray(val)) {
    if (val.length === 0) return 'No attachments'
    const names = val
      .map((x) => (x && typeof x === 'object' ? (x.Name || x._name || x.filename || x.File_name) : x))
      .filter(Boolean)
    if (names.length) return names.map(String).join(', ')
    return `${val.length} attachment(s)`
  }
  if (typeof val === 'object') {
    const n = val.Name || val._name || val.filename
    if (n) return String(n)
  }
  const str = stringifyKfFieldValue(val)
  if (!str) return 'No attachments'
  return str
}

function formatRequestNumberDisplay(raw) {
  const s = stringifyKfFieldValue(raw).trim()
  if (!s) return '—'
  if (/^ctr#/i.test(s)) return s
  return `CTR# ${s.replace(/^#?\s*/i, '')}`
}

function resolveVendorFromItem(item) {
  // Common Kissflow lookup/user/object field: { _id, Name, ... }
  const vendorObj = getVal(item, ['Vendor', 'Vendor_Master', 'Vendor_Details', 'Supplier'], null)
  if (vendorObj && typeof vendorObj === 'object' && !Array.isArray(vendorObj)) {
    const name = vendorObj.Name || vendorObj._name || vendorObj.Title
    if (name != null && String(name).trim()) return String(name).trim()
  }

  const direct = stringifyKfFieldValue(
    getVal(
      item,
      [
        'Vendor',
        'Vendor_Name',
        'VendorName',
        'Vendor_Name_A00',
        'Vendor_Master',
        'Vendor_Master_A02',
        'Vendor_Details',
        'Supplier',
        'Supplier_Name',
        'Party_Name',
      ],
      '',
    ),
  )
  if (direct) return direct

  // Flexible fallback for inconsistent My Items payload keys.
  for (const src of [item, item?.Data, item?.data, item?._data, item?._source_data, item?._fields]) {
    if (!src || typeof src !== 'object') continue
    for (const [k, v] of Object.entries(src)) {
      if (!k || k.startsWith('_')) continue
      const lk = String(k).toLowerCase()
      if (!lk.includes('vendor') && !lk.includes('supplier') && !lk.includes('party')) continue
      if (lk.includes('id') || lk.includes('code') || lk.includes('count') || lk.includes('total')) continue
      const s = stringifyKfFieldValue(v).trim()
      if (s) return s
    }
  }
  return ''
}

function mapKfItemToContract(item, listUrlSegment) {
  if (!item || typeof item !== 'object') return null
  const id = getVal(item, ['_id', 'id'], '')
  const ctx = Array.isArray(item._current_context) ? item._current_context : []
  const firstCtx = ctx.length > 0 ? ctx[0] : null
  const activityId =
    item._activity_id ??
    item._activityId ??
    item._context_activity_id ??
    item._current_activity_id ??
    item._activity?._id ??
    item._activity?.id ??
    firstCtx?._context_activity_id ??
    firstCtx?._context_current_step_id ??
    ''
  const activityInstanceId =
    item._activity_instance_id ??
    item._context_activity_instance_id ??
    item._activityInstanceId ??
    item._activity_instance?._id ??
    item._activity_instance?.id ??
    item._context_activity_instance?._id ??
    item._context_activity_instance?.id ??
    firstCtx?._context_activity_instance_id ??
    firstCtx?._context_activity_instance ??
    ''
  const normalizedActivityInstanceId = Array.isArray(activityInstanceId)
    ? (activityInstanceId[0] ?? '')
    : activityInstanceId
  const name = stringifyKfFieldValue(getVal(item, ['Contract_Title', 'Name', 'Untitled_Field'], '')) || id || '—'
  const vendor = resolveVendorFromItem(item)
  const valueRaw =
    getVal(
      item,
      [
        'Contract_Value',
        'ContractValue',
        'Total_Contract_Value',
        'Contract_Amount',
        'Agreement_Value',
        'Total_Value',
        'Estimated_Contract_Value',
        'Value_of_Contract',
        'Grand_Total',
        'Contract_Total',
      ],
      null,
    ) ??
    extractContractValueRawFromFields(item) ??
    extractContractValueLooseFromItem(item)
  const valueDisplay = parseContractValueDisplay(valueRaw)
  const startRaw = getVal(
    item,
    ['Effective_Date', 'effective_date', 'Contract_Start_Date', 'Start_Date', 'Contract_StartDate', 'StartDate'],
    '',
  )
  const endRaw = getVal(item, ['End_Date', 'EndDate'], '')
  const endDate = endRaw ? String(endRaw).slice(0, 10) : '—'
  const startDateDisplay = formatContractDateUs(startRaw)
  const endDateDisplay = formatContractDateUs(endRaw)
  const contractType = stringifyKfFieldValue(getVal(item, ['Contract_Type', 'Type_of_Contract', 'ContractType', 'Type'], '')) || '—'
  const contractRequestDisplay = formatRequestNumberDisplay(
    getVal(item, ['Contract_Request_Number', 'Contract_Request_No', 'Request_Number', 'CTR_Number', 'Contract_Request#'], ''),
  )
  const contractCategory =
    stringifyKfFieldValue(getVal(item, ['Contract_Category', 'Category_of_Contract', 'Contract_Cat'], '')) || '—'
  const contractDescription =
    stringifyKfFieldValue(getVal(item, ['Contract_Description', 'Scope_Description', 'Scope_of_Work'], '')) ||
    stringifyKfFieldValue(getVal(item, ['Description'], ''))
  const currency =
    stringifyKfFieldValue(getVal(item, ['Currency', 'Contract_Currency', 'Currency_Code'], '')) || 'INR'
  const paymentType =
    stringifyKfFieldValue(getVal(item, ['Payment_Type', 'PaymentType', 'Payment_Method', 'Mode_of_Payment'], '')) ||
    '—'
  const contractDocumentsSummary = summarizeContractDocuments(
    getVal(item, ['Contract_Documents', 'Contract_Document', 'Attachments', 'Upload_Documents', 'Files'], null),
  )
  const ndaRaw = getVal(item, ['NDA_Available'], '')
  const msaRaw = getVal(item, ['MSA_Available'], '')
  const sowRaw = getVal(item, ['SOW_Available'], '')
  const ratingOverall = parsePercentField(
    getVal(item, ['Untitled_Field_1', 'Overall_Score', 'Vendor_Score', 'Performance_Score', 'Contract_Rating', 'Rating'], null),
  )
  const ratingTat = parsePercentField(
    getVal(item, ['TAT_Adherence', 'TAT_Rating', 'TAT_Score', 'Turnaround_Adherence'], null),
  )
  const ratingService = parsePercentField(
    getVal(item, ['Service_Rate', 'Service_Rating', 'Service_Score'], null),
  )
  const ratingResponse = parsePercentField(
    getVal(item, ['Response_Rate', 'Response_Rating', 'Response_Score'], null),
  )
  const ratingPm = parsePercentField(
    getVal(item, ['PM_Adherence', 'PM_Adherence_Rating', 'Preventive_Maintenance_Adherence', 'PM_Score'], null),
  )
  const createdBy =
    item._created_by?.Name ||
    item.Created_by?.Name ||
    stringifyKfFieldValue(getVal(item, ['_current_assigned_to', 'AssignedTo', 'assigned_to'], '')) ||
    null
  const currentStep = stringifyKfFieldValue(getVal(item, ['_current_step', 'Current_step', 'current_step'], ''))
  return {
    id,
    name,
    vendor,
    rawItem: item,
    valueDisplay,
    endDate,
    startDateDisplay,
    endDateDisplay,
    contractType,
    contractRequestDisplay,
    contractCategory,
    contractDescription,
    currency,
    paymentType,
    contractDocumentsSummary,
    ratingOverall,
    ratingTat,
    ratingService,
    ratingResponse,
    ratingPm,
    nda: stringifyKfFieldValue(ndaRaw),
    msa: stringifyKfFieldValue(msaRaw),
    sow: stringifyKfFieldValue(sowRaw),
    fullName: vendor,
    phoneNumber: stringifyKfFieldValue(getVal(item, ['Contact_Phone', 'Phone_Number'], '')),
    emailId: stringifyKfFieldValue(getVal(item, ['Contact_Email', 'Email_Id', 'Email'], '')),
    address: stringifyKfFieldValue(getVal(item, ['Vendor_Address', 'Address'], '')),
    message:
      stringifyKfFieldValue(getVal(item, ['Remarks', 'Internal_Notes', 'Your_Message', 'Message', 'Notes'], '')) ||
      contractDescription ||
      '',
    website: contractType,
    createdDate: stringifyKfFieldValue(getVal(item, ['Created_at', '_created_at', '_modified_at', 'Modified_at'], '')),
    modifiedAt: stringifyKfFieldValue(getVal(item, ['_modified_at', 'Modified_at'], '')),
    completedAt: stringifyKfFieldValue(getVal(item, ['_completed_at', 'Completed_at'], '')),
    status: resolveStatusFromItem(item, listUrlSegment),
    progress: Number(getVal(item, ['_progress', 'Progress'], 0)) || 0,
    createdBy,
    currentStep,
    activityId,
    activityInstanceId: normalizedActivityInstanceId,
  }
}

/**
 * `mapKfContractItem` only reads Contract_Value / ContractValue. Pending/task list rows often omit
 * those and keep the amount under `_fields` only — legacy mapping still finds it. Avoid overwriting
 * with VMS `valueDisplay` (e.g. ₹0) when those top-level keys are absent.
 */
function hasTopLevelContractValueForVmsMap(item) {
  if (!item || typeof item !== 'object') return false
  const raw = item.Contract_Value ?? item.ContractValue
  if (raw == null) return false
  if (typeof raw === 'string' && raw.trim() === '') return false
  return true
}

/** Merge my-items row with VMS2.0 `mapKfContractItem` fields (same value/date/title logic). Keeps my-items id, status (segment-aware), and accordion fields. */
function mergeMyItemsRowWithVmsShape(item, listUrlSegment) {
  const legacy = mapKfItemToContract(item, listUrlSegment)
  if (!legacy) return null
  const vms = mapKfContractItem(item)
  if (!vms) return legacy
  const endIso =
    (vms.endDate && String(vms.endDate).trim()) ||
    (legacy.endDate && legacy.endDate !== '—' ? String(legacy.endDate).slice(0, 10) : '')
  const valueDisplay =
    hasTopLevelContractValueForVmsMap(item) && vms.valueDisplay
      ? vms.valueDisplay
      : legacy.valueDisplay
  return {
    ...legacy,
    name: (vms.contractTitle && String(vms.contractTitle).trim()) || legacy.name,
    valueDisplay,
    endDate: endIso || legacy.endDate,
    vendor: (legacy.vendor && String(legacy.vendor).trim()) || vms.vendor || legacy.vendor,
    contractType:
      vms.contractType && vms.contractType !== 'Other' ? vms.contractType : legacy.contractType,
  }
}

function initialsFromUser(user) {
  if (!user) return 'U'
  const name = user.Name || user.FirstName || ''
  const parts = String(name).trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] || '') + (parts[1][0] || '')
  if (user.FirstName && user.LastName) return (user.FirstName[0] || '') + (user.LastName[0] || '')
  return name.slice(0, 2).toUpperCase() || 'U'
}

function mapKfContractTaskToRow(item, fallbackActivityId) {
  const merged = mergeMyItemsRowWithVmsShape(item, undefined)
  const row = merged || mapKfItemToContract(item, undefined)
  if (!row) return null
  const createdBy = item._created_by?.Name || row.createdBy
  const createdByInitials = initialsFromUser(item._created_by)
  const statusDisplay = formatStatusForDisplay(row.status) || row.status || 'In progress'
  return {
    ...row,
    activityId: row.activityId || fallbackActivityId || '',
    createdBy,
    createdByInitials,
    status: statusDisplay,
  }
}

/** Full instance row for one activity (same URL as expanding a My Tasks accordion). */
async function fetchContractTaskDetailMerged(contractPaths, kfInstance, baseTask, activityIdFallback) {
  const instanceId = baseTask?.id || baseTask?._id
  const activityInstanceId = baseTask?.activityInstanceId || baseTask?._activity_instance_id
  if (!instanceId || !activityInstanceId) return null
  const path = `/process/2/${contractPaths.accountId}/${contractPaths.processId}/${encodeURIComponent(String(instanceId))}/${encodeURIComponent(String(activityInstanceId))}?_application_id=${encodeURIComponent(contractPaths.applicationId)}`
  const sdk = kfInstance
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
      if (!res.ok) return null
      response = await res.json()
    }
    const row = response?.Data ?? response?.data ?? response?.Item ?? response
    const payload = row && typeof row === 'object' && !Array.isArray(row) ? row : response
    return mapKfContractTaskToRow(payload, baseTask?.activityId || activityIdFallback || '')
  } catch {
    return null
  }
}

function buildMyItemsPath(contractPaths, statusFilter, pageNumber, pageSize) {
  const segment = STATUS_TO_SEGMENT[statusFilter] || 'draft'
  const pn = Math.max(1, Number(pageNumber) || 1)
  const ps = Math.min(1000, Math.max(1, Number(pageSize) || 1000))
  return `/process/2/${contractPaths.accountId}/${contractPaths.processId}/myitems/${segment}?apply_preference=true&page_number=${pn}&page_size=${ps}&skip_aggregation=true&_application_id=${encodeURIComponent(contractPaths.applicationId)}`
}

const STATUS_OPTIONS = ['Draft', 'In progress', 'Completed', 'Withdrawn', 'Rejected']

const DEMO_ITEMS = [
  {
    id: '1',
    name: 'AMC',
    vendor: 'Blue Star',
    valueDisplay: '₹9,84,828',
    endDate: '2026-10-31',
    startDateDisplay: '11/1/2025',
    endDateDisplay: '10/31/2026',
    contractType: 'AMC',
    contractRequestDisplay: 'CTR# 0027',
    contractCategory: '—',
    contractDescription: 'Blue Star VRV V Plus HP coo TD D (Equipment as per attached List)',
    currency: 'INR',
    paymentType: '—',
    contractDocumentsSummary: 'No attachments',
    message: 'Annual maintenance reference',
    createdDate: '2026-03-17T15:10:00',
    status: 'Draft',
    fullName: 'Blue Star',
    nda: 'No',
    msa: 'No',
    sow: 'No',
    ratingOverall: 88,
    ratingTat: 92,
    ratingService: 95,
    ratingResponse: 100,
    ratingPm: 88,
  },
  { id: '2', name: 'CORP-RENT-009', vendor: 'BuildRight Co', valueDisplay: '₹12,00,000', endDate: '2027-01-15', startDateDisplay: '—', endDateDisplay: '1/15/2027', contractType: 'Rental', contractRequestDisplay: '—', contractCategory: 'Real estate', contractDescription: 'Office lease', currency: 'INR', paymentType: 'Net 30', contractDocumentsSummary: 'No attachments', message: 'Office lease', createdDate: '2026-03-17T14:42:00', status: 'In progress', fullName: 'BuildRight Co', nda: 'Yes', msa: 'No', sow: 'Yes', ratingOverall: null, ratingTat: null, ratingService: null, ratingResponse: null, ratingPm: null },
  { id: '3', name: '—', vendor: '', valueDisplay: '—', endDate: '—', startDateDisplay: '—', endDateDisplay: '—', contractType: '—', contractRequestDisplay: '—', contractCategory: '—', contractDescription: '', currency: 'INR', paymentType: '—', contractDocumentsSummary: 'No attachments', message: '', createdDate: '2026-03-17T14:39:00', status: 'Draft', fullName: '', nda: '', msa: '', sow: '', ratingOverall: null, ratingTat: null, ratingService: null, ratingResponse: null, ratingPm: null },
]

const ITEMS_COLUMNS = [
  { id: 'vendor', label: 'Vendor Name', icon: 'ri-building-2-line' },
  { id: 'contractDescription', label: 'Contract Description', icon: 'ri-file-paper-2-line' },
  { id: 'contractCategory', label: 'Category', icon: 'ri-price-tag-3-line' },
  { id: 'createdAt', label: 'Date Created', icon: 'ri-calendar-line' },
  { id: 'valueDisplay', label: 'Value', icon: 'ri-money-rupee-circle-line' },
  { id: 'status', label: 'Status', icon: 'ri-flag-line' },
  { id: 'endDate', label: 'End Date', icon: 'ri-calendar-close-line' },
]
const TASKS_COLUMNS = [
  { id: 'vendor', label: 'Vendor Name', icon: 'ri-building-2-line' },
  { id: 'contractDescription', label: 'Contract Description', icon: 'ri-file-paper-2-line' },
  { id: 'contractCategory', label: 'Category', icon: 'ri-price-tag-3-line' },
  { id: 'createdAt', label: 'Date Created', icon: 'ri-calendar-line' },
  { id: 'valueDisplay', label: 'Value', icon: 'ri-money-rupee-circle-line' },
  { id: 'status', label: 'Status', icon: 'ri-flag-line' },
  { id: 'endDate', label: 'End Date', icon: 'ri-calendar-close-line' },
]

const DEFAULT_VISIBLE_ITEMS = Object.fromEntries(ITEMS_COLUMNS.map((c) => [c.id, true]))
const DEFAULT_VISIBLE_TASKS = Object.fromEntries(TASKS_COLUMNS.map((c) => [c.id, true]))

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatIsoDateToDisplay(iso) {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

function formatDateToIso(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function pctOrDash(n) {
  return n != null && Number.isFinite(n) ? `${n}%` : '—'
}

function ratingToFiveScale(n) {
  if (n == null || !Number.isFinite(n)) return null
  const raw = Number(n)
  // Supports either 1-5 ratings or 0-100 score inputs.
  const outOfFive = raw <= 5 ? raw : raw / 20
  return Math.max(0, Math.min(5, outOfFive))
}

function StarRatingDock({ value }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const rating = ratingToFiveScale(value)
  if (rating == null) return <span className="text-slate-500">—</span>
  const filled = Math.round(rating)
  return (
    <div
      className="inline-flex flex-nowrap items-end gap-1 py-1 shrink-0"
      onMouseLeave={() => setHoveredIdx(null)}
      aria-label={`${filled} out of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((idx) => {
        const distance = hoveredIdx == null ? 9 : Math.abs(hoveredIdx - idx)
        const scale = hoveredIdx == null ? 1 : distance === 0 ? 1.9 : distance === 1 ? 1.45 : distance === 2 ? 1.15 : 1
        const filledStar = idx < filled
        return (
          <span
            key={idx}
            onMouseEnter={() => setHoveredIdx(idx)}
            className={`select-none leading-none transition-transform duration-150 ease-out ${filledStar ? 'text-[#17a2b4]' : 'text-[#bfe6ec]'}`}
            style={{ transform: `scale(${scale})`, fontSize: '1.45rem', transformOrigin: 'bottom center' }}
          >
            ★
          </span>
        )
      })}
    </div>
  )
}

/** My Items: compact spinner in Vendor column while instance detail resolves vendor name. */
function ItemVendorNameCell({ item, vendorCellLoadingById }) {
  const resolved = String(item.vendor || resolveVendorFromItem(item.rawItem) || '').trim()
  const isLoading = !!vendorCellLoadingById[item.id] && !resolved
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-2 text-slate-400" aria-busy="true" aria-label="Loading vendor">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#e6f6f8] border-t-[#17a2b4]" />
        <span className="text-xs font-medium text-slate-500">Loading…</span>
      </span>
    )
  }
  return resolved || '—'
}

function parseDateSafe(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBetween(from, to) {
  const a = startOfDay(from).getTime()
  const b = startOfDay(to).getTime()
  return Math.floor((b - a) / (24 * 60 * 60 * 1000))
}

function isDocAvailable(val) {
  if (val == null || val === '') return false
  const s = String(val).trim().toLowerCase()
  if (['yes', 'y', 'true', '1', 'available'].includes(s)) return true
  if (['no', 'n', 'false', '0', 'not available', 'missing', '—'].includes(s)) return false
  return !!s
}

/** Expanded row / accordion body: full contract breakdown (matches Kissflow field groups). */
function ContractAccordionDetail({ item, onViewDetails, onClose }) {
  if (!item) return null
  const yesNoPill = (val) => {
    const t = formatYesNoLabel(val)
      const cls =
        t === 'Yes'
        ? 'bg-[#17a2b4]/10 text-[#17a2b4] border-[#17a2b4]/20'
        : t === 'No'
          ? 'bg-slate-100 text-slate-700 border-slate-200/80'
          : 'bg-slate-50 text-slate-600 border-slate-200/80'
    return (
      <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}>{t}</span>
    )
  }
  const subRow = (label, required, children, className = '') => (
    <div className={className}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">
        {label}
        {required ? <span className="text-[#17a2b4] ml-0.5">*</span> : null}
      </p>
      <div className="mt-0.5 text-sm font-medium text-slate-900 leading-relaxed break-words">{children}</div>
    </div>
  )
  return (
    <div className="w-full bg-white max-md:bg-transparent">
      <div className="flex items-start justify-between gap-3 px-0 md:px-1 py-2 md:py-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 shrink-0 ${vmsAvatarClass()}`}>
            {(item.vendor || item.name || '?').charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm md:text-base font-semibold text-slate-900">{item.name || '—'}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.createdDate ? <>Updated · {formatDateTime(item.createdDate)}</> : ' '}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${getStatusBadgeClass(item.status)}`}
        >
          {formatStatusForDisplay(item.status) || '—'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-10 md:gap-8">
        {/* Left (≈70%): contract details + performance */}
        <div className="md:col-span-7 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {subRow('Contract Title', true, item.name || '—')}
            {subRow('Vendor', true, item.vendor || '—')}
            {subRow('Contract Type', false, item.contractType || '—')}
            {subRow('Contract Category', false, item.contractCategory || '—')}
            {subRow(
              'Contract Value',
              false,
              <span className="inline-flex flex-col">
                <span>{item.valueDisplay || '—'}</span>
                {item.currency ? <span className="text-xs font-normal text-slate-500">{item.currency}</span> : null}
              </span>,
            )}
            {subRow('Contract Start Date', true, item.startDateDisplay || '—')}
            {subRow('End Date', true, item.endDateDisplay || item.endDate || '—')}
            {subRow(
              'Contract Description',
              false,
              <p className="whitespace-pre-wrap text-sm font-normal text-slate-800">
                {item.contractDescription || item.message || '—'}
              </p>,
              'sm:col-span-2',
            )}
          </div>

          <div className="mt-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Vendor performance</p>
            <div className="mt-2 flex flex-col gap-y-2 md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-2">
              {[
                { label: 'Rating', val: item.ratingOverall },
                { label: 'TAT Adherence', val: item.ratingTat },
                { label: 'Service Rate', val: item.ratingService },
                { label: 'Response Rate', val: item.ratingResponse },
                { label: 'PM Adherence', val: item.ratingPm },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between md:justify-start gap-3">
                  <span className="text-xs font-medium text-slate-600 md:text-slate-500 uppercase tracking-wide">{m.label}</span>
                  <StarRatingDock value={m.val} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right (≈30%): docs + status/updated + CTAs */}
        <div className="md:col-span-3">
          <div className="border border-slate-200/70 rounded-xl p-3 md:p-3.5 bg-white">
            <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-200/70">
              <span className="text-xs text-slate-500 uppercase tracking-wide">SOW Available</span>
              {yesNoPill(item.sow)}
            </div>
            <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-200/70">
              <span className="text-xs text-slate-500 uppercase tracking-wide">NDA Available</span>
              {yesNoPill(item.nda)}
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-xs text-slate-500 uppercase tracking-wide">MSA Available</span>
              {yesNoPill(item.msa)}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200/70">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Status</span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${getStatusBadgeClass(item.status)}`}
                >
                  {formatStatusForDisplay(item.status) || '—'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Updated</span>
                <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                  {item.createdDate ? formatDateTime(item.createdDate) : '—'}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onViewDetails}
                className="inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-[#17a2b4] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0f6b7a]"
              >
                <i className="ri-external-link-line" aria-hidden />
                View Full Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ContractsMyItems() {
  const { kf: kfFromContext, sdkReady } = useContext(KissflowSDKContext)
  const kfInstance = kfFromContext ?? (typeof window !== 'undefined' ? window.kf : null)
  const contractPaths = useMemo(() => buildContractProcessApiPaths(kfInstance), [kfInstance])
  const adminPaths = useMemo(() => buildContractAdminApiPaths(kfInstance), [kfInstance])
  const totalVendorsCountPath = useMemo(() => buildTotalVendorsReportCountPath(kfInstance), [kfInstance])
  const vendorMasterPaths = useMemo(() => buildVendorMasterApiPaths(kfInstance), [kfInstance])

  const [adminContractRows, setAdminContractRows] = useState(null)
  /** Same as VMS2.0: report count then contract-unique fallback for Total Vendors KPI. */
  const [vendorTotalFromReport, setVendorTotalFromReport] = useState(null)
  const [vendorMasterRows, setVendorMasterRows] = useState([])

  const [activeTab, setActiveTab] = useState('items')
  const [statusFilter, setStatusFilter] = useState('Draft')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState(null)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [user, setUser] = useState(null)
  const [roleName, setRoleName] = useState('')
  const [itemsPage, setItemsPage] = useState(1)
  const [tasksPage, setTasksPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [selectedItemIds, setSelectedItemIds] = useState(new Set())
  const [selectedContract, setSelectedContract] = useState(null)
  const [statusCountsFromApi, setStatusCountsFromApi] = useState(null)
  const [pendingActivities, setPendingActivities] = useState(null)
  const [currentActivityId, setCurrentActivityId] = useState(null)
  const [currentStepName, setCurrentStepName] = useState('Review contract')
  const [totalTasksCount, setTotalTasksCount] = useState(0)
  const [tasksFromApi, setTasksFromApi] = useState(null)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [columnsPopoverOpen, setColumnsPopoverOpen] = useState(false)
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')
  const [activeDateField, setActiveDateField] = useState(null) // 'from' | 'to' | null
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [visibleColumnsItems, setVisibleColumnsItems] = useState(DEFAULT_VISIBLE_ITEMS)
  const [visibleColumnsTasks, setVisibleColumnsTasks] = useState(DEFAULT_VISIBLE_TASKS)
  const [expandedItemId, setExpandedItemId] = useState(null)
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  const [itemDetailsById, setItemDetailsById] = useState({})
  const [taskDetailsById, setTaskDetailsById] = useState({})
  /** Row ids currently fetching vendor via instance detail (My Items). */
  const [itemVendorCellLoadingById, setItemVendorCellLoadingById] = useState({})
  const [deletingDrafts, setDeletingDrafts] = useState(false)
  const [watchParamsTick, setWatchParamsTick] = useState(0)
  const [expiringWindow, setExpiringWindow] = useState('90')
  const hydratedMissingVendorIdsRef = useRef(new Set())
  const taskValuePrefetchInFlightRef = useRef(new Set())
  const filterPopoverRef = useRef(null)
  const columnsPopoverRef = useRef(null)
  const filterDropdownRef = useRef(null)
  const columnsDropdownRef = useRef(null)
  const [filterAnchorRect, setFilterAnchorRect] = useState(null)
  const [columnsAnchorRect, setColumnsAnchorRect] = useState(null)
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])
  const firstName = user?.FirstName || (user?.Name ? String(user.Name).split(/\s+/)[0] : '') || 'User'
  const roleLabel =
    roleName ||
    user?.Role?.Name?.trim() ||
    user?._user_type ||
    user?.Groups?.[0]?.Name ||
    user?.Roles?.[0]?.Name ||
    'User'

  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [calendarMonth],
  )
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthStartWeekday = monthStart.getDay()
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < monthStartWeekday; i += 1) cells.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day))
    }
    return cells
  }, [calendarMonth])

  const selectedIsoForCalendar = activeDateField === 'from' ? filterFromDate : activeDateField === 'to' ? filterToDate : ''

  function openDatePicker(field) {
    setActiveDateField(field)
    const seed =
      (field === 'from' ? filterFromDate : filterToDate) ||
      (field === 'from' ? filterToDate : filterFromDate) ||
      formatDateToIso(new Date())
    const seedDate = new Date(`${seed}T00:00:00`)
    setCalendarMonth(startOfMonth(isNaN(seedDate.getTime()) ? new Date() : seedDate))
  }

  function selectCalendarDate(dateObj) {
    const iso = formatDateToIso(dateObj)
    if (!iso) return
    if (activeDateField === 'from') setFilterFromDate(iso)
    if (activeDateField === 'to') setFilterToDate(iso)
    setActiveDateField(null)
  }

  useLayoutEffect(function positionFilterPopover() {
    if (!filterPopoverOpen || !filterPopoverRef.current) {
      setFilterAnchorRect(null)
      return
    }
    const rect = filterPopoverRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 10
    const gap = 8
    const width = Math.min(320, Math.max(260, vw - pad * 2))
    // Approximate popover heights (without / with calendar expanded).
    const estimatedHeight = activeDateField ? 560 : 260
    const spaceBelow = vh - rect.bottom - gap
    const shouldOpenUp = spaceBelow < estimatedHeight && rect.top > spaceBelow
    const unclampedLeft = rect.right - width
    const left = Math.max(pad, Math.min(unclampedLeft, vw - width - pad))
    const top = shouldOpenUp ? rect.top - estimatedHeight - gap : rect.bottom + gap
    const clampedTop = Math.max(pad, Math.min(top, vh - pad - 120))
    setFilterAnchorRect({ top: clampedTop, left, width })
  }, [filterPopoverOpen, activeDateField])

  useLayoutEffect(function positionColumnsPopover() {
    if (!columnsPopoverOpen || !columnsPopoverRef.current) {
      setColumnsAnchorRect(null)
      return
    }
    const rect = columnsPopoverRef.current.getBoundingClientRect()
    setColumnsAnchorRect({ top: rect.bottom + 8, right: window.innerWidth - rect.right, width: 224 })
  }, [columnsPopoverOpen])

  useEffect(function keepFilterPopoverAnchoredOnViewportChanges() {
    if (!filterPopoverOpen) return
    const recalc = () => {
      if (!filterPopoverRef.current) return
      const rect = filterPopoverRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const pad = 10
      const gap = 8
      const width = Math.min(320, Math.max(260, vw - pad * 2))
      const estimatedHeight = activeDateField ? 560 : 260
      const spaceBelow = vh - rect.bottom - gap
      const shouldOpenUp = spaceBelow < estimatedHeight && rect.top > spaceBelow
      const unclampedLeft = rect.right - width
      const left = Math.max(pad, Math.min(unclampedLeft, vw - width - pad))
      const top = shouldOpenUp ? rect.top - estimatedHeight - gap : rect.bottom + gap
      const clampedTop = Math.max(pad, Math.min(top, vh - pad - 120))
      setFilterAnchorRect({ top: clampedTop, left, width })
    }
    const onViewportChange = () => window.requestAnimationFrame(recalc)
    window.addEventListener('resize', onViewportChange)
    // capture:true catches scroll from nested containers too.
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [filterPopoverOpen, activeDateField])

  useEffect(function keepColumnsPopoverAnchoredOnViewportChanges() {
    if (!columnsPopoverOpen) return
    const recalc = () => {
      if (!columnsPopoverRef.current) return
      const rect = columnsPopoverRef.current.getBoundingClientRect()
      setColumnsAnchorRect({ top: rect.bottom + 8, right: window.innerWidth - rect.right, width: 224 })
    }
    const onViewportChange = () => window.requestAnimationFrame(recalc)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [columnsPopoverOpen])

  useEffect(() => {
    if (filterPopoverOpen) return
    setActiveDateField(null)
  }, [filterPopoverOpen])

  useEffect(function setupWatchParamsRefetch() {
    if (!kfInstance?.context?.watchParams) return
    function handleWatchParams(data) {
      if (data && typeof data === 'object') {
        if (data.statusFilter != null) setStatusFilter(String(data.statusFilter))
        if (data.search != null) setSearch(String(data.search))
      }
      // Keep counts/lists fresh after workflow actions from popup or other pages.
      setWatchParamsTick((n) => n + 1)
    }
    kfInstance.context.watchParams(handleWatchParams)
  }, [kfInstance])

  /** Same UX as Leads: show name/greeting as soon as `kf.user` exists (before contract API paths resolve). */
  useEffect(function hydrateUserFromKfSdk() {
    const kf = kfInstance
    if (!kf?.user) return
    setUser((prev) => {
      if (prev && (prev.Name || prev.FirstName)) return prev
      const u = kf.user
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
  }, [kfInstance, sdkReady])

  useEffect(function setupRoleNameOnLoad() {
    const sdk = kfInstance
    if (!sdk?.user) return
    let cancelled = false

    const abc =
      sdk.user?.Role ||
      sdk.context?.user?.Role ||
      sdk.user?.Roles?.[0] ||
      sdk.context?.user?.Roles?.[0] ||
      null
    const roleFromSdk = stringifyKfRole(abc)
    if (roleFromSdk) setRoleName(roleFromSdk)

    if (!sdk.app) return

    async function run() {
      try {
        if (!roleFromSdk) return
        await sdk.app.setVariable('user_role_name', roleFromSdk)
        const variableName = await sdk.app.getVariable('user_role_name')
        const variableRole = String(variableName || '').trim()
        const resolvedRole =
          variableRole && variableRole.toLowerCase() !== 'user'
            ? variableRole
            : String(roleFromSdk || '').trim()
        if (!resolvedRole || cancelled) return
        setRoleName(resolvedRole)
      } catch (e) {
        if (!cancelled) console.warn('Role setup failed:', e?.message || e)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [kfInstance])

  useEffect(function fetchStatusCounts() {
    if (!contractPaths) return
    const kf = kfInstance
    let cancelled = false
    async function run() {
      try {
        let response
        if (kf?.api) {
          const resp = await kf.api(contractPaths.statusCountPath, { method: 'GET', headers: { Accept: 'application/json' } })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(getApiBase() + contractPaths.statusCountPath, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
          if (!res.ok) return
          response = await res.json()
        }
        if (!cancelled && response && typeof response === 'object') {
          setStatusCountsFromApi({
            Draft: response.Draft ?? 0,
            'In progress': response.InProgress ?? 0,
            Completed: response.Completed ?? 0,
            Withdrawn: response.Withdrawn ?? 0,
            Rejected: response.Rejected ?? 0,
          })
        }
      } catch (e) {
        if (!cancelled) console.warn('Status count fetch failed:', e?.message || e)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, watchParamsTick, contractPaths, kfInstance])

  useEffect(function fetchPendingActivityCount() {
    if (!contractPaths) return
    const kf = kfInstance
    let cancelled = false
    async function run() {
      try {
        let response
        const pendingCountPath = `/process/2/${contractPaths.accountId}/${contractPaths.processId}/pending/activity/count?_application_id=${encodeURIComponent(contractPaths.applicationId)}`
        if (kf?.api) {
          const resp = await kf.api(pendingCountPath, { method: 'GET', headers: { Accept: 'application/json' } })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(getApiBase() + pendingCountPath, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
          if (!res.ok) return
          response = await res.json()
        }
        if (cancelled) return
        const list = Array.isArray(response) ? response : (response?.Data ?? response?.data ?? [])
        const activities = Array.isArray(list) ? list : []
        setPendingActivities(activities)
        const stillExists = activities.some((a) => a?._id === currentActivityId)
        if (activities.length === 1 && activities[0]?._id) {
          setCurrentActivityId(activities[0]._id)
          setCurrentStepName(activities[0].StepName || 'Review contract')
          setTotalTasksCount(activities[0].Count ?? 0)
          return
        }
        if (!stillExists) {
          setCurrentActivityId(null)
          const first = activities.find((a) => a?.StepName)
          setCurrentStepName(first?.StepName || 'Review contract')
          setTotalTasksCount(first?.Count ?? 0)
        }
      } catch (e) {
        if (!cancelled) console.warn('Pending activity count failed:', e?.message || e)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, watchParamsTick, contractPaths, kfInstance, currentActivityId])

  useEffect(function fetchUser() {
    if (!contractPaths) return
    const kf = kfInstance
    const userId = kf?.user?._id || kf?.context?.user?._id || 'UsCyVwuplHVM'
    const path = contractPaths.userPathPrefix + userId + contractPaths.userPathSuffix
    const url = getApiBase() + path
    let cancelled = false
    async function run() {
      try {
        let response
        if (kf?.api) {
          const resp = await kf.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
          if (!res.ok) return
          response = await res.json()
        }
        if (!cancelled && response && (response._id || response.Name)) setUser(response)
      } catch (e) {
        if (!cancelled) console.warn('User fetch failed:', e?.message || e)
      }
      if (!cancelled && kf?.user?.Name) {
        setUser((prev) => {
          if (prev && (prev._id || prev.Name)) return prev
          const u = kf.user
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
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, contractPaths, kfInstance])

  useEffect(function fetchItemsByStatus() {
    if (!contractPaths) return
    const kf = kfInstance
    let cancelled = false
    setItemsLoading(true)
    // Fetch selected status list from /myitems/{status} endpoint.
    const path = buildMyItemsPath(contractPaths, statusFilter, 1, 1000)
    const segment = STATUS_TO_SEGMENT[statusFilter] || 'draft'
    const url = getApiBase() + path
    async function run() {
      try {
        let response
        if (kf?.api) {
          const resp = await kf.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
          if (!res.ok) return
          response = await res.json()
        }
        if (cancelled) return
        const data = Array.isArray(response) ? response : response?.Data ?? response?.data ?? response?.Item ?? response?.items ?? null
        const list = Array.isArray(data)
          ? data
              .map((row) => mergeMyItemsRowWithVmsShape(row, segment))
              .filter(Boolean)
          : []
        hydratedMissingVendorIdsRef.current = new Set()
        setItemDetailsById({})
        setItemVendorCellLoadingById({})
        setItems(list)
      } catch (e) {
        if (!cancelled) {
          console.warn('Contract items fetch failed:', e?.message || e)
          setItems(null)
        }
      } finally {
        if (!cancelled) setItemsLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, statusFilter, watchParamsTick, contractPaths, kfInstance])

  /** Same admin list as VMS2.0 — used only for KPI totals (total/active/expiring/NDA…) so counts match the dashboard. */
  useEffect(function fetchAdminContractsForKpis() {
    if (!adminPaths) return
    const kf = kfInstance
    let cancelled = false
    async function run() {
      try {
        const path = adminPaths.getContractItemsPath(1, 1000)
        let response
        if (kf?.api) {
          const resp = await kf.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
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
        if (cancelled) return
        const data = response?.Data ?? response?.data ?? (Array.isArray(response) ? response : null)
        const list = Array.isArray(data) ? data : []
        const mapped = []
        for (let i = 0; i < list.length; i += 1) {
          const row = mapKfContractItem(list[i])
          if (row) mapped.push(row)
        }
        if (!cancelled) setAdminContractRows(mapped)
      } catch (e) {
        if (!cancelled) {
          console.warn('Admin contract list for KPIs failed (counts fall back to my-items scope):', e?.message || e)
          setAdminContractRows(null)
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, watchParamsTick, adminPaths, kfInstance])

  useEffect(() => {
    if (!totalVendorsCountPath) {
      setVendorTotalFromReport(null)
      return
    }
    const kf = kfInstance
    let cancelled = false
    async function fetchVendorCount() {
      try {
        let response
        if (kf?.api) {
          response = await kf.api(totalVendorsCountPath, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
        } else {
          const res = await fetch(getApiBase() + totalVendorsCountPath, {
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
  }, [sdkReady, watchParamsTick, kfInstance, totalVendorsCountPath])

  useEffect(() => {
    if (!vendorMasterPaths) {
      setVendorMasterRows([])
      return
    }
    const kf = kfInstance
    let cancelled = false
    function mapVendor(item) {
      if (!item || typeof item !== 'object') return null
      const name = String(item.Vendor_Name || item.Name || '').trim()
      if (!name) return null
      return { id: item._id || '', name, raw: item }
    }
    async function run() {
      try {
        const path = vendorMasterPaths.getVendorItemsPath(1, 1000)
        let response
        if (kf?.api) {
          const resp = await kf.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
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
        setVendorMasterRows(list.map(mapVendor).filter(Boolean))
      } catch (e) {
        if (!cancelled) {
          console.warn('Vendor master list fetch failed:', e?.message || e)
          setVendorMasterRows([])
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, watchParamsTick, kfInstance, vendorMasterPaths])

  /**
   * My Items list is slim: fetch instance detail once per row to fill missing vendor and/or contract value
   * (Rejected and other segments often omit Value like pending tasks).
   */
  useEffect(function hydrateMissingItemVendorsAndValues() {
    /** Avoid unbounded sequential GETs when myitems returns a very large list. */
    const MAX_ITEM_DETAIL_HYDRATE = 300
    if (!contractPaths) return
    if (!Array.isArray(items) || items.length === 0) {
      setItemVendorCellLoadingById({})
      return
    }
    const sdk = kfInstance
    const segment = STATUS_TO_SEGMENT[statusFilter] || 'draft'
    const appQ = `_application_id=${encodeURIComponent(contractPaths.applicationId)}`
    const candidates = [...items]
      .filter((x) => {
        if (!x?.id) return false
        const needVendor = !String(x.vendor || '').trim()
        const needValue = !x.valueDisplay || x.valueDisplay === '—'
        return needVendor || needValue
      })
      .sort((a, b) => {
        const av = !String(a.vendor || '').trim() ? 0 : 1
        const bv = !String(b.vendor || '').trim() ? 0 : 1
        return av - bv
      })
      .slice(0, MAX_ITEM_DETAIL_HYDRATE)
    if (candidates.length === 0) {
      setItemVendorCellLoadingById({})
      return
    }

    const needVendorById = new Set(
      candidates.filter((c) => !String(c.vendor || '').trim()).map((c) => c.id),
    )
    const loadMap = {}
    needVendorById.forEach((id) => {
      loadMap[id] = true
    })
    setItemVendorCellLoadingById(loadMap)

    let cancelled = false

    async function run() {
      const nextById = {}
      for (const row of candidates) {
        if (cancelled) return
        if (hydratedMissingVendorIdsRef.current.has(row.id)) {
          if (needVendorById.has(row.id)) {
            setItemVendorCellLoadingById((prev) => {
              if (!prev[row.id]) return prev
              const n = { ...prev }
              delete n[row.id]
              return n
            })
          }
          continue
        }
        hydratedMissingVendorIdsRef.current.add(row.id)

        const instanceId = row.id
        const activityInstanceId = row.activityInstanceId || row?._activity_instance_id || ''
        const tryPaths = []
        if (activityInstanceId) {
          tryPaths.push(
            `/process/2/${contractPaths.accountId}/${contractPaths.processId}/${encodeURIComponent(String(instanceId))}/${encodeURIComponent(String(activityInstanceId))}?${appQ}`,
          )
        }
        // Instance-only detail URLs can 404 for certain segments (commonly Completed),
        // and create noisy red network requests. Only hydrate when we have activity instance id.
        if (tryPaths.length === 0) {
          if (needVendorById.has(row.id)) {
            setItemVendorCellLoadingById((prev) => {
              if (!prev[row.id]) return prev
              const n = { ...prev }
              delete n[row.id]
              return n
            })
          }
          continue
        }

        let rowPatch = null
        try {
          for (const path of tryPaths) {
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
                if (!res.ok) continue
                response = await res.json()
              }
              if (!response) continue
              const payload = response?.Data ?? response?.data ?? response?.Item ?? response
              const mapped = mapKfItemToContract(payload, segment)
              if (!mapped) continue
              const patch = {}
              const v = String(mapped.vendor || '').trim()
              if (v && !String(row.vendor || '').trim()) patch.vendor = v
              if (mapped.valueDisplay && mapped.valueDisplay !== '—' && (!row.valueDisplay || row.valueDisplay === '—')) {
                patch.valueDisplay = mapped.valueDisplay
              }
              if (mapped.endDate && mapped.endDate !== '—' && (!row.endDate || row.endDate === '—')) {
                patch.endDate = mapped.endDate
                if (mapped.endDateDisplay && mapped.endDateDisplay !== '—') patch.endDateDisplay = mapped.endDateDisplay
              }
              if (Object.keys(patch).length > 0) {
                rowPatch = patch
                break
              }
            } catch {
              continue
            }
          }
        } finally {
          if (needVendorById.has(row.id)) {
            setItemVendorCellLoadingById((prev) => {
              if (!prev[row.id]) return prev
              const n = { ...prev }
              delete n[row.id]
              return n
            })
          }
        }

        if (rowPatch && Object.keys(rowPatch).length > 0) {
          nextById[row.id] = rowPatch
        }
      }
      if (cancelled || Object.keys(nextById).length === 0) return
      setItems((prev) =>
        Array.isArray(prev) ? prev.map((x) => (nextById[x.id] ? { ...x, ...nextById[x.id] } : x)) : prev,
      )
    }
    run()
    return () => {
      cancelled = true
      setItemVendorCellLoadingById({})
    }
  }, [items, contractPaths, kfInstance, statusFilter])

  useEffect(function fetchTasksForActivity() {
    if (!contractPaths) return
    if (!currentActivityId) {
      setTasksFromApi([])
      setTasksLoading(false)
      return
    }
    const kf = kfInstance
    let cancelled = false
    setTasksLoading(true)
    // Fetch selected activity tasks from pending/{activityId} endpoint.
    const path = `/process/2/${contractPaths.accountId}/${contractPaths.processId}/pending/${encodeURIComponent(String(currentActivityId))}?apply_preference=true&page_number=1&page_size=10&skip_aggregation=true&_application_id=${encodeURIComponent(contractPaths.applicationId)}`
    const url = getApiBase() + path
    async function run() {
      try {
        let response
        if (kf?.api) {
          const resp = await kf.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
          if (!res.ok) return
          response = await res.json()
        }
        if (cancelled) return
        const data = Array.isArray(response) ? response : response?.Data ?? response?.data ?? null
        const list = Array.isArray(data) ? data.map((row) => mapKfContractTaskToRow(row, '')).filter(Boolean) : []
        setTasksFromApi(list)
        if (!cancelled) {
          const active = Array.isArray(pendingActivities) ? pendingActivities.find((a) => a?._id === currentActivityId) : null
          setTotalTasksCount(active?.Count ?? (Array.isArray(list) ? list.length : 0))
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Tasks fetch failed:', e?.message || e)
          setTasksFromApi(null)
        }
      } finally {
        if (!cancelled) setTasksLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sdkReady, watchParamsTick, contractPaths, kfInstance, currentActivityId, pendingActivities])

  /**
   * My Items list payload is often slimmer than a full workflow item. My Tasks already hydrates
   * via GET /process/.../{instanceId}/{activityInstanceId}; do the same for expanded My Items rows.
   */
  useEffect(function hydrateExpandedItemDetails() {
    if (!expandedItemId || !contractPaths) return
    if (itemDetailsById[expandedItemId]) return
    const baseItem = Array.isArray(items) ? items.find((t) => t?.id === expandedItemId) : null
    if (!baseItem) return

    const instanceId = baseItem.id
    if (!instanceId) return

    const activityInstanceId = baseItem.activityInstanceId || baseItem._activity_instance_id || ''
    const segment = STATUS_TO_SEGMENT[statusFilter] || 'draft'
    const appQ = `_application_id=${encodeURIComponent(contractPaths.applicationId)}`
    const sdk = kfInstance
    let cancelled = false

    async function run() {
      try {
        const tryPaths = []
        if (activityInstanceId) {
          tryPaths.push(
            `/process/2/${contractPaths.accountId}/${contractPaths.processId}/${encodeURIComponent(String(instanceId))}/${encodeURIComponent(String(activityInstanceId))}?${appQ}`,
          )
        }
        // Avoid noisy 404s for segments where instance-only detail is not available.
        if (tryPaths.length === 0) return

        let response = null
        for (const path of tryPaths) {
          try {
            let resp
            if (sdk?.api) {
              const r = await sdk.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
              resp = r?.data ?? r ?? null
            } else {
              const res = await fetch(getApiBase() + path, {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json' },
              })
              if (!res.ok) continue
              resp = await res.json()
            }
            if (resp && !cancelled) {
              response = resp
              break
            }
          } catch {
            continue
          }
        }
        if (cancelled || !response) return

        const row = response?.Data ?? response?.data ?? response?.Item ?? response
        const payload = row && typeof row === 'object' && !Array.isArray(row) ? row : response
        const merged = mapKfItemToContract(payload, segment)
        if (!merged) return
        setItemDetailsById((prev) => ({ ...prev, [expandedItemId]: { ...baseItem, ...merged } }))
      } catch (e) {
        if (!cancelled) console.warn('Contract item detail hydrate failed:', e?.message || e)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [expandedItemId, contractPaths, kfInstance, items, statusFilter, itemDetailsById])

  useEffect(function hydrateExpandedTaskDetails() {
    if (!expandedTaskId || !contractPaths) return
    if (taskDetailsById[expandedTaskId]) return
    const baseTask = (tasksFromApi || []).find((t) => t?.id === expandedTaskId)
    if (!baseTask) return
    if (
      baseTask.vendor &&
      baseTask.valueDisplay &&
      baseTask.valueDisplay !== '—' &&
      baseTask.endDate &&
      baseTask.endDate !== '—'
    ) {
      return
    }

    const instanceId = baseTask?._id || baseTask?.id
    const activityInstanceId = baseTask?.activityInstanceId || baseTask?._activity_instance_id
    if (!instanceId || !activityInstanceId) return
    let cancelled = false

    async function run() {
      try {
        const merged = await fetchContractTaskDetailMerged(
          contractPaths,
          kfInstance,
          baseTask,
          currentActivityId || '',
        )
        if (cancelled || !merged) return
        setTaskDetailsById((prev) => ({ ...prev, [expandedTaskId]: { ...baseTask, ...merged } }))
      } catch (e) {
        if (!cancelled) console.warn('Task detail hydrate failed:', e?.message || e)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [expandedTaskId, contractPaths, kfInstance, tasksFromApi, taskDetailsById, currentActivityId])

  /**
   * Pending list does not include contract value; prefetch the same detail row used by the accordion
   * so the Value column is filled without expanding.
   */
  useEffect(function prefetchMyTasksContractValues() {
    if (activeTab !== 'tasks') return
    if (!contractPaths || !kfInstance) return
    const list = tasksFromApi
    if (!Array.isArray(list) || list.length === 0) return

    let cancelled = false

    const run = async () => {
      await Promise.all(
        list.map(async (baseTask) => {
          if (cancelled) return
          const id = baseTask?.id
          if (!id) return
          if (baseTask.valueDisplay && baseTask.valueDisplay !== '—') return

          const instanceId = baseTask.id || baseTask._id
          const activityInstanceId = baseTask.activityInstanceId || baseTask._activity_instance_id
          if (!instanceId || !activityInstanceId) return

          if (taskValuePrefetchInFlightRef.current.has(id)) return
          taskValuePrefetchInFlightRef.current.add(id)
          try {
            const merged = await fetchContractTaskDetailMerged(
              contractPaths,
              kfInstance,
              baseTask,
              currentActivityId || '',
            )
            if (cancelled || !merged) return
            setTaskDetailsById((prev) => {
              const existing = prev[id]
              if (existing?.valueDisplay && existing.valueDisplay !== '—') return prev
              const nextVal = merged.valueDisplay
              if (!nextVal || nextVal === '—') return prev
              return { ...prev, [id]: { ...baseTask, ...merged, ...existing } }
            })
          } finally {
            taskValuePrefetchInFlightRef.current.delete(id)
          }
        }),
      )
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [activeTab, contractPaths, kfInstance, tasksFromApi, currentActivityId])

  useEffect(function initAOS() {
    AOS.init({ duration: 800, once: true })
  }, [])

  useEffect(function closePopoversOnClickOutside() {
    if (!filterPopoverOpen && !columnsPopoverOpen) return
    const handlePointerDown = (e) => {
      if (filterPopoverRef.current?.contains(e.target) || filterDropdownRef.current?.contains(e.target)) return
      if (columnsPopoverRef.current?.contains(e.target) || columnsDropdownRef.current?.contains(e.target)) return
      setFilterPopoverOpen(false)
      setColumnsPopoverOpen(false)
      setActiveDateField(null)
    }
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return
      setFilterPopoverOpen(false)
      setColumnsPopoverOpen(false)
      setActiveDateField(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [filterPopoverOpen, columnsPopoverOpen])

  const itemList = items !== null ? items : DEMO_ITEMS
  const taskList = tasksFromApi ?? []
  const contractUniverseForKpis = useMemo(() => {
    if (Array.isArray(adminContractRows)) {
      return adminContractRows.map((c) => ({
        ...c,
        id: c._id || '',
        rawItem: c.raw,
      }))
    }
    const seen = new Set()
    const out = []
    const pushUnique = (row) => {
      const key = String(row?.id || row?._id || '').trim()
      if (!key || seen.has(key)) return
      seen.add(key)
      out.push(row)
    }
    itemList.forEach(pushUnique)
    taskList.forEach(pushUnique)
    return out
  }, [adminContractRows, itemList, taskList])
  const contractKpis = useMemo(() => {
    const today = new Date()
    let next30 = 0
    let next60 = 0
    let next90 = 0
    let expired = 0
    let active = 0
    let ndaMiss = 0
    let msaMiss = 0
    let sowMiss = 0
    const vendorKeys = new Set()

    contractUniverseForKpis.forEach((c) => {
      const endRaw = c?.endDate || c?.endDateDisplay || c?.rawItem?.End_Date || c?.rawItem?.EndDate || ''
      const endDate = parseDateSafe(endRaw)
      const status = String(formatStatusForDisplay(c?.status) || '').toLowerCase()
      const isRejectedLike = status.includes('rejected') || status.includes('withdrawn')
      const isDraftLike = status.includes('draft')
      let isExpiredByDate = false
      if (endDate) {
        const diff = daysBetween(today, endDate)
        if (diff < 0) {
          expired += 1
          isExpiredByDate = true
        } else if (diff <= 30) next30 += 1
        else if (diff <= 60) next60 += 1
        else if (diff <= 90) next90 += 1
      }
      const statusExpired = status.includes('expired')
      const activeLike = !isRejectedLike && !isDraftLike && !statusExpired && !isExpiredByDate
      if (activeLike) active += 1

      if (!isDocAvailable(c?.nda)) ndaMiss += 1
      if (!isDocAvailable(c?.msa)) msaMiss += 1
      if (!isDocAvailable(c?.sow)) sowMiss += 1

      const vendorName = String(c?.vendor || '').trim()
      if (vendorName) vendorKeys.add(vendorName.toLowerCase())
    })

    const vendorsFromContracts = vendorKeys.size
    const vendors =
      vendorMasterRows.length > 0
        ? vendorMasterRows.length
        : vendorTotalFromReport != null
          ? vendorTotalFromReport
          : vendorsFromContracts

    const expiringSoon =
      expiringWindow === '30' ? next30 : expiringWindow === '60' ? (next30 + next60) : (next30 + next60 + next90)
    return {
      total: contractUniverseForKpis.length,
      active,
      expiringSoon,
      expired,
      ndaMiss,
      msaMiss,
      sowMiss,
      vendors,
      next30,
      next60,
      next90,
    }
  }, [contractUniverseForKpis, expiringWindow, vendorMasterRows.length, vendorTotalFromReport])
  const activityTabs = useMemo(() => {
    const list = Array.isArray(pendingActivities) ? pendingActivities : []
    return list.filter((a) => a && a._id)
  }, [pendingActivities])

  function itemMatchesDateRange(item, from, to) {
    const d = item?.createdDate ? new Date(item.createdDate) : null
    if (!d || isNaN(d.getTime())) return false
    if (from) {
      const fromD = new Date(from)
      fromD.setHours(0, 0, 0, 0)
      if (d < fromD) return false
    }
    if (to) {
      const toD = new Date(to)
      toD.setHours(23, 59, 59, 999)
      if (d > toD) return false
    }
    return true
  }

  const filteredItems = useMemo(() => {
    let list = itemList
    if (statusFilter) {
      list = list.filter((item) => (formatStatusForDisplay(item?.status) || 'Draft') === statusFilter)
    }
    if (filterFromDate || filterToDate) {
      list = list.filter((item) => itemMatchesDateRange(item, filterFromDate, filterToDate))
    }
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (item) =>
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.vendor && item.vendor.toLowerCase().includes(q)) ||
        (item.valueDisplay && item.valueDisplay.toLowerCase().includes(q)) ||
        (item.contractType && item.contractType.toLowerCase().includes(q)) ||
        (item.contractDescription && item.contractDescription.toLowerCase().includes(q)) ||
        (item.contractRequestDisplay && item.contractRequestDisplay.toLowerCase().includes(q)) ||
        (item.message && item.message.toLowerCase().includes(q))
    )
  }, [itemList, statusFilter, search, filterFromDate, filterToDate])

  const filteredTasks = useMemo(() => {
    let list = taskList
    if (filterFromDate || filterToDate) {
      list = list.filter((t) => itemMatchesDateRange(t, filterFromDate, filterToDate))
    }
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (t) =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.vendor && t.vendor.toLowerCase().includes(q)) ||
        (t.createdBy && t.createdBy.toLowerCase().includes(q))
    )
  }, [taskList, search, filterFromDate, filterToDate])

  const statusCounts = useMemo(() => {
    if (statusCountsFromApi) return statusCountsFromApi
    const counts = { Draft: 0, 'In progress': 0, Completed: 0, Withdrawn: 0, Rejected: 0 }
    itemList.forEach((item) => {
      const s = item.status || 'Draft'
      if (counts[s] !== undefined) counts[s]++
      else counts.Draft++
    })
    return counts
  }, [statusCountsFromApi, itemList])

  /** Align the active tab badge with the loaded my-items list (same scope as the table/cards). */
  const statusTabCounts = useMemo(() => {
    const c = statusCounts
    if (!c) return c
    if (itemsLoading) return c
    if (items === null) return c
    if (filterFromDate || filterToDate || search.trim()) return c
    return { ...c, [statusFilter]: items.length }
  }, [statusCounts, items, itemsLoading, statusFilter, filterFromDate, filterToDate, search])

  const itemsPaginated = filteredItems.slice((itemsPage - 1) * rowsPerPage, itemsPage * rowsPerPage)
  const tasksPaginated = filteredTasks.slice((tasksPage - 1) * rowsPerPage, tasksPage * rowsPerPage)

  const totalItemsPages = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage))
  const totalTasksPages = Math.max(1, Math.ceil(filteredTasks.length / rowsPerPage))

  /** Bulk row checkboxes: My Items only on Draft; My Tasks hidden (no selection column). */
  const showItemBulkCheckboxes = statusFilter === 'Draft'
  const itemsTableLeadingCols = showItemBulkCheckboxes ? 2 : 1
  const tasksTableLeadingCols = 1

  const toggleItemSelection = (id) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllItems = (checked) => {
    if (checked) setSelectedItemIds(new Set(itemsPaginated.map((i) => i.id)))
    else setSelectedItemIds(new Set())
  }

  const handleDeleteSelectedDrafts = async () => {
    const ids = Array.from(selectedItemIds).filter(Boolean)
    if (ids.length === 0) return
    if (activeTab !== 'items' || statusFilter !== 'Draft') return
    if (!contractPaths) {
      window.alert('Kissflow paths are not ready yet. Please wait and try again.')
      return
    }

    const confirmed = window.confirm(`Delete ${ids.length} selected draft record(s)? This cannot be undone.`)
    if (!confirmed) return

    const sdk = kfInstance
    setDeletingDrafts(true)
    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          // Admin delete endpoint (no _application_id query required).
          const recordId = encodeURIComponent(String(id))
          const path = `/process/2/${contractPaths.accountId}/admin/${contractPaths.processId}/${recordId}`
          if (sdk?.api) {
            return sdk.api(path, { method: 'DELETE', headers: { Accept: 'application/json' } })
          }
          const res = await fetch(getApiBase() + path, {
            method: 'DELETE',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) throw new Error(`Delete failed (${res.status})`)
          return true
        })
      )

      const successIds = []
      let failed = 0
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') successIds.push(ids[idx])
        else failed += 1
      })

      if (successIds.length > 0) {
        setItems((prev) => (Array.isArray(prev) ? prev.filter((row) => !successIds.includes(row.id)) : prev))
        setSelectedItemIds((prev) => {
          const next = new Set(prev)
          successIds.forEach((id) => next.delete(id))
          return next
        })
        setStatusCountsFromApi((prev) => {
          if (!prev || typeof prev !== 'object') return prev
          return { ...prev, Draft: Math.max(0, (prev.Draft || 0) - successIds.length) }
        })
      }

      if (failed > 0) {
        window.alert(`${successIds.length} draft(s) deleted, ${failed} failed.`)
      } else {
        window.alert(`${successIds.length} draft(s) deleted successfully.`)
      }
    } catch (e) {
      console.warn('Bulk draft delete failed:', e?.message || e)
      window.alert('Delete failed. Please try again or contact support.')
    } finally {
      setDeletingDrafts(false)
    }
  }

  // Same pattern as DashboardPage.handleCreateContract — only popup id + openPage fallback differ
  const handleNewItem = () => {
    const sdk = typeof kf !== 'undefined' ? kf : window.kf
    const POPUP_ID = resolveContractPopupId()
    const popupParams = {
      width: 960,
      height: 720,
      popupWidth: '960px',
      popupHeight: '720px',
    }
    const appId = resolveKfContractApplicationId(sdk)
    if (typeof sdk?.app?.page?.openPopup === 'function') {
      sdk.app.page.openPopup(POPUP_ID, popupParams)
    } else if (sdk?.navigation && typeof sdk.navigation.navigate === 'function') {
      sdk.navigation.navigate({ page: 'create' })
    } else if (sdk?.app?.openPage && appId) {
      sdk.app.openPage(appId)
    } else {
      console.info('New item – wire popup/navigation in Kissflow')
    }
  }

  const openContractPopup = (row) => {
    const kfLocal = typeof kf !== 'undefined' ? kf : window.kf
    const POPUP_ID = resolveContractPopupId()
    const instanceId = row?.id || row?._id
    const activityInstanceId = row?.activityInstanceId || row?._activity_instance_id || ''
    // Popup expects ActivityID; prioritize activity instance id for workflow-form loading.
    const activityId = activityInstanceId || row?.activityId || currentActivityId || ''

    if (!kfLocal?.app?.page?.openPopup) {
      setSelectedContract(row)
      return
    }
    if (!instanceId || !activityId) {
      console.warn('View Details: missing required popup params', {
        instanceId,
        activityId,
        activityInstanceId,
        row,
      })
      // Safe UI fallback so user can still inspect details
      setSelectedContract(row)
      return
    }

    try {
      const p = kfLocal.app.page.openPopup(POPUP_ID, {
        // Keep canonical names requested by your popup, plus aliases for compatibility.
        ActivityID: String(activityId),
        InstanceId: String(instanceId),
        ActivityInstanceId: String(activityInstanceId || activityId),
        ActivityId: String(activityId),
        activityId: String(activityId),
        InstanceID: String(instanceId),
        width: 960,
        height: 720,
        popupWidth: '960px',
        popupHeight: '720px',
      })
      if (p && typeof p.catch === 'function') {
        p.catch((e) => {
          console.warn('View Details popup failed:', e?.message || e)
          setSelectedContract(row)
        })
      }
    } catch (e) {
      console.warn('View Details popup failed:', e?.message || e)
      setSelectedContract(row)
    }
  }

  return (
    <div className={`${vmsPageClass} w-full min-w-0`}>
      <div className={vmsPageInnerClass}>
        <div className="p-1 sm:p-2 md:p-0 flex flex-col space-y-4 sm:space-y-6 transition-smooth">
            <section className={vmsHeaderShellClass()} data-aos="fade-down">
              <P2pHeaderFx />
              <div className="relative z-[1] flex items-center gap-3 min-w-0">
                <div className={vmsAvatarClass()}>
                  {(firstName || 'U').charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-semibold tracking-tight text-gray-900 truncate">{greeting}, {firstName}</p>
                  <p className="text-xs sm:text-sm text-gray-500 truncate">Logged in as <span className={vmsRoleAccentClass()}>{roleLabel}</span></p>
                </div>
              </div>
            </section>

            <div className="tfx-kpis-row grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
              {[
                { key: 'total', label: 'Total Contracts', value: contractKpis.total, icon: 'ri-file-copy-2-line', variant: 'all' },
                { key: 'active', label: 'Active Contracts', value: contractKpis.active, icon: 'ri-file-check-line', variant: 'approved' },
                { key: 'expiring', label: 'Expiring Soon', value: contractKpis.expiringSoon, segmented: true, icon: 'ri-calendar-schedule-line', variant: 'overdue', live: true },
                { key: 'expired', label: 'Expired', value: contractKpis.expired, icon: 'ri-calendar-close-line', variant: 'rejected' },
                { key: 'nda', label: 'NDA Missing', value: contractKpis.ndaMiss, icon: 'ri-lock-2-line', variant: 'draft' },
                { key: 'msa', label: 'MSA Missing', value: contractKpis.msaMiss, icon: 'ri-stack-line', variant: 'returned' },
                { key: 'sow', label: 'SOW Missing', value: contractKpis.sowMiss, icon: 'ri-clipboard-line', variant: 'pending_approval' },
                { key: 'vendors', label: 'Total Vendors', value: contractKpis.vendors, icon: 'ri-handshake-line', variant: 'payments' },
              ].map((card, idx) => (
                <P2pKpiCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  variant={card.variant}
                  live={card.live}
                  total={card.key === 'vendors' ? card.value : contractKpis.total}
                  index={idx}
                  extra={card.segmented ? (
                    <div className="tfx-kpi-windows">
                      {['30', '60', '90'].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpiringWindow(w) }}
                          className={expiringWindow === w ? 'is-on' : ''}
                        >
                          {w}d
                        </button>
                      ))}
                    </div>
                  ) : null}
                />
              ))}
            </div>

            {/* Toolbar: mobile first (above tabs), desktop unchanged */}
            <div className={`order-2 relative z-[100] flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap min-w-0 ${vmsSectionShellClass()} ${vmsSectionHeaderClass()} max-md:rounded-none max-md:border-0 max-md:shadow-none max-md:px-0 max-md:py-0`} data-aos="fade-down">
              <div className="flex flex-wrap gap-2 items-center justify-center md:justify-start">
                {activeTab === 'items' ? (
                  <>
                    {STATUS_OPTIONS.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setStatusFilter(status)
                          setItemsPage(1)
                        }}
                        className={vmsChipBtnClass(statusFilter === status)}
                      >
                        {status}
                        {statusTabCounts[status] != null && (
                          <span className="ml-1.5 font-bold">{(statusTabCounts[status] || 0)}</span>
                        )}
                      </button>
                    ))}
                    {statusFilter === 'Draft' && selectedItemIds.size > 0 && (
                      <button
                        type="button"
                        onClick={handleDeleteSelectedDrafts}
                        disabled={deletingDrafts}
                        className={`${vmsDangerBtnClass()} disabled:opacity-60 disabled:cursor-not-allowed`}
                        title="Delete selected draft records"
                      >
                        <i className="ri-delete-bin-6-line"></i>
                        {deletingDrafts ? 'Deleting…' : `Delete Drafts (${selectedItemIds.size})`}
                      </button>
                    )}
                  </>
                ) : activityTabs.length > 0 ? (
                  activityTabs.map((activity) => (
                    <button
                      key={activity._id}
                      type="button"
                      onClick={() => {
                        setCurrentActivityId(activity._id)
                        setCurrentStepName(activity.StepName || 'Review contract')
                        setTotalTasksCount(activity.Count ?? 0)
                        setTasksPage(1)
                      }}
                      className={vmsChipBtnClass(currentActivityId === activity._id)}
                    >
                      {activity.StepName || 'Activity'}
                      <span className="ml-1.5 font-bold">{activity.Count ?? 0}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs md:text-sm text-slate-600 font-medium">No pending activities.</p>
                )}
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-center md:justify-end min-w-0">
                {activeTab === 'items' && (
                  <button
                    type="button"
                    onClick={handleNewItem}
                    className={`hidden md:inline-flex ${vmsPrimaryBtnClass()}`}
                  >
                    <i className="ri-add-line text-base"></i>
                    New item
                  </button>
                )}
                <div className="relative w-full max-w-[220px] md:w-auto md:flex-1 sm:max-w-xs min-w-0">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none"></i>
                  <input
                    type="text"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={vmsSearchInputClass()}
                  />
                </div>
                <div className="relative" ref={filterPopoverRef}>
                  <button
                    type="button"
                    onClick={() => { setFilterPopoverOpen((o) => !o); setColumnsPopoverOpen(false) }}
                    className={vmsIconBtnClass(filterPopoverOpen)}
                    aria-label="Filter"
                  >
                    <i className="ri-filter-3-line text-base md:text-lg"></i>
                  </button>
                  {filterPopoverOpen &&
                  filterAnchorRect &&
                  createPortal(
                    <div
                      ref={filterDropdownRef}
                      className="rounded-xl bg-white border border-gray-200 shadow-lg p-4"
                      style={{
                        position: 'fixed',
                        top: filterAnchorRect.top,
                        right: 8,
                        width: 'min(88vw, 340px)',
                        zIndex: 9999,
                        maxHeight: 'min(86vh, 720px)',
                        overflowY: 'auto',
                      }}
                    >
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Filter by date</p>
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-slate-700">From</label>
                        <button
                          type="button"
                          onClick={() => openDatePicker('from')}
                          className={`${vmsGhostBtnClass()} w-full justify-between`}
                        >
                          <span className="inline-flex w-full items-center justify-between">
                            <span className="inline-flex items-center gap-2">
                              <i className="ri-calendar-2-line text-[#17a2b4]/90" aria-hidden />
                              <span>{formatIsoDateToDisplay(filterFromDate) || 'dd-mm-yyyy'}</span>
                            </span>
                            <i className="ri-calendar-event-line text-slate-500" aria-hidden />
                          </span>
                        </button>
                        <label className="block text-sm font-medium text-slate-700">To</label>
                        <button
                          type="button"
                          onClick={() => openDatePicker('to')}
                          className={`${vmsGhostBtnClass()} w-full justify-between`}
                        >
                          <span className="inline-flex w-full items-center justify-between">
                            <span className="inline-flex items-center gap-2">
                              <i className="ri-calendar-check-line text-[#17a2b4]/90" aria-hidden />
                              <span>{formatIsoDateToDisplay(filterToDate) || 'dd-mm-yyyy'}</span>
                            </span>
                            <i className="ri-calendar-event-line text-slate-500" aria-hidden />
                          </span>
                        </button>
                        {activeDateField && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_14px_35px_rgba(15,23,42,0.12)]">
                            <div className="mb-3 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => setCalendarMonth((prev) => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() - 1, 1)))}
                                className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100"
                                aria-label="Previous month"
                              >
                                <i className="ri-arrow-left-s-line" />
                              </button>
                              <p className="text-base font-semibold text-slate-700">{calendarMonthLabel}</p>
                              <button
                                type="button"
                                onClick={() => setCalendarMonth((prev) => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() + 1, 1)))}
                                className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100"
                                aria-label="Next month"
                              >
                                <i className="ri-arrow-right-s-line" />
                              </button>
                            </div>
                            <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
                              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                                <span key={d} className="py-1">{d}</span>
                              ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {calendarDays.map((dt, idx) => {
                                if (!dt) return <span key={`empty-${idx}`} className="h-9" />
                                const iso = formatDateToIso(dt)
                                const isSelected = selectedIsoForCalendar === iso
                                const isToday = formatDateToIso(new Date()) === iso
                                return (
                                  <button
                                    key={iso}
                                    type="button"
                                    onClick={() => selectCalendarDate(dt)}
                                    className={`h-9 rounded-full text-sm transition-all ${
                                      isSelected
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : isToday
                                          ? 'bg-slate-100 text-slate-700'
                                          : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    {dt.getDate()}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterFromDate('')
                            setFilterToDate('')
                            setFilterPopoverOpen(false)
                          }}
                          className="flex-1 min-h-[40px] px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterPopoverOpen(false)}
                          className={`flex-1 ${vmsPrimaryBtnClass()}`}
                        >
                          Apply
                        </button>
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
                <div className="relative" ref={columnsPopoverRef}>
                  <button
                    type="button"
                    onClick={() => { setColumnsPopoverOpen((o) => !o); setFilterPopoverOpen(false) }}
                    className={vmsIconBtnClass(columnsPopoverOpen)}
                    aria-label="Column visibility"
                  >
                    <i className="ri-eye-line text-base md:text-lg"></i>
                  </button>
                  {columnsPopoverOpen &&
                  columnsAnchorRect &&
                  createPortal(
                    <div
                      ref={columnsDropdownRef}
                      className="rounded-xl bg-white border border-gray-200 shadow-lg p-4"
                      style={{
                        position: 'fixed',
                        top: columnsAnchorRect.top,
                        right: 8,
                        width: 'min(88vw, 320px)',
                        zIndex: 9999,
                      }}
                    >
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Visible columns</p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {activeTab === 'items' &&
                          ITEMS_COLUMNS.map((col) => (
                            <label key={col.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!visibleColumnsItems[col.id]}
                                onChange={() =>
                                  setVisibleColumnsItems((prev) => ({ ...prev, [col.id]: !prev[col.id] }))
                                }
                                className="rounded border-slate-300 text-[#17a2b4] focus:ring-[#17a2b4]"
                              />
                              <span className="text-sm text-slate-700">{col.label}</span>
                            </label>
                          ))}
                        {activeTab === 'tasks' &&
                          TASKS_COLUMNS.map((col) => (
                            <label key={col.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!visibleColumnsTasks[col.id]}
                                onChange={() =>
                                  setVisibleColumnsTasks((prev) => ({ ...prev, [col.id]: !prev[col.id] }))
                                }
                                className="rounded border-slate-300 text-[#17a2b4] focus:ring-[#17a2b4]"
                              />
                              <span className="text-sm text-slate-700">{col.label}</span>
                            </label>
                          ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setColumnsPopoverOpen(false)}
                        className={`mt-3 w-full ${vmsPrimaryBtnClass()}`}
                      >
                        Done
                      </button>
                    </div>,
                    document.body
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="order-1 mx-auto w-full max-w-[360px] md:max-w-none flex gap-2" data-aos="fade-down">
              <button
                type="button"
                onClick={() => setActiveTab('items')}
                className={`${vmsSegmentBtnClass(activeTab === 'items')} flex-1`}
              >
                My Items
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className={`${vmsSegmentBtnClass(activeTab === 'tasks')} flex-1`}
              >
                <span className="inline-flex items-center gap-2">
                  <span>My Tasks</span>
                  {totalTasksCount > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-lg text-xs font-bold ${
                      activeTab === 'tasks' ? 'bg-white/20 text-white' : 'bg-[#e6f6f8] text-[#0f6b7a]'
                    }`}>
                      {totalTasksCount}
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* Table - z-0 so toolbar dropdowns (z-[100]) render on top */}
            <div className={`order-3 relative z-0 ${vmsSectionShellClass()} p-2.5 sm:p-4 max-md:bg-transparent max-md:border-0 max-md:shadow-none max-md:rounded-none max-md:px-0`} data-aos="fade-up">
              {activeTab === 'items' && (
                <>
                  <div className="md:hidden space-y-2.5 w-full min-w-0">
                    {itemsLoading && itemList.length === 0 ? (
                      <p className="text-center text-slate-500 py-10 text-sm">Loading…</p>
                    ) : itemsPaginated.length === 0 ? (
                      <p className="text-center text-slate-500 py-10 text-sm">No items found.</p>
                    ) : (
                      itemsPaginated.map((item) => {
                        const itemView = itemDetailsById[item.id] || item
                        const expanded = expandedItemId === item.id
                        return (
                          <article
                            key={item.id}
                            className={vmsMobileCardClass(expanded)}
                          >
                            <div className="flex w-full min-w-0 items-start gap-3">
                              {showItemBulkCheckboxes && (
                                <input
                                  type="checkbox"
                                  checked={selectedItemIds.has(item.id)}
                                  onChange={() => toggleItemSelection(item.id)}
                                  className="mt-2.5 rounded border-slate-300 text-[#17a2b4] focus:ring-[#17a2b4]/25 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label="Select row"
                                />
                              )}
                              <button
                                type="button"
                                className={`mt-0.5 ${vmsExpandBtnClass(expanded, true)}`}
                                onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                                aria-label={expanded ? 'Collapse details' : 'Expand details'}
                              >
                                <i className={`${expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-lg`} />
                              </button>
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <h3 className="text-[15px] font-bold text-slate-900 leading-snug break-words">
                                  {item.name || '—'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1.5 break-words">
                                  <ItemVendorNameCell item={item} vendorCellLoadingById={itemVendorCellLoadingById} />
                                </p>
                                <div className="mt-2.5">
                                  <span
                                    className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-snug ${getStatusBadgeClass(item.status)}`}
                                  >
                                    {formatStatusForDisplay(item.status) || 'In progress'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {visibleColumnsItems.createdAt && item.createdDate && (
                              <p
                                className={`mt-3 text-xs text-slate-500 ${showItemBulkCheckboxes ? 'pl-[4.75rem]' : 'pl-[3.25rem]'}`}
                              >
                                Created {formatDateTime(item.createdDate)}
                              </p>
                            )}
                            <div className="mt-3.5 grid grid-cols-2 gap-x-2.5 gap-y-2.5 text-[13px] text-slate-800 w-full min-w-0">
                              <div className="min-w-0 col-span-1">
                                <p className="text-xs font-medium text-slate-500">Value</p>
                                <p className="font-semibold tabular-nums break-words">{item.valueDisplay || '—'}</p>
                              </div>
                              <div className="min-w-0 col-span-1">
                                <p className="text-xs font-medium text-slate-500">Type</p>
                                <p className="font-semibold break-words">
                                  <span className={vmsTypeChipClass()}>
                                    <i className={`${vmsContractTypeIcon(item.contractType)} text-[12px]`} aria-hidden />
                                    {item.contractType || '—'}
                                  </span>
                                </p>
                              </div>
                              <div className="min-w-0 col-span-2">
                                <p className="text-xs font-medium text-slate-500">End Date</p>
                                <p className="font-semibold break-words">{item.endDateDisplay || item.endDate || '—'}</p>
                              </div>
                            </div>
                            {expanded && (
                              <div className="mt-3.5 pt-3.5 border-t border-slate-200/80 min-w-0">
                                <ContractAccordionDetail
                                  item={itemView}
                                  onViewDetails={() => openContractPopup(itemView)}
                                  onClose={() => setExpandedItemId(null)}
                                />
                              </div>
                            )}
                          </article>
                        )
                      })
                    )}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0">
                    <thead>
                      <tr className={`${vmsTableHeadClass()} border-b border-gray-100`}>
                        {showItemBulkCheckboxes && (
                          <th className="sticky top-0 z-20 w-10 sm:w-12 rounded-tl-xl bg-gray-50 px-2 sm:px-3 py-3 sm:py-4 align-middle">
                            <input
                              type="checkbox"
                              checked={itemsPaginated.length > 0 && itemsPaginated.every((i) => selectedItemIds.has(i.id))}
                              onChange={(e) => selectAllItems(e.target.checked)}
                              className="mx-auto block rounded border-slate-300 text-[#17a2b4] focus:ring-2 focus:ring-[#17a2b4]/25"
                            />
                          </th>
                        )}
                        <th
                          className={`sticky top-0 z-20 w-10 bg-gray-50 px-2 sm:px-3 py-3 sm:py-4 text-center align-middle ${showItemBulkCheckboxes ? '' : 'rounded-tl-xl'}`}
                          aria-label="Expand row"
                        >
                          <span className="text-xs font-bold text-slate-500 uppercase"> </span>
                        </th>
                        {ITEMS_COLUMNS.map((col) => (
                          <th
                            key={col.id}
                            className={`sticky top-0 z-20 bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 text-left text-[11px] uppercase tracking-wider text-slate-700 font-semibold last:rounded-tr-xl ${visibleColumnsItems[col.id] ? '' : 'hidden'}`}
                          >
                            <span className="inline-flex items-center gap-1.5">{col.icon ? <i className={`${col.icon} ${vmsColIconClass()}`} aria-hidden /> : null}{col.label}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100/80 bg-white/90">
                      {itemsLoading && itemList.length === 0 ? (
                        <tr>
                          <td colSpan={itemsTableLeadingCols + ITEMS_COLUMNS.length} className="px-6 py-12 text-center text-slate-500">
                            Loading…
                          </td>
                        </tr>
                      ) : itemsPaginated.length === 0 ? (
                        <tr>
                          <td colSpan={itemsTableLeadingCols + ITEMS_COLUMNS.length} className="px-6 py-12 text-center text-slate-500">
                            No items found.
                          </td>
                        </tr>
                      ) : (
                        itemsPaginated.map((item) => {
                          const itemView = itemDetailsById[item.id] || item
                          return (
                          <React.Fragment key={item.id}>
                            <tr
                              className={vmsTableRowClass(expandedItemId === item.id)}
                              onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                            >
                              {showItemBulkCheckboxes && (
                                <td className="w-10 sm:w-12 px-2 sm:px-3 py-3 sm:py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedItemIds.has(item.id)}
                                    onChange={() => toggleItemSelection(item.id)}
                                    className="mx-auto block rounded border-slate-300 text-[#17a2b4] focus:ring-[#17a2b4]/25"
                                  />
                                </td>
                              )}
                              <td className="w-10 px-2 sm:px-3 py-3 sm:py-4 align-middle text-slate-500" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                                  className="p-1 rounded-lg hover:bg-white/80 transition-colors"
                                  aria-label={expandedItemId === item.id ? 'Collapse row' : 'Expand row'}
                                >
                                  <i className={`ri-arrow-down-s-line text-lg transition-transform ${expandedItemId === item.id ? 'rotate-180' : ''}`}></i>
                                </button>
                              </td>
                              {visibleColumnsItems.vendor && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700">
                                  <ItemVendorNameCell item={item} vendorCellLoadingById={itemVendorCellLoadingById} />
                                </td>
                              )}
                              {visibleColumnsItems.contractDescription && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700">
                                  <span className="block max-w-[22rem] truncate" title={item.contractDescription || ''}>
                                    {item.contractDescription || '—'}
                                  </span>
                                </td>
                              )}
                              {visibleColumnsItems.contractCategory && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700">
                                  <span className={vmsTypeChipClass()}>
                                    <i className={`${vmsContractTypeIcon(item.contractType)} text-[12px]`} aria-hidden />
                                    {item.contractType || '—'}
                                  </span>
                                </td>
                              )}
                              {visibleColumnsItems.createdAt && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-600">{formatDateTime(item.createdDate)}</td>
                              )}
                              {visibleColumnsItems.valueDisplay && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700 font-medium">{item.valueDisplay || '—'}</td>
                              )}
                              {visibleColumnsItems.status && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap ${getStatusBadgeClass(item.status)}`}
                                  >
                                    {formatStatusForDisplay(item.status) || 'In progress'}
                                  </span>
                                </td>
                              )}
                              {visibleColumnsItems.endDate && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-600 whitespace-nowrap">{item.endDateDisplay || item.endDate || '—'}</td>
                              )}
                            </tr>
                            {expandedItemId === item.id && (
                              <tr>
                                <td colSpan={itemsTableLeadingCols + ITEMS_COLUMNS.length} className="p-0 align-top">
                                  <div className="px-3 sm:px-4 py-3 sm:py-4">
                                    <ContractAccordionDetail
                                      item={itemView}
                                      onViewDetails={() => openContractPopup(itemView)}
                                      onClose={() => setExpandedItemId(null)}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )})
                      )}
                    </tbody>
                  </table>
                  </div>
                </>
              )}

              {activeTab === 'tasks' && (
                <>
                  <div className="md:hidden space-y-2.5 w-full min-w-0">
                    {tasksLoading && tasksFromApi === null ? (
                      <p className="text-center text-slate-500 py-10 text-sm">Loading…</p>
                    ) : tasksPaginated.length === 0 ? (
                      <p className="text-center text-slate-500 py-10 text-sm">No tasks found.</p>
                    ) : (
                      tasksPaginated.map((task) => {
                        const taskView = taskDetailsById[task.id] || task
                        const expanded = expandedTaskId === task.id
                        const contractTitle = taskView.name || '—'
                        const vendorLine = taskView.vendor || '—'
                        return (
                          <article
                            key={task.id}
                            className={vmsMobileCardClass(expanded)}
                          >
                            <div className="flex justify-between gap-3 items-start min-w-0">
                              <div className="min-w-0 flex-1">
                                <h3
                                  className="text-[15px] font-bold text-slate-900 leading-snug truncate"
                                  title={contractTitle}
                                >
                                  {contractTitle}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 truncate min-w-0" title={vendorLine}>
                                  {vendorLine}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium max-w-[min(50%,11rem)] truncate ${getStatusBadgeClass(task.status)}`}
                                title={formatStatusForDisplay(taskView.status) || 'In progress'}
                              >
                                {formatStatusForDisplay(taskView.status) || 'In progress'}
                              </span>
                            </div>
                            <div className="mt-2.5 space-y-2 text-[13px] text-slate-700 min-w-0">
                              {visibleColumnsTasks.createdAt && (
                                <p className="text-xs text-slate-500 break-words">
                                  Created{' '}
                                  <span className="font-semibold text-slate-800">{formatDateTime(taskView.createdDate)}</span>
                                </p>
                              )}
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e6f6f8] text-[11px] font-bold text-gray-800 border border-[#bfe6ec]/80"
                                  title={taskView.createdBy || '—'}
                                >
                                  {taskView.createdByInitials || task.createdByInitials || '?'}
                                </span>
                                <span
                                  className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800"
                                  title={taskView.createdBy || '—'}
                                >
                                  {taskView.createdBy || '—'}
                                </span>
                              </div>
                              {taskView.currentStep ? (
                                <p
                                  className="text-xs text-slate-600 break-words"
                                  title={String(taskView.currentStep)}
                                >
                                  <span className="font-medium text-slate-500">Step:</span> {String(taskView.currentStep)}
                                </p>
                              ) : null}
                            </div>
                            <div className="mt-4 flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                className={vmsExpandBtnClass(expanded, true)}
                                onClick={() => setExpandedTaskId((prev) => (prev === task.id ? null : task.id))}
                                aria-label={expanded ? 'Collapse details' : 'Expand details'}
                              >
                                <i
                                  className={`${expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-lg`}
                                />
                              </button>
                            </div>
                            <button
                              type="button"
                              className={`${vmsGhostBtnClass()} mt-2.5 w-full`}
                              onClick={() => openContractPopup(taskView)}
                            >
                              View Details
                            </button>
                            {expanded && (
                              <div className="mt-4 pt-4 border-t border-slate-200/80 min-w-0">
                                <ContractAccordionDetail
                                  item={taskView}
                                  onViewDetails={() => openContractPopup(taskView)}
                                  onClose={() => setExpandedTaskId(null)}
                                />
                              </div>
                            )}
                          </article>
                        )
                      })
                    )}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0">
                    <thead>
                      <tr className={`${vmsTableHeadClass()} border-b border-gray-100`}>
                        <th
                          className="sticky top-0 z-20 rounded-tl-xl bg-gray-50 px-2 sm:px-3 py-3 sm:py-4 w-10 text-center"
                          aria-label="Expand row"
                        >
                          <span className="text-xs font-bold text-slate-500 uppercase"> </span>
                        </th>
                        {TASKS_COLUMNS.map((col) => (
                          <th
                            key={col.id}
                            className={`sticky top-0 z-20 bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 text-left text-[11px] uppercase tracking-wider text-slate-700 font-semibold last:rounded-tr-xl ${visibleColumnsTasks[col.id] ? '' : 'hidden'}`}
                          >
                            <span className="inline-flex items-center gap-1.5">{col.icon ? <i className={`${col.icon} ${vmsColIconClass()}`} aria-hidden /> : null}{col.label}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100/80 bg-white/90">
                      {tasksLoading && tasksFromApi === null ? (
                        <tr>
                          <td colSpan={tasksTableLeadingCols + TASKS_COLUMNS.length} className="px-6 py-12 text-center text-slate-500">
                            Loading…
                          </td>
                        </tr>
                      ) : tasksPaginated.length === 0 ? (
                        <tr>
                          <td colSpan={tasksTableLeadingCols + TASKS_COLUMNS.length} className="px-6 py-12 text-center text-slate-500">
                            No tasks found.
                          </td>
                        </tr>
                      ) : (
                        tasksPaginated.map((task) => {
                          const taskView = taskDetailsById[task.id] || task
                          return (
                          <React.Fragment key={task.id}>
                            <tr
                              className={vmsTableRowClass(expandedTaskId === task.id)}
                              onClick={() => setExpandedTaskId((prev) => (prev === task.id ? null : task.id))}
                            >
                              <td className="px-2 sm:px-3 py-3 sm:py-4 text-slate-500" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedTaskId((prev) => (prev === task.id ? null : task.id))}
                                  className="p-1 rounded-lg hover:bg-white/80 transition-colors"
                                  aria-label={expandedTaskId === task.id ? 'Collapse row' : 'Expand row'}
                                >
                                  <i className={`ri-arrow-down-s-line text-lg transition-transform ${expandedTaskId === task.id ? 'rotate-180' : ''}`}></i>
                                </button>
                              </td>
                              {visibleColumnsTasks.vendor && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700">{taskView.vendor || '—'}</td>
                              )}
                              {visibleColumnsTasks.contractDescription && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700">
                                  <span className="block max-w-[22rem] truncate" title={taskView.contractDescription || ''}>
                                    {taskView.contractDescription || '—'}
                                  </span>
                                </td>
                              )}
                              {visibleColumnsTasks.contractCategory && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700">
                                  <span className={vmsTypeChipClass()}>
                                    <i className={`${vmsContractTypeIcon(taskView.contractType)} text-[12px]`} aria-hidden />
                                    {taskView.contractType || '—'}
                                  </span>
                                </td>
                              )}
                              {visibleColumnsTasks.createdAt && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-600">{formatDateTime(taskView.createdDate)}</td>
                              )}
                              {visibleColumnsTasks.valueDisplay && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-700 font-medium">{taskView.valueDisplay || '—'}</td>
                              )}
                              {visibleColumnsTasks.status && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap ${getStatusBadgeClass(taskView.status)}`}
                                  >
                                    {formatStatusForDisplay(taskView.status) || 'In progress'}
                                  </span>
                                </td>
                              )}
                              {visibleColumnsTasks.endDate && (
                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-600 whitespace-nowrap">{taskView.endDateDisplay || taskView.endDate || '—'}</td>
                              )}
                            </tr>
                            {expandedTaskId === task.id && (
                              <tr>
                                <td colSpan={tasksTableLeadingCols + TASKS_COLUMNS.length} className="p-0 align-top">
                                  <div className="px-3 sm:px-4 py-3 sm:py-4">
                                    <ContractAccordionDetail
                                      item={taskView}
                                      onViewDetails={() => openContractPopup(taskView)}
                                      onClose={() => setExpandedTaskId(null)}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )})
                      )}
                    </tbody>
                  </table>
                  </div>
                </>
              )}

              {/* Pagination */}
              <div className={`${vmsPaginationBarClass()} mt-4`}>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label htmlFor="rows-per-page-select" className="text-xs sm:text-sm text-slate-600 font-medium whitespace-nowrap">
                    Rows per page:
                  </label>
                  <select
                    id="rows-per-page-select"
                    value={Number(rowsPerPage)}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      if (val === rowsPerPage) return
                      setRowsPerPage(val)
                      setItemsPage(1)
                      setTasksPage(1)
                    }}
                    className={vmsSelectClass()}
                    aria-label="Rows per page"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-end">
                  <span className="text-xs sm:text-sm text-slate-600">
                    {activeTab === 'items'
                      ? `Showing ${(itemsPage - 1) * rowsPerPage + 1} to ${(itemsPage - 1) * rowsPerPage + itemsPaginated.length} out of ${filteredItems.length} Items`
                      : `Showing ${(tasksPage - 1) * rowsPerPage + 1} to ${(tasksPage - 1) * rowsPerPage + tasksPaginated.length} out of ${filteredTasks.length} Items`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={activeTab === 'items' ? itemsPage <= 1 : tasksPage <= 1}
                      onClick={() => (activeTab === 'items' ? setItemsPage((p) => Math.max(1, p - 1)) : setTasksPage((p) => Math.max(1, p - 1)))}
                    className={vmsPaginationBtnClass(false)}
                    >
                      <i className="ri-arrow-left-s-line text-lg"></i>
                    </button>
                    {activeTab === 'items' &&
                      Array.from({ length: totalItemsPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setItemsPage(p)}
                          className={vmsPaginationBtnClass(itemsPage === p)}
                        >
                          {p}
                        </button>
                      ))}
                    {activeTab === 'tasks' &&
                      Array.from({ length: totalTasksPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setTasksPage(p)}
                          className={vmsPaginationBtnClass(tasksPage === p)}
                        >
                          {p}
                        </button>
                      ))}
                    <button
                      type="button"
                      disabled={activeTab === 'items' ? itemsPage >= totalItemsPages : tasksPage >= totalTasksPages}
                      onClick={() =>
                        activeTab === 'items'
                          ? setItemsPage((p) => Math.min(totalItemsPages, p + 1))
                          : setTasksPage((p) => Math.min(totalTasksPages, p + 1))
                      }
                      className={vmsPaginationBtnClass(false)}
                    >
                      <i className="ri-arrow-right-s-line text-lg"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {selectedContract && (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
                style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                onClick={() => setSelectedContract(null)}
              >
                <div
                  className="backdrop-blur-xl bg-white/95 border border-white/40 rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto p-6 sm:p-8 animate-scale-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-slate-800">Contract details</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedContract(null)}
                      className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                    >
                      <i className="ri-close-line text-xl text-slate-700"></i>
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Contract</p>
                      <p className="text-lg font-bold text-slate-900">{selectedContract.name || '—'}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Vendor</p>
                        <p className="text-sm font-bold text-slate-900">{selectedContract.vendor || '—'}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Type</p>
                        <p className="text-sm font-bold text-slate-900">{selectedContract.contractType || '—'}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Value</p>
                        <p className="text-sm font-bold text-slate-900">{selectedContract.valueDisplay || '—'}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">End date</p>
                        <p className="text-sm font-bold text-slate-900">{selectedContract.endDate || '—'}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{selectedContract.message || '—'}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Created</p>
                        <p className="text-sm font-bold text-slate-900">{formatDateTime(selectedContract.createdDate)}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</p>
                        <p className="text-sm font-bold text-slate-900">{selectedContract.status || '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
