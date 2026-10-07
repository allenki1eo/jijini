import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanName, nameKey, nameProblem, pinProblem } from "@/lib/server/accounts";
import { deliveryPoints, nextTier, previousWeek, tierFor } from "./league";

test("PINs: 4–6 digits, nothing everyone guesses first", () => {
  for (const ok of ["2580", "739104", "13579"]) assert.equal(pinProblem(ok), null, ok);
  for (const bad of ["123", "1234567", "12a4", 1234]) assert.equal(pinProblem(bad), "format", String(bad));
  for (const weak of ["0000", "1234", "4321", "987654", "111111"]) assert.equal(pinProblem(weak), "weak", weak);
});

test("names: case, spaces and punctuation don't make a new name", () => {
  assert.equal(nameKey(cleanName("Juma  Kijiweni")), nameKey(cleanName("juma-kijiweni")));
  assert.equal(cleanName("  <b>Asha</b>  "), "bAshab");
  assert.equal(nameProblem("J!"), "short");
  assert.equal(nameProblem("ADMIN"), "reserved");
  assert.equal(nameProblem("Neema"), null);
});

test("seasons: the ISO week before, across year ends", () => {
  assert.equal(previousWeek("2026-W41"), "2026-W40");
  assert.equal(previousWeek("2026-W01"), "2025-W52");
  assert.equal(previousWeek("2027-W01"), "2026-W53");
});

test("points and divisions", () => {
  assert.equal(deliveryPoints(5, true), 25);
  assert.equal(deliveryPoints(3, false), 10);
  assert.equal(deliveryPoints(1, false), 5);
  assert.equal(tierFor(0).id, "shaba");
  assert.equal(tierFor(800).id, "dhahabu");
  assert.deepEqual(nextTier(65) && { id: nextTier(65)!.tier.id, need: nextTier(65)!.need }, { id: "fedha", need: 185 });
  assert.equal(nextTier(5000), null);
});
