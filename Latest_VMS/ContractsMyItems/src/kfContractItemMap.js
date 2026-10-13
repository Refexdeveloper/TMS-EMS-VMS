/**
 * Shared Kissflow contract row mapping (same shape as VMS2.0 dashboard / admin list).
 * Used by VMS2.0 and ContractsMyItems so values, dates, and titles align.
 */

function formatStatusForDisplay(raw) {
  if (raw == null || raw === '') return ''
  const t = String(raw).trim()
  const norm = t.replace(/\s+/g, '')
  const map = {
    InProgress: 'In progress',
    inprogress: 'In progress',
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
  return map[t] || map[norm] || capLabel(t)
}

function capLabel(s) {
  const x = String(s).trim()
  if (!x) return ''
  return x.charAt(0).toUpperCase() + x.slice(1)
}

/** Same pattern as LeadDashboardPage — Kissflow sends status in multiple shapes. */
export function resolveStatusFromItem(item) {
  if (!item || typeof item !== 'object') return ''
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
  if (raw == null || String(raw).trim() === '') return ''
  return formatStatusForDisplay(raw)
}

export function stringifyKfValue(val) {
  if (val == null) return ''
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    if (val.Name != null) return String(val.Name)
    if (val._name != null) return String(val._name)
    if (val.Title != null) return String(val.Title)
  }
  return ''
}

export function parseNumberFromContractValue(raw) {
  if (raw == null) return 0
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  if (typeof raw === 'object' && raw.value != null) return parseNumberFromContractValue(raw.value)
  const s = String(raw).replace(/[^0-9.-]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

export function formatInr(n) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `₹${Math.round(n)}`
  }
}

export function isDocAvailable(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  const s = String(v).trim().toLowerCase()
  if (s === 'yes' || s === 'y' || s === 'true' || s === 'available') return true
  if (s === 'no' || s === 'n' || s === 'false' || s === '') return false
  return !!v
}

function hasAttachmentValue(v) {
  if (Array.isArray(v)) return v.length > 0
  if (v && typeof v === 'object') return Object.keys(v).length > 0
  if (typeof v === 'string') return v.trim() !== ''
  return false
}

export function parseEndDate(s) {
  if (s == null || s === '') return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Coerce Kissflow date / duration values for SLA column (strings, numbers, nested { value }). */
function normalizeSlaDeadlineScalar(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'boolean') return ''
  if (typeof v === 'string') {
    const t = v.trim()
    return t
  }
  if (v instanceof Date) {
    const ms = v.getTime()
    return Number.isNaN(ms) ? '' : v.toISOString()
  }
  if (typeof v === 'object') {
    const nested =
      v.value ??
      v.Value ??
      v.iso ??
      v.ISO ??
      v.displayValue ??
      v.DisplayValue ??
      v.date ??
      v.Date ??
      v.DateTime ??
      v.datetime ??
      v.timestamp
    if (nested != null && nested !== '' && nested !== v) {
      const inner = normalizeSlaDeadlineScalar(nested)
      if (inner !== '') return inner
    }
    if (typeof v.Milliseconds === 'number' && Number.isFinite(v.Milliseconds)) return v.Milliseconds
    if (typeof v.milliseconds === 'number' && Number.isFinite(v.milliseconds)) return v.milliseconds
    const s = stringifyKfValue(v)
    if (s && s !== '[object Object]' && String(s).trim() !== '') return String(s).trim()
  }
  return ''
}

const SLA_DEADLINE_DIRECT_KEYS = [
  'SLA_Deadline',
  'sla_deadline',
  'Deadline',
  'Dead_Line',
  'Deadline_Date_Time',
  'Deadline_Date',
  'deadline',
  'SLA_Date',
]

function slaDeadlineFieldRecordValue(f) {
  if (!f || typeof f !== 'object') return ''
  return (
    f.Value ??
    f.value ??
    f.Selected_Value ??
    f.selected_value ??
    f.Result ??
    f.result ??
    f.Field_value ??
    f.field_value ??
    f.Default_value ??
    f.default_value ??
    ''
  )
}

