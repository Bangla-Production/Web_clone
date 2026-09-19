import React, { useState, useEffect, useRef } from 'react';
import {
  ChefHat,
  Clock,
  CheckCircle,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Bell,
  Printer,
  Flame,
  AlertTriangle,
  Sparkles,
  UtensilsCrossed
} from 'lucide-react';
import {
  subscribeToKitchenKOTs,
  updateKOTStatus,
  markKOTPrinted
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { kitchenAudio, dispatchThermalPrint } from '../services/thermalPrintService';
import InvoiceModal from '../components/invoice/InvoiceModal';

export default function KitchenPage() {
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [selectedKOTForPrint, setSelectedKOTForPrint] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const { activeRestaurantId } = useAuth();
  const toast = useToast();

  // Track known KOT IDs to play audio only on genuinely NEW incoming KOTs
  const knownKotIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToKitchenKOTs(activeRestaurantId, (liveKots) => {
      // Check for new KOTs
      if (!isFirstLoadRef.current) {
        const hasBrandNew = liveKots.some(
          k => !knownKotIdsRef.current.has(k.id) && k.status === 'NEW'
        );
        if (hasBrandNew && !isAudioMuted) {
          kitchenAudio.playOrderBell();
          toast.info('🔔 New Kitchen Order Ticket received!');
        }
      } else {
        isFirstLoadRef.current = false;
      }

      // Update known set
      knownKotIdsRef.current = new Set(liveKots.map(k => k.id));
      setKots(liveKots);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [activeRestaurantId, isAudioMuted, toast]);

  const toggleMute = () => {
    const nextState = !isAudioMuted;
    setIsAudioMuted(nextState);
    kitchenAudio.setMuted(nextState);
    toast.info(nextState ? 'Kitchen audio alerts muted.' : 'Kitchen audio alerts enabled.');
  };

  const handleTestSound = () => {
    kitchenAudio.playOrderBell();
    toast.info('Sound test played.');
  };

  const handleStatusChange = async (kot, newStatus) => {
    try {
      await updateKOTStatus(activeRestaurantId, kot.id, newStatus, kot.orderId);
      toast.success(`KOT #${kot.kotNumber} moved to ${newStatus}`);
    } catch (err) {
      toast.error('Failed to update KOT status.');
    }
  };

  const handlePrintKOT = (kot) => {
    setSelectedKOTForPrint(kot);
    setIsPrintModalOpen(true);
  };

  // Group KOTs into columns
  const newKots = kots.filter(k => k.status === 'NEW');
  const preparingKots = kots.filter(k => ['CONFIRMED', 'PREPARING'].includes(k.status));
  const readyKots = kots.filter(k => k.status === 'READY');

  const getTimeElapsed = (createdAt) => {
    const time = typeof createdAt === 'string' ? new Date(createdAt).getTime() : Date.now();
    const diffMs = Date.now() - time;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins === 1) return '1m ago';
    return `${mins}m ago`;
  };

  const isKOTDelayed = (createdAt) => {
    const time = typeof createdAt === 'string' ? new Date(createdAt).getTime() : Date.now();
    const diffMs = Date.now() - time;
    return diffMs > 15 * 60 * 1000; // > 15 minutes
  };

  return (
    <div className="space-y-3 h-[calc(100vh-4.5rem)] flex flex-col">
      {/* 1. TOP HEADER & AUDIO CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl shrink-0 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-orange-950/80 border border-orange-700/60 text-orange-400 shadow">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
              <span>Kitchen Display System (KDS)</span>
              <span className="text-[11px] bg-orange-950/60 border border-orange-600/80 text-orange-300 font-semibold px-2 py-0.5 rounded-full">
                {kots.length} Active Tickets
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Live incoming tickets & chef preparation workflow ({activeRestaurantId})
            </p>
          </div>
        </div>

        {/* Audio Alert Toolbar */}
        <div className="flex items-center space-x-2 self-end sm:self-auto text-xs">
          <button
            type="button"
            onClick={toggleMute}
            className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center space-x-1.5 transition-all ${
              isAudioMuted
                ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                : 'bg-emerald-950/80 border-emerald-700/70 text-emerald-300 shadow'
            }`}
          >
            {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{isAudioMuted ? 'Muted' : 'Sound ON'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestSound}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition-colors flex items-center space-x-1"
          >
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Bell</span>
          </button>
        </div>
      </div>

      {/* 2. 3-STAGE KANBAN BOARD */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 overflow-hidden min-h-0">
        {/* COLUMN 1: NEW / INCOMING TICKETS */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-lg">
          <div className="p-3 bg-amber-950/40 border-b border-amber-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-amber-200">
                1. New Incoming ({newKots.length})
              </h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {newKots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs">
                <ChefHat className="w-8 h-8 text-slate-700 mb-2 opacity-50" />
                No new incoming tickets
              </div>
            ) : (
              newKots.map((kot) => (
                <div
                  key={kot.id}
                  className={`p-3 rounded-xl border shadow-md space-y-2.5 transition-all ${
                    isKOTDelayed(kot.createdAt)
                      ? 'bg-rose-950/40 border-rose-600/80 animate-pulse'
                      : 'bg-slate-950 border-amber-600/60'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-black text-amber-400">
                          {kot.tableNumber ? `Table ${kot.tableNumber}` : kot.orderType}
                        </span>
                        <span className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
                          {kot.kotNumber}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Server: <strong className="text-slate-200">{kot.waiterName || 'Staff'}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 flex items-center justify-end space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{getTimeElapsed(kot.createdAt)}</span>
                      </span>
                      {isKOTDelayed(kot.createdAt) && (
                        <span className="text-[9px] font-black text-rose-400 bg-rose-950/80 px-1 rounded border border-rose-700 mt-0.5 inline-block">
                          ⚠️ DELAYED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Order Notes if any */}
                  {kot.orderNotes && (
                    <div className="p-1.5 bg-yellow-950/40 border border-yellow-800/80 rounded-lg text-[10px] text-yellow-300 font-bold">
                      Note: {kot.orderNotes}
                    </div>
                  )}

                  {/* Items List */}
                  <div className="space-y-1.5 divide-y divide-slate-900">
                    {(kot.items || []).map((item, idx) => (
                      <div key={idx} className="pt-1.5 first:pt-0">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-xs flex items-center justify-center shrink-0">
                            {item.quantity}x
                          </span>
                          <span className="text-xs font-bold text-white">
                            {item.name}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-orange-400 font-extrabold italic pl-8">
                            👉 {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions: Start Preparing & Print */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintKOT(kot)}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center space-x-1"
                      title="Print KOT Thermal Slip"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(kot, 'PREPARING')}
                      className="flex-1 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow flex items-center justify-center space-x-1.5 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Accept & Start Cooking</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN 2: PREPARING (IN COOKING) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-lg">
          <div className="p-3 bg-blue-950/40 border-b border-blue-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-blue-400 animate-pulse" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-blue-200">
                2. In Cooking / Preparing ({preparingKots.length})
              </h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {preparingKots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs">
                <UtensilsCrossed className="w-8 h-8 text-slate-700 mb-2 opacity-50" />
                No tickets currently in preparation
              </div>
            ) : (
              preparingKots.map((kot) => (
                <div
                  key={kot.id}
                  className={`p-3 rounded-xl border shadow-md space-y-2.5 transition-all ${
                    isKOTDelayed(kot.createdAt)
                      ? 'bg-rose-950/30 border-rose-600/80'
                      : 'bg-slate-950 border-blue-800/60'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-black text-blue-300">
                          {kot.tableNumber ? `Table ${kot.tableNumber}` : kot.orderType}
                        </span>
                        <span className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
                          {kot.kotNumber}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Server: <strong className="text-slate-200">{kot.waiterName || 'Staff'}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 flex items-center justify-end space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{getTimeElapsed(kot.createdAt)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 divide-y divide-slate-900">
                    {(kot.items || []).map((item, idx) => (
                      <div key={idx} className="pt-1.5 first:pt-0">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 font-extrabold text-xs flex items-center justify-center shrink-0">
                            {item.quantity}x
                          </span>
                          <span className="text-xs font-bold text-white">
                            {item.name}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-orange-400 font-extrabold italic pl-8">
                            👉 {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions: Mark Ready & Print */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintKOT(kot)}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center space-x-1"
                      title="Re-print KOT Slip"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(kot, 'READY')}
                      className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow flex items-center justify-center space-x-1.5 transition-all"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Mark Dishes Ready</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN 3: READY / PLATED */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-lg">
          <div className="p-3 bg-emerald-950/40 border-b border-emerald-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-200">
                3. Ready for Pickup ({readyKots.length})
              </h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {readyKots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs">
                <CheckCircle className="w-8 h-8 text-slate-700 mb-2 opacity-50" />
                No completed dishes waiting for pickup
              </div>
            ) : (
              readyKots.map((kot) => (
                <div
                  key={kot.id}
                  className="p-3 rounded-xl border bg-slate-950 border-emerald-800/80 shadow-md space-y-2.5"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <span className="text-base font-black text-emerald-400">
                        {kot.tableNumber ? `Table ${kot.tableNumber}` : kot.orderType}
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Server: <strong className="text-white">{kot.waiterName || 'Staff'}</strong>
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-700">
                      READY TO SERVE
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    {(kot.items || []).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-slate-200">
                        <span>{item.quantity}x {item.name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(kot, 'SERVED')}
                      className="py-1.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-colors"
                    >
                      Dismiss / Served
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. THERMAL KOT PRINT MODAL */}
      <InvoiceModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        kot={selectedKOTForPrint}
      />
    </div>
  );
}
