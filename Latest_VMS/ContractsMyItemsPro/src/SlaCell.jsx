/**
 * Two-line SLA cell — deadline datetime on the first line ("16 Jul 2026, 11:27:25 AM"),
 * compact colored pill with severity icon + countdown/overdue duration on the second.
 * Reuses the same pill style tokens as the Status / Current Step badges.
 */
export default function SlaCell({ meta, deadlineDisplay, title, align = 'left', compact = false }) {
  if (!meta) return <span className="text-sm text-slate-500">—</span>
  const dateLine = deadlineDisplay ?? meta.deadlineDisplay ?? ''
  const hasPill = Boolean(meta.label && meta.label !== '—')

  if (!dateLine && !hasPill) return <span className="text-sm text-slate-500">—</span>

  return (
    <div className={`flex flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      {dateLine ? (
        <span className={`whitespace-nowrap font-medium text-slate-600 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {dateLine}
        </span>
      ) : null}
      {hasPill ? (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border whitespace-nowrap ${meta.pill}`}
          title={title}
        >
          {meta.icon ? <span aria-hidden="true">{meta.icon}</span> : null}
          <span>{meta.label}</span>
        </span>
      ) : (
        <span className="text-sm text-slate-500">—</span>
      )}
    </div>
  )
}
