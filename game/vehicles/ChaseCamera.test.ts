import assert from "node:assert/strict";
import { test } from "node:test";
import { chaseFov, portraitness } from "./ChaseCamera";

const hFov = (vDeg: number, aspect: number) => (2 * Math.atan(Math.tan((vDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;

test("landscape and square screens keep the classic 60° chase view", () => {
  assert.equal(portraitness(844 / 390), 0);
  assert.equal(portraitness(1), 0);
  assert.equal(chaseFov(844 / 390, 0), 60);
  assert.equal(chaseFov(16 / 9, 5), 65);
});

test("a tall phone sees a much wider slice of road than before", () => {
  const aspect = 390 / 844;
  assert.ok(portraitness(aspect) > 0.95);
  const before = hFov(60, aspect);
  const after = hFov(chaseFov(aspect, 0), aspect);
  assert.ok(before < 31, `before ${before}`);
  assert.ok(after > 45, `after ${after}`);
});

test("the portrait FOV stays capped so the picture doesn't warp at speed", () => {
  assert.ok(chaseFov(390 / 844, 22) <= 96);
  assert.ok(chaseFov(0.3, 0) <= 88);
});
