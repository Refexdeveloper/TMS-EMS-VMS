import { useState, useMemo, useRef, useEffect } from 'react'
import CurrentStepBadges from './CurrentStepBadges.jsx'
import SlaCell from './SlaCell.jsx'
import RecordsExportMenu from './RecordsExportMenu.jsx'
import { buildProcessCsv, downloadRecordsCsv } from '../../lib/exportRecordsCsv.js'
import { ExpenseTypeGlyph } from './ExpenseGlyphs.jsx'
import { customPendingRequestsIcon } from '../../../../raghul_icons/index.js'
import {
    expenseHeroIcon,
    expenseFoodClaimIcon,
    expenseLocalConveyanceIcon,
    expenseDailyAllowanceIcon,
} from '../../../../expense_icons/index.js'

function normalizeTypeKey(typeName) {
    const t = String(typeName || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
    if (!t) return ''
    if (t.includes('food')) return 'food'
    if (t.includes('local') || t.includes('conveyance') || t.includes('taxi') || t.includes('cab')) return 'local'
    if (t.includes('daily') || t.includes('allowance') || t.includes('per diem') || t.includes('perdiem')) return 'allowance'
    return ''
}

function rowMatchesType(expense, typeName) {
    const key = normalizeTypeKey(typeName)
    if (!key) return false
    if (key === 'food') return Boolean(expense?.hasFoodType)
    if (key === 'local') return Boolean(expense?.hasLocalType)
    if (key === 'allowance') return Boolean(expense?.hasAllowanceType)
    const cats = Array.isArray(expense?.categories) ? expense.categories : [expense?.category]
    return cats.some((c) => normalizeTypeKey(c) === key)
}

const categoryStyles = {
    'Daily Allowance': { icon: 'ri-sun-line', colorFrom: '#FB8C00', colorTo: '#FFB74D', text: '#FB8C00', bg: 'rgba(251,140,0,0.1)' },
    'Food Claim': { icon: 'ri-restaurant-2-line', colorFrom: '#43A047', colorTo: '#66BB6A', text: '#43A047', bg: 'rgba(67,160,71,0.1)' },
    'Local Conveyance': { icon: 'ri-taxi-line', colorFrom: '#1E88E5', colorTo: '#42A5F5', text: '#1E88E5', bg: 'rgba(30,136,229,0.1)' },
}

const DEFAULT_STYLE = {
    icon: 'ri-file-list-3-line',
    colorFrom: '#1E88E5',
    colorTo: '#42A5F5',
    text: '#1E88E5',
    bg: 'rgba(30,136,229,0.1)',
}

const TAB_CONFIGS = [
    { key: 'all', label: 'All Claims', short: 'All', icon: expenseHeroIcon, color: '#1E88E5', glow: 'rgba(30,136,229,0.45)' },
    { key: 'Food Claim', label: 'Food Claim', short: 'Food', icon: expenseFoodClaimIcon, color: '#43A047', glow: 'rgba(67,160,71,0.45)' },
    { key: 'Local Conveyance', label: 'Local Conveyance', short: 'Local', icon: expenseLocalConveyanceIcon, color: '#1E88E5', glow: 'rgba(30,136,229,0.45)' },
    { key: 'Daily Allowance', label: 'Daily Allowance', short: 'Allowance', icon: expenseDailyAllowanceIcon, color: '#FB8C00', glow: 'rgba(251,140,0,0.45)' },
]

function formatINR(amount) {
    const num = typeof amount === 'number' ? amount : Number(String(amount || 0).replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0
    return `\u20B9${Math.round(num).toLocaleString('en-IN')}`
}

function getExpenseRowView(expense) {
    const typeLabel = Array.isArray(expense?.categories) && expense.categories.length
        ? expense.categories[0]
        : expense?.category
    const cfg = categoryStyles[typeLabel] || DEFAULT_STYLE
    const employeeName = expense?.employee || 'User'
    const initials = employeeName
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    return { typeLabel, cfg, employeeName, initials }
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

function RowSelectBox({ id, checked, onToggle, label }) {
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

function ExpenseRecordCard({ expense, tableAccent, onOpen, selected = false, selectSlot = null }) {
    const { typeLabel, cfg, employeeName, initials } = getExpenseRowView(expense)

    return (
        <div
            className={`expense-record-card${selected ? ' is-selected' : ''}`}
            style={{ '--type-accent': cfg.colorFrom }}
        >
            {selectSlot ? <div className="expense-record-card-select">{selectSlot}</div> : null}
            <button type="button" className="expense-record-card-body" onClick={() => onOpen?.(expense)}>
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="min-w-0 flex-1">
                    <span className="record-id-badge inline-block max-w-full truncate" title={expense.id}>
                        {expense.id}
                    </span>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                        <div className="record-type-icon" style={{ '--type-accent': cfg.colorFrom }}>
                            <ExpenseTypeGlyph type={typeLabel} />
                        </div>
                        <p className="truncate text-sm font-semibold text-slate-800">
                            {expense.category || '—'}
                        </p>
                    </div>
                </div>
                <span className="record-amount shrink-0 pt-0.5">{formatINR(expense.amount)}</span>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px]">
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm"
                        style={{ background: 'linear-gradient(135deg, #1E88E5, #42A5F5)' }}
                    >
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <span className="block text-[10px] uppercase tracking-wide text-slate-400">Requestor</span>
                        <span className="block truncate font-medium text-slate-700">{employeeName}</span>
                    </div>
                </div>
                <MobileField label="Requested">
                    {expense.date || '—'}
                </MobileField>
                <MobileField label="Current step" stacked>
                    <CurrentStepBadges
                        text={expense.currentStep || 'Manager Approval'}
                        size="sm"
                        accent={tableAccent}
                    />
                </MobileField>
                <MobileField label="SLA" stacked>
                    <SlaCell
                        deadlineAtMs={expense.deadlineAtMs}
                        deadlineLabel={expense.deadline}
                        size="sm"
                    />
                </MobileField>
            </div>
            </button>
        </div>
    )
}

function compareByDeadlineThenLatest(a, b) {
    const now = Date.now()
    const rawA = a?.deadlineAtMs > 0 ? a.deadlineAtMs : 0
    const rawB = b?.deadlineAtMs > 0 ? b.deadlineAtMs : 0
    const breachedA = rawA > 0 && rawA < now
    const breachedB = rawB > 0 && rawB < now

    if (breachedA !== breachedB) {
        return breachedA ? 1 : -1
    }
    if (breachedA && breachedB) {
        return (b?.listSortMs || 0) - (a?.listSortMs || 0)
    }
    const na = rawA > 0 ? rawA : Number.POSITIVE_INFINITY
    const nb = rawB > 0 ? rawB : Number.POSITIVE_INFINITY
    if (na !== nb) return na - nb
    return (b?.listSortMs || 0) - (a?.listSortMs || 0)
}

export default function ExpenseTable({
    searchQuery = '',
    setSearchQuery,
    categoryFilter = 'all',
    setCategoryFilter,
    activeTypeFilter,
    setActiveTypeFilter,
    expenseRoleCopy,
    expenseList = [],
    statusFilter = null,
    insightPulse = false,
    onClearInsight,
    onRowClick,
}) {
    const [currentPage, setCurrentPage] = useState(1)
    const [slaFilter, setSlaFilter] = useState('all') // 'all' | 'nearing' | 'breached'
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [selectedRowIds, setSelectedRowIds] = useState(() => new Set())
    const [exportingCsv, setExportingCsv] = useState(false)
    const dropdownRef = useRef(null)
    const pageSize = 8

    useEffect(() => {
        setCurrentPage(1)
        setSelectedRowIds(new Set())
    }, [statusFilter, categoryFilter, slaFilter, searchQuery])

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Calculate count per category for tabs
    const tabCounts = useMemo(() => {
        const counts = { all: expenseList.length }
        TAB_CONFIGS.forEach((t) => {
            if (t.key !== 'all') {
                counts[t.key] = expenseList.filter((e) => rowMatchesType(e, t.key)).length
            }
        })
        return counts
    }, [expenseList])

    // Current active category key
    const activeKey = categoryFilter || 'all'
    const currentTab = TAB_CONFIGS.find((t) => t.key === activeKey) || TAB_CONFIGS[0]
    const tableAccent = currentTab.color || '#1E88E5'

    // Filtering logic
    const filteredRows = useMemo(() => {
        const now = Date.now()
        return expenseList.filter((e) => {
            // Search query filter
            const matchSearch =
                !searchQuery ||
                e.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                e.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                e.employee?.toLowerCase().includes(searchQuery.toLowerCase())

            // Category filter
            const matchCat =
                !categoryFilter ||
                categoryFilter === 'all' ||
                rowMatchesType(e, categoryFilter)

            // SLA filter
            let matchSla = true
            if (slaFilter === 'breached') {
                matchSla = e.deadlineAtMs > 0 && e.deadlineAtMs < now
            } else if (slaFilter === 'nearing') {
                const diff = (e.deadlineAtMs || 0) - now
                matchSla = diff > 0 && diff < 48 * 3600 * 1000
            }

            // Status filter from KPI cards
            const matchStatus = !statusFilter || e.status === statusFilter

            return matchSearch && matchCat && matchSla && matchStatus
        })
    }, [expenseList, searchQuery, categoryFilter, slaFilter, statusFilter])

    const sortedRows = useMemo(() => {
        return [...filteredRows].sort(compareByDeadlineThenLatest)
    }, [filteredRows])

    const totalPages = Math.ceil(sortedRows.length / pageSize) || 1
    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize
        return sortedRows.slice(start, start + pageSize)
    }, [sortedRows, currentPage, pageSize])

    const handleTabChange = (key) => {
        if (setCategoryFilter) setCategoryFilter(key)
        if (setActiveTypeFilter) setActiveTypeFilter(key === 'all' ? null : key)
        setCurrentPage(1)
        setSelectedRowIds(new Set())
    }

    const resolveRowId = (expense, idx = 0) => String(expense?.id || expense?._id || `expense-${idx}`)
    const pageRowIds = paginatedRows.map((expense, idx) => resolveRowId(expense, idx)).filter(Boolean)
    const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedRowIds.has(id))
    const showRowSelect = sortedRows.length > 0

    const toggleRowSelection = (id) => {
        if (!id) return
        setSelectedRowIds((previous) => {
            const next = new Set(previous)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAllOnPage = (checked) => {
        setSelectedRowIds((previous) => {
            const next = new Set(previous)
            pageRowIds.forEach((id) => {
                if (checked) next.add(id)
                else next.delete(id)
            })
            return next
        })
    }

    const handleExportCsv = () => {
        if (exportingCsv) return
        const chosen = selectedRowIds.size
            ? sortedRows.filter((expense) => selectedRowIds.has(resolveRowId(expense)))
            : sortedRows
        if (!chosen.length) return
        setExportingCsv(true)
        try {
            const payload = buildProcessCsv('expenseClaims', chosen, formatINR)
            downloadRecordsCsv(payload)
        } catch (error) {
            console.warn('CSV export failed', error)
        } finally {
            setExportingCsv(false)
        }
    }

    const hasActiveFilters = Boolean(searchQuery || (categoryFilter && categoryFilter !== 'all') || slaFilter !== 'all' || statusFilter)

    const clearAllFilters = () => {
        if (setSearchQuery) setSearchQuery('')
        if (setCategoryFilter) setCategoryFilter('all')
        if (setActiveTypeFilter) setActiveTypeFilter(null)
        setSlaFilter('all')
        onClearInsight?.()
        setCurrentPage(1)
        setSelectedRowIds(new Set())
    }

    const titleText = expenseRoleCopy?.pendingListTitle || 'Pending Requests'

    return (
        <div
            className={`records-panel overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(76,98,168,0.12)] sm:rounded-2xl lg:rounded-3xl${insightPulse ? ' is-insight-pulse' : ''}`}
            style={{ '--records-accent': tableAccent }}
        >
            {/* ─── Header: 3D Icon, Title, and Process Tabs ────────────────────────── */}
            <div className="records-header flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-[#EEF4FF] px-3.5 py-3.5 sm:px-5 sm:py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="records-title-icon flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white sm:h-12 sm:w-12">
                            <img src={customPendingRequestsIcon} alt="" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[15px] font-bold text-slate-900 sm:text-base leading-tight">
                                {titleText}
                            </h3>
                            <p className="text-[11px] text-slate-500 sm:text-xs mt-0.5">
                                {hasActiveFilters
                                    ? `Showing filtered claims (${sortedRows.length} total)`
                                    : 'Team claims waiting for review · all expense categories'}
                            </p>
                        </div>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                className="records-insight-clear btn-press"
                                onClick={clearAllFilters}
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                </div>

                {/* ─── Process Category Tabs ────────────────────────────────────────── */}
                <div className="w-full overflow-x-auto hide-scrollbar">
                    <div className="records-process-tabs inline-flex w-full min-w-max items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/95 p-1 shadow-sm sm:rounded-xl">
                        {TAB_CONFIGS.map((tab) => {
                            const isActive = activeKey === tab.key
                            const count = tabCounts[tab.key] ?? 0
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => handleTabChange(tab.key)}
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
                                    <span className="ml-1 opacity-80 text-[10px]">({count})</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* ─── Toolbar: Search, Category Dropdown, and SLA status chips ────────── */}
            <div className="p-3.5 sm:p-4 lg:p-5">
                {selectedRowIds.size > 0 ? (
                    <div className="draft-bulk-toolbar mb-3" role="status">
                        <div className="draft-selection-count">
                            <span className="draft-selection-icon" aria-hidden="true">
                                <i className="ri-checkbox-multiple-line" />
                            </span>
                            <span>
                                <strong>{selectedRowIds.size}</strong> selected
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="draft-clear-button"
                                onClick={() => setSelectedRowIds(new Set())}
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
                        </div>
                    </div>
                ) : null}
                <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between flex-wrap">
                    {/* Search bar */}
                    <div className="flex items-center gap-2 rounded-xl sm:rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2 sm:py-2.5 shadow-sm focus-within:border-[#1E88E5] focus-within:ring-2 focus-within:ring-[#1E88E5]/20 flex-1 min-w-[220px]">
                        <i className="ri-search-line text-base text-slate-400 sm:text-sm" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                if (setSearchQuery) setSearchQuery(e.target.value)
                                setCurrentPage(1)
                            }}
                            placeholder="Search by ID, requestor, or description..."
                            className="w-full bg-transparent text-xs sm:text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (setSearchQuery) setSearchQuery('')
                                    setCurrentPage(1)
                                }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <i className="ri-close-circle-fill text-sm" />
                            </button>
                        )}
                    </div>

                    {/* Filter controls: Custom Dropdown & SLA Pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Custom Dropdown */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen((prev) => !prev)}
                                className="custom-dropdown-btn btn-press"
                            >
                                <i className="ri-filter-3-line text-[#1E88E5]" />
                                <span>{activeKey === 'all' ? 'All Types' : activeKey}</span>
                                <i className={`ri-arrow-down-s-line transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <div className="custom-dropdown-menu">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleTabChange('all')
                                            setIsDropdownOpen(false)
                                        }}
                                        className={`custom-dropdown-item ${activeKey === 'all' ? 'is-selected' : ''}`}
                                    >
                                        <i className="ri-list-check text-slate-400" />
                                        <span className="flex-1">All Types</span>
                                        {activeKey === 'all' && <i className="ri-check-line text-[#1E88E5] font-bold" />}
                                    </button>
                                    {TAB_CONFIGS.filter((t) => t.key !== 'all').map((cfg) => (
                                        <button
                                            key={cfg.key}
                                            type="button"
                                            onClick={() => {
                                                handleTabChange(cfg.key)
                                                setIsDropdownOpen(false)
                                            }}
                                            className={`custom-dropdown-item ${activeKey === cfg.key ? 'is-selected' : ''}`}
                                        >
                                            <span
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ background: cfg.color }}
                                            />
                                            <span className="flex-1">{cfg.label}</span>
                                            {activeKey === cfg.key && <i className="ri-check-line text-[#1E88E5] font-bold" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* SLA status chips */}
                        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
                            <button
                                type="button"
                                onClick={() => {
                                    setSlaFilter('all')
                                    setCurrentPage(1)
                                }}
                                className={`records-status-chip ${slaFilter === 'all' ? 'is-active' : ''}`}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSlaFilter('nearing')
                                    setCurrentPage(1)
                                }}
                                className={`records-status-chip ${slaFilter === 'nearing' ? 'is-active' : ''}`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Nearing SLA
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSlaFilter('breached')
                                    setCurrentPage(1)
                                }}
                                className={`records-status-chip ${slaFilter === 'breached' ? 'is-active' : ''}`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                Breached
                            </button>
                        </div>
                        <RecordsExportMenu
                            exporting={exportingCsv}
                            selectedCount={selectedRowIds.size}
                            totalCount={sortedRows.length}
                            onExportCsv={handleExportCsv}
                        />
                    </div>
                </div>

                {/* Desktop table · mobile cards (same split as ProjectDashboardPage) */}
                {paginatedRows.length === 0 ? (
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-12 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-sm sm:h-14 sm:w-14">
                            <i className="ri-inbox-2-line text-xl text-slate-400 sm:text-2xl" />
                        </div>
                        <p className="text-sm font-semibold text-slate-800">No matching expense claims</p>
                        <p className="mt-1 text-xs text-slate-500">
                            Try adjusting your search criteria or clearing filters.
                        </p>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearAllFilters}
                                className="mt-3 text-xs font-bold text-[#1E88E5] hover:underline"
                            >
                                Reset all filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                <div
                    className="records-desktop-table overflow-x-auto overflow-y-auto rounded-xl border border-slate-200/90 shadow-sm"
                    style={{ maxHeight: 5 * 52 + 52 }}
                >
                    <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 980 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                                {showRowSelect ? (
                                    <th className="draft-select-cell">
                                        <input
                                            type="checkbox"
                                            className="draft-checkbox"
                                            aria-label="Select all rows on this page"
                                            checked={allPageSelected}
                                            onChange={(event) => toggleAllOnPage(event.target.checked)}
                                        />
                                    </th>
                                ) : null}
                                {[
                                    { label: 'Expense ID', align: 'left' },
                                    { label: 'Requested Date', align: 'left' },
                                    { label: 'Expense Type', align: 'left' },
                                    { label: 'Requestor', align: 'left' },
                                    { label: 'Amount', align: 'right' },
                                    { label: 'Current Step', align: 'left' },
                                    { label: 'SLA', align: 'left' },
                                ].map((h) => (
                                    <th
                                        key={h.label}
                                        className="text-[10px] sm:text-xs font-semibold text-[#475569] uppercase tracking-wider whitespace-nowrap px-3.5 py-2.5"
                                        style={{
                                            textAlign: h.align,
                                            background: 'rgba(248, 250, 252, 0.95)',
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 2,
                                        }}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                                {paginatedRows.map((expense, idx) => {
                                    const { typeLabel, cfg, employeeName, initials } = getExpenseRowView(expense)
                                    const rowId = resolveRowId(expense, idx)
                                    const isSelected = selectedRowIds.has(rowId)

                                    return (
                                        <tr
                                            key={expense.id || idx}
                                            onClick={() => onRowClick?.(expense)}
                                            className={`records-data-row cursor-pointer ${isSelected ? 'is-selected' : ''}`}
                                        >
                                            {showRowSelect ? (
                                                <td className="draft-select-cell">
                                                    <RowSelectBox
                                                        id={rowId}
                                                        checked={isSelected}
                                                        onToggle={toggleRowSelection}
                                                        label={`Select ${expense.id || rowId}`}
                                                    />
                                                </td>
                                            ) : null}
                                            {/* Expense ID */}
                                            <td className="px-3.5 py-2.5 align-middle">
                                                <span
                                                    className="record-id-badge inline-block max-w-[130px] truncate align-middle"
                                                    title={expense.id}
                                                >
                                                    {expense.id}
                                                </span>
                                            </td>

                                            {/* Requested Date */}
                                            <td className="px-3.5 py-2.5 align-middle text-[11px] sm:text-xs text-slate-500 whitespace-nowrap">
                                                {expense.date || '—'}
                                            </td>

                                            {/* Expense Type */}
                                            <td className="px-3.5 py-2.5 align-middle">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div
                                                        className="record-type-icon"
                                                        style={{ '--type-accent': cfg.colorFrom }}
                                                    >
                                                        <ExpenseTypeGlyph type={typeLabel} />
                                                    </div>
                                                    <span className="record-type-label truncate min-w-0">
                                                        {expense.category || '—'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Requestor */}
                                            <td className="px-3.5 py-2.5 align-middle max-w-[160px]">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white shadow-sm"
                                                        style={{
                                                            background: 'linear-gradient(135deg, #1E88E5, #42A5F5)',
                                                        }}
                                                    >
                                                        {initials}
                                                    </div>
                                                    <span
                                                        className="text-[11px] sm:text-xs font-semibold text-slate-700 truncate block"
                                                        title={employeeName}
                                                    >
                                                        {employeeName}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Amount */}
                                            <td className="px-3.5 py-2.5 align-middle text-right whitespace-nowrap">
                                                <span className="record-amount">
                                                    {formatINR(expense.amount)}
                                                </span>
                                            </td>

                                            {/* Current Step */}
                                            <td className="px-3.5 py-2.5 align-top max-w-[180px]">
                                                <CurrentStepBadges
                                                    text={expense.currentStep || 'Manager Approval'}
                                                    size="sm"
                                                    accent={tableAccent}
                                                />
                                            </td>

                                            {/* SLA */}
                                            <td className="px-3.5 py-2.5 align-top">
                                                <SlaCell
                                                    deadlineAtMs={expense.deadlineAtMs}
                                                    deadlineLabel={expense.deadline}
                                                    size="sm"
                                                />
                                            </td>
                                        </tr>
                                    )
                                })}
                        </tbody>
                    </table>
                </div>

                <div className="records-mobile-cards space-y-2.5">
                    {paginatedRows.map((expense, idx) => {
                        const rowId = resolveRowId(expense, idx)
                        const isSelected = selectedRowIds.has(rowId)
                        return (
                        <ExpenseRecordCard
                            key={expense.id || idx}
                            expense={expense}
                            tableAccent={tableAccent}
                            selected={isSelected}
                            selectSlot={
                                showRowSelect ? (
                                    <RowSelectBox
                                        id={rowId}
                                        checked={isSelected}
                                        onToggle={toggleRowSelection}
                                        label={`Select ${expense.id || rowId}`}
                                    />
                                ) : null
                            }
                            onOpen={onRowClick}
                        />
                        )
                    })}
                </div>
                    </>
                )}

                {/* ─── Pagination ──────────────────────────────────────────────────── */}
                {sortedRows.length > 0 && (
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className="text-[11px] sm:text-xs text-slate-500">
                            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedRows.length)} of {sortedRows.length}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="btn-press flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-600 disabled:opacity-40 cursor-pointer"
                            >
                                <i className="ri-arrow-left-s-line" />
                            </button>
                            <span className="px-2 text-[11px] sm:text-xs text-slate-600 font-semibold">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="btn-press flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-600 disabled:opacity-40 cursor-pointer"
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
