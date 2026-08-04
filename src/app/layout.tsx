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
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css"
        />
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
