"use client";

// A full-screen page that the soft keyboard cannot swallow.
//
// Dustin, 2026-08-04, screenshot of the sign-in screen with the Android
// keyboard up: "keyboard covers app when it pops up fix this". The email field
// sat flush against the top of the keyboard; the password field, the error line
// and the Sign in button were all underneath it, and nothing scrolled — because
// the page was exactly `min-h-screen` tall, so there was no overflow for the
// browser to scroll into.
//
// That is the shape of the bug on EVERY one-screen form in the app: a page
// sized to the viewport has no spare height, so when the keyboard covers the
// bottom 55% of it, the bottom 55% of the form is simply gone.
//
// The fix is to stop pretending the screen is still full height while a
// keyboard is on it. This box is as tall as the space ACTUALLY visible, and it
// scrolls. The branding at the top slides away, the form comes up, the submit
// button is reachable, and when the keyboard closes everything returns exactly
// as it was.
//
// Not for the workout logger. That screen's rule is the opposite — nothing may
// move when the keyboard opens — and it is pinned by useStableViewportHeight
// and locked by tests/unit/loggerLayout.test.ts. Do not put this component in
// there.

import { useKeyboardInset, scrollFocusedIntoView } from "@/lib/useKeyboardInset";

export default function KeyboardSafeArea({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const kb = useKeyboardInset();

  return (
    <div
      // React's onFocus is focusin, so this catches every input inside without
      // any of them having to opt in. The handler defers past the keyboard
      // animation before scrolling — see useKeyboardInset.
      onFocus={scrollFocusedIntoView}
      className={className}
      style={{
        // 100dvh, minus whatever the keyboard is covering. dvh follows the
        // layout viewport (the URL bar), which the keyboard does not change —
        // so the subtraction is the only thing that accounts for it.
        height: kb ? `calc(100dvh - ${kb}px)` : "100dvh",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
