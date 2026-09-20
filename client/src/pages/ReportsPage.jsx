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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Sales & Revenue Reports</h1>
          <p className="text-xs text-slate-400">
            Real-time financial analytics, order types, and revenue breakdown ({activeRestaurantId})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            onClick={fetchSalesReport}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors self-start"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Data</span>
          </button>
          <ReportsCleanupTools restaurantId={activeRestaurantId} onDone={fetchSalesReport} />
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setDateRange('TODAY')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              dateRange === 'TODAY' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDateRange('7_DAYS')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              dateRange === '7_DAYS' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setDateRange('30_DAYS')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              dateRange === '30_DAYS' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setDateRange('CUSTOM')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              dateRange === 'CUSTOM' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
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
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Net Sales</span>
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mt-2">
            {currencySymbol}{totalSales.toFixed(2)}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">{paidOrders.length} Paid Orders</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Order Tickets</span>
            <ShoppingBag className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mt-2">{filteredOrders.length}</h3>
          <p className="text-[11px] text-slate-400 mt-1">{unpaidOrders.length} Unpaid / Open</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Avg Order Value (AOV)</span>
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mt-2">
            {currencySymbol}{avgOrderValue.toFixed(2)}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">Per completed bill</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total {taxName} Collected</span>
            <Receipt className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mt-2">
            {currencySymbol}{totalTax.toFixed(2)}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Discounts: {currencySymbol}{totalDiscounts.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Grid: Day-by-day table + Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Breakdown Table (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="font-bold text-sm text-slate-200 pb-3 border-b border-slate-800">
            Day-by-Day Sales Breakdown
          </h3>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="pb-2.5 font-semibold">Date</th>
                  <th className="pb-2.5 font-semibold">Orders</th>
                  <th className="pb-2.5 font-semibold">Paid</th>
                  <th className="pb-2.5 font-semibold">Discounts</th>
                  <th className="pb-2.5 font-semibold">Tax</th>
                  <th className="pb-2.5 font-semibold text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dailyBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-500">
                      No sales recorded in this period.
                    </td>
                  </tr>
                ) : (
                  dailyBreakdown.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 font-semibold text-slate-200">{row.date}</td>
                      <td className="py-3 text-slate-400">{row.ordersCount}</td>
                      <td className="py-3 text-slate-300">{row.paidCount}</td>
                      <td className="py-3 text-slate-400">
                        {currencySymbol}{row.discounts.toFixed(2)}
                      </td>
                      <td className="py-3 text-slate-400">{currencySymbol}{row.tax.toFixed(2)}</td>
                      <td className="py-3 font-bold text-emerald-400 text-right">
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <h4 className="font-bold text-xs text-slate-300 uppercase tracking-wider mb-3">
              Order Type Distribution
            </h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300">🍽️ Dine-In</span>
                <span className="font-bold text-white">
                  {dineInOrders.length} orders (
                  {currencySymbol}{dineInOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2)})
                </span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300">🛍️ Takeaway</span>
                <span className="font-bold text-white">
                  {takeawayOrders.length} orders (
                  {currencySymbol}{takeawayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <h4 className="font-bold text-xs text-slate-300 uppercase tracking-wider mb-3">
              Payment Method Collection
            </h4>
            <div className="space-y-2 text-xs">
              {paymentBreakdown.map((p) => (
                <div
                  key={p.method}
                  className="flex justify-between items-center p-2 rounded-lg bg-slate-950 border border-slate-800"
                >
                  <span className="text-slate-300">
                    {p.method === 'CASH' && '💵 '}
                    {p.method === 'CARD' && '💳 '}
                    {p.method === 'UPI' && '📱 '}
                    {p.method}
                  </span>
                  <span className="font-bold text-emerald-400">
                    {currencySymbol}{p.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Selling Items Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <h3 className="font-bold text-sm text-slate-200 pb-3 border-b border-slate-800">
          Top Selling Dishes (Firestore Real-time)
        </h3>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="pb-2.5 font-semibold">Rank</th>
                <th className="pb-2.5 font-semibold">Item Name</th>
                <th className="pb-2.5 font-semibold">Quantity Sold</th>
                <th className="pb-2.5 font-semibold text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {topItems.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-slate-500">
                    No item sales data available for this range.
                  </td>
                </tr>
              ) : (
                topItems.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-800/30">
                    <td className="py-2.5 font-bold text-slate-400">#{index + 1}</td>
                    <td className="py-2.5 font-semibold text-slate-100">{item.name}</td>
                    <td className="py-2.5 text-slate-300">{item.quantity} units</td>
                    <td className="py-2.5 font-bold text-emerald-400 text-right">
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
