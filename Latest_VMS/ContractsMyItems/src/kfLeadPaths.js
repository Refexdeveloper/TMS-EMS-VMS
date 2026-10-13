/**
 * Build Kissflow API paths for the Lead Tracker process using the embedded SDK.
 * Falls back to Vite env vars when running outside Kissflow (e.g. local preview).
 */

import { getApiBase } from './apiBase.js'

function env(name, fallback = '') {
  try {
    const v = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]
    return v != null && String(v).trim() !== '' ? String(v).trim() : fallback
  } catch {
    return fallback
  }
}

const DEFAULT_ACCOUNT_PROD = 'AcCMptlq60zH'
const DEFAULT_ACCOUNT_DEV = 'AcCMptp3yqcn'
const DEFAULT_LEAD_PROCESS_ID = 'Lead_tracker_1_A00'

/** Venwind sales process in Lead Tracker app (appbuilder/Lead_Trcaker_A00/process/…). */
export const VENWIND_SALES_PROCESS_ID = 'Vindview_Sales_Management_A00'
/** 3i Sales Opportunity process in Lead Tracker app. */
export const SALES_OPPORTUNITY_PROCESS_ID = '3i_Sales_Opportunity_A00'
/** Sales Activity Module process in Lead Tracker app. */
export const SALES_ACTIVITY_PROCESS_ID = 'Sales_Activity_Module_A00'
/** Lead Tracker Kissflow application id (hosts multiple processes). */
export const LEAD_TRACKER_APPLICATION_ID = 'Lead_Trcaker_A00'

/** Map tenant hostname / URL fragment → Kissflow account id. */
function accountIdFromUrlString(urlStr) {
  const u = String(urlStr || '').toLowerCase()
  if (!u) return ''
  if (u.includes('development-refexgroup')) return DEFAULT_ACCOUNT_DEV
  if (u.includes('refexgroup')) return DEFAULT_ACCOUNT_PROD
  return ''
}

/** Infer account id when SDK/env omit it (Page apps on resource.*.kissflow.store CDN). */
function resolveKfAccountIdFromHost() {
  const fromEnvBase = accountIdFromUrlString(env('VITE_KF_BASE_URL', ''))
  if (fromEnvBase) return fromEnvBase

  if (typeof window !== 'undefined' && window.kf?.account?._id) {
    return String(window.kf.account._id).trim()
  }
  if (typeof window !== 'undefined' && window.kf?.context?.account?._id) {
    return String(window.kf.context.account._id).trim()
  }

  try {
    const fromApiBase = accountIdFromUrlString(getApiBase())
    if (fromApiBase) return fromApiBase
  } catch {
    // ignore
  }

  if (typeof document !== 'undefined') {
    const fromReferrer = accountIdFromUrlString(document.referrer)
    if (fromReferrer) return fromReferrer
  }

  if (typeof window !== 'undefined') {
    const fromHref = accountIdFromUrlString(window.location?.href)
    if (fromHref) return fromHref
    const fromHost = accountIdFromUrlString(window.location?.hostname)
    if (fromHost) return fromHost
  }

  return ''
}

/** Account id for `/process/2/{accountId}/...` */
export function resolveKfAccountId(kf) {
  if (kf && typeof kf === 'object') {
    try {
      const fromSdk = kf.account?._id || kf.context?.account?._id
      if (fromSdk) return String(fromSdk).trim()
    } catch {
      // ignore
    }
  }
  const fromEnv = env('VITE_KF_ACCOUNT_ID', '')
  if (fromEnv) return fromEnv

  const fromHost = resolveKfAccountIdFromHost()
  if (fromHost) return fromHost

  // Last resort: prod account (My Team report URL uses refexgroup tenant)
  return DEFAULT_ACCOUNT_PROD
}

/** Application id for `_application_id=` query and often `openPage(appId)` */
export function resolveKfApplicationId(kf) {
  if (!kf || typeof kf !== 'object') return env('VITE_KF_APPLICATION_ID', '')
  try {
    return (
      kf.app?._id ||
      kf.context?.app?._id ||
      env('VITE_KF_APPLICATION_ID', '')
    )
  } catch {
    return env('VITE_KF_APPLICATION_ID', '')
  }
}

/**
 * Process technical name in URL: `/process/2/{account}/{processId}/myitems/...`
 * (e.g. Lead_tracker_1_A00). Not always equal to application id.
 */
export function resolveKfLeadProcessId(kf) {
  if (!kf || typeof kf !== 'object') {
    return env('VITE_KF_LEAD_PROCESS_ID', 'Lead_tracker_1_A00')
  }
  try {
    const p =
      kf.app?.Process?._id ??
      kf.app?.process?._id ??
      kf.context?.process?._id ??
      kf.context?.Process?._id ??
      env('VITE_KF_LEAD_PROCESS_ID', 'Lead_tracker_1_A00')
    return String(p || '').trim() || env('VITE_KF_LEAD_PROCESS_ID', 'Lead_tracker_1_A00')
  } catch {
    return env('VITE_KF_LEAD_PROCESS_ID', 'Lead_tracker_1_A00')
  }
}

