"use client";

// THE BUTTON THAT DID NOTHING.
//
// `New Program` on the programmes screen had no onClick at all — not a broken
// handler, there had never been one. It is the first thing anybody taps on that
// screen, and on 22 Aug three trainers got accounts, so it was about to be the
// first thing three new people found.
//
// There is no create-a-programme form in this app and this is not the commit to
// invent one: programmes here are built by describing them, which is how every
// programme in the database got made. The tutorial already tells trainers that.
// So the button now does the real thing instead of pretending at a different
// one — it opens the assistant, which can build a programme, assign it and
// schedule it out.
//
// `symmetry:open-ai` is the same event the header control dispatches, so there
// is one way in and no second drawer to keep in step.

import { useCallback } from "react";

export default function NewProgramButton() {
  const open = useCallback(() => {
    try {
      window.dispatchEvent(new Event("symmetry:open-ai"));
    } catch {
      /* nothing to fall back to, and a dead tap is what this replaced */
    }
  }, []);

  return (
    <button
      type="button"
      onClick={open}
      title="Describe the programme you want and it will be built"
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
      style={{ background: "var(--brand-primary)" }}
    >
      <i className="ti ti-plus text-base" />
      New Program
    </button>
  );
}
