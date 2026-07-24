'use client';

import Script from 'next/script';
import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getErrorMessage } from '../lib/axios';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface GoogleCredentialResponse {
  credential: string;
}

export interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: { theme?: string; size?: string; shape?: string; width?: number }
  ) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

interface GoogleIdentityContextValue {
  accountsId: GoogleAccountsId | null;
  error: string | null;
}

const GoogleIdentityContext = createContext<GoogleIdentityContextValue>({ accountsId: null, error: null });

// Loads the Google Identity Services script and calls initialize() exactly once for the whole
// app, shared by GoogleSignInButton (the only consumer — it calls renderButton()).
//
// There's deliberately no automatic One Tap prompt() here. Chrome allows only one active FedCM
// request per page, and this app shows the login dialog (with the button) unconditionally
// whenever the visitor is signed out — so an auto-triggered prompt() would always be contending
// with the button for that single FedCM slot, and would non-deterministically break the button's
// own click-triggered sign-in. One Tap's value proposition (skip showing the login form) doesn't
// apply here anyway, since the form is always shown by design.
export function GoogleIdentityProvider({ children }: { children: ReactNode }) {
  const { loginWithGoogle, closeAuthDialog } = useAuth();
  const [accountsId, setAccountsId] = useState<GoogleAccountsId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCredentialResponse = useCallback(
    async (response: GoogleCredentialResponse) => {
      setError(null);
      try {
        await loginWithGoogle(response.credential);
        // LoginForm/SignupForm both do this on success; without it here, the dialog stays open
        // forever once manualDialogOpen has ever been set to true (e.g. from clicking the Log
        // in/Sign up tab switcher) — setting `user` alone doesn't reset that flag.
        closeAuthDialog();
      } catch (err) {
        setError(getErrorMessage(err, 'Unable to sign in with Google'));
      }
    },
    [loginWithGoogle, closeAuthDialog]
  );

  // Fires once, when the script's own `load` event happens — not a render-driven effect, so
  // initializing here (and only here) is the correct place for this one-time side effect.
  const handleScriptLoad = useCallback(() => {
    if (!GOOGLE_CLIENT_ID || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    setAccountsId(window.google.accounts.id);
  }, [handleCredentialResponse]);

  const value = useMemo<GoogleIdentityContextValue>(() => ({ accountsId, error }), [accountsId, error]);

  return (
    <GoogleIdentityContext.Provider value={value}>
      {GOOGLE_CLIENT_ID && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={handleScriptLoad} />
      )}
      {children}
    </GoogleIdentityContext.Provider>
  );
}

export function useGoogleIdentity() {
  return useContext(GoogleIdentityContext);
}
