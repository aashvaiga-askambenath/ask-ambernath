import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, supabase } from './api';

const AuthContext = createContext(null);

function phoneNumberForAuth(value) {
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+91${digits.slice(1)}`;
  throw new Error('Enter a valid phone number with country code, or a 10-digit Indian number.');
}

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
    requestPhoneOtp: async (phone, { name, role, createAccount }) => {
      if (!supabase) throw new Error('Authentication is not configured. Add the Supabase browser keys to the environment.');
      const options = {
        channel: 'whatsapp',
        shouldCreateUser: createAccount,
        ...(createAccount ? { data: { full_name: name, phone: phoneNumberForAuth(phone), requested_role: role } } : {}),
      };
      const { error } = await supabase.auth.signInWithOtp({ phone: phoneNumberForAuth(phone), options });
      if (error) throw new Error(error.message);
    },
    verifyPhoneOtp: async (phone, token) => {
      if (!supabase) throw new Error('Authentication is not configured. Add the Supabase browser keys to the environment.');
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneNumberForAuth(phone),
        token: token.trim(),
        type: 'sms',
      });
      if (error) throw new Error(error.message);
      const result = await api.get('/auth/me');
      setUser(result.user);
      return result.user;
    },
    resetPassword: async (email) => {
      if (!supabase) throw new Error('Authentication is not configured. Add the Supabase browser keys to the environment.');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth?mode=update-password` });
      if (error) {
        if (/rate limit|too many requests/i.test(error.message)) {
          throw new Error('Password reset emails are temporarily rate-limited by the email provider. Wait before trying again, or use WhatsApp sign-in if your phone number is verified.');
        }
        throw new Error(error.message);
      }
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
    deleteAccount: async (confirmation) => {
      await api.delete('/user/delete-account', { confirmation });
      let signOutError = null;
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        signOutError = error?.message || null;
      }
      setUser(null);
      return { signOutError };
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
