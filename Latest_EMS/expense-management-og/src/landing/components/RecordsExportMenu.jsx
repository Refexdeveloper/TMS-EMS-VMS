import { useEffect, useRef, useState } from 'react'

export default function RecordsExportMenu({
    disabled = false,
    exporting = false,
    selectedCount = 0,
    totalCount = 0,
    onExportCsv,
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
            if (ref.current && !ref.current.contains(event.target)) setOpen(false)
        }
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [open])

    const canExport = !disabled && !exporting && totalCount > 0

    return (
        <div ref={ref} className="records-export relative shrink-0">
            <button
                type="button"
                disabled={!canExport && !exporting}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen((value) => !value)}
                className="records-export-btn btn-press inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-[#2C3E50] shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9"
            >
                <i className={`ri-download-2-line ${exporting ? 'animate-pulse' : ''}`} aria-hidden />
                {exporting ? 'Exporting…' : 'Export'}
                <i className={`ri-arrow-down-s-line text-sm transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {open ? (
                <div
                    role="menu"
                    className="records-export-menu z-[80] mt-1 w-full min-w-[13.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg sm:absolute sm:right-0"
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false)
                            onExportCsv?.()
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <i className="ri-file-excel-2-line text-base text-[#43A047]" aria-hidden />
                        Excel (CSV)
                        <span className="ml-auto text-[10px] font-medium text-slate-400">
                            {selectedCount > 0 ? `${selectedCount} selected` : `${totalCount} rows`}
                        </span>
                    </button>
                </div>
            ) : null}
        </div>
    )
}
