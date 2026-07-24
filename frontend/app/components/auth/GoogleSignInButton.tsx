'use client';

import { useEffect, useRef } from 'react';
import { useGoogleIdentity } from '../../context/GoogleIdentityContext';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
// Must match the fixed height Google renders for size="large" so the invisible real button
// (see below) fully covers the glass look-alike drawn on top of it — no dead click zone.
const BUTTON_HEIGHT = 40;

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8064.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.7099c-.18-.54-.2827-1.1168-.2827-1.7099s.1027-1.1699.2827-1.7099V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418l3.0067-2.3319z" />
      <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.9927 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582l3.0067 2.3319C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </svg>
  );
}

// Google's cross-origin iframe button can't be styled or programmatically clicked (that's a
// deliberate click-jacking protection), so this renders it fully transparent and layers a custom
// glass look-alike underneath — the real click always lands on Google's button, only the visuals
// are ours. `group-hover`/`group-active` on the look-alike respond correctly because :hover on the
// invisible top layer still bubbles up to this shared wrapper.
export default function GoogleSignInButton() {
  const { accountsId, error } = useGoogleIdentity();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountsId || !buttonRef.current) return;

    accountsId.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      width: Math.round(buttonRef.current.offsetWidth) || 320,
    });
  }, [accountsId]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div>
      <div className="group relative w-full" style={{ height: BUTTON_HEIGHT }}>
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md transition-colors duration-200 group-hover:bg-white/16 group-active:bg-white/22"
          aria-hidden="true"
        >
          <GoogleGlyph className="h-4.5 w-4.5 shrink-0" />
          <span className="text-sm font-medium">Continue with Google</span>
        </div>

        {/* Google's real button: invisible, same box, receives the actual click. */}
        <div ref={buttonRef} className="absolute inset-0 overflow-hidden opacity-0" />
      </div>

      {error && <p className="mt-2 text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
