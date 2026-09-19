import React from 'react';

export default function PrintableReceipt({ invoice, restaurant, paperSize = '80mm' }) {
  if (!invoice) return null;

  const is58mm = paperSize === '58mm';
  const order = invoice.order || {};
  const items = invoice.items || order.items || [];
  const currencySymbol = restaurant?.currencySymbol || '₹';
  const tableNum = invoice.tableNumber || order.table?.tableNumber || (order.tableNumber ? order.tableNumber : null);
  const issuedTime = invoice.issuedAt || invoice.createdAt || Date.now();
  const dateObj = typeof issuedTime === 'string' ? new Date(issuedTime) : (issuedTime.toDate ? issuedTime.toDate() : new Date());

  return (
    <div
      className={`bg-white text-black p-4 rounded font-mono shadow-inner border border-gray-300 mx-auto select-none print:shadow-none print:border-none print:p-0 ${
        is58mm ? 'max-w-[58mm] text-[10px]' : 'max-w-[80mm] text-xs'
      }`}
      style={{ fontFamily: '"Courier New", Courier, monospace' }}
    >
      {/* Restaurant Header */}
      <div className="text-center pb-2 border-b-2 border-dashed border-black space-y-0.5">
        <h2 className="text-sm font-black uppercase tracking-tight text-black">
          {restaurant?.name || 'SPICE HAVEN BISTRO'}
        </h2>
        {restaurant?.tagline && (
          <p className="text-[10px] text-gray-700 italic">{restaurant.tagline}</p>
        )}
        <p className="text-[10px] text-gray-800">{restaurant?.address}</p>
        {restaurant?.phone && (
          <p className="text-[10px] text-gray-800">Ph: {restaurant.phone}</p>
        )}
        {restaurant?.gstin && (
          <p className="text-[10px] font-bold text-black">GSTIN: {restaurant.gstin}</p>
        )}
      </div>

      {/* Invoice Details */}
      <div className="py-2 border-b border-dashed border-black text-[11px] space-y-0.5">
        <div className="flex justify-between font-black">
          <span>TAX INVOICE: {invoice.invoiceNumber || 'INV-001'}</span>
          <span className="bg-black text-white px-1 rounded text-[10px] uppercase">
            {invoice.paymentStatus || 'PAID'}
          </span>
        </div>
        <div className="flex justify-between text-gray-800 text-[10px]">
          <span>Order: #{invoice.orderNumber || order.orderNumber || 'N/A'}</span>
          <span>Type: {invoice.orderType || order.orderType || 'DINE_IN'}</span>
        </div>
        {tableNum && (
          <div className="flex justify-between text-black font-bold text-[11px]">
            <span>TABLE: {tableNum}</span>
            <span>Server: {invoice.waiterName || invoice.billedBy || 'Staff'}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-700 text-[10px]">
          <span>Date: {dateObj.toLocaleDateString()}</span>
          <span>Time: {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {(invoice.customerName || invoice.customerPhone) && (
          <div className="text-gray-800 pt-0.5 text-[10px]">
            Customer: <strong>{invoice.customerName || 'Walk-in'}</strong> {invoice.customerPhone ? `(${invoice.customerPhone})` : ''}
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="py-2 border-b-2 border-dashed border-black">
        <div className="flex justify-between font-black text-[10px] pb-1 border-b border-black">
          <span className="w-1/2 text-left">ITEM</span>
          <span className="w-1/6 text-center">QTY</span>
          <span className="w-1/6 text-right">RATE</span>
          <span className="w-1/6 text-right">AMT</span>
        </div>
        <div className="divide-y divide-gray-200 text-[11px]">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between py-1">
              <span className="w-1/2 text-left font-semibold truncate">{item.name}</span>
              <span className="w-1/6 text-center font-bold">{item.quantity}</span>
              <span className="w-1/6 text-right">{item.price?.toFixed(2)}</span>
              <span className="w-1/6 text-right font-black">
                {(item.itemTotal || (item.price * item.quantity)).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Breakdown */}
      <div className="py-2 border-b-2 border-black space-y-1 text-[11px]">
        <div className="flex justify-between text-gray-800">
          <span>Subtotal:</span>
          <span>{currencySymbol}{invoice.subtotal?.toFixed(2)}</span>
        </div>
        {invoice.discountAmount > 0 && (
          <div className="flex justify-between text-black font-bold">
            <span>Discount:</span>
            <span>- {currencySymbol}{invoice.discountAmount?.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-800">
          <span>{restaurant?.taxName || 'GST'} ({restaurant?.taxRate || 5}%):</span>
          <span>{currencySymbol}{invoice.taxAmount?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-black text-sm pt-1 border-t-2 border-black text-black">
          <span>GRAND TOTAL:</span>
          <span>{currencySymbol}{invoice.totalAmount?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-800 pt-0.5 font-bold">
          <span>Payment Mode:</span>
          <span className="uppercase">{invoice.paymentMethod || 'CASH'}</span>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="text-center pt-2 text-[10px] text-gray-800 space-y-0.5">
        <p className="font-bold">{restaurant?.invoiceHeader || 'Thank you for dining with us!'}</p>
        <p>{restaurant?.invoiceFooter || 'Visit Again!'}</p>
        <p className="text-[9px] text-gray-500 font-mono tracking-widest pt-1">
          ----------------- CUT HERE -----------------
        </p>
      </div>
    </div>
  );
}
