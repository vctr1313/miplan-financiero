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

// ── HOUSEHOLD ─────────────────────────────────────────────────
export const joinHousehold = async (inviteCode) => {
  const { data: { user } } = await supabase.auth.getUser()
  const oldProfile = await getProfile(user.id)
  const oldHouseholdId = oldProfile.household_id

  // Find target household by invite code. This must go through an RPC
  // (security definer), not a plain select -- the households_member RLS
  // policy only lets a user see a household they're already a member
  // of, so a direct select on someone else's household would always
  // come back empty regardless of whether the code was right.
  const { data: householdId, error } = await supabase
    .rpc('find_household_by_invite_code', { p_invite_code: inviteCode })
  if (error || !householdId) throw new Error('Código de invitación no válido')
  const household = { id: householdId }

  if (household.id === oldHouseholdId) {
    throw new Error('Ya perteneces a este hogar.')
  }

  // Move any transactions the user already created over to the new household
  // (RLS transactions_update only allows the owner to update their own rows,
  // which is exactly what's needed here since this runs as the same user).
  if (oldHouseholdId) {
    await supabase
      .from('transactions')
      .update({ household_id: household.id })
      .eq('user_id', user.id)
      .eq('household_id', oldHouseholdId)
  }

  // Re-point the user's profile to the new household
  await updateProfile(user.id, { household_id: household.id })

  // Clean up the old household if it's now empty (best-effort, ignore failures).
  // supabase-js's query builder is thenable (works with await/.then) but does
  // NOT implement .catch() like a real Promise -- chaining .catch() directly
  // on it throws "catch is not a function" instead of swallowing the RPC
  // error, which is what was actually breaking "Unirme" after a valid code
  // was found. try/catch works because `await` unwraps the thenable first.
  if (oldHouseholdId) {
    try {
      await supabase.rpc('cleanup_empty_household', { target_household_id: oldHouseholdId })
    } catch (e) { /* best-effort cleanup, ignore failures */ }
  }

  return household
}

export const getHouseholdMembers = async (householdId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, salary')
    .eq('household_id', householdId)
  if (error) throw error
  return data
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
