import { useState, useEffect } from 'react'

function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'string') {
        const parsed = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''))
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function normalizeTypeKey(typeName) {
    const t = String(typeName || '').trim().toLowerCase()
    if (!t) return ''
    if (t.includes('food')) return 'food'
    if (t.includes('local') || t.includes('conveyance')) return 'local'
    if (t.includes('daily') || t.includes('allowance')) return 'allowance'
    return ''
}

function formatINR(amount) {
    return `\u20B9${Math.round(toNumber(amount)).toLocaleString('en-IN')}`
}

export default function ExpenseTypeCard({
    type,
    approvedLabel = 'Approved',
    icon,
    iconSrc,
    colorFrom,
    colorTo,
    borderColor = 'rgba(15, 23, 42, 0.12)',
    shadow,
    glowColor,
    bgAccent,
    textColor,
    titleColor,
    descColor = 'rgba(15, 23, 42, 0.5)',
    iconBg,
    iconColor,
    accentVar,
    description,
    policyLabel,
    monthlyLimit,
    usedAmount,
    policyNote,
    animDelay = 0,
    isActive,
    onSelect,
    claims = [],
}) {
    const [progressWidth, setProgressWidth] = useState(0)
    const [hovered, setHovered] = useState(false)

    const typeKey = normalizeTypeKey(type)

    const getTypeAmount = (claim) => {
        if (typeKey === 'food' && claim?.foodAmount !== null && claim?.foodAmount !== undefined) return toNumber(claim.foodAmount)
        if (typeKey === 'local' && claim?.localAmount !== null && claim?.localAmount !== undefined) return toNumber(claim.localAmount)
        if (typeKey === 'allowance' && claim?.allowanceAmount !== null && claim?.allowanceAmount !== undefined) {
            return toNumber(claim.allowanceAmount)
        }
        const typedRaw = claim?.typeAmounts?.[typeKey]
        if (typedRaw !== null && typedRaw !== undefined) return toNumber(typedRaw)
        return 0
    }

    const approvedCount = claims.filter((e) => e.status === 'approved').length
    const pendingCount = claims.filter((e) => e.status === 'pending').length
    const rejectedCount = claims.filter((e) => e.status === 'rejected').length

    const approvedAmount = claims.filter((e) => e.status === 'approved').reduce((s, e) => s + getTypeAmount(e), 0)
    const pendingAmount = claims.filter((e) => e.status === 'pending').reduce((s, e) => s + getTypeAmount(e), 0)
    const rejectedAmount = claims.filter((e) => e.status === 'rejected').reduce((s, e) => s + getTypeAmount(e), 0)

    const totalCount = claims.length
    const totalAmount = totalCount ? approvedAmount + pendingAmount + rejectedAmount : 0
    const pct = Math.round((usedAmount / monthlyLimit) * 100)
    const headingColor = titleColor || textColor
    const chipIconBg =
        iconBg ||
        (typeof textColor === 'string' && textColor.startsWith('#')
            ? `${textColor.length === 7 ? textColor : textColor.slice(0, 7)}26`
            : 'rgba(15, 23, 42, 0.09)')
    const chipIconTint = iconColor || textColor

    useEffect(() => {
        const t = setTimeout(() => setProgressWidth(pct), animDelay + 300)
        return () => clearTimeout(t)
    }, [pct, animDelay])

    const accent = accentVar || iconColor || textColor || '#1E88E5'
    const ringBorder = borderColor || `color-mix(in srgb, ${accent} 20%, transparent)`

    return (
        <div
            className={`expense-type-card animate-fade-in-up${isActive ? ' is-active' : ''}`}
            style={{
                animationDelay: `${animDelay}ms`,
                '--type-accent': accent,
                '--type-border': ringBorder,
            }}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect()
                }
            }}
            role="button"
            tabIndex={0}
        >
            <div className="expense-type-card-inner">
            <div
                className="px-4 py-3.5 sm:px-5 sm:py-4 relative overflow-hidden"
                style={{
                    background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})`,
                    borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
                }}
            >
                <div
                    className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
                    style={{ background: chipIconBg, opacity: 0.35 }}
                />
                <div
                    className="absolute -bottom-4 right-8 w-14 h-14 rounded-full pointer-events-none"
                    style={{ background: chipIconBg, opacity: 0.25 }}
                />

                <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm sm:text-base leading-tight" style={{ color: headingColor }}>
                                {type}
                            </h3>
                            {isActive && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-white/95 text-slate-800 shadow-xs border border-white">
                                    Active
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] sm:text-xs mt-0.5 leading-snug" style={{ color: descColor }}>
                            {description}
                        </p>
                    </div>

                    {/* Icon — PNG/SVG image via expense-type-icon-wrap, fallback to Remix icon */}
                    {iconSrc ? (
                        <div className="expense-type-icon-wrap">
                            <img src={iconSrc} alt="" />
                        </div>
                    ) : (
                        <div
                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: chipIconBg,
                                transition: 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)',
                            }}
                        >
                            <i className={`${icon} text-lg sm:text-xl`} style={{ color: chipIconTint }} />
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom 4-column metrics row */}
            <div
                className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100"
                style={{ background: '#FAFCFF', borderBottom: '1px solid #F1F5F9' }}
            >
                {[
                    { label: 'Total', count: totalCount, amount: totalAmount, color: textColor, bg: bgAccent },
                    { label: approvedLabel, count: approvedCount, amount: approvedAmount, color: '#2e7d32', bg: 'rgba(67, 160, 71, 0.08)' },
                    { label: 'Pending', count: pendingCount, amount: pendingAmount, color: '#b86200', bg: 'rgba(251, 140, 0, 0.08)' },
                    { label: 'Rejected', count: rejectedCount, amount: rejectedAmount, color: '#c62828', bg: 'rgba(229, 57, 53, 0.08)' },
                ].map((s) => (
                    <div key={s.label} className="py-2.5 sm:py-3 text-center px-1">
                        <p className="text-xs sm:text-sm font-bold font-mono tracking-tight leading-tight" style={{ color: s.color }}>
                            {formatINR(s.amount)}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 font-semibold">
                            {s.label}
                        </p>
                        <div
                            className="mt-1 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold font-mono"
                            style={{
                                background: s.bg,
                                color: s.color,
                                border: `1px solid ${s.bg}`,
                            }}
                        >
                            {s.count}
                        </div>
                    </div>
                ))}
            </div>
            </div>
        </div>
    )
}

