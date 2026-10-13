import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import AOS from 'aos'
import { P2pHeaderFx } from './vms/P2pKpiCard.jsx'
import { kf, KissflowSDKContext } from './sdk/index.js'
import { getApiBase } from './apiBase.js'
import {
  vmsPageClass,
  vmsPageInnerClass,
  vmsSectionShellClass,
  vmsSectionHeaderClass,
  vmsSearchInputClass,
  vmsPrimaryBtnClass,
  vmsSecondaryBtnClass,
  vmsTableHeadClass,
  vmsTableHeadCellClass,
  vmsTableRowClass,
  vmsTableDivideClass,
  vmsExpandBtnClass,
  vmsPaginationBarClass,
  vmsPaginationBtnClass,
  vmsAccordionShellClass,
  vmsHeaderShellClass,
  vmsAvatarClass,
  vmsRoleAccentClass,
  vmsColIconClass,
} from './vms/vmsTheme.js'

function envVite(name, fallback = '') {
  try {
    const v = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]
    return v != null && String(v).trim() !== '' ? String(v).trim() : fallback
  } catch {
    return fallback
  }
}

const VENDOR_MASTER_POPUP_ID_DEFAULT = 'Popup_4KziLj16NC'

function resolveVendorMasterPopupId() {
  return envVite('VITE_KF_VENDOR_MASTER_POPUP_ID', VENDOR_MASTER_POPUP_ID_DEFAULT)
}

function stringifyKfFieldValue(val) {
  if (val == null) return ''
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    if (!val.length) return ''
    return val.map((x) => stringifyKfFieldValue(x)).filter(Boolean).join(', ')
  }
  if (typeof val === 'object') {
    return String(
      val.Name ??
        val._name ??
        val.Title ??
        val.value ??
        val.label ??
        val.Email ??
        '',
    ).trim()
  }
  return ''
}

function extractVendorListPayload(response) {
  if (
    response &&
    typeof response === 'object' &&
    response.Data &&
    typeof response.Data === 'object' &&
    !Array.isArray(response.Data)
  ) {
    const nestedRows = Array.isArray(response.Data.Data) ? response.Data.Data : []
    const nestedCols = Array.isArray(response.Data.Columns) ? response.Data.Columns : []
    const nestedCount = Number(response.Data.count ?? response.Data.Count ?? nestedRows.length)
    if (nestedRows.length || nestedCols.length) {
      return {
        rows: nestedRows,
        cols: nestedCols,
        count: Number.isFinite(nestedCount) ? nestedCount : nestedRows.length,
      }
    }
  }

  const candidates = [
    response,
    response?.data,
    response?.Data,
    response?.result,
    response?.Result,
    response?.response,
    response?.response?.data,
    response?.response?.Data,
  ].filter(Boolean)

  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue
    const rows =
      (Array.isArray(c?.Data) && c.Data) ||
      (Array.isArray(c?.data) && c.data) ||
      (Array.isArray(c?.Items) && c.Items) ||
      (Array.isArray(c?.items) && c.items) ||
      null
    const cols =
      (Array.isArray(c?.Columns) && c.Columns) ||
      (Array.isArray(c?.columns) && c.columns) ||
      null
    const countRaw = c?.count ?? c?.Count ?? null
    if (rows || cols || countRaw != null) {
      const countNum = Number(countRaw)
      return {
        rows: rows || [],
        cols: cols || [],
        count: Number.isFinite(countNum) ? countNum : rows ? rows.length : 0,
      }
    }
  }
  return { rows: [], cols: [], count: 0 }
}

// (Removed initials avatar badge in table UI; no gradient/avatar needed.)

function mapKfRowToVendorView(row) {
  if (!row || typeof row !== 'object') return null
  const name = stringifyKfFieldValue(row.Vendor_Name ?? row.Name).trim()
  const id = String(row._id || name || '').trim()
  if (!id) return null

  const regRaw = row.Date_Created ?? row._created_at ?? row._modified_at ?? null
  const activityInstanceId =
    row._activity_instance_id ??
    row._context_activity_instance_id ??
    row._activityInstanceId ??
    ''
  const activityId = row._activity_id ?? row._activityId ?? row._context_activity_id ?? ''

  return {
    id,
    name: name || 'Unknown Vendor',
    email: stringifyKfFieldValue(row.Email_Address).trim(),
    officePhone: stringifyKfFieldValue(row.Office_Phone).trim(),
    contactName: stringifyKfFieldValue(row.Contact_Name).trim(),
    product: stringifyKfFieldValue(row.Product).trim(),
    gstNo: stringifyKfFieldValue(row.GST_No).trim(),
    registeredAddress: stringifyKfFieldValue(row.Registered_Address).trim(),
    registrationDate: regRaw,
    rawRow: row,
    activityInstanceId,
    activityId,
  }
}

