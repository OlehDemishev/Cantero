import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearToken, restoreToken, setToken } from "./api-client";
import { unregisterPush } from "./push";

interface SessionValue {
  token: string | null;
  restoring: boolean;
  signIn: (accessToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    restoreToken()
      .then(setTokenState)
      .catch(() => setTokenState(null))
      .finally(() => setRestoring(false));
  }, []);

  const signIn = useCallback(async (accessToken: string) => {
    await setToken(accessToken);
    setTokenState(accessToken);
  }, []);

  const signOut = useCallback(async () => {
    // While the token still authorizes the call.
    await unregisterPush();
    await clearToken();
    setTokenState(null);
  }, []);

  const value = useMemo(
    () => ({ token, restoring, signIn, signOut }),
    [token, restoring, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
