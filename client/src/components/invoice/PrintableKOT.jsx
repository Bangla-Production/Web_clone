import React from 'react';

export default function PrintableKOT({ kot, restaurant, paperSize = '80mm' }) {
  if (!kot) return null;

  const is58mm = paperSize === '58mm';
  const items = kot.items || [];
  const kotTime = kot.createdAt
    ? typeof kot.createdAt === 'string'
      ? new Date(kot.createdAt)
      : kot.createdAt.toDate ? kot.createdAt.toDate() : new Date()
    : new Date();

  return (
    <div
      className={`bg-white text-black p-4 rounded font-mono text-xs shadow-inner border border-gray-300 mx-auto select-none print:shadow-none print:border-none print:p-0 ${
        is58mm ? 'max-w-[58mm] text-[10px]' : 'max-w-[80mm] text-xs'
      }`}
      style={{ fontFamily: '"Courier New", Courier, monospace' }}
    >
      {/* Header */}
      <div className="text-center pb-2 border-b-2 border-black space-y-0.5">
        <h2 className="text-sm font-black uppercase tracking-tight text-black">
          {restaurant?.name || 'RESTAURANT KITCHEN'}
        </h2>
        <div className="text-[13px] font-black tracking-wider bg-black text-white px-2 py-0.5 inline-block rounded-sm my-1">
          *** KITCHEN ORDER TICKET ***
        </div>
        <p className="text-[11px] font-bold">KOT #{kot.kotNumber || 'KOT-1'}</p>
      </div>

      {/* Ticket Meta Info */}
      <div className="py-2 border-b-2 border-dashed border-black text-[11px] space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-base font-black border-2 border-black px-2 py-0.5 rounded">
            TABLE: {kot.tableNumber || (kot.orderType === 'TAKEAWAY' ? 'TAKEAWAY' : 'DINE-IN')}
          </span>
          <span className="font-bold uppercase text-[10px] bg-gray-100 px-1.5 py-0.5 border border-gray-400 rounded">
            {kot.orderType || 'DINE_IN'}
          </span>
        </div>

        <div className="flex justify-between text-[10px] text-gray-800 pt-1">
          <span>Order: #{kot.orderNumber || 'N/A'}</span>
          <span>Station: {kot.printerDestination || 'KITCHEN'}</span>
        </div>

        <div className="flex justify-between text-[10px] text-gray-800">
          <span>Server: <strong>{kot.waiterName || 'Staff'}</strong></span>
          <span>{kotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {kot.orderNotes && (
          <div className="p-1.5 bg-yellow-50 border border-black rounded text-[10px] font-bold text-black mt-1">
            ⚠️ ORDER NOTE: {kot.orderNotes}
          </div>
        )}
      </div>

      {/* Ordered Items List */}
      <div className="py-2 border-b-2 border-black">
        <div className="flex justify-between font-black text-[11px] pb-1 border-b border-black">
          <span className="w-16 text-center">QTY</span>
          <span className="flex-1 text-left pl-2">ITEM DESCRIPTION</span>
        </div>

        <div className="divide-y divide-gray-300">
          {items.map((item, idx) => (
            <div key={idx} className="py-1.5">
              <div className="flex items-start">
                <span className="w-16 text-center font-black text-sm bg-black text-white rounded px-1 shrink-0">
                  {item.quantity}x
                </span>
                <span className="flex-1 text-left pl-2 font-bold text-[12px] leading-tight text-black">
                  {item.name}
                </span>
              </div>
              {item.notes && item.notes.trim().length > 0 && (
                <div className="ml-16 pl-2 text-[10px] font-extrabold text-red-600 italic">
                  👉 Note: {item.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Cut Line */}
      <div className="text-center pt-2 text-[10px] text-gray-800 space-y-1">
        <p className="font-bold">Total Items: {items.reduce((s, i) => s + (parseInt(i.quantity, 10) || 1), 0)}</p>
        <p className="text-[9px] text-gray-500 font-mono tracking-widest">----------------- CUT HERE -----------------</p>
      </div>
    </div>
  );
}
