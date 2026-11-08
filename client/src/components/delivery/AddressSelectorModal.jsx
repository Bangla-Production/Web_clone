import React, { useState, useEffect } from 'react';
import { MapPin, Home, Briefcase, Plus, Check, X, Navigation } from 'lucide-react';
import {
  getCustomerSavedAddresses,
  addCustomerSavedAddress,
  saveCustomerLocation,
} from '../../services/locationService';

export default function AddressSelectorModal({ isOpen, onClose, customerId, onAddressSelected }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // New address form state
  const [label, setLabel] = useState('Home');
  const [formattedAddress, setFormattedAddress] = useState('');
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (isOpen && customerId) {
      setLoading(true);
      getCustomerSavedAddresses(customerId)
        .then(setAddresses)
        .finally(() => setLoading(false));
    }
  }, [isOpen, customerId]);

  if (!isOpen) return null;

  const handleSelect = (addr) => {
    const locObj = {
      lat: addr.lat || 22.5726,
      lng: addr.lng || 88.3639,
      formattedAddress: addr.formattedAddress,
      shortAddress: addr.formattedAddress.split(',')[0],
      label: addr.label,
      instructions: addr.deliveryInstructions,
    };
    saveCustomerLocation(locObj);
    if (onAddressSelected) onAddressSelected(locObj);
    onClose();
  };

  const handleAddNew = async (e) => {
    e.preventDefault();
    if (!formattedAddress.trim()) return;
    try {
      const added = await addCustomerSavedAddress(customerId, {
        label,
        formattedAddress: formattedAddress.trim(),
        deliveryInstructions: instructions.trim(),
        lat: 22.5726,
        lng: 88.3639,
      });
      if (added) {
        setAddresses((prev) => [added, ...prev]);
        handleSelect(added);
      }
    } catch (err) {
      console.error('Save address error:', err);
    }
  };

  const getIcon = (type) => {
    if (type === 'Home') return <Home className="w-4 h-4 text-amber-500" />;
    if (type === 'Work') return <Briefcase className="w-4 h-4 text-cyan-500" />;
    return <MapPin className="w-4 h-4 text-purple-500" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">
          Select Delivery Address
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Choose a saved address or add a new delivery location.
        </p>

        {!showAddForm ? (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading addresses...</p>
            ) : addresses.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30 text-amber-500" />
                No saved addresses yet.
              </div>
            ) : (
              addresses.map((addr) => (
                <div
                  key={addr.id}
                  onClick={() => handleSelect(addr)}
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 cursor-pointer transition-all flex items-start gap-3"
                >
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
                    {getIcon(addr.label)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                      {addr.label}
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                      {addr.formattedAddress}
                    </p>
                    {addr.deliveryInstructions && (
                      <p className="text-[11px] text-slate-400 italic mt-0.5">
                        Note: {addr.deliveryInstructions}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}

            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-500 hover:text-amber-500 font-bold text-xs flex items-center justify-center gap-2 transition-colors mt-2"
            >
              <Plus className="w-4 h-4" /> Add New Address
            </button>
          </div>
        ) : (
          <form onSubmit={handleAddNew} className="space-y-3">
            {/* Label Selector */}
            <div className="flex gap-2">
              {['Home', 'Work', 'Other'].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabel(l)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    label === l
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <textarea
              required
              rows={2}
              placeholder="Flat / House no, Building, Street, Landmark *"
              value={formattedAddress}
              onChange={(e) => setFormattedAddress(e.target.value)}
              className="w-full p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <input
              type="text"
              placeholder="Delivery instructions (e.g. Leave with security)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs shadow-md"
              >
                Save & Use
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
