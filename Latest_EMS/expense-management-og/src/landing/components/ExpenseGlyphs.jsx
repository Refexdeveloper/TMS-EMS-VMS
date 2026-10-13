const strokeProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
}

function FoodGlyph() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path {...strokeProps} d="M5 15.5a7 7 0 0 1 14 0" />
            <path {...strokeProps} d="M3 15.5h18" />
            <path {...strokeProps} d="M6.5 18.5h11" />
            <path {...strokeProps} d="M12 8.5V7" />
            <circle cx="12" cy="6" r="1.1" fill="currentColor" />
            <path {...strokeProps} strokeWidth={1.4} opacity="0.75" d="M8.4 12.6a4 4 0 0 1 2.4-2.1" />
        </svg>
    )
}

function ConveyanceGlyph() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path {...strokeProps} d="M5.2 11 6.8 6.9A2 2 0 0 1 8.7 5.6h6.6a2 2 0 0 1 1.9 1.3l1.6 4.1" />
            <rect {...strokeProps} x="3.5" y="11" width="17" height="6" rx="2" />
            <path {...strokeProps} d="M6.5 17v2M17.5 17v2" />
            <circle cx="7.6" cy="14" r="1.1" fill="currentColor" />
            <circle cx="16.4" cy="14" r="1.1" fill="currentColor" />
            <path {...strokeProps} strokeWidth={1.4} d="M10.5 14h3" />
        </svg>
    )
}

function DailyAllowanceGlyph() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect {...strokeProps} x="4" y="5.5" width="16" height="14.5" rx="2.5" />
            <path {...strokeProps} d="M4 9.8h16M8.5 3.8v3.4M15.5 3.8v3.4" />
            <path {...strokeProps} strokeWidth={1.6} d="M9.8 12.3h4.6M9.8 14.3h4.6M11 12.3c2.3 0 2.3 4 0 4h-1.1l3.2 2.3" />
        </svg>
    )
}

function GenericExpenseGlyph() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path {...strokeProps} d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" />
            <path {...strokeProps} d="M9 8h6M9 11.5h6M9 15h3.5" />
        </svg>
    )
}

const GLYPHS = {
    'Food Claim': FoodGlyph,
    'Local Conveyance': ConveyanceGlyph,
    'Daily Allowance': DailyAllowanceGlyph,
}

export function ExpenseTypeGlyph({ type }) {
    const Glyph = GLYPHS[type] || GenericExpenseGlyph
    return <Glyph />
}

export function ExpenseHeroArt() {
    return (
        <svg className="expense-hero-illustration" viewBox="0 0 96 80" aria-hidden="true">
            <defs>
                <linearGradient id="expHeroReceipt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
                    <stop offset="100%" stopColor="#e6f3fc" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="expHeroCoin" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFE08A" />
                    <stop offset="100%" stopColor="#F5A524" />
                </linearGradient>
            </defs>
            <g transform="rotate(-7 38 40)">
                <path
                    d="M20 8h36a4 4 0 0 1 4 4v58l-5-3.2-5 3.2-5-3.2-5 3.2-5-3.2-5 3.2-5-3.2-5 3.2V12a4 4 0 0 1 4-4z"
                    fill="url(#expHeroReceipt)"
                />
                <rect x="24" y="17" width="20" height="4" rx="2" fill="#2f87c8" opacity="0.85" />
                <rect x="24" y="28" width="28" height="3" rx="1.5" fill="#9cc8e8" />
                <rect x="24" y="36" width="22" height="3" rx="1.5" fill="#9cc8e8" />
                <rect x="24" y="44" width="26" height="3" rx="1.5" fill="#9cc8e8" />
                <path d="M24 55h28" stroke="#9cc8e8" strokeWidth="1.4" strokeDasharray="3 3" />
            </g>
            <circle cx="70" cy="54" r="15" fill="url(#expHeroCoin)" stroke="#fff" strokeWidth="2.5" />
            <path
                d="M64.5 47.5h11M64.5 51.5h11M67 47.5c5 0 5 8.2 0 8.2h-2.4l7 5.8"
                fill="none"
                stroke="#8A4B08"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M84 16l1.6 3.4 3.4 1.6-3.4 1.6L84 26l-1.6-3.4-3.4-1.6 3.4-1.6z" fill="#fff" opacity="0.9" />
            <circle cx="10" cy="60" r="2.2" fill="#fff" opacity="0.7" />
        </svg>
    )
}
