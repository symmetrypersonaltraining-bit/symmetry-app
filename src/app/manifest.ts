import type { MetadataRoute } from "next";

/**
 * The web app manifest.
 *
 * layout.tsx has pointed at "/manifest.json" since the app was built. The file
 * never existed. Every phone that tried to install the app fetched it, got a
 * 404, and fell back to the worst version of the experience:
 *
 *   Android — Chrome requires a valid manifest before it will offer "Install
 *             app", so it never did. The only route in was sideloading a debug
 *             APK, which means walking a client through "install unknown apps"
 *             and a Play Protect warning that says the app is unsafe.
 *   iPhone  — Add to Home Screen still worked, but with a screenshot of the page
 *             as the icon and the browser's own title.
 *
 * Dustin: "the flow is currently very sloppy for new clients." This was most of
 * why.
 *
 * Served from app/manifest.ts rather than a static public/manifest.json so it is
 * typed and cannot drift from the icons that actually exist on disk.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Symmetry Personal Training",
    short_name: "Symmetry",
    description: "Your programme, your food, your progress — with Dustin.",
    // The app is a single-page experience behind a login; deep-linking the
    // install to /home means a returning client lands on their day, not on a
    // marketing page they have never seen.
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F4C81",
    theme_color: "#0F4C81",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops adaptive icons; the badge sits inside the 80% safe zone in
      // this one so the gold ring does not get shaved off on a Pixel.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today's workout", url: "/workout" },
      { name: "Log food", url: "/nutrition" },
      { name: "Message Dustin", url: "/messages" },
    ],
  };
}
