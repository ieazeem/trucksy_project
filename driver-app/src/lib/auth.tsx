import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, type Driver } from './api';
import { KEYS, secure } from './storage';
import { stopTracking } from './tracking';

type AuthState = {
  ready: boolean;
  token: string | null;
  driver: Driver | null;
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDriver: (d: Driver) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);

  useEffect(() => {
    secure.get(KEYS.token).then((t) => {
      setToken(t);
      setReady(true);
    });
  }, []);

  const signIn = useCallback(async (phone: string, pin: string) => {
    const res = await api<{ token: string; driver: Driver }>('auth/driver/login/', {
      body: { phone, pin }, auth: false,
    });
    await secure.set(KEYS.token, res.token);
    setDriver(res.driver);
    setToken(res.token);
  }, []);

  const signOut = useCallback(async () => {
    await stopTracking().catch(() => {});
    await api('auth/logout/', { method: 'POST' }).catch(() => {});
    await secure.remove(KEYS.token);
    setDriver(null);
    setToken(null);
  }, []);

  const value = useMemo(() => ({ ready, token, driver, signIn, signOut, setDriver }), [ready, token, driver, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
