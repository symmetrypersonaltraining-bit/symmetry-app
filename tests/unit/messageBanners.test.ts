import test from "node:test";
import assert from "node:assert/strict";
import { bannersForDelta } from "../../src/lib/messageBanners.ts";

test("a group message alongside MORE direct messages is still announced", () => {
  // The regression that prompted this file: groupDelta 1 vs directDelta 2 used
  // to render only the direct banner, pointing at the private trainer thread.
  const b = bannersForDelta({ groupDelta: 1, directDelta: 2, isClientMode: false });
  assert.equal(b.length, 2);
  assert.equal(b[0].href, "/messages?client=group");
  assert.equal(b[0].text, "New group message");
  assert.equal(b[1].href, "/messages");
  assert.equal(b[1].text, "2 new messages");
});

test("group only", () => {
  const b = bannersForDelta({ groupDelta: 3, directDelta: 0, isClientMode: false });
  assert.deepEqual(b, [{ text: "3 new group messages", href: "/messages?client=group" }]);
});

test("direct only", () => {
  const b = bannersForDelta({ groupDelta: 0, directDelta: 1, isClientMode: false });
  assert.deepEqual(b, [{ text: "New message", href: "/messages" }]);
});

test("nothing new raises nothing", () => {
  assert.deepEqual(bannersForDelta({ groupDelta: 0, directDelta: 0, isClientMode: false }), []);
});

test("a negative delta (a thread was read elsewhere) raises nothing", () => {
  assert.deepEqual(bannersForDelta({ groupDelta: -2, directDelta: 0, isClientMode: true }), []);
});

test("client mode carries as=client on both destinations", () => {
  const b = bannersForDelta({ groupDelta: 1, directDelta: 1, isClientMode: true });
  assert.equal(b[0].href, "/messages?client=group&as=client");
  assert.equal(b[1].href, "/messages?as=client");
});

test("group is always queued ahead of direct", () => {
  const b = bannersForDelta({ groupDelta: 1, directDelta: 9, isClientMode: false });
  assert.match(b[0].text, /group/);
});