function formatRegistrationDisplay(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

function InfoField({ label, value, icon }) {
  const displayValue = value && String(value).trim() !== '' && String(value).trim() !== '—' ? value : ''
  return (
    <div className="min-w-0 py-2.5">
      <div className="flex items-start gap-2.5">
        {icon ? (
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center text-[#17a2b4]">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 leading-tight">
            {label}
          </p>
          <div className="mt-1 text-[13px] font-semibold text-slate-900 leading-snug break-words">
            {displayValue ? displayValue : <span className="text-slate-400 font-medium">Not provided</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

const ACCORDION_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const ACCORDION_MAX_MS = 180
const ACCORDION_OPACITY_MS = 120

function VendorExpandedRow({ vendor, colSpan, isExpanded, onViewDetails, flash }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const contentHeight = el.scrollHeight
    el.style.transition = `max-height ${ACCORDION_MAX_MS}ms ${ACCORDION_EASE}, opacity ${ACCORDION_OPACITY_MS}ms ease-out`
    el.style.maxHeight = isExpanded ? `${contentHeight + 32}px` : '0px'
    el.style.opacity = isExpanded ? '1' : '0'
  }, [isExpanded])

  const icons = {
    address: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    gst: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
    email: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
    phone: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
    contact: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
    product: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    calendar: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  }

  const items = [
    { label: 'Registered Address', value: vendor.registeredAddress, icon: icons.address },
    { label: 'GST No.', value: vendor.gstNo, icon: icons.gst },
    { label: 'Email Address', value: vendor.email, icon: icons.email },
    { label: 'Office Phone', value: vendor.officePhone, icon: icons.phone },
    { label: 'Contact Person', value: vendor.contactName, icon: icons.contact },
    { label: 'Products / Services', value: vendor.product, icon: icons.product },
    { label: 'Registration Date', value: formatRegistrationDisplay(vendor.registrationDate), icon: icons.calendar },
  ]

  return (
    <tr className={`${isExpanded ? '' : 'pointer-events-none'}`}>
      <td colSpan={colSpan} className="px-0 py-0 align-top bg-slate-50/60">
        <div
          ref={ref}
          className="will-change-[max-height,opacity] [transform:translateZ(0)] [backface-visibility:hidden]"
          style={{ overflow: 'hidden', maxHeight: isExpanded ? '600px' : '0px', opacity: isExpanded ? 1 : 0 }}
        >
          <div
            id={vendor?.id ? `vendor-accordion-${vendor.id}` : undefined}
            className={`mx-3 mb-3 mt-1 scroll-mt-24 sm:mx-4 sm:mb-4 overflow-hidden rounded-2xl ${
              flash ? 'ring-2 ring-[#5cc3cf]/70 ring-offset-2 ring-offset-white' : ''
            }`}
          >
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Header */}
            <div className={`flex items-center justify-between gap-3 px-4 py-3 sm:px-5 ${vmsSectionHeaderClass('brand')}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`shrink-0 ${vmsAvatarClass()}`} aria-hidden>
                  {(vendor?.name || 'V').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#17a2b4]/90">Vendor Details</p>
                  <p className="truncate text-sm font-semibold text-slate-800">{vendor?.name || 'Unknown Vendor'}</p>
                  <p className="text-xs text-slate-500">
                    Registered · {formatRegistrationDisplay(vendor?.registrationDate)}
                  </p>
                </div>
              </div>
              {typeof onViewDetails === 'function' ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewDetails()
                  }}
                  className={vmsPrimaryBtnClass()}
                >
                  <i className="ri-external-link-line" aria-hidden />
                  View Details
                </button>
              ) : null}
            </div>

            {/* Body */}
            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
              {items.map((it) => (
                <div key={it.label} className="min-w-0 rounded-xl bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100/90">
                  <InfoField label={it.label} value={it.value} icon={it.icon} />
                </div>
              ))}
              </div>
            </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

// REDESIGNED MOBILE VENDOR CARD - Clean, modern, no boxy blocks
function MobileVendorCard({ vendor, isExpanded, onToggle, onViewDetails }) {
  const detailsRef = useRef(null)
  
  useEffect(() => {
    const el = detailsRef.current
    if (!el) return
    el.style.transition = `max-height ${ACCORDION_MAX_MS}ms ${ACCORDION_EASE}, opacity ${ACCORDION_OPACITY_MS}ms ease-out`
    if (isExpanded) {
      el.style.maxHeight = `${el.scrollHeight}px`
      el.style.opacity = '1'
    } else {
      el.style.maxHeight = '0px'
      el.style.opacity = '0'
    }
  }, [isExpanded])

  return (
    <div className="mb-3 last:mb-0">
      <div
        className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
          isExpanded 
            ? 'border-[#bfe6ec] bg-white shadow-md ring-1 ring-[#17a2b4]/20' 
            : 'border-slate-200/80 bg-white shadow-sm hover:shadow-md'
        }`}
      >
        {/* Card Header - Clickable Area */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full px-4 py-4 text-left active:bg-slate-50/50 transition-all duration-150"
          aria-expanded={isExpanded}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Vendor Name */}
              <h3 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">
                {vendor.name}
              </h3>
              
              {/* Email with icon - cleaner look */}
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="flex-1 truncate text-slate-700">
                  {vendor.email || <span className="text-slate-400">No email provided</span>}
                </span>
              </div>
              
              {/* GST Chip - elegant pill design */}
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#bfe6ec] bg-[#e6f6f8] px-3 py-1">
                <svg className="w-3.5 h-3.5 text-[#17a2b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
                <span className="text-xs font-medium text-[#17a2b4]">
                  {vendor.gstNo || 'GST not available'}
                </span>
              </div>
              
              {/* Product chip if exists */}
              {vendor.product && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <span className="text-xs font-medium text-slate-700 truncate max-w-[200px]">
                    {vendor.product}
                  </span>
                </div>
              )}
            </div>
            
            {/* Expand/Collapse Icon */}
            <div className="shrink-0 mt-1">
              <div className={`shrink-0 mt-1 flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${
                isExpanded ? 'bg-[#17a2b4] text-white shadow-sm' : 'bg-[#e6f6f8] text-[#0f6b7a]'
              }`}>
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </button>

        {/* Expanded Details - Clean list layout without boxes */}
        <div
          ref={detailsRef}
          className="overflow-hidden"
          style={{ maxHeight: 0, opacity: 0 }}
        >
          <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/50 to-white px-4 py-4">
            <div className="space-y-4">
              {/* Phone */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#17a2b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Phone Number</p>
                  <p className="text-sm text-slate-800 mt-0.5 font-medium">
                    {vendor.officePhone || <span className="text-slate-400 font-normal">Not provided</span>}
                  </p>
                </div>
              </div>

              {/* Contact Person */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#17a2b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contact Person</p>
                  <p className="text-sm text-slate-800 mt-0.5 font-medium">
                    {vendor.contactName || <span className="text-slate-400 font-normal">Not provided</span>}
                  </p>
                </div>
              </div>

              {/* Address - only if exists */}
              {vendor.registeredAddress && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#17a2b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Registered Address</p>
                    <p className="text-sm text-slate-800 mt-0.5 leading-relaxed">{vendor.registeredAddress}</p>
                  </div>
                </div>
              )}

              {/* Registration Date - only if exists */}
              {vendor.registrationDate && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#17a2b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Registration Date</p>
                    <p className="text-sm text-slate-800 mt-0.5 font-medium">{formatRegistrationDisplay(vendor.registrationDate)}</p>
                  </div>
                </div>
              )}

              {typeof onViewDetails === 'function' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewDetails()
                  }}
                  className={`mt-4 w-full ${vmsSecondaryBtnClass()}`}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <i className="ri-external-link-line text-base" aria-hidden />
                    View Details
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ROWS_OPTIONS = [5, 10, 15, 20]

const TABLE_COLUMNS = [
  { label: 'Vendor', key: 'name', width: '20%', icon: 'ri-building-2-line' },
  { label: 'Email', key: 'email', width: '20%', icon: 'ri-mail-line' },
  { label: 'Phone', key: 'officePhone', width: '15%', icon: 'ri-phone-line' },
  { label: 'Contact', key: 'contactName', width: '15%', icon: 'ri-user-line' },
  { label: 'Product', key: 'product', width: '15%', icon: 'ri-box-3-line' },
  { label: 'GST', key: 'gstNo', width: '15%', icon: 'ri-file-text-line' },
]

export default function VendorMaster2() {
  const { kf: kfFromContext, sdkReady } = useContext(KissflowSDKContext)
  const kfInstance = kfFromContext ?? (typeof window !== 'undefined' ? window.kf : null)
  const sdk = kfInstance ?? (typeof window !== 'undefined' ? window.kf : null) ?? kf

  const accountId = envVite('VITE_KF_ACCOUNT_ID', 'AcCMptp3yqcn')
  const formId = envVite('VITE_KF_VENDOR_MASTER_FORM_ID', 'Vendor_Master_A02')

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    AOS.init({ duration: 700, once: true, offset: 24, easing: 'ease-out-cubic' })
  }, [])
  const [apiRows, setApiRows] = useState([])

  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [scrollToVendorId, setScrollToVendorId] = useState(null)
  const [accordionFlashId, setAccordionFlashId] = useState(null)
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [newVendorOpen, setNewVendorOpen] = useState(false)

  useEffect(() => {
    if (!accountId || !formId) return
    let cancelled = false
    const path = `/form/2/${accountId}/${formId}/list?page_number=1&page_size=1000&apply_preference=1`
    setLoading(true)

    async function run() {
      try {
        const fallbackUrl = getApiBase() + path
        let response
        let usedSdkApi = false
        if (sdk?.api) {
          usedSdkApi = true
          const resp = await sdk.api(path, { method: 'GET', headers: { Accept: 'application/json' } })
          response = resp?.data ?? resp ?? null
        } else {
          const res = await fetch(fallbackUrl, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          response = await res.json()
        }
        if (cancelled) return
        let parsed = extractVendorListPayload(response)

        if (usedSdkApi && parsed.rows.length === 0 && parsed.cols.length === 0) {
          try {
            const res = await fetch(fallbackUrl, {
              method: 'GET',
              credentials: 'include',
              headers: { Accept: 'application/json' },
            })
            if (res.ok) {
              const json = await res.json()
              const reparsed = extractVendorListPayload(json)
              if (reparsed.rows.length || reparsed.cols.length) parsed = reparsed
            }
          } catch {
            // keep parsed
          }
        }

        setApiRows(parsed.rows)
        setExpandedId(null)
      } catch (e) {
        if (!cancelled) {
          console.warn('Vendor list fetch failed:', e?.message || e)
          setApiRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [sdkReady, sdk, accountId, formId])

  const vendors = useMemo(() => apiRows.map(mapKfRowToVendorView).filter(Boolean), [apiRows])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return vendors
      .filter(
        (v) =>
          !q ||
          v.name.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q) ||
          v.contactName.toLowerCase().includes(q) ||
          v.product.toLowerCase().includes(q) ||
          v.gstNo.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const av = String(a[sortKey])
        const bv = String(b[sortKey])
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
  }, [vendors, search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
  const startEntry = filtered.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1
  const endEntry = Math.min(currentPage * rowsPerPage, filtered.length)

  const handleRowClick = (id) => {
    setExpandedId((prev) => {
      const next = prev === id ? null : id
      if (next) setScrollToVendorId(id)
      return next
    })
  }

  useEffect(function scrollAndFlashVendorAccordion() {
    const targetId = scrollToVendorId
    if (!targetId) return
    const domId = `vendor-accordion-${targetId}`
    let cancelled = false
    const run = () => {
      if (cancelled) return
      const el = document.getElementById(domId)
      if (!el) {
        window.requestAnimationFrame(run)
        return
      }
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch {
        // ignore
      }
      setAccordionFlashId(targetId)
      window.setTimeout(() => {
        if (!cancelled) setAccordionFlashId((prev) => (prev === targetId ? null : prev))
      }, 1200)
      setScrollToVendorId(null)
    }
    window.requestAnimationFrame(run)
    return () => {
      cancelled = true
    }
  }, [scrollToVendorId, expandedId])

  const pageNumbers = useMemo(() => {
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i)
    } else {
      pages.push(1)
      if (currentPage > 3) pages.push('...')
      for (
        let i = Math.max(2, currentPage - 1);
        i <= Math.min(totalPages - 1, currentPage + 1);
        i += 1
      ) {
        pages.push(i)
      }
      if (currentPage < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }, [totalPages, currentPage])

  const handleNewVendor = () => {
    const kfLocal = sdk ?? (typeof kf !== 'undefined' ? kf : null) ?? (typeof window !== 'undefined' ? window.kf : null)
    const POPUP_ID = resolveVendorMasterPopupId()
    const popupParams = {
      width: 960,
      height: 720,
      popupWidth: '960px',
      popupHeight: '720px',
    }
    if (kfLocal && typeof kfLocal.app?.page?.openPopup === 'function') {
      kfLocal.app.page.openPopup(POPUP_ID, popupParams)
    } else {
      setNewVendorOpen(true)
    }
  }

  const openVendorDetailsPopup = (vendor) => {
    const kfLocal = sdk ?? (typeof kf !== 'undefined' ? kf : null) ?? (typeof window !== 'undefined' ? window.kf : null)
    const POPUP_ID = resolveVendorMasterPopupId()
    const instanceId = vendor?.id || vendor?.rawRow?._id
    const raw = vendor?.rawRow || {}
    const activityInstanceId =
      vendor?.activityInstanceId ||
      raw._activity_instance_id ||
      raw._context_activity_instance_id ||
      ''
    const activityId =
      activityInstanceId || vendor?.activityId || raw._activity_id || raw._activityId || formId

    if (!kfLocal?.app?.page?.openPopup) {
      console.warn('Vendor Master: Kissflow openPopup is not available')
      return
    }
    if (!instanceId) {
      console.warn('Vendor Master: missing record id for View Details', vendor)
      return
    }

    try {
      const p = kfLocal.app.page.openPopup(POPUP_ID, {
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
        p.catch((e) => console.warn('Vendor Master popup failed:', e?.message || e))
      }
    } catch (e) {
      console.warn('Vendor Master popup failed:', e?.message || e)
    }
  }

  return (
    <div className={vmsPageClass}>
      <main className={vmsPageInnerClass}>
        <section className={vmsHeaderShellClass()} data-aos="fade-down">
          <P2pHeaderFx />
          <div className="relative z-[1] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <div className={vmsAvatarClass()}>
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold leading-tight tracking-tight text-slate-900 sm:text-xl">
                  Vendor Master
                </h1>
                <p className="mt-0.5 text-xs leading-snug text-slate-500 sm:text-sm">
                  <span className={vmsRoleAccentClass()}>{filtered.length}</span> vendors registered
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end lg:gap-3">
              <div className="relative w-full sm:w-[22rem] lg:w-[26rem]">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Search vendors…"
                  className={vmsSearchInputClass()}
                />
              </div>
              <button
                type="button"
                onClick={handleNewVendor}
                className={vmsPrimaryBtnClass()}
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Vendor
              </button>
            </div>
          </div>
        </section>

        <div className={`relative z-0 ${vmsSectionShellClass()} p-2.5 sm:p-4 md:p-5`} data-aos="fade-up">
          {/* WEB VIEW - unchanged */}
          <div className="hidden min-w-0 sm:block overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-12" />
                {TABLE_COLUMNS.map((col) => (
                  <col key={col.key} className={col.width} />
                ))}
              </colgroup>
              <thead className={vmsTableHeadClass()}>
                <tr>
                  <th className={`${vmsTableHeadCellClass()} w-12 rounded-tl-lg`}>
                    <span className="sr-only">Expand</span>
                  </th>
                  {TABLE_COLUMNS.map(({ label, key, icon }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={`group cursor-pointer select-none ${vmsTableHeadCellClass()} transition-colors duration-150 last:rounded-tr-lg hover:text-[#17a2b4] ${
                        sortKey === key ? 'text-[#17a2b4]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {icon ? <i className={`${icon} ${vmsColIconClass()}`} aria-hidden /> : null}
                        <span className="truncate">{label}</span>
                        <span className="flex shrink-0 flex-col leading-none opacity-70 transition-opacity group-hover:opacity-100">
                          <svg className={`h-2 w-2 ${sortKey === key && sortDir === 'asc' ? 'text-[#17a2b4]' : 'text-slate-300'}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
                          </svg>
                          <svg
                            className={`-mt-0.5 h-2 w-2 ${sortKey === key && sortDir === 'desc' ? 'text-[#17a2b4]' : 'text-slate-300'}`}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                          </svg>
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className={vmsTableDivideClass()}>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#17a2b4]/25 border-t-[#17a2b4]" />
                          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#17a2b4]/10 blur-md" />
                        </div>
                        <p className="text-sm text-slate-500">Loading vendors...</p>
                      </div>
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p className="text-sm text-slate-500">No vendors match your search</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((vendor) => {
                    const isExpanded = expandedId === vendor.id
                    return (
                      <React.Fragment key={vendor.id}>
                        <tr
                          onClick={() => handleRowClick(vendor.id)}
                          className={`group cursor-pointer [&>td]:border-b [&>td]:border-slate-200/70 last:[&>td]:border-b-0 ${vmsTableRowClass(isExpanded)} ${
                            isExpanded ? 'shadow-[inset_3px_0_0_0_rgba(0,134,201,0.35)]' : ''
                          }`}
                        >
                          <td className="w-12 px-2 py-3 align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRowClick(vendor.id)
                              }}
                              className={vmsExpandBtnClass(isExpanded, true)}
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                            >
                              <i className={`${isExpanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-base`} />
                            </button>
                          </td>

                          <td className="px-3 py-3 align-middle">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                handleRowClick(vendor.id)
                                }}
                                className="block w-full truncate text-left text-sm font-semibold tracking-tight text-slate-800 transition-colors hover:text-[#17a2b4] hover:underline focus:outline-none"
                                title={vendor.name || 'Unknown Vendor'}
                              >
                                {vendor.name || 'Unknown Vendor'}
                              </button>
                            </div>
                          </td>

                          <td className="px-3 py-3 align-middle">
                            <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600 sm:text-sm">
                              <svg className="h-3 w-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span className="min-w-0 flex-1 truncate" title={vendor.email || ''}>
                                {vendor.email ? vendor.email : <span className="text-slate-400">—</span>}
                              </span>
                            </div>
                          </td>

                          <td className="px-3 py-3 align-middle">
                            <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600 sm:text-sm">
                              <svg className="h-3 w-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span className="min-w-0 flex-1 truncate" title={vendor.officePhone || ''}>
                                {vendor.officePhone ? vendor.officePhone : <span className="text-slate-400">—</span>}
                              </span>
                            </div>
                          </td>

                          <td className="px-3 py-3 align-middle">
                            <span className="block truncate text-xs text-slate-700 sm:text-sm" title={vendor.contactName || ''}>
                              {vendor.contactName ? vendor.contactName : <span className="text-slate-400">—</span>}
                            </span>
                          </td>

                          <td className="px-3 py-3 align-middle">
                            <div className="truncate text-xs text-slate-700 sm:text-sm" title={vendor.product || ''}>
                              {vendor.product || <span className="text-slate-400">—</span>}
                            </div>
                          </td>

                          <td className="px-3 py-3 align-middle">
                            <span
                              className="inline-flex max-w-full items-center rounded-md bg-[#17a2b4]/10 px-1.5 py-0.5 text-[10px] font-semibold leading-snug text-[#17a2b4] sm:px-2 sm:py-1 sm:text-xs"
                              title={vendor.gstNo || ''}
                            >
                              <span className="line-clamp-2 break-all sm:line-clamp-1 sm:break-normal">{vendor.gstNo ? vendor.gstNo : '—'}</span>
                            </span>
                          </td>
                        </tr>
                        <VendorExpandedRow
                          vendor={vendor}
                          colSpan={7}
                          isExpanded={isExpanded}
                          flash={accordionFlashId === vendor.id}
                          onViewDetails={() => openVendorDetailsPopup(vendor)}
                        />
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* REDESIGNED MOBILE VIEW - Clean card layout */}
          <div className="space-y-3 sm:hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="relative">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#17a2b4]/25 border-t-[#17a2b4]" />
                </div>
                <p className="mt-3 text-sm text-slate-500">Loading vendors...</p>
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <svg className="h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="mt-3 text-center text-sm text-slate-500">No vendors match your search</p>
              </div>
            ) : (
              paginated.map((vendor) => (
                <MobileVendorCard
                  key={vendor.id}
                  vendor={vendor}
                  isExpanded={expandedId === vendor.id}
                  onToggle={() => {
                    handleRowClick(vendor.id)
                  }}
                  onViewDetails={() => openVendorDetailsPopup(vendor)}
                />
              ))
            )}
          </div>

          {/* Pagination (attached to table) */}
          <div className={vmsPaginationBarClass()}>
            {/* Mobile Pagination */}
            <div className="flex flex-col gap-2.5 sm:hidden">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Page <span className="font-semibold text-slate-700">{currentPage}</span> / {totalPages}
                </span>
                <span className="tabular-nums">
                  {startEntry}–{endEntry} of {filtered.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
                >
                  Next
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Rows per page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value))
                    setPage(1)
                  }}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[#17a2b4]"
                >
                  {ROWS_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Desktop Pagination */}
            <div className={`hidden sm:flex ${vmsPaginationBarClass()} !mt-0 rounded-b-2xl`}>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 text-xs text-slate-600 sm:text-sm">
                <label htmlFor="vendor-rows-per-page" className="whitespace-nowrap font-medium">
                  Rows per page:
                </label>
                <select
                  id="vendor-rows-per-page"
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value))
                    setPage(1)
                  }}
                  className="min-h-[36px] min-w-[72px] cursor-pointer rounded-full border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-white focus:border-[#5cc3cf] focus:ring-2 focus:ring-[#17a2b4]/20 touch-manipulation"
                >
                  {ROWS_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-slate-600">
                  Showing <span className="font-semibold text-slate-800">{startEntry}</span> to{' '}
                  <span className="font-semibold text-slate-800">{endEntry}</span> of{' '}
                  <span className="font-semibold text-slate-800">{filtered.length}</span> vendors
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={vmsPaginationBtnClass(false)}
                  aria-label="Previous page"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {pageNumbers.map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="flex h-9 w-9 items-center justify-center text-xs text-slate-400">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={vmsPaginationBtnClass(currentPage === p)}
                      aria-label={`Page ${p}`}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={vmsPaginationBtnClass(false)}
                  aria-label="Next page"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Fallback when Kissflow openPopup is unavailable (e.g. outside embedded shell) */}
      {newVendorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}
          onClick={() => setNewVendorOpen(false)}
        >
          <div
            className="max-h-[min(92dvh,100%)] w-full max-w-lg overflow-hidden rounded-t-2xl border border-white/50 bg-white/95 shadow-2xl backdrop-blur-md sm:rounded-2xl"
            style={{ animation: 'vm2FadeSlideUp 0.3s cubic-bezier(0.4,0,0.2,1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0 pr-2">
                <h2 className="text-base font-bold text-[#17a2b4] sm:text-lg">
                  Add New Vendor
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">Fill in the vendor details below</p>
              </div>
              <button
                type="button"
                onClick={() => setNewVendorOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-[60vh] sm:space-y-4 sm:px-6 sm:py-5">
              {[
                { label: 'Vendor Name', placeholder: 'e.g. TechCorp Solutions Pvt Ltd', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
                { label: 'Email Address', placeholder: 'e.g. contracts@vendor.com', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
                { label: 'Office Phone', placeholder: 'e.g. +91 22 4567 8901', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> },
                { label: 'Contact Name', placeholder: 'e.g. Rajesh Mehta', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
                { label: 'Product / Service', placeholder: 'e.g. Enterprise Software Suite', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
                { label: 'GST No.', placeholder: 'e.g. 27AABCT1234A1Z5', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg> },
              ].map((field) => (
                <div key={field.label}>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600 sm:mb-1.5 sm:text-xs">{field.label}</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#17a2b4] sm:left-3.5">
                      {field.icon}
                    </div>
                    <input
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#17a2b4]/35 focus:ring-2 focus:ring-[#17a2b4]/25 sm:py-2.5 sm:pl-10 sm:pr-4 sm:text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:gap-3 sm:px-6 sm:py-4 sm:pb-4">
              <button
                type="button"
                onClick={() => setNewVendorOpen(false)}
                className={vmsSecondaryBtnClass()}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setNewVendorOpen(false)}
                className={vmsPrimaryBtnClass()}
              >
                Save Vendor
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes vm2FadeSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        .animate-pulse {
          animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  )
}