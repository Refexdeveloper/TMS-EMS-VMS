/** Table export — same CSV + BOM download path as Reference_project. */

function csvEscape(value) {
    const s = value == null || value === '—' ? '' : String(value)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
}

function sanitizeFilename(name) {
    return (
        String(name || 'records')
            .replace(/[<>:"/\\|?*]+/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80) || 'records'
    )
}

function todayStamp() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function formatSlaExport(deadlineAtMs, deadlineLabel) {
    const when = deadlineLabel && deadlineLabel !== '—' ? String(deadlineLabel) : ''
    if (deadlineAtMs == null || !Number.isFinite(deadlineAtMs)) return when
    const now = Date.now()
    const breached = now > deadlineAtMs
    const totalSec = Math.floor(Math.abs(deadlineAtMs - now) / 1000)
    const days = Math.floor(totalSec / 86400)
    const hours = Math.floor((totalSec % 86400) / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    const seconds = totalSec % 60
    let dur = `${seconds} sec`
    if (days > 0) dur = `${days}d ${hours}h`
    else if (hours > 0) dur = `${hours}h ${minutes}m`
    else if (minutes > 0) dur = `${minutes}m ${seconds}s`
    const status = breached ? `Breached (+${dur})` : `${dur} left`
    return when ? `${when} · ${status}` : status
}

export function downloadRecordsCsv({ filenameBase, headers, rows }) {
    const cols = Array.isArray(headers) ? headers : []
    const lines = [cols.map(csvEscape).join(',')]
    for (const row of Array.isArray(rows) ? rows : []) {
        lines.push(cols.map((h) => csvEscape(row?.[h] ?? '')).join(','))
    }
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' })
    downloadBlob(`${sanitizeFilename(filenameBase)}-${todayStamp()}.csv`, blob)
}

export function buildProcessCsv(processKey, entries, formatAmount = (v) => v) {
    const list = Array.isArray(entries) ? entries : []
    if (processKey === 'expenseClaims') {
        return {
            filenameBase: 'expense-claims',
            headers: ['Expense ID', 'Requested Date', 'Expense Type', 'Requestor', 'Amount', 'Current Step', 'SLA'],
            rows: list.map((e) => ({
                'Expense ID': e.id || e.expenseId || '',
                'Requested Date': e.date || e.requestDateStr || '',
                'Expense Type': e.category || e.expenseType || '',
                Requestor: e.employee || e.requestorText || '',
                Amount: formatAmount(e.amount ?? e.totalAmount),
                'Current Step': e.currentStep || '',
                SLA: formatSlaExport(e.deadlineAtMs, e.deadlineText || e.deadline),
            })),
        }
    }
    return { filenameBase: 'records', headers: [], rows: [] }
}
