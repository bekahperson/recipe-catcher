"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Units = require("../extension/units.js");

test("parseQuantity: integers, decimals, fractions", () => {
  assert.strictEqual(Units.parseQuantity("2").value, 2);
  assert.strictEqual(Units.parseQuantity("1.5").value, 1.5);
  assert.strictEqual(Units.parseQuantity("1/2").value, 0.5);
  assert.strictEqual(Units.parseQuantity("1 1/2").value, 1.5);
  assert.strictEqual(Units.parseQuantity("½").value, 0.5);
  assert.strictEqual(Units.parseQuantity("1½").value, 1.5);
  assert.strictEqual(Units.parseQuantity("¾").value, 0.75);
});

test("parseQuantity: ranges keep low + high", () => {
  const r = Units.parseQuantity("1 to 2");
  assert.strictEqual(r.value, 1);
  assert.strictEqual(r.high, 2);
});

test("parseIngredient: volume with mixed fraction", () => {
  const p = Units.parseIngredient("1 1/2 cups all-purpose flour");
  assert.strictEqual(p.hasMeasure, true);
  assert.strictEqual(p.dim, "volume");
  assert.ok(Math.abs(p.base - 354.882) < 0.5);
  assert.strictEqual(p.rest, "all-purpose flour");
});

test("parseIngredient: weight in ounces", () => {
  const p = Units.parseIngredient("8 oz cream cheese");
  assert.strictEqual(p.dim, "weight");
  assert.ok(Math.abs(p.base - 226.796) < 0.5);
  assert.strictEqual(p.rest, "cream cheese");
});

test("parseIngredient: countable item is not convertible", () => {
  const p = Units.parseIngredient("2 large eggs");
  assert.strictEqual(p.hasMeasure, false);
  assert.strictEqual(Units.formatIngredient(p, "metric"), "2 large eggs");
});

test("parseIngredient: no quantity passes through untouched", () => {
  const p = Units.parseIngredient("Salt, to taste");
  assert.strictEqual(p.hasMeasure, false);
  assert.strictEqual(Units.formatIngredient(p, "metric"), "Salt, to taste");
});

test("formatIngredient: imperial -> metric", () => {
  const p = Units.parseIngredient("1 1/2 cups milk");
  assert.strictEqual(Units.formatIngredient(p, "metric"), "350 ml milk");
});

test("formatIngredient: metric -> imperial", () => {
  const p = Units.parseIngredient("240 ml water");
  const out = Units.formatIngredient(p, "imperial");
  assert.match(out, /cup/);
  assert.match(out, /water$/);
});

test("formatIngredient: round-trip is stable from canonical base", () => {
  const p = Units.parseIngredient("2 cups sugar");
  // toggling metric then imperial renders from the same base each time
  assert.strictEqual(Units.formatIngredient(p, "metric"), "470 ml sugar");
  assert.strictEqual(Units.formatIngredient(p, "imperial"), "2 cups sugar");
  assert.strictEqual(Units.formatIngredient(p, "metric"), "470 ml sugar");
});

test("formatIngredient: weight grams -> pounds/oz", () => {
  const p = Units.parseIngredient("500 g beef");
  const out = Units.formatIngredient(p, "imperial");
  assert.match(out, /(lb|oz)/);
});

test("formatIngredient: ranges convert both ends", () => {
  const p = Units.parseIngredient("1 to 2 cups broth");
  const out = Units.formatIngredient(p, "metric");
  assert.match(out, /ml.*–.*ml|ml–/);
  assert.match(out, /broth$/);
});

test("formatIngredient: same-system keeps original wording", () => {
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("1/2 cup butter, softened"), "imperial"),
    "1/2 cup butter, softened"
  );
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("200 g flour"), "metric"),
    "200 g flour"
  );
});

test("formatIngredient: metric->imperial reduces fractions and pluralizes", () => {
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("355 ml milk"), "imperial"),
    "1 1/2 cups milk"
  );
});

