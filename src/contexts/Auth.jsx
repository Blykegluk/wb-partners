import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

  // When user logs in, accept pending invitations via Edge Function (bypasses RLS)
  const acceptPendingInvitations = async (u) => {
    if (!u?.email) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${FUNCTIONS_URL}/accept-invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: u.id, email: u.email }),
      })
    } catch { /* best effort */ }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      setLoading(false)
      if (u) acceptPendingInvitations(u)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null
      setUser(prev => {
        // Same user — skip to avoid re-render cascade
        if (prev?.id && newUser?.id && prev.id === newUser.id) return prev
        return newUser
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
