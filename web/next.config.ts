import type { NextConfig } from "next";

// The agent API runs on EC2 behind nginx on plain HTTP (port 443 is closed on that
// box's security group, and an amazonaws.com hostname cannot get a Let's Encrypt
// cert). The site is served over HTTPS, so a direct browser call would be blocked
// as mixed content. These rewrites proxy the API server-side instead: the browser
// talks HTTPS to Vercel, Vercel talks HTTP to the origin.
//
// `API_ORIGIN` is a server-only variable — deliberately NOT NEXT_PUBLIC_*, so the
// origin address never ships in the browser bundle.
const API_ORIGIN =
  process.env.API_ORIGIN?.replace(/\/$/, "") ||
  "http://ec2-13-126-37-160.ap-south-1.compute.amazonaws.com";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
