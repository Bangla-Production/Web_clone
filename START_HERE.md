# 🍽️ RestoPulse — Quick Start (বাংলা)

তোমার Firebase + ImgBB config আগে থেকেই `client/.env` ফাইলে বসানো আছে। শুধু নিচের কমান্ডগুলো চালাও:

```bash
cd client
npm install
npm run dev
```

তারপর ব্রাউজারে `http://localhost:5173/login` খোলো।

## প্রথমবার চালু করার সময়
1. লগইন পেজের নিচে ডানদিকে **"Seed Firestore Demo"** বাটনে ক্লিক করো — এতে sample restaurant, category, menu item, table তৈরি হবে।
2. **একবারের সেটআপ (জরুরি):**
   - Firebase Console → Authentication → Sign-in method → **Email/Password** Enable করো।
   - Authentication → Users → **Add user**: `altcafe2026@gmail.com` + তোমার নিজের শক্ত পাসওয়ার্ড। এটাই Super Admin লগইন।
   - `client/env` ফাইলের নাম বদলে `client/.env` করো, তারপর `npm run dev` রিস্টার্ট করো।
3. Super Admin দিয়ে লগইন করে Restaurant যোগ করো। প্রতিটা অ্যাকাউন্ট আসল Firebase লগইন, ইমেইল কনফার্ম না হওয়া পর্যন্ত **Pending** থাকে (মেইল Spam / Junk এ যেতে পারে)। পাসওয়ার্ড Firestore-এ সেভ হয় না।

## ⚠️ জরুরি — Firestore Rules বসাও
[Firebase Console](https://console.firebase.google.com/) → তোমার প্রজেক্ট → Firestore Database → **Rules** ট্যাব → root এ থাকা `firestore.rules` ফাইলের পুরো কনটেন্ট পেস্ট করে **Publish** করো। এটা না করলে ৩০ দিন পর ডাটাবেজ ব্লক হয়ে যাবে (test mode রুলস মেয়াদ শেষ হয়)।

## 🚀 দ্রুত চালু করার উপায়
Root ফোল্ডার থেকেই চালাতে পারো:
```bash
npm run dev
```
অথবা:
```bash
cd client
npm run dev
```

## নিরাপত্তা নোট
`.env` ফাইলে তোমার আসল API key আছে — এটা GitHub-এ পাবলিক রিপোতে আপলোড কোরো না (`.gitignore`-এ `.env` যোগ করা আছে, তাই `git add .` করলে এটা এমনিতেই স্কিপ হবে)।
