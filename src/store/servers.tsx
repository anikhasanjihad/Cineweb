import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {loadProviders} from '../provider/manager';
import type {Provider} from '../provider/types';
import {load, save} from '../lib/storage';

interface Ctx {
  providers: Provider[];
  active: Provider | null;
  loading: boolean;
  error: string;
  select: (p: Provider) => void;
  reload: () => void;
  byKey: (key: string) => Provider | undefined;
}
const C = createContext<Ctx>(null as never);
export const useServers = () => useContext(C);

export const ServersProvider = ({children}: {children: ReactNode}) => {
  const [providers, setProviders] = useState<Provider[]>(() => load<Provider[]>('providers-cache', []));
  const [activeKey, setActiveKey] = useState<string>(() => load('active-provider', ''));
  const [loading, setLoading] = useState(providers.length === 0);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setError('');
    loadProviders()
      .then(list => { setProviders(list); save('providers-cache', list); })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load servers'))
      .finally(() => setLoading(false));
  }, []);
  // Cached list shows instantly; the fresh list replaces it a moment later.
  useEffect(reload, [reload]);

  const active = useMemo(
    () => providers.find(p => p.key === activeKey) ?? providers[0] ?? null,
    [providers, activeKey],
  );
  const select = useCallback((p: Provider) => { setActiveKey(p.key); save('active-provider', p.key); }, []);
  const byKey = useCallback((k: string) => providers.find(p => p.key === k), [providers]);
  return <C.Provider value={{providers, active, loading, error, select, reload, byKey}}>{children}</C.Provider>;
};
