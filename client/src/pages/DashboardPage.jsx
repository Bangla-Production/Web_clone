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
  CalendarDays,
  Receipt,
  Grid2X2,
  Flame,
  ArrowRight,
  Sparkles,
  Zap,
  Activity,
  Layers,
  Percent
} from 'lucide-react';
import {
  getOrders,
  getInventory,
  getReservations,
  subscribeToTables
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';

export default function DashboardPage() {
  const { activeRestaurantId, user } = useAuth();
  const { currencySymbol, restaurant } = useRestaurant();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [orderList, stockList, resList] = await Promise.all([
        getOrders(activeRestaurantId),
        getInventory(activeRestaurantId),
        getReservations(activeRestaurantId)
      ]);
      setOrders(orderList || []);
      setStockItems(stockList || []);
      setReservations(resList || []);
    } catch (err) {
      console.error('Failed to load dashboard from Firestore:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId]);

  useEffect(() => {
    fetchData();
    const unsub = subscribeToTables(activeRestaurantId, (liveTables) => {
      setTables(liveTables || []);
    });
    return () => unsub();
  }, [fetchData, activeRestaurantId]);

  // Aggregate stats
  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID');
  const todaySales = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const pendingOrders = orders.filter((o) => o.orderStatus === 'CONFIRMED').length;
  const preparingOrders = orders.filter((o) => o.orderStatus === 'PREPARING').length;
  const readyOrders = orders.filter((o) => o.orderStatus === 'READY').length;
  const activeKOTCount = pendingOrders + preparingOrders;
  const lowStockItems = stockItems.filter((i) => i.isLowStock);
  const recentOrders = orders.slice(0, 7);

  // Table calculations
  const totalTables = tables.length || 1;
  const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED').length;
  const occupancyPercent = Math.round((occupiedTables / totalTables) * 100);

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
  const maxPopularQty = popularItems.length > 0 ? popularItems[0].quantity : 1;

  const kpis = [
    {
      title: "Today's Settled Sales",
      value: `${currencySymbol}${todaySales.toFixed(2)}`,
      subtitle: `${paidOrders.length} paid invoices completed`,
      badge: '+18.4% vs avg',
      badgeColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
      icon: DollarSign,
      bgGradient: 'from-emerald-500/10 via-pos-surface to-pos-card dark:from-emerald-900/50 dark:via-slate-900 dark:to-slate-950',
      borderColor: 'border-emerald-500/30 dark:border-emerald-500/40',
      shadowColor: 'shadow-emerald-950/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/30 dark:border-emerald-500/40'
    },
    {
      title: 'Total Cloud Orders',
      value: orders.length,
      subtitle: `${orders.filter(o => o.orderType === 'DINE_IN').length} Dine-In • ${orders.filter(o => o.orderType === 'TAKEAWAY').length} Takeaway`,
      badge: 'Live Firestore',
      badgeColor: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30',
      icon: ShoppingBag,
      bgGradient: 'from-blue-500/10 via-pos-surface to-pos-card dark:from-blue-900/50 dark:via-slate-900 dark:to-slate-950',
      borderColor: 'border-blue-500/30 dark:border-blue-500/40',
      shadowColor: 'shadow-blue-950/20',
      iconColor: 'text-blue-600 dark:text-blue-400 bg-blue-500/15 dark:bg-blue-500/20 border-blue-500/30 dark:border-blue-500/40'
    },
    {
      title: 'Active Kitchen KOTs',
      value: activeKOTCount,
      subtitle: `${preparingOrders} on stove • ${pendingOrders} in queue`,
      badge: activeKOTCount > 0 ? '🔥 Cooking Now' : 'Idle',
      badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
      icon: ChefHat,
      bgGradient: 'from-amber-500/10 via-pos-surface to-pos-card dark:from-amber-900/50 dark:via-slate-900 dark:to-slate-950',
      borderColor: 'border-amber-500/30 dark:border-amber-500/40',
      shadowColor: 'shadow-amber-950/20',
      iconColor: 'text-amber-600 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20 border-amber-500/30 dark:border-amber-500/40'
    },
    {
      title: 'Floor Occupancy',
      value: `${occupancyPercent}%`,
      subtitle: `${occupiedTables} of ${tables.length} tables active`,
      badge: `${tables.filter(t => t.status === 'AVAILABLE').length} Vacant`,
      badgeColor: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30',
      icon: Grid2X2,
      bgGradient: 'from-purple-500/10 via-pos-surface to-pos-card dark:from-purple-900/50 dark:via-slate-900 dark:to-slate-950',
      borderColor: 'border-purple-500/30 dark:border-purple-500/40',
      shadowColor: 'shadow-purple-950/20',
      iconColor: 'text-purple-600 dark:text-purple-400 bg-purple-500/15 dark:bg-purple-500/20 border-purple-500/30 dark:border-purple-500/40'
    }
  ];

  return (
    <div className="space-y-6 select-none transition-colors duration-200">
      {/* 1. TOP COMMAND BAR */}
      <div className="pos-surface-glass p-5 rounded-3xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-pos-border shadow-xl">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-display">
              {restaurant?.name || 'Restaurant'} POS Command Center
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Petpooja-grade real-time multi-branch terminal, kitchen KDS dispatcher & sales analytics
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchData}
            className="pos-btn-touch flex items-center space-x-1.5 px-4 py-2.5 rounded-2xl bg-pos-card hover:bg-pos-card-hover text-slate-700 dark:text-slate-300 text-xs font-bold border border-pos-border transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            <span>Sync</span>
          </button>

          <button
            onClick={() => navigate('/kitchen')}
            className="pos-btn-touch flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 text-white text-xs font-black shadow-pos-sky hover:brightness-110 transition-all"
          >
            <ChefHat className="w-4 h-4 stroke-[2.5]" />
            <span>Kitchen KDS</span>
          </button>

          <button
            onClick={() => navigate('/cashier')}
            className="pos-btn-touch flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-black shadow-pos-purple hover:brightness-110 transition-all"
          >
            <Receipt className="w-4 h-4 stroke-[2.5]" />
            <span>Cashier Terminal</span>
          </button>

          <button
            onClick={() => navigate('/pos')}
            className="petpooja-btn-kot flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-slate-950 text-xs font-black shadow-pos-amber"
          >
            <UtensilsCrossed className="w-4 h-4 stroke-[2.5]" />
            <span>OPEN POS TERMINAL</span>
          </button>
        </div>
      </div>

      {/* 2. VIBRANT PETPOOJA KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div
              key={index}
              className={`p-5 rounded-3xl bg-gradient-to-br ${kpi.bgGradient} border ${kpi.borderColor} shadow-lg relative overflow-hidden backdrop-blur-md group hover:scale-[1.02] transition-all duration-200`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{kpi.title}</p>
                  <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1.5 font-num tracking-tight">{kpi.value}</h3>
                </div>
                <div className={`p-3 rounded-2xl border ${kpi.iconColor} shadow-md`}>
                  <Icon className="w-6 h-6 stroke-[2.4]" />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-pos-border/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium truncate max-w-[160px]">{kpi.subtitle}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${kpi.badgeColor} shrink-0`}>
                  {kpi.badge}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. LIVE FLOOR TABLE OCCUPANCY MATRIX STRIP */}
      {tables.length > 0 && (
        <div className="pos-surface-glass rounded-3xl p-5 border border-pos-border shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Grid2X2 className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white font-display">Live Floor Tables Status</h3>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-pos-dark text-slate-700 dark:text-slate-300 border border-pos-border font-bold">
                {occupiedTables} / {tables.length} Tables Occupied ({occupancyPercent}%)
              </span>
            </div>
            <button
              onClick={() => navigate('/tables')}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-bold flex items-center space-x-1"
            >
              <span>Manage Floor Plan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mini Table Pills Bar */}
          <div className="flex items-center space-x-2 overflow-x-auto py-1 scrollbar-thin">
            {tables.map((t) => {
              const isOcc = t.status === 'OCCUPIED';
              const isBillReq = t.status === 'BILL_REQUESTED';
              return (
                <button
                  key={t.id}
                  onClick={() => navigate('/pos')}
                  className={`px-3.5 py-2.5 rounded-2xl text-left shrink-0 border transition-all pos-btn-touch ${
                    isBillReq
                      ? 'bg-purple-100 dark:bg-purple-950/80 border-purple-400 dark:border-purple-500 text-purple-900 dark:text-purple-200 animate-pulse-subtle'
                      : isOcc
                      ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 dark:border-amber-500 text-amber-900 dark:text-amber-200 shadow-pos-amber'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-300 hover:border-emerald-500'
                  }`}
                >
                  <div className="flex items-center justify-between space-x-2">
                    <span className="text-xs font-black font-display text-slate-900 dark:text-white">T-{t.tableNumber}</span>
                    <span className="text-[9px] font-mono opacity-80 font-bold">👥 {t.capacity}</span>
                  </div>
                  <div className="text-[10px] font-extrabold mt-0.5 uppercase">
                    {isBillReq ? 'Bill Req' : isOcc ? 'Occupied' : 'Vacant'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. LOW STOCK ALERT BANNER */}
      {lowStockItems.length > 0 && (
        <div className="p-4.5 rounded-3xl bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 dark:border-amber-500/70 flex items-start justify-between shadow-pos-amber backdrop-blur-md">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5 border border-amber-500/40">
              <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-900 dark:text-amber-200">
                Low Inventory Warning: {lowStockItems.length} ingredients below safe stock level!
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300/80 mt-0.5 font-medium">
                Items: {lowStockItems.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/inventory')}
            className="pos-btn-touch px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shrink-0 ml-4 shadow-md transition-colors"
          >
            Refill Stock
          </button>
        </div>
      )}

      {/* 5. MAIN SPLIT GRID (RECENT LIVE ORDERS & TOP SELLING DISHES) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Live Orders (2 Cols) */}
        <div className="lg:col-span-2 pos-surface-glass rounded-3xl p-5 shadow-xl border border-pos-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-pos-border">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h3 className="font-black text-sm text-slate-900 dark:text-white font-display">Recent Cloud Orders & Tickets</h3>
              </div>
              <button
                onClick={() => navigate('/orders')}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold flex items-center space-x-1"
              >
                <span>View Full Order History</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-pos-border">
                    <th className="pb-3 font-black uppercase tracking-wider text-[10px]">Order #</th>
                    <th className="pb-3 font-black uppercase tracking-wider text-[10px]">Type / Table</th>
                    <th className="pb-3 font-black uppercase tracking-wider text-[10px]">Items</th>
                    <th className="pb-3 font-black uppercase tracking-wider text-[10px]">Amount</th>
                    <th className="pb-3 font-black uppercase tracking-wider text-[10px]">KDS Status</th>
                    <th className="pb-3 font-black uppercase tracking-wider text-[10px]">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-border/60">
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-10 text-center text-slate-400">
                        <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
                        <p className="font-bold text-slate-700 dark:text-slate-300">No live orders found</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Create your first ticket in the POS Terminal!</p>
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-pos-card-hover transition-colors">
                        <td className="py-3.5 font-black text-slate-900 dark:text-white font-num">#{order.orderNumber}</td>
                        <td className="py-3.5">
                          {order.orderType === 'DINE_IN' ? (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-slate-900 text-amber-700 dark:text-amber-300 font-black border border-amber-300 dark:border-amber-500/30 text-[11px]">
                              🍽️ {order.tableNumber ? `Table ${order.tableNumber}` : 'Dine-In'}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-black border border-blue-300 dark:border-blue-600/40 text-[11px]">
                              🥡 Takeaway
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-slate-600 dark:text-slate-300 font-medium">
                          {order.items?.length || 0} items
                        </td>
                        <td className="py-3.5 font-black text-slate-900 dark:text-white font-num text-sm">
                          {currencySymbol}{order.totalAmount?.toFixed(2)}
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide ${
                              order.orderStatus === 'CONFIRMED'
                                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40'
                                : order.orderStatus === 'PREPARING'
                                ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-500/40'
                                : order.orderStatus === 'READY'
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {order.orderStatus}
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide ${
                              order.paymentStatus === 'PAID'
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40'
                                : 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40'
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

          <div className="mt-4 pt-3 border-t border-pos-border flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Showing top {recentOrders.length} active transactions</span>
            <button
              onClick={() => navigate('/pos')}
              className="text-amber-600 dark:text-amber-400 hover:underline font-bold"
            >
              + Create New Ticket
            </button>
          </div>
        </div>

        {/* Top Selling Dishes & Quick Actions (1 Col) */}
        <div className="space-y-6">
          {/* Top Selling Leaderboard */}
          <div className="pos-surface-glass rounded-3xl p-5 shadow-xl border border-pos-border flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 pb-4 border-b border-pos-border">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <h3 className="font-black text-sm text-slate-900 dark:text-white font-display">Top Selling Dishes</h3>
              </div>

              <div className="space-y-3 mt-4">
                {popularItems.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">
                    Settle orders in POS to generate sales leaderboard.
                  </p>
                ) : (
                  popularItems.map((item, index) => {
                    const pct = Math.round((item.quantity / maxPopularQty) * 100);
                    const rankBadge = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                    return (
                      <div
                        key={index}
                        className="p-3.5 rounded-2xl bg-pos-card border border-pos-border hover:border-amber-500/40 transition-colors space-y-2 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2.5 overflow-hidden">
                            <span className="text-sm font-black font-mono shrink-0">{rankBadge}</span>
                            <div className="overflow-hidden">
                              <p className="text-xs font-black text-slate-900 dark:text-white truncate">{item.name}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{item.quantity} portions sold</p>
                            </div>
                          </div>
                          <p className="text-xs font-black text-amber-600 dark:text-amber-400 font-num shrink-0">
                            {currencySymbol}{item.revenue.toFixed(2)}
                          </p>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-yellow-400 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-pos-border">
              <button
                onClick={() => navigate('/reports')}
                className="pos-btn-touch w-full py-2.5 rounded-xl bg-pos-card hover:bg-pos-card-hover text-slate-700 dark:text-slate-200 text-xs font-bold text-center border border-pos-border transition-colors shadow-sm"
              >
                View Full Sales & Item Reports →
              </button>
            </div>
          </div>

          {/* Fast Shortcuts Grid */}
          <div className="pos-surface-glass rounded-3xl p-5 border border-pos-border shadow-xl space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Quick Modules</h4>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => navigate('/menu-admin')}
                className="p-3 rounded-2xl bg-pos-card border border-pos-border hover:border-amber-500/40 text-left transition-all pos-btn-touch shadow-sm"
              >
                <span className="text-base block mb-1">📖</span>
                <p className="text-xs font-black text-slate-900 dark:text-white">Menu Catalog</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Edit items & prices</p>
              </button>

              <button
                onClick={() => navigate('/inventory')}
                className="p-3 rounded-2xl bg-pos-card border border-pos-border hover:border-emerald-500/40 text-left transition-all pos-btn-touch shadow-sm"
              >
                <span className="text-base block mb-1">📦</span>
                <p className="text-xs font-black text-slate-900 dark:text-white">Stock Control</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Inventory & alerts</p>
              </button>

              <button
                onClick={() => navigate('/reservations')}
                className="p-3 rounded-2xl bg-pos-card border border-pos-border hover:border-blue-500/40 text-left transition-all pos-btn-touch shadow-sm"
              >
                <span className="text-base block mb-1">📅</span>
                <p className="text-xs font-black text-slate-900 dark:text-white">Bookings</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{reservations.length} total seats</p>
              </button>

              <button
                onClick={() => navigate('/invoices')}
                className="p-3 rounded-2xl bg-pos-card border border-pos-border hover:border-purple-500/40 text-left transition-all pos-btn-touch shadow-sm"
              >
                <span className="text-base block mb-1">🧾</span>
                <p className="text-xs font-black text-slate-900 dark:text-white">Invoices</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Print & reprints</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
