import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // When user logs in, check for pending invitations and accept them
  const acceptPendingInvitations = async (u) => {
    if (!u?.email) return
    const { data: invites } = await supabase.from('invitations').select('*').eq('email', u.email.toLowerCase())
    if (!invites || invites.length === 0) return
    for (const inv of invites) {
      // Add as member (ignore if already exists)
      await supabase.from('societe_membres').upsert(
        { societe_id: inv.societe_id, user_id: u.id, role: inv.role },
        { onConflict: 'societe_id,user_id' }
      )
      // Delete the invitation
      await supabase.from('invitations').delete().eq('id', inv.id)
    }
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
