import React, { useEffect, useMemo, useState } from 'react'
import AOS from 'aos'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import P2pKpiCard, { P2pHeaderFx } from './vms/P2pKpiCard.jsx'
import { vmsSectionShellClass } from './vms/vmsTheme.js'

// PHASE 1 (YOU ARE HERE): basic dashboard only.
// Replace these mocks with your Kissflow vendor/contract data.
const MOCK_VENDORS = [
  { id: 'V-001', name: 'ABC Solutions' },
  { id: 'V-002', name: 'Global Tech' },
  { id: 'V-003', name: 'Eco Logistics' },
  { id: 'V-004', name: 'Delta Services' },
]

const MOCK_CONTRACTS = [
  { id: 'CNT-001', title: 'Network Upgrade', vendor: 'ABC Solutions', status: 'Active', amount: 50000, startDate: '2024-01-15', endDate: '2024-03-30' },
  { id: 'CNT-002', title: 'Cloud Migration', vendor: 'Global Tech', status: 'Active', amount: 90000, startDate: '2024-01-20', endDate: '2024-04-20' },
  { id: 'CNT-003', title: 'Warehouse Digitization', vendor: 'Eco Logistics', status: 'Pending', amount: 30000, startDate: '2024-02-02', endDate: '2024-05-15' },
  { id: 'CNT-004', title: 'Infra Managed Services', vendor: 'ABC Solutions', status: 'Active', amount: 120000, startDate: '2024-02-10', endDate: '2024-08-10' },
  { id: 'CNT-005', title: 'Data Center Support', vendor: 'Delta Services', status: 'Expired', amount: 40000, startDate: '2024-03-01', endDate: '2024-03-31' },
  { id: 'CNT-006', title: 'Security Audit', vendor: 'Global Tech', status: 'Active', amount: 70000, startDate: '2024-03-06', endDate: '2024-06-30' },
  { id: 'CNT-007', title: 'Process Automation', vendor: 'ABC Solutions', status: 'Pending', amount: 50000, startDate: '2024-04-01', endDate: '2024-07-31' },
  { id: 'CNT-008', title: 'Fleet Tracking Setup', vendor: 'Eco Logistics', status: 'Active', amount: 25000, startDate: '2024-04-12', endDate: '2024-08-31' },
]

const PIE_COLORS = ['#17a2b4', '#0f6b7a', '#5fe0e6', '#5cc3cf', '#0b5361', '#bfe6ec']

function money(v) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(v || 0))
}

function toDate(s) {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function quarterOfDate(d) {
  if (!d) return null
  return Math.floor(d.getMonth() / 3) + 1
}

function monthShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short' })
}