function fieldRecordNameNormalized(f) {
  return String(
    f.Name ?? f.name ?? f.Field_name ?? f.field_name ?? f.Title ?? f.Label ?? f.Display_name ?? f.display_name ?? '',
  )
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function fieldRecordLooksLikeSlaDeadline(f) {
  const n = fieldRecordNameNormalized(f)
  if (!n) return false
  if (n.includes('sla_deadline') || n.includes('sla_date')) return true
  if (n.includes('deadline') || n.includes('dead_line')) return true
  if (n === 'sla' || n.endsWith('_sla')) return false
  return false
}

function extractSlaDeadlineFromFieldsBlob(blob) {
  if (blob == null) return ''
  if (Array.isArray(blob)) {
    for (const f of blob) {
      if (!fieldRecordLooksLikeSlaDeadline(f)) continue
      const raw = slaDeadlineFieldRecordValue(f)
      const n = normalizeSlaDeadlineScalar(raw)
      if (n !== '') return n
    }
    return ''
  }
  if (typeof blob === 'object') {
    for (const [k, v] of Object.entries(blob)) {
      if (v === undefined || v === null || v === '') continue
      if (looseObjectKeyIsSlaDeadline(k)) {
        const n = normalizeSlaDeadlineScalar(v)
        if (n !== '') return n
      }
    }
    for (const f of Object.values(blob)) {
      if (!f || typeof f !== 'object') continue
      if (!fieldRecordLooksLikeSlaDeadline(f)) continue
      const raw = slaDeadlineFieldRecordValue(f)
      const n = normalizeSlaDeadlineScalar(raw)
      if (n !== '') return n
    }
  }
  return ''
}

function looseObjectKeyIsSlaDeadline(k) {
  const lk = String(k).toLowerCase().replace(/\s+/g, '_')
  for (const d of SLA_DEADLINE_DIRECT_KEYS) {
    if (lk === String(d).toLowerCase()) return true
  }
  if (lk.includes('sla_deadline') || lk.includes('sla_date')) return true
  if (lk.includes('deadline_date') || lk.includes('dead_line')) return true
  if (lk === 'deadline' || lk.endsWith('_deadline')) return true
  return false
}

/**
 * Same intent as LeadDashboardPage `deadline` / SLA column, but matches My Items / slim-list payloads:
 * nested `Data`, `_fields` arrays, and object-shaped field values.
 */
export function resolveContractSlaDeadlineRaw(item) {
  if (!item || typeof item !== 'object') return ''
  const buckets = [item, item.Data, item.data, item._data, item._source_data]
  if (Array.isArray(item._current_context)) {
    for (const c of item._current_context) {
      if (c && typeof c === 'object') {
        buckets.push(c, c.Data, c.data, c._data, c._source_data)
      }
    }
  }
  const lowerDirect = SLA_DEADLINE_DIRECT_KEYS.map((k) => String(k).toLowerCase())

  for (const src of buckets) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue

    for (const k of SLA_DEADLINE_DIRECT_KEYS) {
      const v = src[k]
      if (v === undefined || v === null || v === '') continue
      const n = normalizeSlaDeadlineScalar(v)
      if (n !== '') return n
    }

    for (const [k, v] of Object.entries(src)) {
      if (v === undefined || v === null || v === '') continue
      if (!lowerDirect.includes(String(k).toLowerCase()) && !looseObjectKeyIsSlaDeadline(k)) continue
      const n = normalizeSlaDeadlineScalar(v)
      if (n !== '') return n
    }

    for (const blobKey of ['_fields', 'fields', '_field_values', 'field_values']) {
      const n = extractSlaDeadlineFromFieldsBlob(src[blobKey])
      if (n !== '') return n
    }
  }

  return ''
}

/** Kissflow instance creation time (used for “latest contracts” ordering). */
function parseCreatedAtFromItem(item) {
  if (!item || typeof item !== 'object') return null
  const raw =
    item.Created_at ??
    item._created_at ??
    item.CreatedAt ??
    item.created_at ??
    null
  if (raw == null || raw === '') return null
  const d = new Date(typeof raw === 'number' ? raw : String(raw))
  return Number.isNaN(d.getTime()) ? null : d
}

