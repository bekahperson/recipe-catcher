"use strict";
const test = require("node:test");
const assert = require("node:assert");
const N = require("../extension/nutrition.js");

const BREAD = [
  "1 1/2 cups all-purpose flour", "1 teaspoon baking soda", "1/4 teaspoon salt",
  "1/2 cup butter, softened", "3/4 cup brown sugar", "2 large eggs",
  "3 ripe bananas, mashed", "1 to 2 tablespoons milk", "8 oz chopped walnuts",
];

test("parseServings: various yield strings", () => {
  assert.strictEqual(N.parseServings("1 loaf (10 slices)"), 10);
  assert.strictEqual(N.parseServings("Serves 4"), 4);
  assert.strictEqual(N.parseServings("12 pancakes"), 12);
  assert.strictEqual(N.parseServings("makes a bunch"), null);
});

test("matchFood: specific keywords win, avoids false positives", () => {
  assert.strictEqual(N.matchFood("3/4 cup brown sugar").keys[0], "brown sugar");
  assert.ok(N.matchFood("2 large eggs").keys.includes("egg"));
  assert.strictEqual(N.matchFood("1 cup boiling water").keys[0], "water"); // not "oil"
  assert.strictEqual(N.matchFood("a pinch of nothing special"), null);
});

test("estimate: matches all bread ingredients, plausible total", () => {
  const est = N.estimate(BREAD);
  assert.strictEqual(est.matched, 9);
  assert.ok(est.kcal > 3000 && est.kcal < 5500, `kcal=${Math.round(est.kcal)}`);
});

test("compute: estimates per serving when no site data", () => {
  const info = N.compute({ yield: "1 loaf (10 slices)", ingredients: BREAD, nutrition: null });
  assert.strictEqual(info.source, "estimated");
  assert.strictEqual(info.servings, 10);
  assert.ok(info.perServing.calories > 300 && info.perServing.calories < 520);
  assert.ok(info.perServing.protein > 0 && info.perServing.fat > 0 && info.perServing.carbs > 0);
});

test("compute: prefers site nutrition when present", () => {
  const info = N.compute({
    yield: "Serves 2", ingredients: [],
    nutrition: { calories: "240 calories", protein: "5 g", fat: "10 g", carbs: "30 g" },
  });
  assert.strictEqual(info.source, "site");
  assert.strictEqual(info.perServing.calories, 240);
});

test("compute: source 'none' when nothing recognizable", () => {
  const info = N.compute({ yield: "", ingredients: ["a splash of mystery", "good vibes"], nutrition: null });
  assert.strictEqual(info.source, "none");
  assert.strictEqual(info.perServing, null);
});
