import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { GoogleIdentityProvider } from "./context/GoogleIdentityContext";
import AuthDialog from "./components/auth/AuthDialog";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Interview Prep Coach",
  description: "An AI coach that preps you for job interviews — coding, system design, behavioral, resume, and negotiation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <SkeletonTheme baseColor="#27272a" highlightColor="#3f3f46">
          <AuthProvider>
            <GoogleIdentityProvider>
              {children}
              <AuthDialog />
            </GoogleIdentityProvider>
          </AuthProvider>
        </SkeletonTheme>
      </body>
    </html>
  );
}