function formatContractCreatedDisplay(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Star ratings (1–5) or legacy 0–100 stored values → percentage for vendor performance. */
export function normalizeRating(value) {
  if (value == null) return null
  const num = Number(value)
  if (num >= 1 && num <= 5) {
    return Math.round((num / 5) * 100)
  }
  if (num > 5 && num <= 100) {
    return Math.round(num)
  }
  return null
}

export function resolveTrendFromItem(item) {
  if (!item || typeof item !== 'object') return null
  const raw =
    item.Performance_Trend ??
    item.Vendor_Trend ??
    item.Trend ??
    item.Rating_Trend ??
    item._trend
  const s = stringifyKfValue(raw).toLowerCase()
  if (!s) return null
  if (/improv|↑|up|increas|better|positive/.test(s)) return 'Improving'
  if (/declin|↓|down|decreas|wors|negative/.test(s)) return 'Declining'
  return 'Stable'
}

export { formatStatusForDisplay }

/** Map Kissflow process/admin item → dashboard row (shared with VMS2.0). */
export function mapKfContractItem(item) {
  if (!item || typeof item !== 'object') return null
  const valueNum = parseNumberFromContractValue(item.Contract_Value ?? item.ContractValue)
  const endRaw = item.End_Date ?? item.EndDate ?? item._end_date
  const contractTypeCandidate =
    item.Contract_Type ??
    item.Type_of_Contract ??
    item.ContractType ??
    item.Type ??
    null
  const contractType = (() => {
    const s = stringifyKfValue(contractTypeCandidate)
    return (s && s.trim()) || 'Other'
  })()
  const isAmcContract = contractType.toLowerCase() === 'amc'

  const tatPct = normalizeRating(item.TAT_Adherence)
  const pmPct = isAmcContract ? normalizeRating(item.PM_Adherence) : null
  const servicePct = normalizeRating(item.Service_Rate)
  const responsePct = normalizeRating(item.Response_Rate)
  const overallPct = normalizeRating(item.Untitled_Field_1)
  const vendorCategory =
    stringifyKfValue(
      item.Vendor_Category ??
        item.Category ??
        item.Industry ??
        item.Service_Category ??
        item.Vendor_Type,
    ) || ''
  const workflowStatus = resolveStatusFromItem(item)
  const businessStatus = formatStatusForDisplay(
    item.Status_1 ??
      item.Current_Status ??
      item.Form_status ??
      item.Workflow_Stage ??
      item._status ??
      '',
  )
  const ndaAvailable = item.NDA_Available ?? (hasAttachmentValue(item.NDA) ? true : null)
  const msaAvailable = item.MSA_Available ?? (hasAttachmentValue(item.MSA) ? true : null)
  const sowAvailable = item.SOW_Available ?? (hasAttachmentValue(item.Scope_Of_Work) ? true : null)
  const createdDateObj = parseCreatedAtFromItem(item)

  return {
    _id: item._id || '',
    contractTitle: item.Contract_Title ?? item.Name ?? '',
    vendor: stringifyKfValue(item.Vendor ?? item.Vendor_Name),
    valueNum,
    valueDisplay: formatInr(valueNum),
    endDate: endRaw ? String(endRaw).slice(0, 10) : '',
    endDateObj: parseEndDate(endRaw),
    createdDateObj,
    createdDateDisplay: formatContractCreatedDisplay(createdDateObj),
    nda: ndaAvailable,
    msa: msaAvailable,
    sow: sowAvailable,
    status: workflowStatus,
    businessStatus,
    contractType,
    tatPct,
    pmPct,
    servicePct,
    responsePct,
    overallPct,
    vendorCategory,
    trendLabel: resolveTrendFromItem(item),
    slaDeadline: resolveContractSlaDeadlineRaw(item),
    raw: item,
  }
}

/** Status pill styling aligned with VMS2.0 contract tables/cards. */
export function contractStatusPillClass(status) {
  const s = String(status || '').trim().toLowerCase().replace(/\s+/g, '')
  if (s.includes('completed') || s.includes('active')) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (s.includes('rejected')) return 'bg-red-100 text-red-700 border-red-200'
  if (s.includes('withdrawn')) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (s.includes('draft')) return 'bg-gray-100 text-gray-700 border-gray-200'
  if (s.includes('progress')) return 'bg-blue-100 text-blue-700 border-blue-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}