/**
 * Paths for LeadsManagementPage (myitems, pending, item delete, user).
 * @returns {null | object}
 */
export function buildLeadProcessApiPaths(kf) {
  const accountId = resolveKfAccountId(kf)
  const applicationId = resolveKfApplicationId(kf)
  const processId = resolveKfLeadProcessId(kf)
  if (!accountId || !applicationId || !processId) return null

  const appQ = `_application_id=${encodeURIComponent(applicationId)}`

  return {
    accountId,
    applicationId,
    processId,
    statusCountPath: `/process/2/${accountId}/${processId}/myitems/status/count?${appQ}`,
    // Admin delete endpoint is based on /admin/<processId>/<instanceId>
    itemBase: `/process/2/${accountId}/admin/${processId}`,

    // My Items / My Tasks endpoints (pwa)
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
 * Paths for LeadDashboardPage (admin item list + count).
 * @returns {null | object}
 */
/** Kissflow process-report id for “My Team” (Columns + Data rows). */
export const MY_TEAM_REPORT_ID = 'My_Team_A00'

/**
 * GET /process-report/2/{account}/{process}/My_Team_A00?...
 * @returns {string | null}
 */
/** Resolve ids for My Team process-report (reuse Me-tab paths when available). */
export function resolveMyTeamReportIds(kf, overrides = {}) {
  const leadPaths = buildLeadProcessApiPaths(kf)
  const adminPaths = buildLeadAdminApiPaths(kf)

  return {
    accountId:
      overrides.accountId ||
      leadPaths?.accountId ||
      adminPaths?.accountId ||
      resolveKfAccountId(kf),
    processId:
      overrides.processId ||
      leadPaths?.processId ||
      adminPaths?.processId ||
      resolveKfLeadProcessId(kf) ||
      DEFAULT_LEAD_PROCESS_ID,
    applicationId:
      overrides.applicationId ||
      leadPaths?.applicationId ||
      adminPaths?.applicationId ||
      resolveKfApplicationId(kf) ||
      '',
    reportId: overrides.reportId || env('VITE_KF_MY_TEAM_REPORT_ID', MY_TEAM_REPORT_ID) || MY_TEAM_REPORT_ID,
  }
}

export function buildMyTeamReportPath(kf, pageNumber = 1, pageSize = 1000, options = {}) {
  const { minimal = false, managerEmail: managerEmailOpt, loggedInEmail, ...idOverrides } = options
  const managerEmail = String(managerEmailOpt || loggedInEmail || '').trim()
  const { accountId, applicationId, processId, reportId } = resolveMyTeamReportIds(kf, idOverrides)

  const params = new URLSearchParams()
  if (managerEmail) {
    params.set('apply_preference', '1')
  } else if (!minimal) {
    params.set('apply_preference', 'true')
    params.set('page_number', String(Math.max(1, Number(pageNumber) || 1)))
    params.set('page_size', String(Math.min(1000, Math.max(1, Number(pageSize) || 1000))))
  }
  if (applicationId) params.set('_application_id', applicationId)
  let qs = params.toString()
  if (managerEmail) {
    const enc = encodeURIComponent(managerEmail)
    const mgr = `$final_l1_manager_email=${enc}&$final_l2_manager_email=${enc}`
    qs = qs ? `${qs}&${mgr}` : mgr
    if (!minimal) {
      const pag = new URLSearchParams()
      pag.set('page_number', String(Math.max(1, Number(pageNumber) || 1)))
      pag.set('page_size', String(Math.min(1000, Math.max(1, Number(pageSize) || 1000))))
      qs = `${qs}&${pag.toString()}`
    }
  }
  return `/process-report/2/${accountId}/${processId}/${encodeURIComponent(reportId)}${qs ? `?${qs}` : '?'}`
}

/** Process id for Venwind Sales Management dashboard APIs. */
export function resolveKfVenwindProcessId(kf) {
  const fromEnv = env('VITE_KF_VENWIND_PROCESS_ID', '')
  if (fromEnv) return fromEnv
  if (kf && typeof kf === 'object') {
    try {
      const fromSdk =
        kf.app?.Process?._id ??
        kf.app?.process?._id ??
        kf.context?.process?._id ??
        kf.context?.Process?._id ??
        ''
      const s = String(fromSdk || '').trim()
      if (s) return s
    } catch {
      // ignore
    }
  }
  return VENWIND_SALES_PROCESS_ID
}

/** Application id for Venwind dashboard (_application_id on admin/process APIs). */
export function resolveKfVenwindApplicationId(kf) {
  const fromEnv = env('VITE_KF_VENWIND_APPLICATION_ID', '')
  if (fromEnv) return fromEnv
  if (kf && typeof kf === 'object') {
    try {
      const fromSdk = kf.app?._id || kf.context?.app?._id
      if (fromSdk) return String(fromSdk).trim()
    } catch {
      // ignore
    }
  }
  return LEAD_TRACKER_APPLICATION_ID
}

/** Admin API paths for Venwind Sales Management (`Vindview_Sales_Management_A00`). */
export function buildVenwindAdminApiPaths(kf) {
  return buildLeadAdminApiPaths(kf, {
    processId: resolveKfVenwindProcessId(kf),
    applicationId: resolveKfVenwindApplicationId(kf),
  })
}

/** Process id for 3i Sales Opportunity dashboard APIs. */
export function resolveKfSalesOpportunityProcessId(kf) {
  const fromEnv = env('VITE_KF_SALES_OPP_PROCESS_ID', '')
  if (fromEnv) return fromEnv
  if (kf && typeof kf === 'object') {
    try {
      const fromSdk =
        kf.app?.Process?._id ??
        kf.app?.process?._id ??
        kf.context?.process?._id ??
        kf.context?.Process?._id ??
        ''
      const s = String(fromSdk || '').trim()
      if (s && /sales.?opportunit/i.test(s)) return s
    } catch {
      // ignore
    }
  }
  return SALES_OPPORTUNITY_PROCESS_ID
}

/** Application id for 3i Sales Opportunity (`Lead_Trcaker_A00`). */
export function resolveKfSalesOpportunityApplicationId(kf) {
  const fromEnv = env('VITE_KF_SALES_OPP_APPLICATION_ID', '')
  if (fromEnv) return fromEnv
  if (kf && typeof kf === 'object') {
    try {
      const fromSdk = kf.app?._id || kf.context?.app?._id
      if (fromSdk) return String(fromSdk).trim()
    } catch {
      // ignore
    }
  }
  return LEAD_TRACKER_APPLICATION_ID
}

/** Admin API paths for 3i Sales Opportunity (`3i_Sales_Opportunity_A00`). */
export function buildSalesOpportunityAdminApiPaths(kf) {
  return buildLeadAdminApiPaths(kf, {
    processId: resolveKfSalesOpportunityProcessId(kf),
    applicationId: resolveKfSalesOpportunityApplicationId(kf),
  })
}

/** Process id for Sales Activity Module (`Sales_Activity_Module_A00`). */
export function resolveKfSalesActivityProcessId(kf) {
  const fromEnv = env('VITE_KF_SALES_ACTIVITY_PROCESS_ID', '')
  if (fromEnv) return fromEnv
  if (kf && typeof kf === 'object') {
    try {
      const fromSdk =
        kf.app?.Process?._id ??
        kf.app?.process?._id ??
        kf.context?.process?._id ??
        kf.context?.Process?._id ??
        ''
      const s = String(fromSdk || '').trim()
      if (s && /sales.?activit/i.test(s)) return s
    } catch {
      // ignore
    }
  }
  return SALES_ACTIVITY_PROCESS_ID
}

/** Admin API paths for Sales Activity Module (`Sales_Activity_Module_A00`). */
export function buildSalesActivityAdminApiPaths(kf) {
  return buildLeadAdminApiPaths(kf, {
    processId: resolveKfSalesActivityProcessId(kf),
    applicationId: resolveKfSalesOpportunityApplicationId(kf),
  })
}

export function buildLeadAdminApiPaths(kf, overrides = {}) {
  const accountId = overrides.accountId || resolveKfAccountId(kf)
  const applicationId = overrides.applicationId || resolveKfApplicationId(kf)
  const processId = overrides.processId || resolveKfLeadProcessId(kf)
  if (!accountId || !applicationId || !processId) return null

  const appQ = `_application_id=${encodeURIComponent(applicationId)}`
  return {
    accountId,
    applicationId,
    processId,
    leadCountPath: `/process/2/${accountId}/admin/${processId}/item/appdata/count?apply_preference=true&${appQ}`,
    /** @param {number} pageNumber 1-based */
    getLeadItemsPath(pageNumber, pageSize) {
      const pn = Math.max(1, Number(pageNumber) || 1)
      const ps = Math.min(1000, Math.max(1, Number(pageSize) || 1000))
      // User-requested admin endpoint format for lead list data.
      return `/process/2/${accountId}/admin/${processId}/item?page_number=${pn}&page_size=${ps}&apply_preference=1`
    },
    getAdminItemPath(itemId) {
      const id = encodeURIComponent(String(itemId || '').trim())
      return `/process/2/${accountId}/admin/${processId}/${id}`
    },
    userPathPrefix: `/user/2/${accountId}/`,
    userPathSuffix: `?${appQ}`,
    openPageAppId: applicationId,
  }
}
