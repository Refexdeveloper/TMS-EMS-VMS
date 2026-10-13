/** Teal theme aligned with requester-dashboard KPI cards (Sathish_p2p tfx). */

export const VMS_BRAND = {
  DEFAULT: '#17a2b4',
  dark: '#0f6b7a',
  darker: '#0b5361',
  light: '#5fe0e6',
  muted: '#e6f6f8',
  soft: '#f3f8fb',
  border: '#bfe6ec',
  borderStrong: '#5cc3cf',
}

export const VMS_BRAND_LOGO_URL = '/p2p/refexone-logo.png'

export const VMS_PAGE_BG =
  'linear-gradient(180deg, #e8f6f9 0%, #f3f8fb 48%, #f7fbfc 100%)'

export const VMS_HERO_GRADIENT =
  'linear-gradient(135deg, #17a2b4 0%, #0f6b7a 55%, #0b5361 100%)'

export const vmsPageClass =
  'p2p-theme min-h-screen overflow-x-hidden overflow-y-auto px-3 pb-6 pt-1 font-sans text-[#0F172A] md:px-4 md:pb-8 md:pt-2'

export const vmsPageInnerClass = 'mx-auto max-w-[1500px] min-w-0'

export function vmsSectionShellClass(extra = '') {
  return [
    'p2p-card relative overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_10px_30px_rgba(20,90,120,0.08)] sm:rounded-[18px]',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

export function vmsSectionHeaderClass(accent = 'brand') {
  const map = {
    brand: 'bg-gradient-to-r from-white to-[#e6f6f8]/70',
    brandAlt: 'bg-[#F8FAFC]',
    slate: 'bg-[#F8FAFC]',
    rose: 'bg-red-50/40',
  }
  return `relative z-[1] border-b border-slate-100/80 px-3 py-3 sm:px-5 sm:py-4 ${map[accent] || map.brand}`
}

export function vmsSectionTitleClass() {
  return 'text-base md:text-xl font-semibold tracking-tight text-[#0F172A]'
}

export function vmsSectionSubtitleClass() {
  return 'mt-0.5 text-xs sm:text-sm text-[#64748B]'
}

export function vmsSearchInputClass() {
  return [
    'w-full min-h-[44px] md:min-h-[38px] rounded-xl border border-slate-200 bg-white',
    'pl-10 pr-10 py-2.5 md:py-2 text-sm text-[#0F172A] shadow-none',
    'placeholder:text-slate-400 touch-manipulation transition-all',
    'focus:outline-none focus:ring-2 focus:ring-[#17a2b4]/30 focus:border-[#17a2b4]',
  ].join(' ')
}

export function vmsGhostBtnClass() {
  return 'min-h-[44px] md:min-h-[36px] rounded-xl border border-transparent bg-white px-3 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.10)] hover:border-[#bfe6ec] transition-colors whitespace-nowrap touch-manipulation inline-flex items-center justify-center gap-1.5'
}

export function vmsPrimaryBtnClass() {
  return 'min-h-[44px] md:min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#17a2b4] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#0f6b7a] transition-colors touch-manipulation whitespace-nowrap disabled:opacity-60'
}

export function vmsSecondaryBtnClass() {
  return 'min-h-[44px] md:min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-transparent bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.10)] hover:border-[#bfe6ec] transition-colors touch-manipulation whitespace-nowrap'
}

export function vmsDangerBtnClass() {
  return 'min-h-[44px] md:min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors touch-manipulation whitespace-nowrap disabled:opacity-50'
}

export function vmsIconBtnClass(active = false) {
  return active
    ? 'h-9 w-9 inline-flex shrink-0 items-center justify-center rounded-xl border border-[#bfe6ec] bg-[#e6f6f8] text-[#17a2b4] transition-colors touch-manipulation'
    : 'h-9 w-9 inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors touch-manipulation'
}

export function vmsSegmentBtnClass(active = false) {
  return active
    ? 'min-h-[36px] px-3.5 rounded-xl text-xs font-semibold bg-[#17a2b4] text-white transition-colors touch-manipulation inline-flex items-center justify-center gap-1'
    : 'min-h-[36px] px-3.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors touch-manipulation inline-flex items-center justify-center gap-1'
}

export function vmsChipBtnClass(active = false) {
  return active
    ? 'min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold bg-[#17a2b4] text-white transition-colors touch-manipulation'
    : 'min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors touch-manipulation'
}

export function vmsSelectClass() {
  return 'min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#17a2b4]/30 focus:border-[#17a2b4] touch-manipulation'
}

export function vmsTableHeadClass() {
  return 'bg-[#f3f8fb] border-b border-[#e9f0f3] text-[11px] font-semibold uppercase tracking-wider text-[#6b7684]'
}

export function vmsContractTypeIcon(type) {
  const t = String(type || '').toLowerCase()
  if (t.includes('amc') || t.includes('maint')) return 'ri-tools-line'
  if (t.includes('rent') || t.includes('lease')) return 'ri-key-2-line'
  if (t.includes('nda') || t.includes('confidential')) return 'ri-lock-2-line'
  if (t.includes('mssa') || t.includes('msa')) return 'ri-stack-line'
  if (t.includes('sow') || t.includes('scope')) return 'ri-clipboard-line'
  if (t.includes('one') || t.includes('spot') || t.includes('once')) return 'ri-file-text-line'
  return 'ri-file-paper-2-line'
}

export function vmsTypeChipClass() {
  return 'inline-flex max-w-full items-center gap-1 rounded-lg bg-[#e6f6f8] px-2 py-0.5 text-[11px] font-medium text-[#0f6b7a]'
}

export function vmsColIconClass() {
  return 'text-[13px] text-[#17a2b4]'
}

export function vmsTableHeadCellClass() {
  return 'px-4 py-3 text-left'
}

export function vmsTableRowClass(expanded = false) {
  return expanded
    ? 'bg-[#e6f6f8]/80 transition-colors'
    : 'hover:bg-[#f7fbfd] transition-colors'
}

export function vmsTableDivideClass() {
  return 'divide-y divide-slate-100'
}

export function vmsExpandBtnClass(expanded = false, compact = false) {
  const size = compact ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-xl'
  return expanded
    ? `${size} flex shrink-0 items-center justify-center bg-[#17a2b4] text-white transition-colors touch-manipulation`
    : `${size} flex shrink-0 items-center justify-center bg-[#e6f6f8] text-[#17a2b4] border border-[#bfe6ec]/40 hover:bg-[#d5f3f6]/50 transition-colors touch-manipulation`
}

export function vmsMobileCardClass(expanded = false) {
  return expanded
    ? 'rounded-2xl border border-[#bfe6ec] bg-white p-3 w-full min-w-0 shadow-sm'
    : 'rounded-2xl border border-slate-200/80 bg-white p-3 w-full min-w-0 shadow-sm hover:border-slate-300 transition-colors'
}

export function vmsPaginationBarClass() {
  return 'mt-0 border-t border-slate-100 bg-white px-3 py-3 sm:px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm rounded-b-2xl'
}

export function vmsPaginationBtnClass(active = false) {
  return active
    ? 'h-9 w-9 inline-flex items-center justify-center rounded-xl text-xs font-semibold bg-[#17a2b4] text-white'
    : 'h-9 w-9 inline-flex items-center justify-center rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors'
}

export function vmsVendorRowClass(selected = false) {
  return selected
    ? 'cursor-pointer bg-[#e6f6f8]/70 ring-1 ring-inset ring-[#bfe6ec]/50 transition-colors'
    : 'cursor-pointer hover:bg-slate-50 transition-colors'
}

export function vmsVendorMobileCardClass(selected = false) {
  return selected
    ? 'w-full text-left rounded-2xl border border-[#bfe6ec] bg-[#e6f6f8]/50 p-3 shadow-sm touch-manipulation min-w-0'
    : 'w-full text-left rounded-2xl border border-slate-200/80 bg-white p-3 hover:border-[#bfe6ec] hover:shadow-sm transition-all touch-manipulation min-w-0'
}

export function vmsAccordionShellClass() {
  return 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)]'
}

