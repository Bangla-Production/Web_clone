import React, { useState } from 'react';
import { Printer, X, SlidersHorizontal, Check } from 'lucide-react';
import Modal from '../common/Modal';
import PrintableReceipt from './PrintableReceipt';
import PrintableKOT from './PrintableKOT';
import { useRestaurant } from '../../context/RestaurantContext';
import { dispatchThermalPrint } from '../../services/thermalPrintService';

export default function InvoiceModal({ isOpen, onClose, invoice = null, kot = null }) {
  const { restaurant } = useRestaurant();
  const [paperSize, setPaperSize] = useState('80mm');
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen || (!invoice && !kot)) return null;

  const isKOT = !!kot;
  const title = isKOT ? `Kitchen Ticket #${kot.kotNumber || 'KOT'}` : `Tax Invoice #${invoice?.invoiceNumber || 'INV'}`;

  const handlePrint = async () => {
    setIsPrinting(true);
    await dispatchThermalPrint({
      type: isKOT ? 'KOT' : 'RECEIPT',
      data: isKOT ? kot : invoice,
      restaurant,
      paperSize,
      onFallback: () => window.print()
    });
    setIsPrinting(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Paper Size Selector */}
        <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs no-print">
          <span className="text-slate-400 font-medium flex items-center space-x-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Thermal Format:</span>
          </span>
          <div className="flex space-x-1.5">
            <button
              type="button"
              onClick={() => setPaperSize('80mm')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                paperSize === '80mm'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              80mm Standard
            </button>
            <button
              type="button"
              onClick={() => setPaperSize('58mm')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                paperSize === '58mm'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              58mm Compact
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="print-container bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex justify-center max-h-[60vh] overflow-y-auto">
          {isKOT ? (
            <PrintableKOT kot={kot} restaurant={restaurant} paperSize={paperSize} />
          ) : (
            <PrintableReceipt invoice={invoice} restaurant={restaurant} paperSize={paperSize} />
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Printing...' : isKOT ? 'Print KOT' : 'Print Receipt'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
