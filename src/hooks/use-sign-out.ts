import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { childLogout } from '@/lib/identity.functions';

/** Parent logout: stop and drop private caches, end the parent session, and replace history. */
export function useParentSignOut() {
  const cache = useQueryClient(); const navigate = useNavigate();
  return async () => {
    await cache.cancelQueries(); cache.clear();
    await supabase.auth.signOut();
    await navigate({ to: '/login', replace: true });
  };
}

/** Child logout: revoke the child session on the server, clear caches, and return to the profile picker. */
export function useChildSignOut() {
  const cache = useQueryClient(); const navigate = useNavigate(); const logout = useServerFn(childLogout);
  return async () => {
    try { await logout(); } catch { toast.error('Could not close your space. Please try again.'); return; }
    await cache.cancelQueries(); cache.clear();
    await navigate({ to: '/child-login', replace: true });
  };
}
