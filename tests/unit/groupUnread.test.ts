// ============================================================================
// Unit tests — src/lib/groupUnread.ts (per-user GROUP-chat unread predicate).
// Run: npm run test:unit   (node --import tsx --test)
// Pure node, no browser, no network.
//
// Focus: the `includeOwn` flag. In Client View, Dustin's trainer app and his
// client app are the SAME auth account, so his OWN trainer-sent group /
// announcement messages must still notify his client app (includeOwn=true) —
// exactly like a real client would be notified. Real clients (includeOwn=false,
// the default) never self-notify for their own group posts.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isGroupUnread, countGroupUnread } from "../../src/lib/groupUnread";

const ME = "aaec8ad5"; // Dustin's (trainer === client) auth id
const OTHER = "client-2";
const WATERMARK = "2026-07-24T12:00:00.000Z";

const ownGroupMsg = { is_group: true, created_at: "2026-07-24T13:00:00.000Z", from_id: ME, deleted_at: null };
const othersGroupMsg = { is_group: true, created_at: "2026-07-24T13:00:00.000Z", from_id: OTHER, deleted_at: null };

describe("isGroupUnread — self-exclusion vs includeOwn", () => {
  it("excludes my OWN group message by default (real-client behavior)", () => {
    assert.equal(isGroupUnread(ownGroupMsg, WATERMARK, ME), false);
  });

  it("COUNTS my own group message when includeOwn=true (Client View)", () => {
    assert.equal(isGroupUnread(ownGroupMsg, WATERMARK, ME, true), true);
  });

  it("always counts OTHERS' group messages regardless of includeOwn", () => {
    assert.equal(isGroupUnread(othersGroupMsg, WATERMARK, ME), true);
    assert.equal(isGroupUnread(othersGroupMsg, WATERMARK, ME, true), true);
  });

  it("still respects the watermark even with includeOwn (older = read)", () => {
    const old = { ...ownGroupMsg, created_at: "2026-07-24T11:00:00.000Z" };
    assert.equal(isGroupUnread(old, WATERMARK, ME, true), false);
  });

  it("still excludes deleted messages even with includeOwn", () => {
    const del = { ...ownGroupMsg, deleted_at: "2026-07-24T13:30:00.000Z" };
    assert.equal(isGroupUnread(del, WATERMARK, ME, true), false);
  });

  it("still excludes non-group messages even with includeOwn", () => {
    const direct = { ...ownGroupMsg, is_group: false };
    assert.equal(isGroupUnread(direct, WATERMARK, ME, true), false);
  });
});

describe("countGroupUnread — includeOwn aggregate", () => {
  const msgs = [ownGroupMsg, othersGroupMsg];

  it("default counts only others' messages", () => {
    assert.equal(countGroupUnread(msgs, WATERMARK, ME), 1);
  });

  it("includeOwn counts own + others' messages", () => {
    assert.equal(countGroupUnread(msgs, WATERMARK, ME, true), 2);
  });
});
