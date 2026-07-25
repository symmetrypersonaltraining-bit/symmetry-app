"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fx } from "@/lib/fx";

/**
 * PullToRefresh — drag down at the top of a page to reload. 2026-07-25.
 *
 * The native app is a Capacitor WebView pointed at the live site, and a
 * standalone WebView has no browser chrome and no built-in pull-to-refresh.
 * So people were stuck with whatever the page loaded with. This adds the
 * gesture everyone already expects from a phone app.
 *
 * ── THE SAFETY RULE THAT MATTERS ──────────────────────────────────────────
 * This does a real page reload, which throws away anything typed but unsaved.
 * On the workout logger that would mean losing sets someone is mid-way through
 * entering — so the logger, the meal plan logger and every other screen with
 * live unsaved input are excluded outright by route. Nothing about how those
 * screens work is touched; the gesture simply never arms there.
 *
 * On top of the route list there are four more guards, any one of which
 * cancels the pull:
 *   1. the nearest scrollable ancestor isn't at the very top
 *   2. the finger started inside a fixed-position element (a modal or sheet)
 *   3. a text field, textarea or contenteditable has focus (mid-typing)
 *   4. ANY box on screen currently holds typed text — the general net behind
 *      the route list, since no hand-kept list stays correct as the app grows
 *   5. more than one finger is down (that's a pinch, not a pull)
 *
 * Anything can opt out by adding data-no-refresh to a wrapping element.
 *
 * Revert = remove the two mounts in (app)/layout.tsx.
 */

// Screens that hold unsaved input. A reload here loses real work.
// NOTE: "/workout/" has the trailing slash on purpose — it blocks the session
// logger at /workout/[dayId] but still allows the /workout list page, which has
// nothing to lose and is worth refreshing.
const BLOCKED = [
  "/workout/", // the session logger — sets typed but not yet saved
  "/nutrition", // meal plan logger (and /nutrition/v3)
  "/log", // metric logging form (also covers /log-bodyfat)
  "/messages", // a half-typed message
  "/onboarding",
  "/assessment",
  "/movement", // movement screen forms
  "/clients/", // program + day editors live under here
  "/client-preview/workout",
  "/client-preview/nutrition",
];

const TRIGGER = 64; // px of pull needed to fire
const MAX = 96; // px the indicator can travel
const RESISTANCE = 2.2; // finger travel : indicator travel

function isBlocked(path: string): boolean {
  return BLOCKED.some((b) => path === b || path.startsWith(b));
}

/** Nearest ancestor that actually scrolls, or null if the document scrolls. */
function scrollParent(el: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    try {
      const s = getComputedStyle(node);
      const oy = s.overflowY;
      if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    } catch {
      /* detached node mid-gesture — treat as not scrollable */
    }
    node = node.parentElement;
  }
  return null;
}

function atTop(el: Element | null): boolean {
  if (el) return el.scrollTop <= 0;
  const doc = document.documentElement;
  return (window.scrollY || doc.scrollTop || 0) <= 0;
}

/** True if the touch began inside a modal, sheet or other fixed overlay. */
function inFixedOverlay(el: Element | null): boolean {
  let node: Element | null = el;
  while (node && node !== document.body) {
    try {
      if (node.hasAttribute("data-no-refresh")) return true;
      const pos = getComputedStyle(node).position;
      if (pos === "fixed" || pos === "sticky") return true;
    } catch {
      return true; // if we can't tell, don't arm the gesture
    }
    node = node.parentElement;
  }
  return false;
}

function typing(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  const tag = a.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || a.isContentEditable === true;
}

const TEXTY =
  "textarea,input:not([type]),input[type=text],input[type=search],input[type=number]," +
  "input[type=email],input[type=tel],input[type=url],input[type=password],[contenteditable=true]";

/**
 * True if anything on screen currently holds typed text.
 *
 * This is the general safety net behind the route list. A reload throws away
 * unsaved input, and no hand-maintained list of routes stays correct as the app
 * grows — but "there is text in a box on this screen" is always a reason not to
 * reload out from under someone. Deliberately conservative: it would rather
 * skip a refresh than lose a sentence.
 *
 * Runs once per gesture on touchstart, never per frame. Date pickers,
 * checkboxes and radios are excluded — those hold no typed text.
 */
