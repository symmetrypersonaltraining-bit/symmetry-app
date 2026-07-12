import type { Metadata, Viewport } from "next";
import HapticTap from "@/components/HapticTap";
import VersionWatcher from "@/components/VersionWatcher";
import FloatingDock from "@/components/FloatingDock";
import AIAssistant from "@/components/AIAssistant";
import ChartZoom from "@/components/ChartZoom";
import VideoZoom from "@/components/VideoZoom";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Symmetry Corrective",
  description: "Train smarter. Move better. Live stronger.",
  manifest: "/manifest.json",
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
  // Let the on-screen keyboard resize the layout so fixed overlays (workout logger)
  // rise above it instead of being covered. Chrome/Android; harmless elsewhere.
  interactiveWidget: "resizes-content",
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
        <VersionWatcher />
        <FloatingDock />
        <AIAssistant />
        <ChartZoom />
        <VideoZoom />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
