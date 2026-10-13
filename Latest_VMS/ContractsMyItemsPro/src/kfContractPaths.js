/**
 * Kissflow API paths for Contract Management / Contract Approval workflow.
 * Same pattern as kfLeadPaths.js: SDK-first account + process + application resolution,
 * with Vite env fallbacks for local preview.
 */

import { resolveKfAccountId } from './kfLeadPaths.js'

function env(name, fallback = '') {
  try {
    const v = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]
    return v != null && String(v).trim() !== '' ? String(v).trim() : fallback
  } catch {
    return fallback
  }
}

/** Application id for Contract Management (query `_application_id=`) */
export function resolveKfContractApplicationId(kf) {
  if (!kf || typeof kf !== 'object') {
    return env('VITE_KF_CONTRACT_APP_ID', 'Contract_Management_A00')
  }
  try {
    return (
      kf.app?._id ||
      kf.context?.app?._id ||
      env('VITE_KF_CONTRACT_APP_ID', 'Contract_Management_A00')
    )
  } catch {
    return env('VITE_KF_CONTRACT_APP_ID', 'Contract_Management_A00')
  }
}

/**
 * Form report count: total vendors in Vendor Master (Contract Management app).
 * Example path:
 * `/form-report/2/{account}/Vendor_Master_A02/Total_Vendors_A00/count?apply_preference=true&_application_id=...`
 */
export function buildTotalVendorsReportCountPath(kf) {
  const accountId = resolveKfAccountId(kf)
  const applicationId = resolveKfContractApplicationId(kf)
  if (!accountId || !applicationId) return null
  const vendorFormId = env('VITE_KF_VENDOR_MASTER_FORM_ID', 'Vendor_Master_A02')
  const vendorReportId = env('VITE_KF_TOTAL_VENDORS_REPORT_ID', 'Total_Vendors_A00')
  const appQ = `_application_id=${encodeURIComponent(applicationId)}`
  return `/form-report/2/${accountId}/${vendorFormId}/${vendorReportId}/count?apply_preference=true&${appQ}`
}

/**
 * Vendor Master list endpoint (all vendor records).
 * Example:
 * `/form/2/{account}/Vendor_Master_A02/list?page_number=1&page_size=1000&apply_preference=1`
 */
export function buildVendorMasterApiPaths(kf) {
  const accountId = resolveKfAccountId(kf)
  if (!accountId) return null
  const vendorFormId = env('VITE_KF_VENDOR_MASTER_FORM_ID', 'Vendor_Master_A02')
  return {
    accountId,
    vendorFormId,
    getVendorItemsPath(pageNumber = 1, pageSize = 1000) {
      const pn = Math.max(1, Number(pageNumber) || 1)
      const ps = Math.min(1000, Math.max(1, Number(pageSize) || 1000))
      return `/form/2/${accountId}/${vendorFormId}/list?page_number=${pn}&page_size=${ps}&apply_preference=1`
    },
  }
}

/** Process technical id in `/process/2/{account}/{processId}/admin/...` */
export function resolveKfContractProcessId(kf) {
  if (!kf || typeof kf !== 'object') {
    return env('VITE_KF_CONTRACT_PROCESS_ID', 'Contract_Approval_Workflow_A00')
  }
  try {
    const p =
      kf.app?.Process?._id ??
      kf.app?.process?._id ??
      kf.context?.process?._id ??
      kf.context?.Process?._id ??
      env('VITE_KF_CONTRACT_PROCESS_ID', 'Contract_Approval_Workflow_A00')
    return String(p || '').trim() || env('VITE_KF_CONTRACT_PROCESS_ID', 'Contract_Approval_Workflow_A00')
  } catch {
    return env('VITE_KF_CONTRACT_PROCESS_ID', 'Contract_Approval_Workflow_A00')
  }
}

/**
 * Paths for Contracts My Items / My Tasks (PWA myitems + pending), same shape as buildLeadProcessApiPaths.
 * Uses Contract_Management_A00 (application) + Contract_Approval_Workflow_A00 (process) by default.
 * @returns {null | object}
 */
