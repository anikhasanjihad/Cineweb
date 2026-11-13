import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';

interface AuthCtx { session: Session | null; ready: boolean }
const Ctx = createContext<AuthCtx>({session: null, ready: false});
export const useAuth = () => useContext(Ctx);

export const AuthProvider = ({children}: {children: ReactNode}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // The stored session is read from disk, so the app opens without waiting for the network.
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setReady(true); }).catch(() => setReady(true));
    const {data} = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={{session, ready}}>{children}</Ctx.Provider>;
};
