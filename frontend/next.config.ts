import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server (HMR websocket, /_next/* assets) be reached from other machines on the
  // LAN via this host's IP, instead of only localhost.
  allowedDevOrigins: ["192.168.8.74", "https://prepzy-degz.onrender.com"],
};

export default nextConfig;