export function buildContractProcessApiPaths(kf) {
  const accountId = resolveKfAccountId(kf)
  const applicationId = resolveKfContractApplicationId(kf)
  const processId = resolveKfContractProcessId(kf)
  if (!accountId || !applicationId || !processId) return null

  const appQ = `_application_id=${encodeURIComponent(applicationId)}`

  return {
    accountId,
    applicationId,
    processId,
    statusCountPath: `/process/2/${accountId}/${processId}/myitems/status/count?${appQ}`,
    itemBase: `/process/2/${accountId}/admin/${processId}`,
    myitemsBase: `/process/2/${accountId}/pwa/${processId}/myitems`,
    myitemsQuery: `apply_preference=1`,
    pendingCountPath: `/process/2/${accountId}/${processId}/pending/activity/count?${appQ}`,
    pendingBase: `/process/2/${accountId}/pwa/${processId}/pending`,
    pendingQuery: `apply_preference=1`,
    userPathPrefix: `/user/2/${accountId}/`,
    userPathSuffix: `?${appQ}`,
    openPageAppId: applicationId,
  }
}

/**
 * Admin list paths for contract dashboard (same shape as buildLeadAdminApiPaths).
 * @returns {null | object}
 */
export function buildContractAdminApiPaths(kf) {
  const accountId = resolveKfAccountId(kf)
  const applicationId = resolveKfContractApplicationId(kf)
  const processId = resolveKfContractProcessId(kf)
  if (!accountId || !applicationId || !processId) return null

  const appQ = `_application_id=${encodeURIComponent(applicationId)}`
  return {
    accountId,
    applicationId,
    processId,
    contractCountPath: `/process/2/${accountId}/admin/${processId}/item/appdata/count?apply_preference=true&${appQ}`,
    /** @param {number} pageNumber 1-based */
    getContractItemsPath(pageNumber, pageSize) {
      const pn = Math.max(1, Number(pageNumber) || 1)
      const ps = Math.min(100000, Math.max(1, Number(pageSize) || 1000))
      return `/process/2/${accountId}/admin/${processId}/item?page_number=${pn}&page_size=${ps}&apply_preference=1`
    },
    userPathPrefix: `/user/2/${accountId}/`,
    userPathSuffix: `?${appQ}`,
    openPageAppId: applicationId,
  }
}

/** Kissflow contract workflow popup — same default as ContractsMyItemsPro / VMS2.0 */
export const CONTRACT_WORKFLOW_POPUP_ID = 'Popup_6xSap6ocDi'

export function resolveContractPopupId() {
  return env('VITE_KF_CONTRACT_POPUP_ID', CONTRACT_WORKFLOW_POPUP_ID)
}

/**
 * Open contract instance in Kissflow popup (duplicate alias keys for SDK compatibility).
 * @returns {boolean} true if openPopup was invoked
 */
export function openContractWorkflowPopup(kf, { instanceId, activityInstanceId }, { onFallback, onError } = {}) {
  const popupId = resolveContractPopupId()
  const activityId = activityInstanceId ? String(activityInstanceId) : ''
  const instId = instanceId ? String(instanceId) : ''

  if (!kf?.app?.page?.openPopup) {
    onFallback?.()
    return false
  }
  if (!instId || !activityId) {
    console.warn('openContractWorkflowPopup: missing instance/activity id', { instId, activityId })
    onFallback?.()
    return false
  }

  try {
    const p = kf.app.page.openPopup(popupId, {
      ActivityID: activityId,
      InstanceId: instId,
      ActivityInstanceId: activityId,
      ActivityId: activityId,
      activityId: activityId,
      InstanceID: instId,
      width: 960,
      height: 720,
      popupWidth: '960px',
      popupHeight: '720px',
    })
    if (p && typeof p.catch === 'function') {
      p.catch((e) => {
        console.warn('openContractWorkflowPopup failed:', e?.message || e)
        onError?.(e)
        onFallback?.()
      })
    }
    return true
  } catch (e) {
    console.warn('openContractWorkflowPopup failed:', e?.message || e)
    onError?.(e)
    onFallback?.()
    return false
  }
}
