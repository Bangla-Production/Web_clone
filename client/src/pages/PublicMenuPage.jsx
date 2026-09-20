import { getStockQty, isItemSoldOut, isLowStock } from '../utils/stock';
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
  CalendarDays,
  Sun,
  Moon
} from 'lucide-react';
import {
  getRestaurantById,
  subscribeToCategories,
  subscribeToMenuItems,
  createReservation
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';

export default function PublicMenuPage() {
  const { restaurantId } = useParams();
  // Never fall back to a demo restaurant. A customer link must carry the
  // restaurant id (/menu/<id>); on a staff device we reuse the last restaurant
  // that logged in there.
  const activeId = restaurantId || localStorage.getItem('restopulse_active_rest_id') || '';

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
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

  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  // Live data: whatever the restaurant admin adds / edits / deletes in
  // Menu Management shows up here immediately, no reload needed.
  useEffect(() => {
    if (!activeId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setLoadError('');
    setRestaurant(null);
    setCategories([]);
    setMenuItems([]);
    setSelectedCat('ALL');

    getRestaurantById(activeId)
      .then((data) => {
        if (cancelled) return;
        if (data) setRestaurant(data);
        else setNotFound(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || 'Could not load restaurant.');
      });

    const unsubCats = subscribeToCategories(
      activeId,
      (list) => { if (!cancelled) setCategories(list); },
      (err) => { if (!cancelled) setLoadError(err?.message || 'Could not load categories.'); }
    );

    const unsubItems = subscribeToMenuItems(
      activeId,
      (list) => {
        if (cancelled) return;
        setMenuItems(list);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'Could not load the menu.');
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsubCats();
      unsubItems();
    };
  }, [activeId]);

  const currencySymbol = restaurant?.currencySymbol || '₹';

  // Build a lookup map of category display order so items can be sorted by category first
  const catOrder = categories.reduce((acc, cat) => {
    acc[cat.id] = Number.isFinite(Number(cat.displayOrder)) ? Number(cat.displayOrder) : 999;
    return acc;
  }, {});

  // Categories that actually have dishes (empty ones are hidden from guests)
  const visibleCategories = categories
    .filter((c) => menuItems.some((i) => i.categoryId === c.id))
    .sort((a, b) => (catOrder[a.id] ?? 999) - (catOrder[b.id] ?? 999));

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
        tableNumber: 'Online Request',
        notes: bookNotes
      });
      setBookingSuccess(true);
      toast.success('Table booking requested successfully!');
    } catch (err) {
      toast.error('Failed to submit booking.');
    }
  };

  const filteredItems = [...menuItems]
    .sort(
      (a, b) =>
        (catOrder[a.categoryId] ?? 999) - (catOrder[b.categoryId] ?? 999) ||
        (a.name || '').localeCompare(b.name || '')
    )
    .filter((item) => {
      const q = search.toLowerCase();
      const matchesCat = selectedCat === 'ALL' || item.categoryId === selectedCat;
      const matchesSearch =
        q === '' ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));
      const matchesVeg = !vegOnly || item.isVeg;

      return matchesCat && matchesSearch && matchesVeg;
    });

  // No restaurant in the link, or it does not exist
  if (!activeId || notFound) {
    return (
      <div className="min-h-screen bg-pos-dark text-slate-900 dark:text-slate-100 flex items-center justify-center p-6 transition-colors duration-200">
        <div className="max-w-sm text-center space-y-3 pos-card-glass p-8 rounded-2xl border border-pos-border shadow-2xl">
          <Info className="w-10 h-10 mx-auto text-slate-400" />
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white font-display">Menu not available</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {!activeId
              ? 'This menu link is incomplete. Please scan the restaurant\'s QR code or use the link they shared.'
              : 'We could not find this restaurant. Please check the link and try again.'}
          </p>
          <Link to="/login" className="inline-block text-xs font-bold text-emerald-600 dark:text-emerald-400 underline">
            Staff login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pos-dark text-slate-900 dark:text-slate-100 pb-16 transition-colors duration-200">
      {/* Top Floating Staff Login Bar */}
      <header className="pos-surface-glass backdrop-blur-md border-b border-pos-border sticky top-0 z-30 px-4 py-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          {restaurant?.logoUrl ? (
            <img src={restaurant.logoUrl} alt="Logo" className="w-8 h-8 rounded-xl object-cover shadow-sm border border-pos-border" />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center font-extrabold text-xs text-slate-950 shadow-sm">
              {restaurant?.name?.charAt(0) || 'R'}
            </div>
          )}
          <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate max-w-[160px] sm:max-w-none font-display">
            {restaurant?.name || 'Restaurant Menu'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* White Mood / Dark Mood Toggle */}
          <button
            onClick={toggleTheme}
            className="pos-btn-touch flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-pos-dark hover:bg-pos-surface border border-pos-border text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-sm"
            title={`Switch to ${theme === 'dark' ? 'White Mood (Light)' : 'Dark Mood'}`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
                <span className="hidden md:inline">White Mood</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">Dark Mood</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              setBookingSuccess(false);
              setIsBookOpen(true);
            }}
            className="pos-btn-touch flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-pos-glow transition-all"
          >
            <CalendarDays className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Book Table</span>
          </button>
          <Link
            to="/login"
            className="pos-btn-touch flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold border border-pos-border transition-colors shadow-sm"
          >
            <Lock className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
            <span>Staff</span>
          </Link>
        </div>
      </header>

      {/* Hero Banner with Restaurant Details */}
      <div className="relative pos-surface-glass border-b border-pos-border px-4 py-8 text-center sm:py-12 shadow-sm">
        <div className="max-w-2xl mx-auto space-y-3">
          {restaurant?.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt="Logo"
              className="w-16 h-16 rounded-2xl mx-auto object-cover border-2 border-emerald-500/40 shadow-xl"
            />
          ) : (
            <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 shadow-xl mb-1">
              <Utensils className="w-7 h-7" />
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-display">
            {restaurant?.name || 'Restaurant Menu'}
          </h1>
          {restaurant?.tagline && (
            <p className="text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 font-semibold">{restaurant.tagline}</p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-2 font-medium">
            {restaurant?.address && (
              <div className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{restaurant.address}</span>
              </div>
            )}
            {restaurant?.phone && (
              <div className="flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-mono">{restaurant.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Search & Category Navigation Bar */}
      <div className="sticky top-12 z-20 pos-surface-glass backdrop-blur-md border-b border-pos-border px-4 py-3 space-y-3 shadow-md">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search delicious dishes..."
              className="w-full pl-10 pr-4 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>

          <label className="pos-btn-touch flex items-center space-x-2 bg-pos-dark border border-pos-border px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer self-stretch sm:self-auto justify-center shadow-sm">
            <input
              type="checkbox"
              checked={vegOnly}
              onChange={(e) => setVegOnly(e.target.checked)}
              className="rounded bg-pos-dark border-pos-border text-emerald-500 focus:ring-0"
            />
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Pure Veg Only</span>
          </label>
        </div>

        {/* Category Pill Filters */}
        <div className="max-w-4xl mx-auto flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCat('ALL')}
            className={`pos-btn-touch px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedCat === 'ALL'
                ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
                : 'bg-pos-dark text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border'
            }`}
          >
            All Items
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`pos-btn-touch px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCat === cat.id
                  ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
                  : 'bg-pos-dark text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border'
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
          <div className="py-16 text-center text-emerald-500 dark:text-emerald-400 font-bold">Loading dishes...</div>
        ) : loadError ? (
          <div className="py-16 text-center text-rose-500 space-y-2">
            <Info className="w-8 h-8 mx-auto text-rose-500" />
            <p className="text-sm font-semibold">Could not load the menu. {loadError}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <Info className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-sm font-medium">
              {menuItems.length === 0
                ? 'The menu is being prepared. Please check back soon.'
                : 'No dishes found matching your search or filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="pos-card-glass rounded-2xl p-4 shadow-xl flex gap-4 transition-transform hover:-translate-y-0.5 relative overflow-hidden"
              >
                {/* Food Image (ImgBB Hosted) */}
                {item.imageUrl && (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-pos-dark border border-pos-border shrink-0 relative shadow-sm">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {isItemSoldOut(item) && (
                      <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-1 text-center backdrop-blur-xs">
                        <span className="text-[10px] font-extrabold text-rose-400">Sold Out</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 leading-snug">{item.name}</h3>
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
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-pos-border">
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-num">
                      {currencySymbol}{item.price?.toFixed(2)}
                    </span>
                    {isItemSoldOut(item) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                        Out of Stock
                      </span>
                    )}
                    {!isItemSoldOut(item) && isLowStock(item) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        Only {getStockQty(item)} left
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