function hasTypedText(): boolean {
  try {
    const nodes = document.querySelectorAll(TEXTY);
    const limit = Math.min(nodes.length, 300); // bound the scan on huge pages
    for (let i = 0; i < limit; i++) {
      const el = nodes[i] as HTMLInputElement & HTMLElement;
      if (el.disabled || el.readOnly) continue;
      if (el.offsetParent === null && el.tagName !== "BODY") continue; // hidden
      const v = el.isContentEditable ? el.textContent || "" : el.value || "";
      if (v.trim()) return true;
    }
  } catch {
    return true; // if we can't tell, don't reload
  }
  return false;
}

export default function PullToRefresh() {
  const pathname = usePathname() || "";
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Refs, not state: these change on every touchmove and must not re-render.
  const startY = useRef(0);
  const armed = useRef(false);
  const scroller = useRef<Element | null>(null);
  const passedRef = useRef(false);

  useEffect(() => {
    if (isBlocked(pathname)) return;

    // Pointer-coarse only. On a desktop browser this gesture doesn't exist and
    // shouldn't be simulated by a trackpad flick.
    let touchCapable = false;
    try {
      touchCapable = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    } catch {
      touchCapable = false;
    }
    if (!touchCapable) return;

    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1) {
        armed.current = false;
        return;
      }
      const target = e.target as Element | null;
      if (typing() || inFixedOverlay(target) || hasTypedText()) {
        armed.current = false;
        return;
      }
      const sp = scrollParent(target);
      if (!atTop(sp)) {
        armed.current = false;
        return;
      }
      scroller.current = sp;
      startY.current = e.touches[0].clientY;
      armed.current = true;
      passedRef.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed.current || refreshing) return;
      if (e.touches.length !== 1) {
        armed.current = false;
        setDragging(false);
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;

      // Pulling up, or the container scrolled away from the top mid-gesture:
      // hand the gesture back to the browser.
      if (dy <= 0 || !atTop(scroller.current)) {
        setPull(0);
        setDragging(false);
        armed.current = false;
        return;
      }

      const dist = Math.min(dy / RESISTANCE, MAX);
      // Only now do we own the gesture, so this is the only moment we suppress
      // the browser's own overscroll. Everything else stays native.
      if (e.cancelable) e.preventDefault();
      setDragging(true);
      setPull(dist);

      if (dist >= TRIGGER && !passedRef.current) {
        passedRef.current = true;
        fx("tap"); // the little "it'll go now" buzz
      } else if (dist < TRIGGER && passedRef.current) {
        passedRef.current = false;
      }
    };

    const onEnd = () => {
      setDragging(false);
      if (!armed.current) return;
      armed.current = false;
      if (passedRef.current) {
        setRefreshing(true);
        setPull(TRIGGER);
        // A real reload. router.refresh() only re-runs server components, so
        // anything that fetches in a useEffect would stay stale — which is
        // exactly the thing someone is pulling down to fix.
        window.setTimeout(() => {
          try {
            window.location.reload();
          } catch {
            setRefreshing(false);
            setPull(0);
          }
        }, 180);
      } else {
        setPull(0);
      }
      passedRef.current = false;
    };

    // touchmove must be non-passive so the pull can suppress native overscroll.
    // start/end stay passive — they never call preventDefault.
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    // NOTE: `pull` is deliberately NOT a dependency. It changes on every
    // touchmove frame, and including it would unbind and rebind these listeners
    // mid-gesture — which drops the gesture. All per-frame state lives in refs.
  }, [pathname, refreshing]);

  if (isBlocked(pathname)) return null;
  if (pull <= 0 && !refreshing) return null;

  const progress = Math.min(pull / TRIGGER, 1);
  const ready = progress >= 1;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 95,
        transform: "translateY(" + (pull - 34) + "px)",
        transition: dragging ? "none" : "transform .22s cubic-bezier(.2,.8,.3,1)",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          boxShadow: "0 4px 14px rgba(20,30,55,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" style={{ display: "block" }}>
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="var(--brand-border)"
            strokeWidth="2.5"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke={ready ? "var(--brand-primary)" : "var(--brand-text-secondary)"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 9}
            strokeDashoffset={2 * Math.PI * 9 * (1 - progress)}
            transform="rotate(-90 12 12)"
            style={{
              transformOrigin: "12px 12px",
              animation: refreshing ? "cw-ptr-spin .8s linear infinite" : undefined,
            }}
          />
        </svg>
      </div>
      <style>{"@keyframes cw-ptr-spin{to{transform:rotate(270deg)}}"}</style>
    </div>
  );
}
