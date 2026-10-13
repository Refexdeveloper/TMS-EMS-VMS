const statusConfig = {
    pending: {
        label: 'Pending',
        bg: 'rgba(251,140,0,0.12)',
        color: '#b86200',
        dot: '#FB8C00',
        icon: 'ri-time-line',
    },
    approved: {
        label: 'Approved',
        bg: 'rgba(67,160,71,0.1)',
        color: '#2e7d32',
        dot: '#43A047',
        icon: 'ri-checkbox-circle-line',
    },
    rejected: {
        label: 'Rejected',
        bg: 'rgba(229,57,53,0.1)',
        color: '#c62828',
        dot: '#E53935',
        icon: 'ri-close-circle-line',
    },
}

export default function StatusBadge({ status, size = 'md' }) {
    const config = statusConfig[String(status || '').toLowerCase()] ?? statusConfig.pending
    const pad = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap text-xs ${pad}`} style={{ background: config.bg, color: config.color }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: config.dot }} />
            {config.label}
        </span>
    )
}
