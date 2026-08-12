"use client";

// A number field you can actually type a decimal into.
//
// Claudine, 11 Aug: "cant type decimals in weight for each ingredient." The
// recipe fields were controlled straight off a number, so `Number("1.")` came
// back as 1 and React re-rendered the box as "1" — deleting the decimal point
// on the keystroke that typed it. See src/lib/numericField.ts for the full
// account; the fix is that the TEXT is the source of truth while editing.

import { useEffect, useState } from "react";
import { sanitizeNumericText, parseNumericText, formatNumericValue } from "@/lib/numericField";

export default function NumericInput({
  value,
  onChange,
  emptyAsZero = false,
  ...rest
}: {
  value: number | null | undefined;
  /** Fired with the parsed number, or null while the text is not yet usable. */
  onChange: (n: number | null) => void;
  /** For fields stored as a plain number (P/C/F) rather than nullable. */
  emptyAsZero?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => formatNumericValue(value));
  const [editing, setEditing] = useState(false);

  // Follow the value when it changes from OUTSIDE (AI fills the row, a reset,
  // a different ingredient) — but never while the user is mid-edit, or we are
  // back to yanking the text out from under them.
  useEffect(() => {
    if (editing) return;
    setText(formatNumericValue(value));
  }, [value, editing]);

  return (
    <input
      {...rest}
      inputMode="decimal"
      value={text}
      onFocus={(e) => { setEditing(true); rest.onFocus?.(e); }}
      onChange={(e) => {
        const next = sanitizeNumericText(e.target.value);
        setText(next);
        const n = parseNumericText(next);
        // "1." parses to null. Don't report it — the previous number stands
        // until they finish typing, so totals never flicker to zero mid-entry.
        if (n !== null) onChange(n);
        else if (next === "") onChange(emptyAsZero ? 0 : null);
      }}
      onBlur={(e) => {
        setEditing(false);
        // Tidy a trailing point on the way out: "1." shows as "1".
        const n = parseNumericText(text);
        setText(n === null ? (text === "" ? "" : formatNumericValue(value)) : formatNumericValue(n));
        rest.onBlur?.(e);
      }}
    />
  );
}
