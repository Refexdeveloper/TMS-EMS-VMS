const DEFAULT_TENANT_BASE_PROD = 'https://refexgroup.kissflow.com'
const DEFAULT_TENANT_BASE_DEV = 'https://development-refexgroup.kissflow.com'

function isAssetCdnHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return (
    h.includes('kissflow.store') ||
    h.startsWith('resource.') ||
    h.includes('.as.kissflow.store')
  )
}

function tenantBaseFromUrlString(urlStr) {
  const raw = String(urlStr || '').trim()
  if (!raw) return ''
  try {
    const origin = new URL(raw).origin
    if (origin && !isAssetCdnHost(new URL(origin).hostname)) return origin
  } catch {
    // ignore
  }
  return ''
}

/**
 * Kissflow tenant API origin for fetch() — never the resource.*.kissflow.store CDN (S3 → NoSuchKey 404).
 * Use for process-report and other REST calls with access keys.
 */
export function getKissflowTenantBase() {
  const envBase = import.meta.env?.VITE_KF_BASE_URL
  if (envBase && !String(envBase).includes('kissflow.store')) {
    return String(envBase).replace(/\/$/, '')
  }

  if (typeof document !== 'undefined') {
    const fromRef = tenantBaseFromUrlString(document.referrer)
    if (fromRef) return fromRef
  }

  if (typeof window !== 'undefined') {
    const host = window.location?.hostname || ''
    if (!isAssetCdnHost(host)) {
      const origin = window.location?.origin ? String(window.location.origin) : ''
      if (origin) return origin.replace(/\/$/, '')
    }
  }

  return DEFAULT_TENANT_BASE_PROD
}

/** True when browser fetch() to the tenant API would be same-origin (avoids CORS from resource CDN). */
export function canFetchKissflowTenantDirectly() {
  if (typeof window === 'undefined') return true
  try {
    const tenantOrigin = new URL(getKissflowTenantBase()).origin
    return tenantOrigin === window.location.origin
  } catch {
    return false
  }
}

export function getKissflowSdk(kfInstance) {
  if (kfInstance?.api) return kfInstance
  if (typeof window !== 'undefined' && window.kf?.api) return window.kf
  return kfInstance || (typeof window !== 'undefined' ? window.kf : null) || null
}

/**
 * GET a Kissflow path. Uses kf.api inside the Page iframe (CDN origin).
 * Falls back to fetch only when the page is same-origin with the tenant — never from resource.*.kissflow.store.
 */
export async function fetchKissflowPath(kfInstance, path) {
  const sdk = getKissflowSdk(kfInstance)
  if (typeof sdk?.api === 'function') {
    const resp = await sdk.api(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    return resp?.data ?? resp ?? null
  }
  if (canFetchKissflowTenantDirectly()) {
    const res = await fetch(getApiBase() + path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Kissflow HTTP ${res.status}`)
    return res.json()
  }
  throw new Error('Kissflow SDK api is not ready (CDN frame cannot fetch tenant APIs)')
}

/**
 * Base URL for Kissflow API requests.
 * - kf.api() uses relative paths on the tenant origin via the SDK.
 * - For fetch() fallback, prefer getKissflowTenantBase() for process-report.
 */
export function getApiBase() {
  if (typeof window !== 'undefined') {
    const host = window.location?.hostname ? String(window.location.hostname) : ''
    if (isAssetCdnHost(host)) {
      return getKissflowTenantBase()
    }
    const origin = window.location?.origin ? String(window.location.origin) : ''
    if (origin) return origin.replace(/\/$/, '')
  }

  return import.meta.env?.VITE_KF_BASE_URL || DEFAULT_TENANT_BASE_DEV
}

/** Use at module load for constants; in browser this will be the page origin. */
export const API_BASE = getApiBase()
