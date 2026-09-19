import {
  createRestaurant,
  createCategory,
  createMenuItem,
  createTable,
  createInventoryItem,
  saveUserProfile
} from '../services/firestoreService';

export async function seedFirestoreDatabase() {
  console.log('Seeding Multi-Tenant Firebase Firestore Database...');

  // 1. Super Admin Profile
  await saveUserProfile('superadmin-root-id', {
    name: 'Super Admin (Platform Owner)',
    email: 'superadmin@gmail.com',
    role: 'super_admin',
    restaurantId: null
  });

  // Admin Profile (AltCafe Admin)
  await saveUserProfile('admin-altcafe-id', {
    name: 'AltCafe Admin',
    email: 'altcafe2026@gmail.com',
    role: 'restaurant_admin',
    restaurantId: 'spice-haven'
  });

  // 2. Restaurant 1: Spice Haven Bistro
  const rest1 = await createRestaurant({
    name: 'Spice Haven Bistro',
    tagline: 'Authentic Flavors & Gourmet Dining',
    logoUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
    address: '104 Royal Heritage Road, Sector 5, Salt Lake, Kolkata, WB 700091',
    phone: '+91 98765 43210',
    email: 'contact@spicehaven.com',
    gstin: '19AABCS1429B1Z8',
    currency: 'INR',
    currencySymbol: '₹',
    primaryColor: '#0f766e',
    secondaryColor: '#ea580c',
    taxRate: 5.0,
    taxName: 'GST (5%)',
    invoiceHeader: 'Tax Invoice / Cash Memo',
    invoiceFooter: 'FSSAI Lic: 12822019000123 • Thank you for dining with us!',
    adminName: 'Rajesh Sharma',
    adminEmail: 'owner@restopulse.com'
  }, 'spice-haven');

  // Categories for Spice Haven
  const catStarters = await createCategory('spice-haven', { name: 'Starters & Appetizers', displayOrder: 1 });
  const catMain = await createCategory('spice-haven', { name: 'Main Course', displayOrder: 2 });
  const catBreads = await createCategory('spice-haven', { name: 'Breads & Biryani', displayOrder: 3 });
  const catBeverages = await createCategory('spice-haven', { name: 'Beverages', displayOrder: 4 });

  // Menu items for Spice Haven
  await createMenuItem('spice-haven', {
    categoryId: catMain.id,
    categoryName: 'Main Course',
    name: 'Paneer Butter Masala',
    description: 'Fresh cottage cheese cubes in rich velvet tomato-butter gravy',
    price: 250.0,
    sku: 'MAIN-01',
    isVeg: true,
    isAvailable: true,
    imageUrl: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop&q=80'
  });

  await createMenuItem('spice-haven', {
    categoryId: catMain.id,
    categoryName: 'Main Course',
    name: 'Butter Chicken Special',
    description: 'Tandoori roasted chicken stewed in creamy aromatic makhani gravy',
    price: 340.0,
    sku: 'MAIN-02',
    isVeg: false,
    isAvailable: true,
    imageUrl: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=500&auto=format&fit=crop&q=80'
  });

  await createMenuItem('spice-haven', {
    categoryId: catBreads.id,
    categoryName: 'Breads & Biryani',
    name: 'Hyderabadi Chicken Dum Biryani',
    description: 'Fragrant basmati rice layered with spiced marinated chicken and saffron',
    price: 280.0,
    sku: 'RICE-01',
    isVeg: false,
    isAvailable: true,
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80'
  });

  await createMenuItem('spice-haven', {
    categoryId: catBreads.id,
    categoryName: 'Breads & Biryani',
    name: 'Butter Garlic Naan',
    description: 'Soft leavened tandoor bread brushed with minced garlic and melted butter',
    price: 60.0,
    sku: 'BRED-01',
    isVeg: true,
    isAvailable: true,
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=80'
  });

  await createMenuItem('spice-haven', {
    categoryId: catBeverages.id,
    categoryName: 'Beverages',
    name: 'Royal Mango Lassi',
    description: 'Thick creamy churned yogurt flavored with Alphonso mango pulp',
    price: 110.0,
    sku: 'BEV-01',
    isVeg: true,
    isAvailable: true,
    imageUrl: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=500&auto=format&fit=crop&q=80'
  });

  // Tables
  await createTable('spice-haven', { tableNumber: 'Table 1', capacity: 4 });
  await createTable('spice-haven', { tableNumber: 'Table 2', capacity: 2 });
  await createTable('spice-haven', { tableNumber: 'Table 3', capacity: 4 });
  await createTable('spice-haven', { tableNumber: 'Table 4', capacity: 6 });
  await createTable('spice-haven', { tableNumber: 'Outdoor 1', capacity: 4 });

  // Inventory
  await createInventoryItem('spice-haven', { name: 'Basmati Rice (Kohinoor)', unit: 'kg', quantity: 25, minThreshold: 10 });
  await createInventoryItem('spice-haven', { name: 'Fresh Malai Paneer', unit: 'kg', quantity: 12, minThreshold: 5 });
  await createInventoryItem('spice-haven', { name: 'Pure Country Butter', unit: 'kg', quantity: 3.5, minThreshold: 5 }); // Low stock

  // 3. Restaurant 2: Grand Royal Kitchen (Multi-tenant demonstration)
  await createRestaurant({
    name: 'Grand Royal Kitchen',
    tagline: 'Royal Mughlai & Tandoor Delicacies',
    logoUrl: 'https://images.unsplash.com/photo-1552611052-33e04de081de?w=200&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
    address: '42 Park Street, Kolkata, WB 700016',
    phone: '+91 98300 11223',
    email: 'admin@grandroyal.com',
    gstin: '19AABCR5512A1Z4',
    currency: 'INR',
    currencySymbol: '₹',
    taxRate: 5.0,
    taxName: 'GST',
    adminName: 'Farhan Ali',
    adminEmail: 'admin@grandroyal.com'
  }, 'grand-royal');

  console.log('Firebase Firestore Seed Completed!');
}