test("formatIngredient: tiny volume does not round to zero", () => {
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("1/4 teaspoon salt"), "metric"),
    "1 ml salt"
  );
});

test("formatIngredient: batch scaling of measures and counts", () => {
  assert.strictEqual(Units.formatCount(1.5), "1 1/2");
  assert.strictEqual(Units.formatCount(4), "4");
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("1 1/2 cups flour"), "imperial", 2),
    "3 cups flour"
  );
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("1/4 teaspoon salt"), "imperial", 2),
    "1/2 tsp salt"
  );
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("2 large eggs"), "metric", 2),
    "4 large eggs"
  );
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("3 ripe bananas, mashed"), "imperial", 0.5),
    "1 1/2 ripe bananas, mashed"
  );
  // scale 1 preserves the author's wording
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("2 large eggs"), "metric", 1),
    "2 large eggs"
  );
});

test("convertTemperatures: annotates F with C inline (nearest degree)", () => {
  assert.strictEqual(
    Units.convertTemperatures("Bake at 350°F for 25 minutes."),
    "Bake at 350°F (177°C) for 25 minutes."
  );
  assert.strictEqual(
    Units.convertTemperatures("Preheat oven to 425 degrees F."),
    "Preheat oven to 425 degrees F (218°C)."
  );
});

test("convertTemperatures: annotates C with F inline", () => {
  assert.strictEqual(
    Units.convertTemperatures("Roast at 200°C."),
    "Roast at 200°C (392°F)."
  );
  assert.strictEqual(
    Units.convertTemperatures("Stir the batter."),
    "Stir the batter."
  );
});

test("formatIngredient: metric weighs dry goods in grams, liquids in ml", () => {
  const N = require("../extension/nutrition.js");
  const resolver = (t) => N.matchFood(t);
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("1 1/2 cups all-purpose flour"), "metric", 1, resolver),
    "185 g all-purpose flour"
  );
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("1 1/2 cups water"), "metric", 1, resolver),
    "350 ml water"
  );
  // a solid measured in a note is weighed, not poured
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient("1 packet yeast (or 2.25 teaspoons)"), "metric", 1, resolver),
    "1 packet yeast (or 7 g)"
  );
});

test("detectSystem: metric vs imperial majority", () => {
  assert.strictEqual(
    Units.detectSystem(["200 g flour", "250 ml milk", "2 eggs"]),
    "metric"
  );
  assert.strictEqual(
    Units.detectSystem(["1 cup flour", "2 tbsp butter", "1 lb beef"]),
    "imperial"
  );
});

// Recipes often state one amount twice — "1 1/2 cups (375 ml) water". Rendering
// both produced "1 1/2 cups (1 5/8 cups)" in imperial and two disagreeing
// values, "350 ml (375 ml)", in metric. (RecipeTin Eats, and WPRM generally.)
const DUP = "1 1/2 cups (375 ml) very warm tap water (Note 4)";

test("formatIngredient: drops a restated amount in the other system", () => {
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient(DUP), "imperial", 1),
    "1 1/2 cups very warm tap water (Note 4)"
  );
});

test("formatIngredient: prefers the author's own number for the shown system", () => {
  // 1 1/2 cups is 354.9 ml, but the author wrote 375 ml — show theirs, exactly
  // (not nice-rounded to 380).
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient(DUP), "metric", 1),
    "375 ml very warm tap water (Note 4)"
  );
});

test("formatIngredient: the author's number still scales", () => {
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient(DUP), "metric", 2),
    "750 ml very warm tap water (Note 4)"
  );
});

test("formatIngredient: keeps a note amount that is NOT a restatement", () => {
  const line = "1 1/2 cups water (plus 2 tbsp for thinning)";
  assert.strictEqual(
    Units.formatIngredient(Units.parseIngredient(line), "imperial", 1),
    "1 1/2 cups water (plus 2 tbsp for thinning)"
  );
  assert.match(
    Units.formatIngredient(Units.parseIngredient(line), "metric", 1),
    /30 ml for thinning/
  );
});
