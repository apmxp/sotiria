import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getChildSpace } from '@/lib/wellbeing.functions';
import { loadFamily } from '@/lib/identity.functions';
import type { Snapshot } from '@/lib/wellbeing-db';
import type { ChildIdentity } from '@/lib/identity';

type FamilyData = Awaited<ReturnType<typeof loadFamily>>;
interface IdentityValue { user: User | null; child: ChildIdentity | null; childSnapshot: Snapshot | undefined; familyData: FamilyData | undefined; selected: string | undefined; selectChild: (id: string) => void; scope: string; ready: boolean }
const IdentityContext = createContext<IdentityValue | null>(null);
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, selectChild] = useState<string>();
  const router = useRouter(); const cache = useQueryClient();
  const path = useRouterState({ select: s => s.location.pathname });
  const parent = path.startsWith('/parent/'); const childPage = path.startsWith('/child/');
  const familyFn = useServerFn(loadFamily); const childFn = useServerFn(getChildSpace);
  useEffect(() => {
    void supabase.auth.getUser()
      .then(({ data }) => { setUser(data.user); setReady(true); })
      .catch(() => { setUser(null); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
      setUser(session?.user ?? null); selectChild(undefined);
      void router.invalidate();
      if (event !== 'SIGNED_OUT') void cache.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, cache]);
  const family = useQuery({ queryKey: ['identity-family', user?.id], queryFn: familyFn, enabled: parent && !!user, retry: 1 });
  const child = useQuery({ queryKey: ['identity-child'], queryFn: childFn, enabled: childPage, retry: 1, staleTime: 15_000, refetchInterval: false });
  useEffect(() => {
    if (!childPage) cache.removeQueries({ queryKey: ['identity-child'] });
  }, [childPage, cache]);
  const childSessionFailed = childPage && child.isError;
  useEffect(() => {
    if (childSessionFailed) void router.navigate({ to: '/child-login', replace: true });
  }, [childSessionFailed, router]);

  const childrenList = Array.isArray(family.data?.children) ? (family.data.children as Array<{ id: string }>) : [];
  const defaultChildId = childrenList[0]?.id;
  const activeChildId = selected ?? defaultChildId ?? 'none';
  const parentUserId = user?.id ?? (ready ? 'none' : 'loading');
  const childIdentity = child.data?.child;

  const scope = childPage
    ? `child:${childIdentity?.id ?? 'loading'}`
    : parent
      ? `parent:${parentUserId}:${activeChildId}`
      : 'public';
  return <IdentityContext.Provider value={{ user, child: childPage ? childIdentity ?? null : null, childSnapshot: childPage ? child.data?.snapshot : undefined, familyData: parent ? family.data : undefined, selected, selectChild, scope, ready }}>{children}</IdentityContext.Provider>;
}
export function useIdentity() { const value = useContext(IdentityContext); if (!value) throw new Error('IdentityProvider is required'); return value; }