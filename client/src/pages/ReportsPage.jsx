import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Calendar,
  DollarSign,
  ShoppingBag,
  Percent,
  Receipt,
  TrendingUp,
  CreditCard,
  Utensils,
  RefreshCw
} from 'lucide-react';
import { getOrders } from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import ReportsCleanupTools from '../components/settings/ReportsCleanupTools';

export default function ReportsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7_DAYS');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { activeRestaurantId } = useAuth();
  const { currencySymbol, taxName } = useRestaurant();
  const toast = useToast();

  const fetchSalesReport = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getOrders(activeRestaurantId);
      setOrders(list);
    } catch (err) {
      toast.error('Failed to load sales from Firestore.');
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, toast]);

  useEffect(() => {
    fetchSalesReport();
  }, [fetchSalesReport]);

  // Date Filtering
  const filteredOrders = orders.filter((o) => {
    if (!o.createdAt) return true;
    const orderDate = new Date(o.createdAt).toISOString().slice(0, 10);

    if (dateRange === 'TODAY') {
      return orderDate === new Date().toISOString().slice(0, 10);
    } else if (dateRange === '7_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return orderDate >= d.toISOString().slice(0, 10);
    } else if (dateRange === '30_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return orderDate >= d.toISOString().slice(0, 10);
    } else if (dateRange === 'CUSTOM' && startDate && endDate) {
      return orderDate >= startDate && orderDate <= endDate;
    }
    return true;
  });

  // Summary Metrics
  const paidOrders = filteredOrders.filter((o) => o.paymentStatus === 'PAID');
  const unpaidOrders = filteredOrders.filter((o) => o.paymentStatus === 'UNPAID');
  const totalSales = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalDiscounts = paidOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
  const totalTax = paidOrders.reduce((sum, o) => sum + (o.taxAmount || 0), 0);
  const avgOrderValue = paidOrders.length > 0 ? totalSales / paidOrders.length : 0;

  // Day-by-day map
  const dayMap = {};
  filteredOrders.forEach((order) => {
    const dayKey = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : 'Today';
    if (!dayMap[dayKey]) {
      dayMap[dayKey] = {
        date: dayKey,
        totalSales: 0,
        ordersCount: 0,
        paidCount: 0,
        discounts: 0,
        tax: 0
      };
    }
    dayMap[dayKey].ordersCount += 1;
    if (order.paymentStatus === 'PAID') {
      dayMap[dayKey].paidCount += 1;
      dayMap[dayKey].totalSales += order.totalAmount || 0;
      dayMap[dayKey].discounts += order.discountAmount || 0;
      dayMap[dayKey].tax += order.taxAmount || 0;
    }
  });
  const dailyBreakdown = Object.values(dayMap);

  // Channels Breakdown
  const dineInOrders = paidOrders.filter(o => o.orderType === 'DINE_IN');
  const takeawayOrders = paidOrders.filter(o => o.orderType === 'TAKEAWAY');

  // Payment Breakdown
  const paymentMap = { CASH: 0, CARD: 0, UPI: 0 };
  paidOrders.forEach(o => {
    const method = o.paymentMethod || 'CASH';
    paymentMap[method] = (paymentMap[method] || 0) + (o.totalAmount || 0);
  });
  const paymentBreakdown = Object.entries(paymentMap).map(([method, amount]) => ({ method, amount }));

  // Top Items
  const itemMap = {};
  paidOrders.forEach(o => {
    o.items?.forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { name: i.name, quantity: 0, revenue: 0 };
      itemMap[i.name].quantity += i.quantity || 1;
      itemMap[i.name].revenue += (i.price * (i.quantity || 1));
    });
  });
  const topItems = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="pos-surface-glass p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight font-display">
                Sales & Revenue Analytics
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Financial reports, settlement audits, and revenue performance ({activeRestaurantId})
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchSalesReport}
            className="pos-btn-touch flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-200 text-xs font-bold border border-pos-border transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh Data</span>
          </button>
          <ReportsCleanupTools restaurantId={activeRestaurantId} onDone={fetchSalesReport} />
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="pos-surface-glass p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-pos-dark p-1.5 rounded-xl border border-pos-border">
          <button
            onClick={() => setDateRange('TODAY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              dateRange === 'TODAY' ? 'bg-emerald-500 text-slate-950 shadow-sm font-extrabold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDateRange('7_DAYS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              dateRange === '7_DAYS' ? 'bg-emerald-500 text-slate-950 shadow-sm font-extrabold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setDateRange('30_DAYS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              dateRange === '30_DAYS' ? 'bg-emerald-500 text-slate-950 shadow-sm font-extrabold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setDateRange('CUSTOM')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              dateRange === 'CUSTOM' ? 'bg-emerald-500 text-slate-950 shadow-sm font-extrabold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Custom Range
          </button>
        </div>

        {dateRange === 'CUSTOM' && (
          <div className="flex items-center space-x-2 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-pos-dark border border-pos-border rounded-xl text-white focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-500 font-bold">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-pos-dark border border-pos-border rounded-xl text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl pos-card-glass shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Net Sales</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-2 font-num">
            {currencySymbol}{totalSales.toFixed(2)}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">{paidOrders.length} Paid Settlements</p>
        </div>

        <div className="p-5 rounded-2xl pos-card-glass shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Order Tickets</span>
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-2 font-num">{filteredOrders.length}</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">{unpaidOrders.length} Unpaid / Open</p>
        </div>

        <div className="p-5 rounded-2xl pos-card-glass shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Avg Order Value (AOV)</span>
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 dark:text-purple-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-2 font-num">
            {currencySymbol}{avgOrderValue.toFixed(2)}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">Per completed bill</p>
        </div>

        <div className="p-5 rounded-2xl pos-card-glass shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total {taxName} Tax</span>
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-2 font-num">
            {currencySymbol}{totalTax.toFixed(2)}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Discounts: {currencySymbol}{totalDiscounts.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Grid: Day-by-day table + Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Breakdown Table (2 Cols) */}
        <div className="lg:col-span-2 pos-card-glass rounded-2xl p-5 shadow-xl">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-200 pb-3 border-b border-pos-border font-display">
            Day-by-Day Sales Breakdown
          </h3>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 dark:text-slate-400 border-b border-pos-border">
                <tr>
                  <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Date</th>
                  <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Orders</th>
                  <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Paid</th>
                  <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Discounts</th>
                  <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Tax</th>
                  <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-border">
                {dailyBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-500 font-semibold">
                      No sales recorded in this period.
                    </td>
                  </tr>
                ) : (
                  dailyBreakdown.map((row) => (
                    <tr key={row.date} className="hover:bg-pos-surface/60 transition-colors">
                      <td className="py-3 font-bold text-slate-800 dark:text-slate-200">{row.date}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400 font-num">{row.ordersCount}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-300 font-bold font-num">{row.paidCount}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400 font-num">
                        {currencySymbol}{row.discounts.toFixed(2)}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-400 font-num">{currencySymbol}{row.tax.toFixed(2)}</td>
                      <td className="py-3 font-black text-emerald-600 dark:text-emerald-400 text-right font-num">
                        {currencySymbol}{row.totalSales.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Channels & Payment Breakdown (1 Col) */}
        <div className="space-y-4">
          <div className="pos-card-glass rounded-2xl p-4 shadow-xl">
            <h4 className="font-extrabold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              Order Type Distribution
            </h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center p-2.5 rounded-xl bg-pos-dark border border-pos-border">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">🍽️ Dine-In</span>
                <span className="font-extrabold text-slate-900 dark:text-white font-num">
                  {dineInOrders.length} orders ({currencySymbol}{dineInOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2)})
                </span>
              </div>
              <div className="flex justify-between items-center p-2.5 rounded-xl bg-pos-dark border border-pos-border">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">🛍️ Takeaway</span>
                <span className="font-extrabold text-slate-900 dark:text-white font-num">
                  {takeawayOrders.length} orders ({currencySymbol}{takeawayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          <div className="pos-card-glass rounded-2xl p-4 shadow-xl">
            <h4 className="font-extrabold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              Payment Method Collection
            </h4>
            <div className="space-y-2 text-xs">
              {paymentBreakdown.map((p) => (
                <div
                  key={p.method}
                  className="flex justify-between items-center p-2.5 rounded-xl bg-pos-dark border border-pos-border"
                >
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    {p.method === 'CASH' && '💵 '}
                    {p.method === 'CARD' && '💳 '}
                    {p.method === 'UPI' && '📱 '}
                    {p.method}
                  </span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 font-num">
                    {currencySymbol}{p.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Selling Items Table */}
      <div className="pos-card-glass rounded-2xl p-5 shadow-xl">
        <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-200 pb-3 border-b border-pos-border font-display">
          Top Selling Dishes (Firestore Real-time)
        </h3>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 dark:text-slate-400 border-b border-pos-border">
              <tr>
                <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Rank</th>
                <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Item Name</th>
                <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Quantity Sold</th>
                <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-border">
              {topItems.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-slate-500 font-semibold">
                    No item sales data available for this range.
                  </td>
                </tr>
              ) : (
                topItems.map((item, index) => (
                  <tr key={index} className="hover:bg-pos-surface/60 transition-colors">
                    <td className="py-2.5 font-extrabold text-amber-500 font-num">#{index + 1}</td>
                    <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">{item.name}</td>
                    <td className="py-2.5 text-slate-700 dark:text-slate-300 font-num">{item.quantity} units</td>
                    <td className="py-2.5 font-black text-emerald-600 dark:text-emerald-400 text-right font-num">
                      {currencySymbol}{item.revenue.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
