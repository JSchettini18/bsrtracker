import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import Login from '@/pages/Login';

// Renders the app only with a Supabase session. The real protection is RLS
// (policies allow only the `authenticated` role); this gate is the UI side of it.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Drop cached data from the previous session (e.g. after logout).
      if (!newSession) queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  if (loading) return null;
  if (!session) return <Login />;
  return <>{children}</>;
}
