import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, getProfile, getCategories, getTransactions, getFixedExpenses, getHouseGoal, getSavingGoals, getPartnerSummary, getCategoryPctHistory, subscribeToHousehold } from './lib/supabase'
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
import Layout from './components/Layout'

// Once, before any chart mounts: every Chart.js chart inherits the
// app's look from these defaults (see lib/charts.js).
applyChartTheme()

// ── APP CONTEXT ───────────────────────────────────────────────
export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

function AppProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [houseGoal, setHouseGoal] = useState(null)
  const [savingGoals, setSavingGoals] = useState([])
  const [pctHistory, setPctHistory] = useState([])
  const [partnerSummary, setPartnerSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const cycles = buildCycles(transactions)

  // Keeps `--kb` (on-screen keyboard height) up to date for the CSS
  // that lifts bottom-sheet dialogs above the keyboard.
  useKeyboardInset()

  const loadAll = useCallback(async (userId) => {
    setSyncing(true)
    try {
      const [prof, cats, txs, fixed, hGoal, sGoals, pctHist] = await Promise.all([
        getProfile(userId),
        getCategories(),
        getTransactions(),
        getFixedExpenses(),
        getHouseGoal(),
        getSavingGoals(),
        getCategoryPctHistory(),
      ])
      setProfile(prof)
      setCategories(cats || [])
      setTransactions(txs || [])
      setFixedExpenses(fixed || [])
      setHouseGoal(hGoal)
      setSavingGoals(sGoals || [])
      setPctHistory(pctHist || [])
      // Read-only aggregate summary of a linked partner, if any -- see
      // getPartnerSummary in lib/supabase.js for why this never pulls
      // their raw transactions/categories.
      setPartnerSummary(prof?.partner_id ? await getPartnerSummary().catch(() => null) : null)
    } catch (e) {
      console.error('Load error:', e)
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }, [])

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

  // Real-time sync
  useEffect(() => {
    if (!profile?.household_id) return
    const unsub = subscribeToHousehold(profile.household_id, () => {
      loadAll(session.user.id)
    })
    return unsub
  }, [profile?.household_id, session, loadAll])

  const refresh = () => session && loadAll(session.user.id)

  const value = {
    session, profile, setProfile,
    categories, setCategories,
    transactions, setTransactions,
    fixedExpenses, setFixedExpenses,
    houseGoal, setHouseGoal,
    savingGoals, setSavingGoals,
    pctHistory,
    partnerSummary,
    cycles, loading, syncing, refresh
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
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}
