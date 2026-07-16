import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── AUTH ──────────────────────────────────────────────────────
export const signUp = (email, password, name) =>
  supabase.auth.signUp({ email, password, options: { data: { name } } })

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({ provider: 'google' })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()

// ── PROFILE ───────────────────────────────────────────────────
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, households(*)')
    .eq('id', userId)
    .single()
  if (error) throw error

  // Supabase's PostgREST can return a to-one relation embed as either a
  // single object or a single-element array depending on how it infers
  // the foreign key cardinality. profiles.household_id -> households.id
  // is a clean many-to-one (many profiles per household), which should
  // embed as an object, but in practice this has been observed coming
  // back as [{...}] instead -- silently breaking any `profile.households.x`
  // access without throwing, since `.x` on an array just returns
  // undefined rather than erroring. Normalize defensively here so every
  // caller can safely assume `profile.households` is always either the
  // object or null, never an array.
  if (Array.isArray(data.households)) {
    data.households = data.households[0] || null
  }

  return data
}

export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── PARTNER LINKING ───────────────────────────────────────────
// Each person keeps their own private household (categories,
// transactions, budget, etc. never merge). Linking a partner only
// grants a read-only aggregate summary via get_partner_summary(),
// served through a security definer RPC that never exposes individual
// transaction/category rows -- see supabase_patch_partner_linking.sql.
export const linkPartner = async (inviteCode) => {
  const { data: partnerId, error } = await supabase
    .rpc('link_partner_by_invite_code', { p_invite_code: inviteCode })
  if (error || !partnerId) throw new Error('Código de invitación no válido')
  return partnerId
}

export const unlinkPartner = async () => {
  const { error } = await supabase.rpc('unlink_partner')
  if (error) throw error
}

export const getPartnerSummary = async () => {
  const { data, error } = await supabase.rpc('get_partner_summary')
  if (error) throw error
  return data?.[0] || null
}

// ── CATEGORIES ────────────────────────────────────────────────
export const getCategories = async () => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data
}

export const upsertCategory = async (cat) => {
  const { data, error } = await supabase
    .from('categories')
    .upsert(cat)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteCategory = async (id) => {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

export const updateCategoryPct = async (id, userPct) => {
  const { error } = await supabase
    .from('categories')
    .update({ user_pct: userPct })
    .eq('id', id)
  if (error) throw error
}

// ── FIXED EXPENSES ────────────────────────────────────────────
export const getFixedExpenses = async () => {
  const { data, error } = await supabase
    .from('fixed_expenses')
    .select('*, categories(name,icon)')
    .order('created_at')
  if (error) throw error
  return data
}

export const addFixedExpense = async (expense) => {
  const { data: { user } } = await supabase.auth.getUser()
  const profile = await getProfile(user.id)
  const { data, error } = await supabase
    .from('fixed_expenses')
    .insert({ ...expense, household_id: profile.household_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteFixedExpense = async (id) => {
  const { error } = await supabase.from('fixed_expenses').delete().eq('id', id)
  if (error) throw error
}

export const markFixedExpenseCharged = async (id, date) => {
  const { error } = await supabase
    .from('fixed_expenses')
    .update({ last_charged_date: date })
    .eq('id', id)
  if (error) throw error
}

// ── TRANSACTIONS ──────────────────────────────────────────────
export const getTransactions = async ({ startDate, endDate, userId } = {}) => {
  let query = supabase
    .from('transactions')
    .select('*, categories(name,icon,color,type), profiles(name)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (startDate) query = query.gte('date', startDate)
  if (endDate) query = query.lte('date', endDate)
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export const addTransaction = async (tx) => {
  const { data: { user } } = await supabase.auth.getUser()
  const profile = await getProfile(user.id)
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ...tx,
      user_id: user.id,
      household_id: profile.household_id
    })
    .select('*, categories(name,icon,color,type)')
    .single()
  if (error) throw error
  return data
}

export const deleteTransaction = async (id) => {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}

export const updateTransaction = async (id, patch) => {
  const { data, error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .select('*, categories(name,icon,color,type)')
    .single()
  if (error) throw error
  return data
}

// ── SALARY CYCLES ─────────────────────────────────────────────
// Cycle building logic lives in lib/finance.js (buildCycles).
// It consumes the `transactions` array already loaded by AppProvider,
// filtering by `type === 'income' && is_salary === true`.

// ── HOUSE GOAL ────────────────────────────────────────────────
export const getHouseGoal = async () => {
  const { data, error } = await supabase
    .from('house_goals')
    .select('*')
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const updateHouseGoal = async (goal) => {
  const { data, error } = await supabase
    .from('house_goals')
    .upsert({ ...goal, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return data
}

// Atomically increment my_saved and/or invest_saved by a delta amount,
// using Postgres's own column = column + delta arithmetic via an RPC
// instead of fetch-then-write from JS. A plain JS read-modify-write
// here would be vulnerable to a real race condition in this app
// specifically: two household members (e.g. partners) could each
// distribute part of the same paga extra around the same time from
// different devices, and whichever write lands second would silently
// clobber the first instead of both amounts actually accumulating.
export const incrementHouseGoalSavings = async ({ mySavedDelta = 0, investSavedDelta = 0 }) => {
  const { data, error } = await supabase.rpc('increment_house_goal_savings', {
    my_saved_delta: mySavedDelta,
    invest_saved_delta: investSavedDelta,
  })
  if (error) throw error
  return data
}

// ── SAVING GOALS ──────────────────────────────────────────────
export const getSavingGoals = async () => {
  const { data, error } = await supabase
    .from('saving_goals')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data || []
}

export const upsertSavingGoal = async (goal) => {
  const { data: { user } } = await supabase.auth.getUser()
  const profile = await getProfile(user.id)
  const { data, error } = await supabase
    .from('saving_goals')
    .upsert({ ...goal, household_id: profile.household_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteSavingGoal = async (id) => {
  const { error } = await supabase.from('saving_goals').delete().eq('id', id)
  if (error) throw error
}

// ── REALTIME SUBSCRIPTION ─────────────────────────────────────
export const subscribeToHousehold = (householdId, onEvent) => {
  const channel = supabase
    .channel(`household_${householdId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'transactions',
      filter: `household_id=eq.${householdId}`
    }, onEvent)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'categories',
      filter: `household_id=eq.${householdId}`
    }, onEvent)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'fixed_expenses',
      filter: `household_id=eq.${householdId}`
    }, onEvent)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'house_goals',
      filter: `household_id=eq.${householdId}`
    }, onEvent)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'saving_goals',
      filter: `household_id=eq.${householdId}`
    }, onEvent)
    .subscribe()

  return () => supabase.removeChannel(channel)
}
