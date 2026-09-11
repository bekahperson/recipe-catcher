"use strict";
/*
 * nutrition.js — rough per-serving nutrition for a recipe.
 *
 * Priority:
 *   1. If the page's schema.org data included NutritionInformation (per serving),
 *      use that — it's the site's own number.
 *   2. Otherwise ESTIMATE from the ingredient list using a compact food table:
 *      resolve each ingredient to grams (weight directly, volume via density,
 *      or count via a per-item weight), look up calories + macros per 100 g,
 *      sum, and divide by the parsed number of servings.
 *
 * Estimates are approximate by nature — the reader labels them as such and
 * reports how many ingredients it could account for. Depends on Units (loaded
 * first) for quantity parsing.
 */
const Nutrition = (function () {
  const U = typeof Units !== "undefined" ? Units : (typeof require !== "undefined" ? require("./units.js") : null);

  // Per 100 g: kcal, p(rotein), f(at), c(arbs). density = g per ml (for volume
  // measures). unit = grams per countable item (for "2 eggs" etc). Ordered
  // most-specific first; the first keyword that matches a line wins.
  const FOODS = [
    { keys: ["cream cheese"], kcal: 342, p: 6, f: 34, c: 4, density: 1.0 },
    { keys: ["brown sugar"], kcal: 380, p: 0, f: 0, c: 98, density: 0.93 },
    { keys: ["powdered sugar", "confectioner", "icing sugar"], kcal: 389, p: 0, f: 0, c: 100, density: 0.51 },
    { keys: ["maple syrup"], kcal: 260, p: 0, f: 0, c: 67, density: 1.32 },
    { keys: ["almond flour", "almond meal"], kcal: 571, p: 21, f: 50, c: 21, density: 0.4 },
    { keys: ["peanut butter"], kcal: 588, p: 25, f: 50, c: 20, density: 1.09 },
    { keys: ["buttermilk"], kcal: 40, p: 3.3, f: 0.9, c: 4.8, density: 1.03 },
    { keys: ["baking powder"], kcal: 0, p: 0, f: 0, c: 0, density: 0.9 },
    { keys: ["baking soda", "bicarbonate"], kcal: 0, p: 0, f: 0, c: 0, density: 2.2 },
    { keys: ["chocolate chip", "chocolate"], kcal: 480, p: 4.2, f: 30, c: 63, density: 0.72 },
    { keys: ["cocoa"], kcal: 228, p: 20, f: 14, c: 58, density: 0.42 },
    { keys: ["cornstarch", "corn starch"], kcal: 381, p: 0.3, f: 0, c: 91, density: 0.5 },
    { keys: ["broth", "stock"], kcal: 4, p: 0.5, f: 0.1, c: 0.4, density: 1.0 },
    { keys: ["walnut"], kcal: 654, p: 15, f: 65, c: 14, density: 0.5 },
    { keys: ["pecan"], kcal: 691, p: 9, f: 72, c: 14, density: 0.5 },
    { keys: ["almond"], kcal: 579, p: 21, f: 50, c: 22, density: 0.55 },
    { keys: ["coconut"], kcal: 660, p: 6, f: 65, c: 24, density: 0.35 },
    { keys: ["nutmeg", "cinnamon", "spice", "clove"], kcal: 247, p: 4, f: 3, c: 55, density: 0.45 },
    { keys: ["nut"], kcal: 607, p: 20, f: 54, c: 20, density: 0.52 }, // generic (hazelnut, cashew…)
    { keys: ["butter", "margarine"], kcal: 717, p: 0.9, f: 81, c: 0.1, density: 0.959 },
    { keys: ["olive oil", "vegetable oil", "canola", "oil"], kcal: 884, p: 0, f: 100, c: 0, density: 0.918 },
    { keys: ["heavy cream", "whipping cream"], kcal: 340, p: 2.8, f: 36, c: 2.8, density: 1.0 },
    { keys: ["sour cream"], kcal: 198, p: 2.4, f: 19, c: 4.6, density: 1.0 },
    { keys: ["yogurt", "yoghurt"], kcal: 59, p: 10, f: 0.4, c: 3.6, density: 1.03 },
    { keys: ["milk", "cream"], kcal: 61, p: 3.2, f: 3.3, c: 4.8, density: 1.03 },
    { keys: ["honey"], kcal: 304, p: 0.3, f: 0, c: 82, density: 1.42 },
    { keys: ["oat"], kcal: 389, p: 17, f: 7, c: 66, density: 0.38 },
    { keys: ["flour"], kcal: 364, p: 10, f: 1, c: 76, density: 0.528 },
    { keys: ["rice"], kcal: 365, p: 7, f: 0.6, c: 80, density: 0.78 },
    { keys: ["sugar", "granulated"], kcal: 387, p: 0, f: 0, c: 100, density: 0.845 },
    { keys: ["cheese"], kcal: 402, p: 25, f: 33, c: 1.3, density: 0.45 },
    { keys: ["egg"], kcal: 143, p: 12.6, f: 9.5, c: 0.7, density: 1.03, unit: 50 },
    { keys: ["banana"], kcal: 89, p: 1.1, f: 0.3, c: 23, density: 0.9, unit: 118 },
    { keys: ["apple"], kcal: 52, p: 0.3, f: 0.2, c: 14, density: 0.6, unit: 182 },
    { keys: ["onion"], kcal: 40, p: 1.1, f: 0.1, c: 9, density: 0.6, unit: 110 },
    { keys: ["garlic"], kcal: 149, p: 6, f: 0.5, c: 33, density: 0.6, unit: 3 },
    { keys: ["carrot"], kcal: 41, p: 0.9, f: 0.2, c: 10, density: 0.6, unit: 61 },
    { keys: ["potato"], kcal: 77, p: 2, f: 0.1, c: 17, density: 0.6, unit: 170 },
    { keys: ["tomato"], kcal: 18, p: 0.9, f: 0.2, c: 3.9, density: 0.6, unit: 123 },
    { keys: ["chicken"], kcal: 165, p: 31, f: 3.6, c: 0 },
    { keys: ["beef", "ground beef"], kcal: 250, p: 26, f: 18, c: 0 },
    { keys: ["vanilla"], kcal: 288, p: 0, f: 0, c: 13, density: 0.88 },
    { keys: ["yeast"], kcal: 325, p: 40, f: 8, c: 41, density: 0.6 },
    { keys: ["salt"], kcal: 0, p: 0, f: 0, c: 0, density: 1.2 },
    { keys: ["water"], kcal: 0, p: 0, f: 0, c: 0, density: 1.0 },
  ];

  // Ingredients that stay in ml when converted to metric (everything else with
  // a known density becomes grams — dry goods like flour/sugar are weighed).
  const LIQUID_KEYS = new Set([
    "water", "milk", "cream", "buttermilk", "heavy cream", "whipping cream",
    "broth", "stock", "olive oil", "vegetable oil", "canola", "oil",
    "maple syrup", "honey", "vanilla",
  ]);

  // Precompile a leading-word-boundary matcher per food (allows plurals like
  // "eggs" while avoiding false hits such as "oil" inside "boiling").
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  for (const food of FOODS) {
    food.re = new RegExp("(?:^|[^a-z0-9])(?:" + food.keys.map(esc).join("|") + ")", "i");
    food.liquid = food.keys.some((k) => LIQUID_KEYS.has(k));
  }

  function matchFood(line) {
    const lower = String(line || "").toLowerCase();
    for (const food of FOODS) if (food.re.test(lower)) return food;
    return null;
  }

  // Grams of a single ingredient line, or null if we can't tell.
  function gramsOf(parsed, food) {
    if (!parsed || !food) return null;
    if (parsed.hasMeasure && parsed.dim === "weight") return parsed.base; // base is grams
    if (parsed.hasMeasure && parsed.dim === "volume") {
      return food.density ? parsed.base * food.density : null; // base is ml
    }
    if (!parsed.hasMeasure && parsed.value != null && food.unit) return parsed.value * food.unit;
    return null;
  }

  // Pull a servings count out of a yield string ("Serves 4", "12 muffins",
  // "1 loaf (10 slices)"). Returns null if none found.
  function parseServings(yieldStr) {
    if (!yieldStr) return null;
    const s = String(yieldStr);
    const patterns = [
      /serves?\s+(\d+)/i,
      /(\d+)\s+servings?/i,
      /(\d+)\s*(?:slices?|pieces?|cookies?|muffins?|bars?|rolls?|pancakes?|cups?|people)/i,
      /\((\d+)\s+\w+\)/,
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (m) return parseInt(m[1], 10);
    }
    const any = s.match(/(\d+)/);
    return any ? parseInt(any[1], 10) : null;
  }

  function estimate(ingredients) {
    let kcal = 0, p = 0, f = 0, c = 0, matched = 0;
    const total = (ingredients || []).length;
    for (const line of ingredients || []) {
      const food = matchFood(line);
      if (!food) continue;
      const parsed = U.parseIngredient(line);
      const g = gramsOf(parsed, food);
      if (g == null) continue;
      matched++;
      kcal += (g / 100) * food.kcal;
      p += (g / 100) * food.p;
      f += (g / 100) * food.f;
      c += (g / 100) * food.c;
    }
    return { kcal, p, f, c, matched, total };
  }

  function parseNum(v) {
    if (v == null) return null;
    const m = String(v).match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  // Decide the best available nutrition and return a display-ready object.
  function compute(recipe) {
    const servings = parseServings(recipe && recipe.yield) || 1;

    const site = recipe && recipe.nutrition;
    if (site && parseNum(site.calories) != null) {
      return {
        source: "site",
        servings,
        perServing: {
          calories: parseNum(site.calories),
          protein: parseNum(site.protein),
          fat: parseNum(site.fat),
          carbs: parseNum(site.carbs),
        },
      };
    }

    const est = estimate((recipe && recipe.ingredients) || []);
    if (!est.matched) {
      return { source: "none", servings, perServing: null, matched: 0, total: est.total };
    }
    return {
      source: "estimated",
      servings,
      matched: est.matched,
      total: est.total,
      perServing: {
        calories: est.kcal / servings,
        protein: est.p / servings,
        fat: est.f / servings,
        carbs: est.c / servings,
      },
    };
  }

  return { compute, estimate, matchFood, parseServings, _FOODS: FOODS };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Nutrition;
else if (typeof globalThis !== "undefined") globalThis.Nutrition = Nutrition;
