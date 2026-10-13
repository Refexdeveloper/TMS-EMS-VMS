export const monthlyTrends = [
    { month: 'Sep', expense: 18200, advance: 4100, travel: 6400 },
    { month: 'Oct', expense: 21400, advance: 5300, travel: 7200 },
    { month: 'Nov', expense: 19800, advance: 3800, travel: 5900 },
    { month: 'Dec', expense: 22600, advance: 6200, travel: 8100 },
    { month: 'Jan', expense: 20300, advance: 4700, travel: 7400 },
    { month: 'Feb', expense: 24580, advance: 7500, travel: 9200 },
]

export const recentActivity = [
    { id: 1, user: 'Arjun Mehta', action: 'submitted an expense claim', amount: '$342.00', time: '2 minutes ago', type: 'expense', status: 'pending', avatar: 'AM' },
    { id: 2, user: 'Priya Sharma', action: 'travel request approved', amount: '$1,240.00', time: '18 minutes ago', type: 'travel', status: 'approved', avatar: 'PS' },
    { id: 3, user: 'Rahul Nair', action: 'expense rejected — missing receipt', amount: '$89.50', time: '1 hour ago', type: 'expense', status: 'rejected', avatar: 'RN' },
    { id: 4, user: 'Sneha Krishnan', action: 'submitted travel request', amount: '$2,100.00', time: '3 hours ago', type: 'travel', status: 'pending', avatar: 'SK' },
    { id: 5, user: 'Vikram Patel', action: 'expense approved', amount: '$560.00', time: '5 hours ago', type: 'expense', status: 'approved', avatar: 'VP' },
    { id: 6, user: 'Divya Menon', action: 'submitted an expense claim', amount: '$215.00', time: 'Yesterday', type: 'expense', status: 'pending', avatar: 'DM' },
]

export const pendingApprovals = [
    { id: 1, user: 'Arjun Mehta', type: 'Expense', description: 'Client dinner — Taj Hotel', amount: '$342.00', date: 'Feb 17, 2026', avatar: 'AM', urgent: true },
    { id: 2, user: 'Sneha Krishnan', type: 'Travel', description: 'Mumbai → Delhi, Mar 2–5', amount: '$2,100.00', date: 'Feb 16, 2026', avatar: 'SK', urgent: false },
    { id: 3, user: 'Rohan Das', type: 'Expense', description: 'Team offsite accommodation', amount: '$890.00', date: 'Feb 15, 2026', avatar: 'RD', urgent: true },
    { id: 4, user: 'Ananya Iyer', type: 'Expense', description: 'Software license renewal', amount: '$450.00', date: 'Feb 14, 2026', avatar: 'AI', urgent: false },
]
