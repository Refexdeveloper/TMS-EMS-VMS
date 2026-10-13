import { recentActivity } from '../../mocks/dashboard.js'

const statusConfig = {
    pending: { dot: '#F59E21', bg: 'rgba(245,158,33,0.12)', glow: 'rgba(245,158,33,0.5)' },
    approved: { dot: '#7dc244', bg: 'rgba(125,194,68,0.12)', glow: 'rgba(125,194,68,0.5)' },
    rejected: { dot: '#ee6a31', bg: 'rgba(238,106,49,0.12)', glow: 'rgba(238,106,49,0.5)' },
}

const avatarGradients = {
    AM: ['#2879b6', '#1D9AD4'],
    PS: ['#235EAC', '#2879b6'],
    RN: ['#ee6a31', '#F59E21'],
    SK: ['#235EAC', '#1D9AD4'],
    VP: ['#139B49', '#7dc244'],
    DM: ['#58595B', '#333842'],
}

const typeIcons = {
    expense: { icon: 'ri-receipt-line', color: '#ee6a31' },
    travel: { icon: 'ri-flight-takeoff-line', color: '#2879b6' },
}

export default function RecentActivity() {
    return (
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f0f0f0', boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-800">Recent Activity</h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(135deg, #2879b6, #7dc244)' }}>
                        {recentActivity.length}
                    </span>
                </div>
                <span className="text-xs font-medium cursor-pointer hover:underline" style={{ color: '#2879b6' }}>View all</span>
            </div>

            <div className="space-y-2">
                {recentActivity.map((item, idx) => {
                    const grads = avatarGradients[item.avatar] || ['#58595B', '#333842']
                    const sc = statusConfig[item.status] || statusConfig.pending
                    const ti = typeIcons[item.type] || typeIcons.expense
                    return (
                        <div
                            key={item.id}
                            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all card-lift card-brand-glow animate-fade-in-up"
                            style={{
                                border: '1px solid #f5f5f5',
                                background: 'linear-gradient(135deg, #fafafa, #ffffff)',
                                animationDelay: `${idx * 60}ms`,
                                '--glow-color': sc.glow,
                            }}
                        >
                            <div className="relative flex-shrink-0">
                                <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold card-icon"
                                    style={{ background: `linear-gradient(135deg, ${grads[0]}, ${grads[1]})` }}
                                >
                                    {item.avatar}
                                </div>
                                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white" style={{ background: sc.dot }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-800 leading-snug">
                                    <span className="font-semibold">{item.user}</span> <span className="text-gray-500">{item.action}</span>
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-3 h-3 flex items-center justify-center" style={{ color: ti.color }}>
                                        <i className={`${ti.icon} text-[10px]`} />
                                    </div>
                                    <p className="text-xs text-gray-400">{item.time}</p>
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: sc.bg, color: sc.dot }}>
                                    {item.amount}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
