import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Utensils,
  Search,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Sparkles,
  Info,
  Lock,
  CheckCircle2,
  CalendarDays
} from 'lucide-react';
import {
  getRestaurantById,
  getCategories,
  getMenuItems,
  createReservation
} from '../services/firestoreService';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';

export default function PublicMenuPage() {
  const { restaurantId } = useParams();
  const activeId = restaurantId || 'spice-haven';

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  // Table Booking Modal
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCount, setGuestCount] = useState('2');
  const [bookDate, setBookDate] = useState(new Date().toISOString().slice(0, 10));
  const [bookTime, setBookTime] = useState('19:30');
  const [bookNotes, setBookNotes] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const toast = useToast();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [restData, catList, itemList] = await Promise.all([
          getRestaurantById(activeId),
          getCategories(activeId),
          getMenuItems(activeId)
        ]);

        if (restData) setRestaurant(restData);
        if (catList) setCategories(catList);
        if (itemList) setMenuItems(itemList);
      } catch (err) {
        console.error('Failed to load public menu from Firestore:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [activeId]);

  const currencySymbol = restaurant?.currencySymbol || '₹';

  const handleBookTable = async (e) => {
    e.preventDefault();
    if (!guestName || !guestPhone) return;

    try {
      await createReservation(activeId, {
        customerName: guestName,
        customerPhone: guestPhone,
        partySize: parseInt(guestCount, 10) || 2,
        reservationDate: bookDate,
        reservationTime: bookTime,
        tableNumber: 'Online Booking',
        notes: bookNotes
      });
      setBookingSuccess(true);
      toast.success('Table booking requested successfully!');
    } catch (err) {
      toast.error('Failed to submit booking.');
    }
  };

  const filteredItems = menuItems.filter((item) => {
    const matchesCat = selectedCat === 'ALL' || item.categoryId === selectedCat;
    const matchesSearch =
      search === '' ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    const matchesVeg = !vegOnly || item.isVeg;

    return matchesCat && matchesSearch && matchesVeg;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Top Floating Staff Login Bar */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {restaurant?.logoUrl ? (
            <img src={restaurant.logoUrl} alt="Logo" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
              {restaurant?.name?.charAt(0) || 'R'}
            </div>
          )}
          <span className="font-bold text-sm text-white truncate max-w-[180px] sm:max-w-none">
            {restaurant?.name || 'Spice Haven Bistro'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setBookingSuccess(false);
              setIsBookOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Book Table</span>
          </button>
          <Link
            to="/login"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Staff</span>
          </Link>
        </div>
      </header>

      {/* Hero Banner with Restaurant Details */}
      <div className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-b border-slate-800 px-4 py-8 text-center sm:py-12">
        <div className="max-w-2xl mx-auto space-y-3">
          {restaurant?.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt="Logo"
              className="w-16 h-16 rounded-2xl mx-auto object-cover border-2 border-emerald-500/40 shadow-xl shadow-emerald-950/50"
            />
          ) : (
            <div className="inline-flex p-3 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 shadow-xl shadow-emerald-950/50 mb-1">
              <Utensils className="w-7 h-7" />
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {restaurant?.name || 'Spice Haven Bistro'}
          </h1>
          {restaurant?.tagline && (
            <p className="text-xs sm:text-sm text-emerald-400 font-medium">{restaurant.tagline}</p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 pt-2">
            {restaurant?.address && (
              <div className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>{restaurant.address}</span>
              </div>
            )}
            {restaurant?.phone && (
              <div className="flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>{restaurant.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Search & Category Navigation Bar */}
      <div className="sticky top-12 z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 space-y-3 shadow-md">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search delicious dishes..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <label className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 cursor-pointer self-stretch sm:self-auto justify-center">
            <input
              type="checkbox"
              checked={vegOnly}
              onChange={(e) => setVegOnly(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Pure Veg Only</span>
          </label>
        </div>

        {/* Category Pill Filters */}
        <div className="max-w-4xl mx-auto flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCat('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCat === 'ALL'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCat === cat.id
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Cards Grid */}
      <main className="max-w-4xl mx-auto px-4 mt-6">
        {loading ? (
          <div className="py-16 text-center text-emerald-400">Loading dishes...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <Info className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm">No dishes found matching your search or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 shadow-xl flex gap-4 transition-transform hover:-translate-y-0.5 relative overflow-hidden"
              >
                {/* Food Image (ImgBB Hosted) */}
                {item.imageUrl && (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-slate-950 shrink-0 relative">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {!item.isAvailable && (
                      <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-1 text-center">
                        <span className="text-[10px] font-bold text-rose-400">Sold Out</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <h3 className="font-bold text-sm text-slate-100 leading-snug">{item.name}</h3>
                      <span
                        className={`w-3 h-3 rounded-full shrink-0 border mt-0.5 ${
                          item.isVeg
                            ? 'bg-emerald-500 border-emerald-400'
                            : 'bg-rose-500 border-rose-400'
                        }`}
                        title={item.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                      />
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/80">
                    <span className="text-base font-extrabold text-emerald-400">
                      {currencySymbol}{item.price?.toFixed(2)}
                    </span>
                    {!item.isAvailable && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                        Out of Stock
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Table Booking Modal */}
      {isBookOpen && (
        <Modal
          isOpen={isBookOpen}
          onClose={() => setIsBookOpen(false)}
          title="Reserve a Table Online"
          maxWidth="max-w-md"
        >
          {bookingSuccess ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="font-bold text-base text-white">Table Booking Confirmed!</h3>
              <p className="text-xs text-slate-300">
                Thank you, {guestName}. We have received your booking for {guestCount} guests on {bookDate} at {bookTime}.
              </p>
              <button
                onClick={() => setIsBookOpen(false)}
                className="mt-3 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleBookTable} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Your Full Name *</label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Suman Sen"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Mobile Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Guests</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Date</label>
                  <input
                    type="date"
                    value={bookDate}
                    onChange={(e) => setBookDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Time</label>
                  <input
                    type="time"
                    value={bookTime}
                    onChange={(e) => setBookTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Special Instructions</label>
                <textarea
                  rows={2}
                  value={bookNotes}
                  onChange={(e) => setBookNotes(e.target.value)}
                  placeholder="Birthday celebration, high chair required..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBookOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md"
                >
                  Confirm Table Request
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 mt-12 text-center text-xs text-slate-500 space-y-1">
        <p>Prices are exclusive of applicable taxes ({restaurant?.taxRate || 5}% {restaurant?.taxName || 'GST'}).</p>
        <p className="text-[10px]">RestoPulse Cloud Digital Dining Menu</p>
      </footer>
    </div>
  );
}
