import type { Metadata } from "next";
import { Source_Serif_4, Archivo } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "@/components/providers";
import { FaucetPrompt } from "@/components/faucet-prompt";
import { ChannelFrame } from "@/components/channel-frame";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-source-serif",
});

const archivo = Archivo({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-archivo",
});

const TITLE = "BBC — the Bull Broadcasting Corporation";
const DESC =
  "An autonomous prediction-market trading agent that reports its own reasoning, positions and P&L as a live news broadcast. $BBC on Solana.";

export const metadata: Metadata = {
  metadataBase: process.env.VERCEL_URL
    ? new URL(`https://${process.env.VERCEL_URL}`)
    : new URL("http://localhost:3000"),
  title: TITLE,
  description: DESC,
  icons: { icon: "/channel-mark.svg", shortcut: "/channel-mark.svg", apple: "/channel-mark.svg" },
  openGraph: {
    title: TITLE,
    description: DESC,
    images: [{ url: "/anchor-bull.png", width: 1100, height: 1059, alt: "The BBC anchor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/anchor-bull.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // the font variables must live on <html>: `@theme inline` resolves
    // --font-head / --font-ui at :root, so declaring them on <body> leaves
    // every .headline falling through to the platform sans.
    <html lang="en" className={`${sourceSerif.variable} ${archivo.variable}`}>
      <body className="min-h-screen antialiased">
        {/*
          THESIS: A trading agent that reports itself. This is a 24h news
          channel whose only story is its own book — not a dashboard of tiles
          with an accent colour, which is what this category always ships.
          OWN-WORLD: A dark studio (#0a0d11) lit by an out-of-focus video wall
          of blue and red monitor glow; BBC broadcast red (#bb1919) as page
          furniture, not accent — lower thirds, straps, cut-ins, the tape.
          Source Serif 4 headlines against Archivo chyrons. Panels are lit
          monitors; labels are all-caps tracked chyrons.
          STORY: A judge sees a bull anchor delivering a trade the agent just
          made, understands "autonomous trader, live, on Solana", and either
          watches the reasoning run or checks the Bull Pool.
          FIRST VIEWPORT: Studio full-bleed. Anchor bull camera-right at ~55vh.
          Red lower third pinned across the bottom of the hero carrying the
          agent's latest decision as a headline, strap and clock beneath it.
          Primary action ("Run a market live") sits in the strap row. The tape
          rolls fixed at the foot of every page.
          FORM: Broadcast news channel — pinned by the user's brief and
          reference frame, so the direction roll does not apply.
          FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, and DESIGN.md.
        */}
        <Providers>
          <SiteHeader />
          <FaucetPrompt />
          <main className="relative z-10 pb-14">{children}</main>
          <ChannelFrame />
        </Providers>
      </body>
    </html>
  );
}
