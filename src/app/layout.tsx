import type { Metadata, Viewport } from "next";
import HapticTap from "@/components/HapticTap";
import FloatingDock from "@/components/FloatingDock";
import AIAssistant from "@/components/AIAssistant";
import ChartZoom from "@/components/ChartZoom";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Symmetry Personal Training",
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
        <FloatingDock />
        <AIAssistant />
        <ChartZoom />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
