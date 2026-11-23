import { useCallback, useEffect, useState } from 'react';
import type { GmailAccount } from '../types/board';
import { MOCK_ACCOUNTS } from '../data/mockBoardData';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { loadKnownAccounts, rememberAccount, signInWithGoogle, signOut, userToAccount } from '../lib/auth';

export interface AccountsApi {
  /** true = đang dùng Supabase thật; false = tài khoản mẫu. */
  isReal: boolean;
  accounts: GmailAccount[];
  current: GmailAccount | null;
  switchTo: (account: GmailAccount) => Promise<void>;
  addAnother: () => Promise<void>;
  logout: () => Promise<void>;
  error: string;
}

/** Một chỗ duy nhất quyết định dùng tài khoản mẫu hay Supabase Auth thật. */
export function useAccounts(): AccountsApi {
  const [accounts, setAccounts] = useState<GmailAccount[]>(isSupabaseConfigured ? loadKnownAccounts() : MOCK_ACCOUNTS);
  const [current, setCurrent] = useState<GmailAccount | null>(isSupabaseConfigured ? null : MOCK_ACCOUNTS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    const apply = (user: Parameters<typeof userToAccount>[0] | null): void => {
      if (!user) { setCurrent(null); return; }
      const acc = userToAccount(user);
      setCurrent(acc);
      setAccounts(rememberAccount(acc));
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const run = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không đăng nhập được.'); }
  }, []);

  const switchTo = useCallback(async (account: GmailAccount): Promise<void> => {
    if (!isSupabaseConfigured) { setCurrent(account); return; }
    await run(() => signInWithGoogle(account.email));
  }, [run]);

  const addAnother = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      // Bản mẫu: giả lập thêm một Gmail mới để thử luồng giao diện.
      const n = accounts.length + 1;
      const acc: GmailAccount = { id: `acc-${n}`, email: `giaovien${n}@gmail.com`, name: `Giáo viên mẫu ${n}`, hue: (n * 67) % 360 };
      setAccounts((l) => [...l, acc]);
      setCurrent(acc);
      return;
    }
    await run(() => signInWithGoogle());
  }, [accounts.length, run]);

  const logout = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured) { setCurrent(null); return; }
    await run(signOut);
  }, [run]);

  return { isReal: isSupabaseConfigured, accounts, current, switchTo, addAnother, logout, error };
}
