"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("../extension/parser.js");

test("findRecipeNode: nested in @graph with @type array", () => {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "page" },
      { "@type": ["Recipe", "NewsArticle"], name: "Cookies", recipeIngredient: ["a"] },
    ],
  };
  const node = P.findRecipeNode(data);
  assert.ok(node);
  assert.strictEqual(node.name, "Cookies");
});

test("findRecipeNode: top-level array of nodes", () => {
  const data = [{ "@type": "Organization" }, { "@type": "Recipe", name: "Soup" }];
  assert.strictEqual(P.findRecipeNode(data).name, "Soup");
});

test("normInstructions: plain string with newlines", () => {
  const steps = P.normInstructions("Mix the batter.\nBake for 20 min.\n");
  assert.deepStrictEqual(steps, ["Mix the batter.", "Bake for 20 min."]);
});

test("normInstructions: array of HowToStep", () => {
  const steps = P.normInstructions([
    { "@type": "HowToStep", text: "Whisk eggs." },
    { "@type": "HowToStep", text: "Fold in flour." },
  ]);
  assert.deepStrictEqual(steps, ["Whisk eggs.", "Fold in flour."]);
});

test("normInstructions: HowToSection with nested steps", () => {
  const steps = P.normInstructions([
    {
      "@type": "HowToSection",
      name: "Dough",
      itemListElement: [
        { "@type": "HowToStep", text: "Combine." },
        { "@type": "HowToStep", text: "Knead." },
      ],
    },
  ]);
  assert.deepStrictEqual(steps, ["Combine.", "Knead."]);
});

test("normInstructions: strips embedded HTML", () => {
  const steps = P.normInstructions([{ "@type": "HowToStep", text: "Add <b>salt</b> &amp; pepper." }]);
  assert.deepStrictEqual(steps, ["Add salt & pepper."]);
});

test("normDuration: ISO-8601 to human", () => {
  assert.strictEqual(P.normDuration("PT1H30M"), "1 hr 30 min");
  assert.strictEqual(P.normDuration("PT25M"), "25 min");
  assert.strictEqual(P.normDuration("PT2H"), "2 hr");
  assert.strictEqual(P.normDuration(""), "");
});

test("normalizeRecipe: full schema.org Recipe node", () => {
  const node = {
    "@type": "Recipe",
    name: "Best Pancakes",
    author: { "@type": "Person", name: "Sam" },
    image: ["https://x/img.jpg"],
    recipeYield: "12 pancakes",
    prepTime: "PT10M",
    cookTime: "PT15M",
    recipeIngredient: ["1 1/2 cups flour", "1 tbsp sugar", "2 eggs"],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Mix dry." },
      { "@type": "HowToStep", text: "Add wet, cook at 375°F." },
    ],
  };
  const r = P.normalizeRecipe(node, "https://example.com/pancakes");
  assert.strictEqual(r.title, "Best Pancakes");
  assert.strictEqual(r.author, "Sam");
  assert.strictEqual(r.image, "https://x/img.jpg");
  assert.strictEqual(r.yield, "12 pancakes");
  assert.strictEqual(r.times.prep, "10 min");
  assert.strictEqual(r.times.cook, "15 min");
  assert.deepStrictEqual(r.ingredients, ["1 1/2 cups flour", "1 tbsp sugar", "2 eggs"]);
  assert.strictEqual(r.steps.length, 2);
  assert.strictEqual(r.source, "https://example.com/pancakes");
  assert.strictEqual(r.extractedBy, "json-ld");
});

test("normalizeRecipe: returns null when empty", () => {
  assert.strictEqual(P.normalizeRecipe({ "@type": "Recipe", name: "x" }, ""), null);
});

test("normNutrition: keeps raw strings, null when empty", () => {
  const nn = P.normNutrition({
    calories: "240 calories", proteinContent: "5 g",
    fatContent: "10 g", carbohydrateContent: "30 g",
  });
  assert.strictEqual(nn.calories, "240 calories");
  assert.strictEqual(nn.protein, "5 g");
  assert.strictEqual(P.normNutrition({}), null);
});

test("normalizeRecipe: captures nutrition when present", () => {
  const r = P.normalizeRecipe({
    "@type": "Recipe", recipeIngredient: ["a"], recipeInstructions: "Do it.",
    nutrition: { "@type": "NutritionInformation", calories: "300 calories", proteinContent: "8 g" },
  }, "");
  assert.ok(r.nutrition);
  assert.strictEqual(r.nutrition.calories, "300 calories");
});

test("normalizeRecipe: recipeInstructions as single string", () => {
  const r = P.normalizeRecipe(
    { "@type": "Recipe", recipeIngredient: ["a"], recipeInstructions: "Do this. Then that." },
    ""
  );
  assert.deepStrictEqual(r.steps, ["Do this. Then that."]);
});

// Regression: clean() used to match "((" and "))" independently, which ate the
// outer paren of a legitimately nested note. WordPress Recipe Maker (RecipeTin
// Eats et al) emits "flour (, bread or plain/all purpose (Note 1))".
test("clean: keeps nested note parentheses balanced", () => {
  const out = P.clean("3 cups (450g) flour (, bread or plain/all purpose (Note 1))");
  assert.strictEqual(out, "3 cups (450g) flour (bread or plain/all purpose (Note 1))");
  let bal = 0;
  for (const ch of out) { if (ch === "(") bal++; else if (ch === ")") bal--; }
  assert.strictEqual(bal, 0, "parentheses must balance");
});

test("clean: still collapses genuinely doubled parentheses", () => {
  assert.strictEqual(
    P.clean("warm water ((about 100 degrees F))"),
    "warm water (about 100 degrees F)"
  );
});

test("clean: drops the stray leading comma in plugin-wrapped notes", () => {
  assert.strictEqual(P.clean("1 1/2 tbsp flour (, for dusting)"),
    "1 1/2 tbsp flour (for dusting)");
});
