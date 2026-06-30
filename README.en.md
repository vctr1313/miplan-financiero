# Mi Plan Financiero — Setup Guide

🇪🇸 [Leer en español](README.md)

An expense-tracking and savings-plan app, synced to the cloud, installable as a mobile app. Each person's data is private; if you link a partner's account, each of you sees a read-only summary of the other's status (without sharing individual transactions or categories).

## Your configuration

- **Supabase**: `https://hbtogqkofnitfufmluik.supabase.co`
- **GitHub**: `https://github.com/vctr1313/miplan-financiero`

## Features

- **Real-time sync** across devices via Supabase (phone, desktop, laptop)
- **Linked partner**: link your account to your partner's with an invite code to see a summary of their status (salary, % of budget spent, total saved) — your individual transactions and categories stay private
- **Installable PWA** on mobile (own icon, full screen, works offline for already-loaded data)
- **Paycheck-based cycles**: the "month" starts when you get paid, not on the 1st
- **Savings pots** that accumulate money cycle by cycle if you don't spend them
- **Editable categories**: add, edit or delete, with balance reassignment if they have a pot
- **Automatic fixed expenses**: a banner proposes confirming them at the start of each cycle
- **Multiple savings goals** (trips, car, emergency fund…) in addition to the house goal
- **House goal as a couple**: if you have a linked partner, it uses their real numbers (salary, savings) instead of typing them in manually
- **Cycle history** with a side-by-side comparison between two periods
- **Mortgage simulator**, solo or as a couple, with financial-effort analysis
- **Reports** with charts, exportable to PDF and Excel
- **Push notifications** when you go over 80% or 100% of a category's budget
- **AI financial advisor** (free copy/paste mode, or with an API key for instant replies)
- **Dark mode**

## Exact steps to deploy

### 1. Run the SQL in Supabase (5 min, one-time)

1. Go to your project: [supabase.com/dashboard/project/hbtogqkofnitfufmluik](https://supabase.com/dashboard/project/hbtogqkofnitfufmluik)
2. Sidebar → **SQL Editor** → **New query**
3. Open `supabase_schema.sql` (included in this package), copy ALL of its content, paste it into the editor
4. Click **Run** (or Ctrl+Enter)
5. You should see "Success. No rows returned" — that confirms the tables, RLS policies, triggers and functions were created correctly

> If your project predates one of the changes listed under [Migrations](#migrations), `supabase_schema.sql` already includes all of them — a fresh install doesn't need to run the standalone patches separately.

### 2. Push the code to your GitHub

This package already comes with an initialized git repository and the first commit done. You just need to connect it to your GitHub and push:

```bash
cd miplan
git remote add origin https://github.com/vctr1313/miplan-financiero.git
git push -u origin main
```

If it asks for authentication, use a GitHub [Personal Access Token](https://github.com/settings/tokens) as the password (not your regular account password).

### 3. Test locally (optional but recommended)

The `.env.local` file with your Supabase credentials is already created inside the `miplan/` folder. You just need:

```bash
cd miplan
npm install
npm start
```

It opens at `http://localhost:3000`. Create your account with your email, confirm it, and you're ready to use the app. To link your partner, share the invite code shown under **Settings → Linked partner**.

### 4. Deploy to Vercel (free, ~3 min)

1. Go to [vercel.com/new](https://vercel.com/new)
2. "Import Git Repository" → search for `vctr1313/miplan-financiero` → **Import**
3. Under "Environment Variables" add these two (copy them exactly):

   | Name | Value |
   |---|---|
   | `REACT_APP_SUPABASE_URL` | `https://hbtogqkofnitfufmluik.supabase.co` |
   | `REACT_APP_SUPABASE_ANON_KEY` | (the long key starting with `eyJhbGci...`, found in your `.env.local`) |

4. Click **Deploy**

In ~2 minutes you'll have a URL like `https://miplan-financiero.vercel.app` running with automatic HTTPS.

### 5. Install as a mobile app (PWA)

Once you have your Vercel URL:

**iPhone (Safari):**
1. Open the URL in Safari
2. Tap the "Share" button (square with an arrow)
3. "Add to Home Screen"

**Android (Chrome):**
1. Open the URL in Chrome
2. An "Install app" banner will appear automatically, or
3. Menu (⋮) → "Install app"

The app will install with its own icon, full screen, and will work offline to view already-loaded data.

### 6. Generate the PWA icons (optional)

You need to create `public/icon-192.png` and `public/icon-512.png` so the icon looks right when installed. You can:
- Use [realfavicongenerator.net](https://realfavicongenerator.net) with your logo
- Or quickly generate one with a 🏠 emoji at [favicon.io](https://favicon.io/emoji-favicons/house)

Without these files the app still works the same, but the install icon will be generic.

## Project structure

```
src/
  lib/
    supabase.js   → all the database calls
    finance.js    → financial calculations (cycles, pots, mortgage, partner...)
  pages/          → one page per route
  components/     → Layout, reusable modals
  styles/         → global CSS with theme variables
supabase_schema.sql → run once in the Supabase SQL Editor (includes all migrations)
```

## Migrations

If your Supabase project predates one of these changes, run the matching patch once in the SQL Editor (they're idempotent, safe to re-run). Fresh installs don't need them — they're already folded into `supabase_schema.sql`.

| File | What it fixes |
|---|---|
| `supabase_patch_search_path.sql` | `security definer` functions missing a pinned `search_path`, which broke new user signup (Google/email sign-in got stuck on the login page) |
| `supabase_patch_partner_linking.sql` | Replaces "join a household" (which merged all of both people's data) with the current partner-linking model: each account stays private, only an aggregate summary is shared |

## Important notes

- **Row Level Security** is enabled: each user only sees their own data (categories, transactions, budget, pots). Nothing is shared by default.
- **Linked partner**: if you link your account with your partner's, they (and only they) can see an aggregate summary of your financial status — salary, % of budget spent, and total saved — never your individual transactions or categories, not even via a direct API call.
- **Real-time**: your own changes sync instantly across your devices without reloading.
- **AI API key**: stored in the browser's `localStorage`, not in the database (each device needs its own, or use the free copy/paste mode)
