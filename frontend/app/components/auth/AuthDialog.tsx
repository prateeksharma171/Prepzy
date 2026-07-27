"use client";

import { useAuth } from "../../context/AuthContext";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";

// Signing in is mandatory: the app has no unauthenticated experience, so this
// dialog is never user-dismissible (no close button, no click-outside-to-close).
// The scrim behind it is a light, see-through tint (not a solid dark overlay) so
// the page stays visible — it's also `pointer-events-none` since the page is
// already `inert` (page.tsx) and the scrim is purely decorative, not a click-catcher.
export default function AuthDialog() {
  const { isAuthDialogOpen, authDialogTab, openAuthDialog } = useAuth();

  if (!isAuthDialogOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 pointer-events-none animate-fadeIn" />

      <div className="relative w-full max-w-md rounded-3xl bg-zinc-800 border border-zinc-600 shadow-2xl shadow-black/50 animate-slideUp max-h-[90vh] overflow-y-auto scrollbar-thin">
        <div className="px-7 pt-7">
          <div className="flex gap-1 p-1 rounded-xl bg-zinc-900/70">
            <button
              onClick={() => openAuthDialog("login")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                authDialogTab === "login"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => openAuthDialog("signup")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                authDialogTab === "signup"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign up
            </button>
          </div>
        </div>

        <div className="px-7 pb-7 pt-6">
          {authDialogTab === "login" ? <LoginForm /> : <SignupForm />}
        </div>
      </div>
    </div>
  );
}
