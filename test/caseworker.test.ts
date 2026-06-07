// Unit tests for Caseworker's deterministic core — the date parsing, deadline
// extraction, and demo analyzer that must work with zero API keys.
//
// Run:  npm test   (node --test, no extra dependencies)
//
// These tests force demo mode by leaving ANTHROPIC_API_KEY / GEMINI_API_KEY
// unset, so nothing here touches the network.

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  daysBetween,
  findDeadline,
  runCaseworker,
  NoModelForFileError,
} from "../lib/caseworker.ts";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.GEMINI_API_KEY;

// Same "days from now → US long date" helper the samples use, so deadlines are
// always realistic relative to the day the tests run.
function fmt(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

test("parseDate handles the formats letters and models emit", () => {
  const monthName = parseDate("August 30, 2026");
  assert.equal(monthName?.getFullYear(), 2026);
  assert.equal(monthName?.getMonth(), 7); // August
  assert.equal(monthName?.getDate(), 30);

  const iso = parseDate("2026-08-30");
  assert.equal(iso?.getFullYear(), 2026);
  assert.equal(iso?.getMonth(), 7);
  assert.equal(iso?.getDate(), 30);

  const us = parseDate("8/30/2026");
  assert.equal(us?.getMonth(), 7);
  assert.equal(us?.getDate(), 30);

  assert.equal(parseDate("sometime soon"), null);
  assert.equal(parseDate(""), null);
});

test("daysBetween counts whole days from today", () => {
  const target = new Date();
  target.setDate(target.getDate() + 10);
  const midnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  assert.equal(daysBetween(midnight), 10);

  // Round-trips through the month-name parser the way the UI does.
  assert.equal(daysBetween(parseDate(fmt(15))!), 15);
  assert.equal(daysBetween(parseDate(fmt(-5))!), -5);
});

test("findDeadline prefers a date that follows a deadline cue", () => {
  const due = fmt(40);
  const r = findDeadline(`You may appeal. Your appeal must be received no later than ${due}.`);
  assert.ok(r, "expected a deadline");
  assert.equal(r!.date, due);
  assert.equal(r!.daysLeft, 40);
});

test("runCaseworker demo mode extracts the case number and deadline", async () => {
  const res = await runCaseworker(
    `BlueShield — Claim #CLM-22841907 was DENIED. Your appeal must be received no later than ${fmt(20)}.`,
    "insurance"
  );
  assert.equal(res.source, "demo");
  assert.equal(res.documentType, "Insurance claim denial");
  assert.equal(res.severity, "urgent"); // 20 days ≤ 30
  assert.equal(res.deadlines[0]?.daysLeft, 20);
  assert.ok(res.draftResponse.body.includes("CLM-22841907"));
  assert.ok(res.yourRights.length > 0);
  assert.ok(res.recommendedActions.length > 0);
});

test("severity is action_needed for a far deadline, urgent for a near one", async () => {
  const far = await runCaseworker(`Notice of action. Request a hearing before ${fmt(90)}.`, "benefits");
  assert.equal(far.severity, "action_needed");

  const near = await runCaseworker(`Notice of action. Request a hearing before ${fmt(12)}.`, "benefits");
  assert.equal(near.severity, "urgent");
});

test("severity defaults to action_needed when no deadline is found (regression for the dead-code fix)", async () => {
  const res = await runCaseworker("A general notice. No dates appear anywhere in this letter.", "medical");
  assert.equal(res.source, "demo");
  assert.equal(res.severity, "action_needed");
  assert.equal(res.deadlines[0]?.daysLeft, null);
});

test("runCaseworker rejects a file when no model is configured", async () => {
  await assert.rejects(
    () => runCaseworker({ file: { mediaType: "image/png", data: "AAAA" } }, "insurance"),
    (err) => err instanceof NoModelForFileError
  );
});
