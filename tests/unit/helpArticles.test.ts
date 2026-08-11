// ============================================================================
// Unit tests — src/lib/help/articles.ts (Help & Tutorials content + search).
//
// This shipped as a PATCH on 7 Aug 2026 and was applied to Dylan's fork, never
// to this repo — so the tutorials lived only in the copy we are now retiring.
// Landing it here is what stops them being deleted along with the fork, and
// these tests are what stop the copy drifting back to naming one studio.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  filterArticles,
} from "../../src/lib/help/articles.ts";

describe("help articles — data integrity", () => {
  it("every article has the required non-empty fields and at least one step", () => {
    for (const a of HELP_ARTICLES) {
      assert.ok(a.id, `missing id: ${JSON.stringify(a)}`);
      assert.ok(a.title.trim().length > 0, `empty title: ${a.id}`);
      assert.ok(a.intro.trim().length > 0, `empty intro: ${a.id}`);
      assert.ok(a.icon.trim().length > 0, `empty icon: ${a.id}`);
      assert.ok(a.steps.length >= 1, `no steps: ${a.id}`);
      assert.ok(a.steps.every((s) => s.trim().length > 0), `blank step: ${a.id}`);
      assert.ok(["all", "client", "trainer"].includes(a.audience), `bad audience: ${a.id}`);
      assert.ok((HELP_CATEGORIES as readonly string[]).includes(a.category), `unknown category: ${a.id} → ${a.category}`);
    }
  });

  it("has no duplicate ids", () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("keeps internal/NASM method language out of ALL help copy (client-safe)", () => {
    const banned = ["nasm", "ohsa", "inhibit", "overhead squat"];
    for (const a of HELP_ARTICLES) {
      const text = [a.title, a.intro, ...a.keywords, ...a.steps].join(" ").toLowerCase();
      for (const b of banned) {
        assert.ok(!text.includes(b), `article "${a.id}" contains banned term "${b}"`);
      }
    }
  });

  it("names no individual coach — the tutorials belong to every instance", () => {
    // A tutorial that tells another trainer's client to contact Dustin is worse
    // than no tutorial: it is confidently, specifically wrong.
    const name = ["Dus", "tin"].join("");
    for (const a of HELP_ARTICLES) {
      const text = [a.title, a.intro, ...a.keywords, ...a.steps].join(" ");
      assert.ok(!text.includes(name), `article "${a.id}" names a specific coach`);
    }
  });

  it("the studio name is never hardcoded in an article's steps", () => {
    // The install article legitimately uses BUSINESS_NAME in its intro, which
    // is a value, not a literal. Steps must stay neutral.
    for (const a of HELP_ARTICLES) {
      assert.ok(
        !a.steps.some((s) => s.includes("Symmetry")),
        `article "${a.id}" hardcodes the studio name in a step`,
      );
    }
  });

  it("there is a setup path for a trainer standing up their own instance", () => {
    // The whole reason this file moved into the shared repo.
    const setup = HELP_ARTICLES.filter((a) => a.category === "Running Your Own Instance");
    assert.ok(setup.length >= 3, "expected the instance-setup articles");
    assert.ok(setup.every((a) => a.audience === "trainer"), "instance setup must be trainer-only");
  });
});

describe("filterArticles — audience gating", () => {
  it("hides trainer-only articles from clients", () => {
    const forClient = filterArticles(HELP_ARTICLES, "", false);
    assert.ok(forClient.length > 0);
    assert.ok(forClient.every((a) => a.audience !== "trainer"), "a trainer article leaked to a client");
  });

  it("shows the trainer everything", () => {
    const forTrainer = filterArticles(HELP_ARTICLES, "", true);
    assert.equal(forTrainer.length, HELP_ARTICLES.length);
  });

  it("a client can never reach the instance-setup articles", () => {
    const forClient = filterArticles(HELP_ARTICLES, "setup", false);
    assert.ok(forClient.every((a) => a.category !== "Running Your Own Instance"));
  });

  it("there is at least one trainer-only article to gate", () => {
    assert.ok(HELP_ARTICLES.some((a) => a.audience === "trainer"));
  });
});

describe("filterArticles — search", () => {
  it("empty query returns all audience-appropriate articles", () => {
    const all = filterArticles(HELP_ARTICLES, "   ", true);
    assert.equal(all.length, HELP_ARTICLES.length);
  });

  it("matches by keyword the viewer can see", () => {
    const res = filterArticles(HELP_ARTICLES, "weigh-in", false);
    assert.ok(res.some((a) => a.id === "weigh-in"), "expected the weigh-in article");
  });

  it("matches by step/body text, not just title", () => {
    const res = filterArticles(HELP_ARTICLES, "barcode", false);
    assert.ok(res.some((a) => a.id === "barcode-scan"));
  });

  it("multi-word queries match as AND across all fields", () => {
    const res = filterArticles(HELP_ARTICLES, "off plan photo", false);
    assert.ok(res.some((a) => a.id === "off-plan-meal"));
    const strict = filterArticles(HELP_ARTICLES, "barcode weigh-in", false);
    assert.equal(strict.length, 0);
  });

  it("is case-insensitive", () => {
    const lower = filterArticles(HELP_ARTICLES, "workout", false).length;
    const upper = filterArticles(HELP_ARTICLES, "WORKOUT", false).length;
    assert.equal(lower, upper);
    assert.ok(lower > 0);
  });

  it("a trainer-only match never surfaces for a client", () => {
    const forClient = filterArticles(HELP_ARTICLES, "session rate", false);
    assert.ok(forClient.every((a) => a.audience !== "trainer"));
    const forTrainer = filterArticles(HELP_ARTICLES, "session rate", true);
    assert.ok(forTrainer.some((a) => a.id === "trainer-payments"));
  });
});