export function vmsWorkflowStepClass() {
  return 'relative flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5'
}

export function vmsHeaderShellClass() {
  return 'p2p-header mb-3 sm:mb-4 relative overflow-hidden rounded-2xl border border-white/70 bg-white/95 px-3 py-4 sm:px-6 sm:py-6 min-h-[100px] sm:min-h-[118px] shadow-[0_10px_30px_rgba(20,90,120,0.08)]'
}

export function vmsAvatarClass() {
  return 'h-11 w-11 rounded-xl bg-[#17a2b4] flex items-center justify-center text-white text-sm font-semibold'
}

export function vmsRoleAccentClass() {
  return 'font-semibold text-[#17a2b4]'
}

export function vmsBrandTextClass() {
  return 'text-[#17a2b4]'
}

export function vmsBrandTextMutedClass() {
  return 'text-[#17a2b4]/80'
}

export function vmsBrandIconWrapClass() {
  return 'inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#e6f6f8] text-[#17a2b4]'
}

export function vmsBrandProgressBarClass() {
  return 'h-full rounded-full bg-[#17a2b4]'
}

export function vmsChartPanelClass() {
  return vmsSectionShellClass()
}

export function vmsBrandKpiAccent() {
  return {
    borderClass: 'border border-slate-200/80',
    washClass: '',
    radialWash: '',
    iconBg: 'bg-[#e6f6f8]',
    iconColor: 'text-[#17a2b4]',
    iconGradient: 'from-[#17a2b4] to-[#0f6b7a]',
    valueClass: 'text-[#0F172A]',
    watermarkColor: 'text-[#17a2b4]',
  }
}

export function vmsBrandKpiAccentLight() {
  return {
    borderClass: 'border border-slate-200/80',
    washClass: '',
    radialWash: '',
    iconBg: 'bg-[#e6f6f8]',
    iconColor: 'text-[#17a2b4]',
    iconGradient: 'from-[#bfe6ec] to-[#17a2b4]',
    valueClass: 'text-[#0F172A]',
    watermarkColor: 'text-[#17a2b4]',
  }
}

export function vmsKpiCardClass(selected = false) {
  return `p2p-kpi p2p-kpi--brand ${selected ? 'is-selected' : ''}`
}