export default function VendorManagementSystem({
  kissflowVendors = MOCK_VENDORS,
  kissflowContracts = MOCK_CONTRACTS,
}) {
  const [vendorFilter, setVendorFilter] = useState('All Vendors')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [quarterFilter, setQuarterFilter] = useState('All Quarters')
  const [recentView, setRecentView] = useState('table')

  useEffect(() => {
    AOS.init({ duration: 700, once: true, offset: 30 })
  }, [])

  const vendorNames = useMemo(() => {
    const source = Array.isArray(kissflowVendors) ? kissflowVendors : []
    const names = source.map((v) => v?.name).filter(Boolean)
    return ['All Vendors', ...new Set(names)]
  }, [kissflowVendors])

  const filteredContracts = useMemo(() => {
    const source = Array.isArray(kissflowContracts) ? kissflowContracts : []
    return source.filter((c) => {
      const byVendor = vendorFilter === 'All Vendors' || c.vendor === vendorFilter
      const byStatus = statusFilter === 'All Status' || c.status === statusFilter
      const q = quarterOfDate(toDate(c.startDate))
      const byQuarter = quarterFilter === 'All Quarters' || `Q${q}` === quarterFilter
      return byVendor && byStatus && byQuarter
    })
  }, [kissflowContracts, vendorFilter, statusFilter, quarterFilter])

  const metrics = useMemo(() => {
    const totalVendors = new Set(filteredContracts.map((c) => c.vendor)).size
    const activeContracts = filteredContracts.filter((c) => c.status === 'Active').length
    const totalSpend = filteredContracts.reduce((sum, c) => sum + Number(c.amount || 0), 0)
    return { totalVendors, activeContracts, totalSpend }
  }, [filteredContracts])

  const contractsPerVendor = useMemo(() => {
    const counts = {}
    filteredContracts.forEach((c) => {
      counts[c.vendor] = (counts[c.vendor] || 0) + 1
    })
    return Object.entries(counts).map(([name, contracts]) => ({ name, contracts }))
  }, [filteredContracts])

  const spendPerVendor = useMemo(() => {
    const totals = {}
    filteredContracts.forEach((c) => {
      totals[c.vendor] = (totals[c.vendor] || 0) + Number(c.amount || 0)
    })
    return Object.entries(totals).map(([name, value], i) => ({
      name,
      value,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))
  }, [filteredContracts])

  const contractTrend = useMemo(() => {
    const map = {}
    filteredContracts.forEach((c) => {
      const d = toDate(c.startDate)
      if (!d) return
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!map[key]) {
        map[key] = { month: monthShort(d), contracts: 0, spend: 0, sortKey: d.getTime() }
      }
      map[key].contracts += 1
      map[key].spend += Number(c.amount || 0)
    })
    return Object.values(map)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ month, contracts, spend }) => ({ month, contracts, spend }))
  }, [filteredContracts])

  const recentContracts = useMemo(() => {
    return [...filteredContracts]
      .sort((a, b) => {
        const da = toDate(a.startDate)?.getTime() || 0
        const db = toDate(b.startDate)?.getTime() || 0
        return db - da
      })
      .slice(0, 8)
  }, [filteredContracts])

  return (
    <div className="p2p-theme min-h-[100dvh] w-full flex flex-col overflow-x-hidden font-sans text-[#0F172A]">
      <div className="flex-1 min-w-0 overflow-auto p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-[1600px] mx-auto min-w-0 space-y-6 sm:space-y-8">
          <div
            className="p2p-header relative overflow-hidden rounded-2xl bg-white/95 border border-white/70 shadow-[0_10px_30px_rgba(20,90,120,0.08)] p-5 sm:p-6"
            data-aos="fade-down"
          >
            <P2pHeaderFx />
            <div className="relative z-[1] flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Vendor Management System
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  PHASE 1: Dashboard (basic version) using vendor and contract data.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <select
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17a2b4] focus:border-transparent"
                >
                  {vendorNames.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17a2b4] focus:border-transparent"
                >
                  {['All Status', 'Active', 'Pending', 'Expired'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  value={quarterFilter}
                  onChange={(e) => setQuarterFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17a2b4] focus:border-transparent"
                >
                  {['All Quarters', 'Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="tfx-kpis-row grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: 'Total Vendors', value: metrics.totalVendors, variant: 'payments', subtitle: metrics.totalVendors ? 'In this view' : 'No vendors yet' },
              { label: 'Active Contracts', value: metrics.activeContracts, variant: 'approved', subtitle: metrics.activeContracts ? 'Currently active' : 'None active yet' },
              { label: 'Total Spend', value: metrics.totalSpend, variant: 'ready', displayValue: money(metrics.totalSpend), subtitle: 'Across filtered contracts', footText: 'Filtered spend', percent: 100 },
            ].map((m, i) => (
              <P2pKpiCard
                key={m.label}
                label={m.label}
                value={m.value}
                variant={m.variant}
                index={i}
                total={m.label === 'Total Spend' ? 1 : m.label === 'Total Vendors' ? metrics.totalVendors : filteredContracts.length}
                subtitle={m.subtitle}
                displayValue={m.displayValue}
                footText={m.footText}
                percent={m.percent}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className={`${vmsSectionShellClass()} p-4 sm:p-6`} data-aos="zoom-in">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Contracts per Vendor</h3>
              <div className="h-[270px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contractsPerVendor}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-10} textAnchor="end" height={52} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [v, 'Contracts']} />
                    <Bar dataKey="contracts" fill="#17a2b4" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${vmsSectionShellClass()} p-4 sm:p-6`} data-aos="zoom-in" data-aos-delay={100}>
              <h3 className="text-sm font-bold text-slate-800 mb-4">Spend per Vendor</h3>
              <div className="h-[270px] w-full flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-1/2 h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={spendPerVendor} dataKey="value" nameKey="name" innerRadius={46} outerRadius={76} paddingAngle={2}>
                        {spendPerVendor.map((s, i) => (
                          <Cell key={s.name} fill={s.color || PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [money(v), 'Spend']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-2 text-sm">
                  {spendPerVendor.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-700">
                        {s.name} <span className="font-semibold text-slate-900">({money(s.value)})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`${vmsSectionShellClass()} p-4 sm:p-6`} data-aos="zoom-in" data-aos-delay={200}>
              <h3 className="text-sm font-bold text-slate-800 mb-4">Contract Trends</h3>
              <div className="h-[270px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={contractTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, key) => [key === 'spend' ? money(v) : v, key]} />
                    <Legend />
                    <Area yAxisId="right" type="monotone" dataKey="spend" fill="#bfe6ec" stroke="#17a2b4" fillOpacity={0.35} name="Spend" />
                    <Line yAxisId="left" type="monotone" dataKey="contracts" stroke="#0f6b7a" strokeWidth={2.5} dot={{ r: 3 }} name="Contracts" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className={`${vmsSectionShellClass()} p-4 sm:p-6`} data-aos="fade-up">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold text-slate-800">Recent Contracts</h3>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg ${recentView === 'table' ? 'bg-white text-[#0f6b7a] shadow-sm' : 'text-slate-600'}`}
                  onClick={() => setRecentView('table')}
                >
                  Table View
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg ${recentView === 'card' ? 'bg-white text-[#0f6b7a] shadow-sm' : 'text-slate-600'}`}
                  onClick={() => setRecentView('card')}
                >
                  Card View
                </button>
              </div>
            </div>

            {recentView === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e9f0f3] bg-[#f3f8fb] text-xs font-semibold text-[#6b7684] text-left">
                      <th className="py-2 pr-2"><span className="inline-flex items-center gap-1.5"><i className="ri-file-paper-2-line text-[#17a2b4]" aria-hidden />Contract</span></th>
                      <th className="py-2 pr-2"><span className="inline-flex items-center gap-1.5"><i className="ri-building-2-line text-[#17a2b4]" aria-hidden />Vendor</span></th>
                      <th className="py-2 pr-2"><span className="inline-flex items-center gap-1.5"><i className="ri-money-rupee-circle-line text-[#17a2b4]" aria-hidden />Amount</span></th>
                      <th className="py-2 pr-2"><span className="inline-flex items-center gap-1.5"><i className="ri-flag-line text-[#17a2b4]" aria-hidden />Status</span></th>
                      <th className="py-2"><span className="inline-flex items-center gap-1.5"><i className="ri-calendar-check-line text-[#17a2b4]" aria-hidden />Duration</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentContracts.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 pr-2 font-semibold text-slate-900">{c.title}</td>
                        <td className="py-3 pr-2 text-slate-700">{c.vendor}</td>
                        <td className="py-3 pr-2 font-semibold text-slate-900">{money(c.amount)}</td>
                        <td className="py-3 pr-2">
                          <span className="inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold bg-[#e6f6f8] border-[#bfe6ec] text-[#0f6b7a]">
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 text-slate-600">
                          {c.startDate} to {c.endDate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recentContracts.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">{c.title}</p>
                    <p className="text-sm text-slate-600 mt-1">{c.vendor}</p>
                    <p className="text-base font-bold text-[#0f6b7a] mt-2">{money(c.amount)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {c.startDate} to {c.endDate}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
