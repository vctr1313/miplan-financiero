import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, getProfile, getCategories, getTransactions, getFixedExpenses, getHouseGoal, getSavingGoals, getPartnerSummary, getCategoryPctHistory, subscribeToHousehold, takeDirty, getShared, subscribeToShared } from './lib/supabase'
import { buildCycles } from './lib/finance'
import { useKeyboardInset } from './lib/ui'
import { applyChartTheme } from './lib/charts'
import { DashboardSkeleton } from './components/Skeleton'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Savings from './pages/Savings'
import SavingGoals from './pages/SavingGoals'
import House from './pages/House'
import CycleHistory from './pages/CycleHistory'
import Reports from './pages/Reports'
import AIChat from './pages/AIChat'
import Settings from './pages/Settings'
import Shared from './pages/Shared'
import Layout from './components/Layout'

// Once, before any chart mounts: every Chart.js chart inherits the
// app's look from these defaults (see lib/charts.js).
applyChartTheme()

// ── APP CONTEXT ───────────────────────────────────────────────
export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [houseGoal, setHouseGoal] = useState(null)
  const [savingGoals, setSavingGoals] = useState([])
  const [pctHistory, setPctHistory] = useState([])
  const [partnerSummary, setPartnerSummary] = useState(null)
  // Expenses shared with the linked partner and past settlements.
  const [shared, setShared] = useState({ expenses: [], settlements: [] })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const cycles = useMemo(() => buildCycles(transactions), [transactions])

  // Keeps `--kb` (on-screen keyboard height) up to date for the CSS
  // that lifts bottom-sheet dialogs above the keyboard.
  useKeyboardInset()

  // One loader per slice of state, so a change only refetches what it
  // touched (see markDirty/takeDirty in lib/supabase.js) instead of all
  // of it every time.
  const loaders = useMemo(() => ({
    profile: async (userId) => {
      const prof = await getProfile(userId)
      setProfile(prof)
      // Read-only aggregate summary of a linked partner, if any -- see
      // getPartnerSummary in lib/supabase.js for why this never pulls
      // their raw transactions/categories.
      setPartnerSummary(prof?.partner_id ? await getPartnerSummary().catch(() => null) : null)
    },
    categories: async () => setCategories((await getCategories()) || []),
    transactions: async () => setTransactions((await getTransactions()) || []),
    fixedExpenses: async () => setFixedExpenses((await getFixedExpenses()) || []),
    houseGoal: async () => setHouseGoal(await getHouseGoal()),
    savingGoals: async () => setSavingGoals((await getSavingGoals()) || []),
    pctHistory: async () => setPctHistory((await getCategoryPctHistory()) || []),
    shared: async () => setShared(await getShared()),
  }), [])
  const ALL_KEYS = useMemo(() => Object.keys(loaders), [loaders])

  // When each slice was last refetched by us, to ignore the realtime
  // echo of our own writes (it arrives a moment after we've already
  // refetched that same slice).
  const lastLoadedAt = useRef({})

  const load = useCallback(async (userId, keys) => {
    const wanted = [...new Set(keys.map(k => (k === 'partnerSummary' ? 'profile' : k)))]
      .filter(k => loaders[k])
    if (!wanted.length) return
    setSyncing(true)
    try {
      await Promise.all(wanted.map(k => loaders[k](userId)))
      const now = Date.now()
      wanted.forEach(k => { lastLoadedAt.current[k] = now })
    } catch (e) {
      console.error('Load error:', e)
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }, [loaders])

  const loadAll = useCallback((userId) => load(userId, ALL_KEYS), [load, ALL_KEYS])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadAll(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadAll(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [loadAll])

  // Real-time sync, batched: a burst of changes (e.g. confirming five
  // fixed expenses) becomes ONE refetch of just the affected slices,
  // and changes we made ourselves a moment ago are skipped.
  useEffect(() => {
    if (!profile?.household_id || !session) return
    const TABLE_TO_KEY = {
      transactions: 'transactions', categories: 'categories',
      fixed_expenses: 'fixedExpenses', house_goals: 'houseGoal',
      saving_goals: 'savingGoals', category_pct_history: 'pctHistory',
    }
    const pending = new Set()
    let timer = null
    const unsub = subscribeToHousehold(profile.household_id, (payload) => {
      const key = TABLE_TO_KEY[payload?.table]
      if (!key) return
      if (Date.now() - (lastLoadedAt.current[key] || 0) < 2000) return
      pending.add(key)
      clearTimeout(timer)
      timer = setTimeout(() => {
        const keys = [...pending]
        pending.clear()
        load(session.user.id, keys)
      }, 350)
    })
    return () => { clearTimeout(timer); unsub() }
  }, [profile?.household_id, session, load])

  // Shared expenses live outside the household (the partner writes
  // them too), so they get their own subscription.
  useEffect(() => {
    if (!session?.user?.id || !profile?.partner_id) return
    let timer = null
    const unsub = subscribeToShared(session.user.id, () => {
      if (Date.now() - (lastLoadedAt.current.shared || 0) < 2000) return
      clearTimeout(timer)
      timer = setTimeout(() => load(session.user.id, ['shared']), 350)
    })
    return () => { clearTimeout(timer); unsub() }
  }, [session, profile?.partner_id, load])

  // refresh() with no argument refetches whatever the writes since the
  // last refresh touched; with nothing recorded (e.g. pull-to-refresh)
  // it reloads everything. Pass keys explicitly to override.
  const refresh = (keys) => {
    if (!session) return Promise.resolve()
    const wanted = keys || takeDirty()
    return load(session.user.id, wanted.length ? wanted : ALL_KEYS)
  }

  // Drops a movement from local state immediately; the server delete
  // runs behind it. Returns a restore function for the failure path.
  const removeTransactionLocally = (id) => {
    let removed = null
    setTransactions(prev => {
      removed = prev.find(t => t.id === id) || null
      return prev.filter(t => t.id !== id)
    })
    return () => removed && setTransactions(prev => [removed, ...prev])
  }

  const value = {
    session, profile, setProfile,
    categories, setCategories,
    transactions, setTransactions,
    fixedExpenses, setFixedExpenses,
    houseGoal, setHouseGoal,
    savingGoals, setSavingGoals,
    pctHistory,
    partnerSummary,
    shared,
    cycles, loading, syncing, refresh, removeTransactionLocally
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// ── PROTECTED ROUTE ───────────────────────────────────────────
function Protected({ children }) {
  const { session, loading } = useApp()
  if (loading) return <DashboardSkeleton />
  return session ? children : <Navigate to="/login" replace />
}

// ── APP ───────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="budget" element={<Budget />} />
            <Route path="savings" element={<Savings />} />
            <Route path="goals" element={<SavingGoals />} />
            <Route path="house" element={<House />} />
            <Route path="history" element={<CycleHistory />} />
            <Route path="reports" element={<Reports />} />
            <Route path="chat" element={<AIChat />} />
            <Route path="shared" element={<Shared />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}
