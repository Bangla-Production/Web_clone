import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  CreditCard,
  QrCode,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  Layers,
  ArrowDownLeft,
  Building2,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import {
  subscribePaymentTransactions,
  subscribeSettlementBatches
} from '../services/paymentClientService';

export default function FinancialDashboardPage() {
  const { user, activeRestaurantId } = useAuth();
  const { outlets, activeOutletId, setActiveOutletId, currencySymbol } = useRestaurant();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('OVERVIEW'); // 'OVERVIEW' | 'TRANSACTIONS' | 'SETTLEMENTS'
  const [transactions, setTransactions] = useState([]);
  const [settlementBatches, setSettlementBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedOutlet, setSelectedOutlet] = useState(activeOutletId || '');
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'
  const [channelFilter, setChannelFilter] = useState('ALL'); // 'ALL' | 'POS' | 'DIRECT_ONLINE' | 'SWIGGY' | 'ZOMATO'
  const [methodFilter, setMethodFilter] = useState('ALL'); // 'ALL' | 'CASH' | 'UPI' | 'CARD' | 'SWIGGY_ONLINE' | 'ZOMATO_ONLINE'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync with activeOutletId if changed
  useEffect(() => {
    if (activeOutletId && !selectedOutlet) {
      setSelectedOutlet(activeOutletId);
    }
  }, [activeOutletId, selectedOutlet]);

  const targetOutletId = selectedOutlet || activeOutletId || (outlets?.[0]?.id) || `${activeRestaurantId}_main`;

  // Subscribe to real-time transactions & settlements for selected outlet
  useEffect(() => {
    if (!activeRestaurantId || !targetOutletId) return;

    setLoading(true);

    const unsubTxns = subscribePaymentTransactions(
      activeRestaurantId,
      targetOutletId,
      (data) => {
        setTransactions(data);
        setLoading(false);
      }
    );

    const unsubSettlements = subscribeSettlementBatches(
      activeRestaurantId,
      targetOutletId,
      (data) => {
        setSettlementBatches(data);
      }
    );

    return () => {
      unsubTxns();
      unsubSettlements();
    };
  }, [activeRestaurantId, targetOutletId]);

  // Date filtering logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Channel
      if (channelFilter !== 'ALL' && t.paymentSource !== channelFilter) return false;
      // Method
      if (methodFilter !== 'ALL' && t.paymentMethod !== methodFilter) return false;
      // Status
      if (statusFilter !== 'ALL' && t.paymentStatus !== statusFilter) return false;

      // Date
      if (dateFilter !== 'ALL' && t.createdAt) {
        const itemDate = new Date(t.createdAt);
        const now = new Date();
        if (dateFilter === 'TODAY') {
          if (itemDate.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === 'WEEK') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (itemDate < sevenDaysAgo) return false;
        } else if (dateFilter === 'MONTH') {
          if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) return false;
        }
      }

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchId = (t.transactionId || '').toLowerCase().includes(q);
        const matchOrder = (t.orderId || '').toLowerCase().includes(q);
        const matchMethod = (t.paymentMethod || '').toLowerCase().includes(q);
        return matchId || matchOrder || matchMethod;
      }

      return true;
    });
  }, [transactions, channelFilter, methodFilter, statusFilter, dateFilter, searchQuery]);

  // Aggregate Metrics & KPIs
  const metrics = useMemo(() => {
    let totalGrossSales = 0;
    let posCollections = 0;
    let directOnlineCollections = 0;
    let swiggyGross = 0;
    let zomatoGross = 0;
    let aggregatorCommissions = 0;
    let totalRefunds = 0;

    for (const t of filteredTransactions) {
      const amt = Number(t.amount || 0);
      const refunded = Number(t.totalRefundedAmount || 0);
      totalRefunds += refunded;

      if (t.paymentStatus === 'CAPTURED' || t.paymentStatus === 'PARTIALLY_REFUNDED' || t.paymentStatus === 'REFUNDED') {
        totalGrossSales += amt;

        if (t.paymentSource === 'POS') {
          posCollections += amt;
        } else if (t.paymentSource === 'DIRECT_ONLINE') {
          directOnlineCollections += amt;
        } else if (t.paymentSource === 'SWIGGY') {
          swiggyGross += amt;
          aggregatorCommissions += Number(t.pricingBreakdown?.commissionAmount || amt * 0.18);
        } else if (t.paymentSource === 'ZOMATO') {
          zomatoGross += amt;
          aggregatorCommissions += Number(t.pricingBreakdown?.commissionAmount || amt * 0.18);
        }
      }
    }

    // Settlements totals
    let actualSettlementsReceived = 0;
    let totalDiscrepancies = 0;

    for (const batch of settlementBatches) {
      actualSettlementsReceived += Number(batch.summary?.actualPayoutAmount || 0);
      if (batch.payoutStatus === 'DISCREPANCY' || batch.discrepancyCount > 0) {
        totalDiscrepancies += Number(batch.discrepancyCount || 1);
      }
    }

    const netAggregatorExpected = (swiggyGross + zomatoGross) - aggregatorCommissions;
    const outstandingSettlement = Math.max(0, netAggregatorExpected - actualSettlementsReceived);

    return {
      totalGrossSales,
      posCollections,
      directOnlineCollections,
      swiggyGross,
      zomatoGross,
      aggregatorCommissions,
      totalRefunds,
      netAggregatorExpected,
      actualSettlementsReceived,
      outstandingSettlement,
      totalDiscrepancies
    };
  }, [filteredTransactions, settlementBatches]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Outlet Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-pos-card p-6 rounded-2xl border border-pos-border shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Multi-Tenant Financial Audit Engine</span>
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-display">
            Payment, Settlement & Reconciliation
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Authoritative ledger tracking POS tenders, direct collections, and aggregator net settlements.
          </p>
        </div>

        {/* Outlet Selector Dropdown */}
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Outlet:</label>
          <select
            value={selectedOutlet}
            onChange={(e) => {
              setSelectedOutlet(e.target.value);
              if (setActiveOutletId) setActiveOutletId(e.target.value);
            }}
            className="px-3.5 py-2 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:border-blue-500"
          >
            {outlets?.length > 0 ? (
              outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.outletName || o.name || o.id} {o.isDefaultOutlet ? '(Main)' : ''}
                </option>
              ))
            ) : (
              <option value={`${activeRestaurantId}_main`}>Primary Branch</option>
            )}
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-pos-border pb-2">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center space-x-2 ${
            activeTab === 'OVERVIEW'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-pos-card'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Financial Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('TRANSACTIONS')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center space-x-2 ${
            activeTab === 'TRANSACTIONS'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-pos-card'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Payment Transactions ({filteredTransactions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SETTLEMENTS')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center space-x-2 ${
            activeTab === 'SETTLEMENTS'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-pos-card'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Aggregator Settlements ({settlementBatches.length})</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & KEY FINANCIAL KPIS */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-pos-card rounded-2xl border border-pos-border shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Sales</span>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-num">
                {currencySymbol}{metrics.totalGrossSales.toFixed(2)}
              </p>
              <span className="text-xs text-slate-400 mt-1 block">POS + Online + Aggregators</span>
            </div>

            <div className="p-5 bg-pos-card rounded-2xl border border-pos-border shadow-sm">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">POS Collections</span>
              <p className="text-2xl font-black text-emerald-600 mt-1 font-num">
                {currencySymbol}{metrics.posCollections.toFixed(2)}
              </p>
              <span className="text-xs text-slate-400 mt-1 block">Cash, Card & Direct UPI</span>
            </div>

            <div className="p-5 bg-pos-card rounded-2xl border border-pos-border shadow-sm">
              <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Aggregator Gross</span>
              <p className="text-2xl font-black text-orange-600 mt-1 font-num">
                {currencySymbol}{(metrics.swiggyGross + metrics.zomatoGross).toFixed(2)}
              </p>
              <span className="text-xs text-slate-400 mt-1 block">
                Swiggy ({currencySymbol}{metrics.swiggyGross.toFixed(0)}) + Zomato ({currencySymbol}{metrics.zomatoGross.toFixed(0)})
              </span>
            </div>

            <div className="p-5 bg-pos-card rounded-2xl border border-pos-border shadow-sm">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Net Expected Payout</span>
              <p className="text-2xl font-black text-indigo-600 mt-1 font-num">
                {currencySymbol}{metrics.netAggregatorExpected.toFixed(2)}
              </p>
              <span className="text-xs text-slate-400 mt-1 block">
                After ₹{metrics.aggregatorCommissions.toFixed(0)} Commission/Taxes
              </span>
            </div>
          </div>

          {/* Secondary Financial Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Payment Ownership Separation Card */}
            <div className="p-6 bg-pos-card rounded-2xl border border-pos-border space-y-4">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-blue-500" />
                <span>Payment Ownership Separation</span>
              </h3>
              <p className="text-xs text-slate-500">
                Guaranteed architectural separation between in-house restaurant tenders and externally-collected platform payouts.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center p-3 bg-pos-surface rounded-xl">
                  <div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">Restaurant-Collected (POS & Direct)</span>
                    <span className="text-xs text-slate-400">Instantly available in restaurant bank/till</span>
                  </div>
                  <span className="font-black text-sm text-emerald-600 font-num">
                    {currencySymbol}{(metrics.posCollections + metrics.directOnlineCollections).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-pos-surface rounded-xl">
                  <div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">Aggregator-Collected (Swiggy / Zomato)</span>
                    <span className="text-xs text-slate-400">Held by platforms, paid via weekly/bi-weekly settlement</span>
                  </div>
                  <span className="font-black text-sm text-orange-600 font-num">
                    {currencySymbol}{(metrics.swiggyGross + metrics.zomatoGross).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-pos-surface rounded-xl">
                  <div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">Total Refunds & Adjustments</span>
                    <span className="text-xs text-slate-400">Cancellation reversals and customer refunds</span>
                  </div>
                  <span className="font-black text-sm text-rose-600 font-num">
                    {currencySymbol}{metrics.totalRefunds.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Aggregator Settlement & Reconciliation Card */}
            <div className="p-6 bg-pos-card rounded-2xl border border-pos-border space-y-4">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>Settlement & Reconciliation Status</span>
              </h3>
              <p className="text-xs text-slate-500">
                Tracks actual bank disbursements (UTR references) vs expected platform receivables.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center p-3 bg-pos-surface rounded-xl">
                  <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Actual Payouts Disbursed</span>
                  <span className="font-black text-sm text-slate-900 dark:text-white font-num">
                    {currencySymbol}{metrics.actualSettlementsReceived.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-pos-surface rounded-xl">
                  <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Outstanding Payout Balance</span>
                  <span className="font-black text-sm text-indigo-600 font-num">
                    {currencySymbol}{metrics.outstandingSettlement.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-pos-surface rounded-xl">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Reconciliation Exceptions</span>
                    {metrics.totalDiscrepancies > 0 && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-xs font-bold">
                        {metrics.totalDiscrepancies} Action Required
                      </span>
                    )}
                  </div>
                  <span className={`font-black text-sm font-num ${metrics.totalDiscrepancies > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {metrics.totalDiscrepancies}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DETAILED PAYMENT TRANSACTIONS LIST */}
      {activeTab === 'TRANSACTIONS' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 bg-pos-card rounded-2xl border border-pos-border shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Txn ID, Order ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-pos-surface border border-pos-border rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-num"
              />
            </div>

            {/* Channel filter */}
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Sources</option>
              <option value="POS">POS Dine-In / Counter</option>
              <option value="DIRECT_ONLINE">Direct Online</option>
              <option value="SWIGGY">Swiggy Orders</option>
              <option value="ZOMATO">Zomato Orders</option>
            </select>

            {/* Payment Method filter */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="SWIGGY_ONLINE">Swiggy Online</option>
              <option value="ZOMATO_ONLINE">Zomato Online</option>
            </select>

            {/* Date filter */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">This Month</option>
            </select>
          </div>

          {/* Transactions Table */}
          <div className="bg-pos-card rounded-2xl border border-pos-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-pos-surface border-b border-pos-border text-slate-500 dark:text-slate-400 font-display">
                  <tr>
                    <th className="py-3 px-4 font-bold">Txn ID</th>
                    <th className="py-3 px-4 font-bold">Order ID</th>
                    <th className="py-3 px-4 font-bold">Source / Channel</th>
                    <th className="py-3 px-4 font-bold">Method</th>
                    <th className="py-3 px-4 font-bold">Collection Type</th>
                    <th className="py-3 px-4 font-bold">Amount</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-border">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                        No payment transactions match the active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((txn) => (
                      <tr key={txn.id || txn.transactionId} className="hover:bg-pos-surface/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {txn.transactionId}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {txn.orderId}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {txn.paymentSource}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                            {txn.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            txn.collectionType === 'AGGREGATOR_COLLECTED'
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}>
                            {txn.collectionType === 'AGGREGATOR_COLLECTED' ? 'Aggregator' : 'In-House'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-black font-num text-slate-900 dark:text-white">
                          {currencySymbol}{Number(txn.amount || 0).toFixed(2)}
                          {Number(txn.totalRefundedAmount || 0) > 0 && (
                            <span className="text-[10px] text-rose-500 block font-normal">
                              Refunded: -{currencySymbol}{Number(txn.totalRefundedAmount).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            txn.paymentStatus === 'CAPTURED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : txn.paymentStatus === 'REFUNDED'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {txn.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400 font-num">
                          {txn.createdAt ? new Date(txn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AGGREGATOR SETTLEMENTS & BATCHES */}
      {activeTab === 'SETTLEMENTS' && (
        <div className="space-y-4">
          <div className="bg-pos-card rounded-2xl border border-pos-border p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white font-display">
                  Settlement Batches & Bank Reconciliations
                </h3>
                <p className="text-xs text-slate-400">
                  Aggregator settlement statements matched against internal POS & online order tickets.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {settlementBatches.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-bold">No settlement reports recorded for this outlet.</p>
                  <p className="text-xs mt-1">Import Swiggy or Zomato statement files to initiate automated reconciliation.</p>
                </div>
              ) : (
                settlementBatches.map((batch) => (
                  <div key={batch.id || batch.settlementBatchId} className="p-4 bg-pos-surface rounded-xl border border-pos-border space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-pos-border pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                            {batch.settlementBatchId}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            {batch.providerName}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 mt-0.5 block">
                          Period: {new Date(batch.settlementPeriod?.startDate).toLocaleDateString()} – {new Date(batch.settlementPeriod?.endDate).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          batch.payoutStatus === 'RECONCILED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {batch.payoutStatus}
                        </span>
                      </div>
                    </div>

                    {/* Batch Summary Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block">Orders</span>
                        <span className="font-bold font-num text-slate-800 dark:text-slate-200">
                          {batch.orderCount} (Matched: {batch.matchedCount})
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block">Gross Sales</span>
                        <span className="font-bold font-num text-slate-800 dark:text-slate-200">
                          {currencySymbol}{Number(batch.summary?.grossOrderAmount || 0).toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block">Commission & Taxes</span>
                        <span className="font-bold font-num text-rose-500">
                          -{currencySymbol}{Number(batch.summary?.totalCommission || 0).toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block">Bank UTR Payout</span>
                        <span className="font-black font-num text-emerald-600">
                          {currencySymbol}{Number(batch.summary?.actualPayoutAmount || 0).toFixed(2)}
                        </span>
                        {batch.paymentReference?.utrNumber && (
                          <span className="text-[10px] text-slate-400 block truncate">
                            UTR: {batch.paymentReference.utrNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
