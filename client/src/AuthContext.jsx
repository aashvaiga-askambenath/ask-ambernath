import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, supabase } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const syncUser = async (session) => {
      if (!session) {
        if (active) setUser(null);
        return;
      }
      try {
        const result = await api.get('/auth/me');
        if (active) setUser(result.user);
      } catch (error) {
        if (error.status === 401 || error.status === 403) await supabase.auth.signOut();
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    supabase.auth.getSession().then(({ data: { session } }) => syncUser(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => syncUser(session));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    configured: Boolean(supabase),
    login: async (email, password) => {
      if (!supabase) throw new Error('Authentication is not configured. Add the Supabase browser keys to the environment.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Email or password is incorrect');
      const result = await api.get('/auth/me');
      setUser(result.user);
      return result.user;
    },
    register: async ({ name, email, phone, password, role }) => {
      if (!supabase) throw new Error('Authentication is not configured. Add the Supabase browser keys to the environment.');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, phone, requested_role: role === 'business_owner' ? 'business_owner' : 'customer' } },
      });
      if (error) throw new Error(error.message);
      if (data.session) {
        const result = await api.get('/auth/me');
        setUser(result.user);
      }
      return { user: data.user, needsEmailConfirmation: !data.session };
    },
    resetPassword: async (email) => {
      if (!supabase) throw new Error('Authentication is not configured. Add the Supabase browser keys to the environment.');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth?mode=update-password` });
      if (error) throw new Error(error.message);
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    updateProfile: async (payload) => {
      const result = await api.patch('/profile', payload);
      setUser((current) => ({ ...current, ...result.user }));
      return result.user;
    },
    logout: async () => {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw new Error(error.message);
      }
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
