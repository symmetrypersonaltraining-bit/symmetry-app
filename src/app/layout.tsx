import type { Metadata, Viewport } from "next";
import HapticTap from "@/components/HapticTap";
import InteractionFX from "@/components/InteractionFX";
import AutoDark from "@/components/AutoDark";
import EasterEgg from "@/components/EasterEgg";
import VersionWatcher from "@/components/VersionWatcher";
import BackButtonGuard from "@/components/BackButtonGuard";
import FloatingDock from "@/components/FloatingDock";
import AIAssistant from "@/components/AIAssistant";
import ChartZoom from "@/components/ChartZoom";
import VideoZoom from "@/components/VideoZoom";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

// Pinned, not @latest: jsdelivr resolves @latest on every request and caps
// browser caching at about a week, so repeat visitors re-fetched this all the
// time. 3.46.0 is what @latest resolves to right now, so pinning it is
// byte-for-byte what the app is already serving — no icon can change or
// disappear — it only stops the set moving underneath us later.
//
// VERIFY THE VERSION EXISTS BEFORE EVER CHANGING THIS. The first draft of this
// commit pinned 3.19.0, a version that has never been published. It would have
// 404'd the whole stylesheet and taken all 144 icons off every screen for every
// client. Checked against the npm registry, not from memory.
const ICON_CSS =
  "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.46.0/dist/tabler-icons.min.css";

export const metadata: Metadata = {
  title: "Symmetry Corrective",
  description: "Train smarter. Move better. Live stronger.",
  // app/manifest.ts serves this; it used to point at a public/manifest.json
  // that did not exist, so no phone could install the app properly.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // Without this iOS uses a screenshot of the page as the home-screen icon.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Symmetry",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0F4C81",
  // The keyboard shrinks the VISUAL viewport only — which is the browser default,
  // and the behaviour every ordinary form in this app needs: Chrome pans the page
  // so the field you just tapped stays visible.
  //
  // This said "overlays-content" from 7d7cc8f (11 Jul) until 04 Aug. That was one
  // part of an approach to the workout logger which was ABANDONED — the
  // visualViewport listener it shipped with was ripped out in 4cb50a1 (scroll
  // loop) and the scrollIntoView in 48d246f. The logger now holds its layout with
  // useStableViewportHeight, which works whether or not the viewport resizes and
  // does not depend on this line at all (it can't — inside the native WebView the
  // activity's windowSoftInputMode overrides the meta tag anyway).
  //
  // So the setting bought the logger nothing and cost every other screen the
  // browser's own scroll-the-focused-field-into-view. On the sign-in screen that
  // meant the password field and the Sign in button sat under the keyboard with
  // no way to reach them. Screens that need more than the browser's panning wrap
  // themselves in <KeyboardSafeArea>.
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* THE ICON FONT NO LONGER HOLDS UP THE FIRST PAINT.
          *
          * Dustin, 3 Sep: "the app has been loading very slow for me".
          *
          * A plain <link rel="stylesheet"> in <head> is render-blocking: the
          * browser paints NOTHING until it has been fetched and parsed. This
          * one is on a third origin, so it also costs a DNS lookup and a TLS
          * handshake before the request even starts — all of it in front of
          * the first pixel, on every page, every load.
          *
          * Two changes, neither of which touches a single icon:
          *
          * 1. PINNED. It was `@latest`, which makes jsdelivr resolve the
          *    version on every request and caps browser caching at ~7 days
          *    instead of the year a pinned version gets. Repeat visitors were
          *    re-fetching it all week. 3.46.0 is what `@latest` resolves to
          *    today, so pinning it is byte-for-byte what is already being
          *    served — it just stops the set moving under us later, which is
          *    its own outage waiting to happen.
          *
          * 2. NON-BLOCKING. rel="preload" starts the download immediately
          *    without holding up paint, and a few lines of inline script
          *    attach it as a real stylesheet as soon as it lands. <noscript>
          *    keeps a plain blocking link for anyone without JS, who would
          *    otherwise get no icons at all.
          *
          * What this does NOT fix: the app uses 144 icons and this font ships
          * about 5,800 of them, from a CDN that is a single point of failure
          * with no fallback. Self-hosting a subset is the real answer and it
          * touches 72 files, so it is its own change.
          */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preload" as="style" href={ICON_CSS} crossOrigin="anonymous" />
        {/* This layout is a SERVER component, so the usual
          * media="print" onLoad={...} trick is not available — React cannot
          * hand an event handler to the client from here. A preload plus three
          * lines of inline script does the same job and runs before hydration.
          */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){var l=document.createElement('link');` +
              `l.rel='stylesheet';l.href=${JSON.stringify(ICON_CSS)};` +
              `document.head.appendChild(l);})();`,
          }}
        />
        <noscript>
          <link rel="stylesheet" href={ICON_CSS} />
        </noscript>
      </head>
      <body>
        <HapticTap />
        <InteractionFX />
        <AutoDark />
        <EasterEgg />
        <VersionWatcher />
        <BackButtonGuard />
        <FloatingDock />
        <AIAssistant />
        <ChartZoom />
        <VideoZoom />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
