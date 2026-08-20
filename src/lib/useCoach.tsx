"use client";

// The client half of coachIdentity.ts.
//
// Sixty-six files render a coach's name in the browser. They cannot each go and
// ask the database, so the app layout resolves it once on the server and seeds
// this provider; every client component reads it from here.
//
// The default is the OWNER'S NAME AND NO FACE. A component rendered outside the
// provider therefore degrades to what it did before this existed — never to a
// blank where a name should be, and never to another trainer's photograph.

import { createContext, useContext } from "react";
import { DEFAULT_COACH, type CoachIdentity } from "@/lib/coachIdentity";

const CoachContext = createContext<CoachIdentity>(DEFAULT_COACH);

export function CoachProvider({ value, children }: { value: CoachIdentity; children: React.ReactNode }) {
  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

/** The coach of the person looking at the screen. Never null. */
export function useCoach(): CoachIdentity {
  return useContext(CoachContext);
}

/** Shorthand for the overwhelmingly common case. */
export function useCoachFirstName(): string {
  return useContext(CoachContext).firstName;
}

export type { CoachIdentity };
