import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  ShoppingBag,
  Clock,
  ChefHat,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  UtensilsCrossed,
  RefreshCw,
  CalendarDays
} from 'lucide-react';
import {
  getOrders,
  getInventory,
  getReservations
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';

export default function DashboardPage() {
  const { activeRestaurantId } = useAuth();
  const { currencySymbol, restaurant } = useRestaurant();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [orderList, stockList, resList] = await Promise.all([
        getOrders(activeRestaurantId),
        getInventory(activeRestaurantId),
        getReservations(activeRestaurantId)
      ]);
      setOrders(orderList);
      setStockItems(stockList);
      setReservations(resList);
    } catch (err) {
      console.error('Failed to load dashboard from Firestore:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate stats
  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID');
  const todaySales = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const pendingOrders = orders.filter((o) => o.orderStatus === 'CONFIRMED').length;
  const preparingOrders = orders.filter((o) => o.orderStatus === 'PREPARING').length;
  const readyOrders = orders.filter((o) => o.orderStatus === 'READY').length;
  const lowStockItems = stockItems.filter((i) => i.isLowStock);
  const recentOrders = orders.slice(0, 6);

  // Calculate top dishes
  const itemMap = {};
  paidOrders.forEach((o) => {
    o.items?.forEach((item) => {
      if (!itemMap[item.name]) itemMap[item.name] = { name: item.name, quantity: 0, revenue: 0 };
      itemMap[item.name].quantity += item.quantity || 1;
      itemMap[item.name].revenue += (item.price * (item.quantity || 1));
    });
  });
  const popularItems = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

  const kpis = [
    {
      title: "Total Paid Sales",
      value: `${currencySymbol}${todaySales.toFixed(2)}`,
      subtitle: `${paidOrders.length} settled tickets`,
      icon: DollarSign,
      bgGradient: 'from-emerald-950/40 to-slate-900',
      borderColor: 'border-emerald-800/40',
      iconColor: 'text-emerald-400'
    },
    {
      title: "Total Orders",
      value: orders.length,
      subtitle: 'Recorded in Firestore',
      icon: ShoppingBag,
      bgGradient: 'from-blue-950/40 to-slate-900',
      borderColor: 'border-blue-800/40',
      iconColor: 'text-blue-400'
    },
    {
      title: 'Kitchen In Prep',
      value: preparingOrders,
      subtitle: `${pendingOrders} waiting in queue`,
      icon: ChefHat,
      bgGradient: 'from-amber-950/40 to-slate-900',
      borderColor: 'border-amber-800/40',
      iconColor: 'text-amber-400'
    },
    {
      title: 'Table Bookings',
      value: reservations.length,
      subtitle: `${reservations.filter(r => r.status === 'CONFIRMED').length} upcoming`,
      icon: CalendarDays,
      bgGradient: 'from-teal-950/40 to-slate-900',
      borderColor: 'border-teal-800/40',
      iconColor: 'text-teal-400'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {restaurant?.name} Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time operations, cloud POS transactions, and kitchen orders ({activeRestaurantId})
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => navigate('/pos')}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition-colors"
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Open POS Terminal</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div
              key={index}
              className={`p-5 rounded-xl bg-gradient-to-br ${kpi.bgGradient} border ${kpi.borderColor} shadow-lg relative overflow-hidden`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{kpi.title}</p>
                  <h3 className="text-2xl font-bold text-white mt-1.5">{kpi.value}</h3>
                  <p className="text-[11px] text-slate-400 mt-1">{kpi.subtitle}</p>
                </div>
                <div className={`p-3 rounded-xl bg-slate-800/80 border border-slate-700 ${kpi.iconColor}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Low Stock Warning */}
      {lowStockItems.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-start justify-between shadow-lg">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-amber-900/80 text-amber-300 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-200">
                Low Stock Alert: {lowStockItems.length} items below minimum threshold
              </h4>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Items: {lowStockItems.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/inventory')}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shrink-0 ml-4 transition-colors"
          >
            Manage Stock
          </button>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-bold text-sm text-slate-200">Recent Live Orders</h3>
              <button
                onClick={() => navigate('/orders')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-1"
              >
                <span>View All Orders</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800/80">
                    <th className="pb-2.5 font-semibold">Order #</th>
                    <th className="pb-2.5 font-semibold">Type / Table</th>
                    <th className="pb-2.5 font-semibold">Items</th>
                    <th className="pb-2.5 font-semibold">Total</th>
                    <th className="pb-2.5 font-semibold">Status</th>
                    <th className="pb-2.5 font-semibold">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-6 text-center text-slate-500">
                        No orders recorded yet. Create an order in POS!
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 font-semibold text-slate-200">{order.orderNumber}</td>
                        <td className="py-3 text-slate-300">
                          {order.orderType === 'DINE_IN' ? (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                              {order.tableNumber || 'Dine-In'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-medium">
                              Takeaway
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-slate-400">{order.items?.length || 0} items</td>
                        <td className="py-3 font-bold text-slate-200">
                          {currencySymbol}{order.totalAmount?.toFixed(2)}
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              order.orderStatus === 'CONFIRMED'
                                ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
                                : order.orderStatus === 'PREPARING'
                                ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                                : order.orderStatus === 'READY'
                                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {order.orderStatus}
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              order.paymentStatus === 'PAID'
                                ? 'bg-emerald-900/80 text-emerald-300'
                                : 'bg-rose-900/80 text-rose-300'
                            }`}
                          >
                            {order.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Popular Items (1 Col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 pb-4 border-b border-slate-800">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-slate-200">Top Selling Dishes</h3>
            </div>

            <div className="space-y-3 mt-4">
              {popularItems.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Settle paid orders to see item sales ranking.
                </p>
              ) : (
                popularItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800"
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className="w-6 h-6 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 flex items-center justify-center font-bold text-xs shrink-0">
                        {index + 1}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-slate-200 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.quantity} orders</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-emerald-400">
                        {currencySymbol}{item.revenue.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800">
            <button
              onClick={() => navigate('/reports')}
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium text-center transition-colors"
            >
              View Full Analytics Report →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
