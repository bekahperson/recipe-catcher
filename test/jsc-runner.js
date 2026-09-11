// Lightweight test runner for JavaScriptCore (jsc), since `node` may be absent.
// Mirrors the node:test suites. Usage:
//   jsc -e 'var DIR="/abs/path/recipe-catcher";' test/jsc-runner.js
// DIR must be defined by the caller (the run-tests.sh script does this).
load(DIR + "/extension/units.js");
load(DIR + "/extension/parser.js");
load(DIR + "/extension/nutrition.js");
var U = globalThis.Units, P = globalThis.RecipeParser, N = globalThis.Nutrition;

var passed = 0, failed = 0, failures = [];
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; failures.push(name); }
}
function eq(a, b, name) { ok(a === b, name + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function near(a, b, name) { ok(Math.abs(a - b) < 0.5, name + "  (got " + a + ", want ~" + b + ")"); }
function deep(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "  (got " + JSON.stringify(a) + ")"); }
function match(str, re, name) { ok(re.test(str), name + "  (got " + JSON.stringify(str) + ")"); }

// ---- units: duplicate amount stated in both systems ----
// "1 1/2 cups (375 ml) water" rendered the amount twice: "1 1/2 cups (1 5/8
// cups)" in imperial, and two disagreeing values "350 ml (375 ml)" in metric.
(function () {
  var DUP = "1 1/2 cups (375 ml) very warm tap water (Note 4)";
  eq(U.formatIngredient(U.parseIngredient(DUP), "imperial", 1),
     "1 1/2 cups very warm tap water (Note 4)", "drops restated amount (imperial)");
  eq(U.formatIngredient(U.parseIngredient(DUP), "metric", 1),
     "375 ml very warm tap water (Note 4)", "prefers author's exact metric number");
  eq(U.formatIngredient(U.parseIngredient(DUP), "metric", 2),
     "750 ml very warm tap water (Note 4)", "author's number scales");
  var other = "1 1/2 cups water (plus 2 tbsp for thinning)";
  eq(U.formatIngredient(U.parseIngredient(other), "imperial", 1), other,
     "keeps a note amount that is not a restatement");
  match(U.formatIngredient(U.parseIngredient(other), "metric", 1), /30 ml for thinning/,
     "still converts a genuinely different note amount");
})();

// ---- parser: clean() paren handling ----
// Regression: "((" / "))" were matched independently, eating the outer paren of
// a nested note ("flour (, bread or plain/all purpose (Note 1))").
(function () {
  var out = P.clean("3 cups (450g) flour (, bread or plain/all purpose (Note 1))");
  eq(out, "3 cups (450g) flour (bread or plain/all purpose (Note 1))", "clean keeps nested note parens");
  var bal = 0;
  for (var i = 0; i < out.length; i++) {
    if (out[i] === "(") bal++; else if (out[i] === ")") bal--;
  }
  eq(bal, 0, "clean leaves parentheses balanced");
  eq(P.clean("warm water ((about 100 degrees F))"), "warm water (about 100 degrees F)",
     "clean still collapses doubled parens");
  eq(P.clean("1 1/2 tbsp flour (, for dusting)"), "1 1/2 tbsp flour (for dusting)",
     "clean drops stray leading comma in notes");
})();

// ---- units ----
eq(U.parseQuantity("1 1/2").value, 1.5, "parseQuantity mixed");
eq(U.parseQuantity("½").value, 0.5, "parseQuantity unicode");
eq(U.parseQuantity("1½").value, 1.5, "parseQuantity attached unicode");
eq(U.parseQuantity("1 to 2").high, 2, "parseQuantity range high");
// run-together range "2-21/2" is repaired to 2–2.5 and flagged
var meat = U.parseIngredient("2-21/2 pounds beef stew meat");
ok(meat.suspect, "malformed amount flagged as suspect");
eq(meat.suspectNote, "2-21/2", "suspect note keeps the original text");
eq(meat.hasMeasure, true, "repaired into a real measurement");
near(meat.value, 2, "repaired range low = 2");
near(meat.high, 2.5, "repaired range high = 2.5");
eq(U.formatIngredient(meat, "imperial", 1), "2 lbs–2.5 lbs beef stew meat", "renders repaired range (weight in decimals)");
eq(U.parseIngredient("2 eggs").suspect, false, "normal amount is not flagged");
// range endpoints can be fractions/mixed numbers now
var br = U.parseIngredient("1 to 2 1/2 cups broth");
near(br.value, 1, "fractional range low");
near(br.high, 2.5, "fractional range high");
near(U.parseIngredient("1 1/2 cups all-purpose flour").base, 354.882, "ingredient volume base");
eq(U.parseIngredient("1 1/2 cups all-purpose flour").rest, "all-purpose flour", "ingredient rest");
near(U.parseIngredient("8 oz cream cheese").base, 226.796, "ingredient weight base");
eq(U.parseIngredient("2 large eggs").hasMeasure, false, "count not convertible");
eq(U.formatIngredient(U.parseIngredient("Salt, to taste"), "metric"), "Salt, to taste", "passthrough");
eq(U.formatIngredient(U.parseIngredient("1 1/2 cups milk"), "metric"), "350 ml milk", "cups->ml");
eq(U.formatIngredient(U.parseIngredient("2 cups sugar"), "metric"), "470 ml sugar", "2cups->ml");
eq(U.formatIngredient(U.parseIngredient("2 cups sugar"), "imperial"), "2 cups sugar", "round-trip imperial");
match(U.formatIngredient(U.parseIngredient("240 ml water"), "imperial"), /cup.*water$/, "ml->cup");
match(U.formatIngredient(U.parseIngredient("500 g beef"), "imperial"), /(lb|oz).*beef$/, "g->lb/oz");
match(U.formatIngredient(U.parseIngredient("1 to 2 cups broth"), "metric"), /ml.*–.*ml.*broth$/, "range convert");
eq(U.convertTemperatures("Bake at 350°F for 25 minutes."), "Bake at 350°F (177°C) for 25 minutes.", "annotate F with C");
eq(U.convertTemperatures("Preheat oven to 425 degrees F."), "Preheat oven to 425 degrees F (218°C).", "annotate degrees F");
eq(U.convertTemperatures("Roast at 200°C."), "Roast at 200°C (392°F).", "annotate C with F");
eq(U.convertTemperatures("Stir the batter."), "Stir the batter.", "no temperature untouched");
eq(U.convertTemperatures("preheat the oven to 270ºF."), "preheat the oven to 270ºF (132°C).", "ordinal-indicator degree (º) still converts");
eq(U.convertTemperatures("bake at 240℉ until set"), "bake at 240℉ (116°C) until set", "℉ fahrenheit symbol converts");
eq(U.convertTemperatures("rotate the pan 180° after 8 minutes"), "rotate the pan 180° after 8 minutes", "bare degree (rotation) is not a temperature");
// metric dry goods -> grams; liquids stay ml
var resolver = function (t) { return N.matchFood(t); };
ok(N.matchFood("1 cup olive oil").liquid, "oil marked liquid");
ok(!N.matchFood("2 cups flour").liquid, "flour not liquid");
eq(U.formatIngredient(U.parseIngredient("1 1/2 cups all-purpose flour"), "metric", 1, resolver), "185 g all-purpose flour", "dry volume -> grams");
eq(U.formatIngredient(U.parseIngredient("1 1/2 cups water"), "metric", 1, resolver), "350 ml water", "liquid volume stays ml");
eq(U.formatIngredient(U.parseIngredient("2 cups sugar"), "metric", 1, resolver), "400 g sugar", "sugar -> grams");
// imperial weight uses decimals (only cups/tbsp/tsp are fractionalized)
eq(U.formatIngredient(U.parseIngredient("168 g flour"), "imperial", 1, resolver), "5.9 oz flour", "weight -> 1-decimal oz, not fraction");
eq(U.formatIngredient(U.parseIngredient("500 g beef"), "imperial", 1, resolver), "1.1 lbs beef", "weight -> decimal lbs");
// a recipe that lists BOTH a volume and an explicit weight
eq(U.formatIngredient(U.parseIngredient("1 1/2 cups blanched almond flour (168 g)"), "metric", 1, resolver),
  "168 g blanched almond flour", "metric uses the stated weight, no duplicate note");
eq(U.formatIngredient(U.parseIngredient("1/2 cup granulated sugar (100 g)"), "metric", 1, resolver),
  "100 g granulated sugar", "no redundant (100 g)");
eq(U.formatIngredient(U.parseIngredient("1/2 cup granulated sugar (100 g)"), "imperial", 1, resolver),
  "1/2 cup granulated sugar (3.5 oz)", "imperial keeps cups + decimal-oz weight");
// amounts embedded in notes / instructions convert with the toggle
eq(U.formatIngredient(U.parseIngredient("1 packet yeast (active dry, instant, or quick rise- 2.25 teaspoons)"), "imperial", 1, resolver),
  "1 packet yeast (active dry, instant, or quick rise- 2 1/4 teaspoons)", "note decimal -> fraction");
eq(U.formatIngredient(U.parseIngredient("1 packet yeast (active dry, instant, or quick rise- 2.25 teaspoons)"), "metric", 1, resolver),
  "1 packet yeast (active dry, instant, or quick rise- 7 g)", "yeast note is a solid -> grams");
eq(U.convertText("Add the 3 1/4 cups all-purpose flour to the bowl", "metric", 1, resolver), "Add the 405 g all-purpose flour to the bowl", "instruction dry -> grams");
eq(U.convertText("mix in the 1 1/2 cups warm water", "metric", 1, resolver), "mix in the 350 ml warm water", "instruction liquid -> ml");
eq(U.convertText("or 2.25 teaspoons", "imperial", 1), "or 2 1/4 teaspoons", "instruction decimal -> fraction");
eq(U.convertText("add 2 cups flour", "imperial", 2, resolver), "add 4 cups flour", "instruction scales");
eq(U.convertText("let rise for 2-3 hours", "metric", 1), "let rise for 2-3 hours", "non-measurement untouched");
eq(U.convertText("preheat to 450 degrees F", "metric", 1), "preheat to 450 degrees F", "temperature left for annotator");
eq(U.convertText("mix the 1 1/2 cups warm water, 1 packet yeast, and 1 ½ teaspoons fine grain salt", "metric", 1, resolver),
  "mix the 350 ml warm water, 1 packet yeast, and 9 g fine grain salt", "each amount uses its own immediate food");
eq(U.detectSystem(["200 g flour", "250 ml milk", "2 eggs"]), "metric", "detect metric");
eq(U.detectSystem(["1 cup flour", "2 tbsp butter", "1 lb beef"]), "imperial", "detect imperial");

// same-system passthrough keeps the author's exact wording
eq(U.formatIngredient(U.parseIngredient("1/2 cup butter, softened"), "imperial"), "1/2 cup butter, softened", "imperial passthrough");
eq(U.formatIngredient(U.parseIngredient("200 g flour"), "metric"), "200 g flour", "metric passthrough");
// metric -> imperial produces reduced fractions + correct plurals
eq(U.formatIngredient(U.parseIngredient("355 ml milk"), "imperial"), "1 1/2 cups milk", "reduced fraction + plural");
eq(U.formatIngredient(U.parseIngredient("1/4 teaspoon salt"), "metric"), "1 ml salt", "tiny volume not rounded to 0");
// batch scaling
eq(U.formatCount(1.5), "1 1/2", "formatCount fraction");
eq(U.formatCount(4), "4", "formatCount integer");
eq(U.formatIngredient(U.parseIngredient("1 1/2 cups flour"), "imperial", 2), "3 cups flour", "scale x2 measured");
eq(U.formatIngredient(U.parseIngredient("1/4 teaspoon salt"), "imperial", 2), "1/2 tsp salt", "scale x2 tsp");
eq(U.formatIngredient(U.parseIngredient("2 large eggs"), "metric", 2), "4 large eggs", "scale x2 count");
eq(U.formatIngredient(U.parseIngredient("3 ripe bananas, mashed"), "imperial", 0.5), "1 1/2 ripe bananas, mashed", "scale half count");
eq(U.formatIngredient(U.parseIngredient("2 large eggs"), "metric", 1), "2 large eggs", "scale x1 keeps wording");
eq(U.formatIngredient(U.parseIngredient("1 1/2 cups flour"), "metric", 2), "710 ml flour", "scale x2 then metric");
eq(U.formatIngredient(U.parseIngredient("1/2 cup butter"), "imperial", 1.5), "3/4 cup butter", "scaled sub-cup stays in cups");

// ---- parser ----
var g = { "@context": "https://schema.org", "@graph": [
  { "@type": "WebPage", name: "page" },
  { "@type": ["Recipe", "NewsArticle"], name: "Cookies", recipeIngredient: ["a"] } ] };
eq(P.findRecipeNode(g).name, "Cookies", "findRecipeNode @graph + type array");
eq(P.findRecipeNode([{ "@type": "Organization" }, { "@type": "Recipe", name: "Soup" }]).name, "Soup", "findRecipeNode array");
deep(P.normInstructions("Mix the batter.\nBake for 20 min.\n"), ["Mix the batter.", "Bake for 20 min."], "instructions string");
deep(P.normInstructions([{ "@type": "HowToStep", text: "Whisk eggs." }, { "@type": "HowToStep", text: "Fold in flour." }]), ["Whisk eggs.", "Fold in flour."], "instructions HowToStep");
deep(P.normInstructions([{ "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Combine." }, { "@type": "HowToStep", text: "Knead." }] }]), ["Combine.", "Knead."], "instructions HowToSection");
deep(P.normInstructions([{ "@type": "HowToStep", text: "Add <b>salt</b> &amp; pepper." }]), ["Add salt & pepper."], "instructions strip html");
eq(P.normDuration("PT1H30M"), "1 hr 30 min", "duration H+M");
eq(P.normDuration("PT25M"), "25 min", "duration M");
eq(P.normDuration("PT2H"), "2 hr", "duration H");
var full = P.normalizeRecipe({ "@type": "Recipe", name: "Best Pancakes", author: { "@type": "Person", name: "Sam" },
  image: ["https://x/img.jpg"], recipeYield: "12 pancakes", prepTime: "PT10M", cookTime: "PT15M",
  recipeIngredient: ["1 1/2 cups flour", "1 tbsp sugar", "2 eggs"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Mix dry." }, { "@type": "HowToStep", text: "Add wet, cook at 375°F." }] },
  "https://example.com/pancakes");
eq(full.title, "Best Pancakes", "normalize title");
eq(full.author, "Sam", "normalize author");
eq(full.image, "https://x/img.jpg", "normalize image");
eq(full.times.prep, "10 min", "normalize prep");
eq(full.steps.length, 2, "normalize steps count");
eq(full.extractedBy, "json-ld", "normalize source tag");
eq(P.normalizeRecipe({ "@type": "Recipe", name: "x" }, ""), null, "normalize empty -> null");
// doubled parentheses from recipe plugins are collapsed
deep(P.normalizeRecipe({ "@type": "Recipe", recipeIngredient: ["1 cup water ((about 100 degrees F))"], recipeInstructions: "Mix." }, "").ingredients,
  ["1 cup water (about 100 degrees F)"], "collapse doubled parens");
deep(P.normalizeRecipe({ "@type": "Recipe", recipeIngredient: ["a"], recipeInstructions: "Do this. Then that." }, "").steps, ["Do this. Then that."], "normalize string instructions");

// ---- nutrition ----
eq(N.parseServings("1 loaf (10 slices)"), 10, "servings from parenthetical slices");
eq(N.parseServings("Serves 4"), 4, "servings from 'Serves N'");
eq(N.parseServings("12 pancakes"), 12, "servings from 'N pancakes'");
eq(N.parseServings("makes a bunch"), null, "servings none -> null");
eq(N.matchFood("3/4 cup brown sugar").keys[0], "brown sugar", "match brown sugar (specific first)");
ok(N.matchFood("2 large eggs").keys.indexOf("egg") >= 0, "match eggs");
eq(N.matchFood("1 cup boiling water").keys[0], "water", "'boiling' does not match 'oil'");
eq(N.matchFood("a pinch of nothing special"), null, "no food -> null");
var BREAD = ["1 1/2 cups all-purpose flour","1 teaspoon baking soda","1/4 teaspoon salt",
  "1/2 cup butter, softened","3/4 cup brown sugar","2 large eggs","3 ripe bananas, mashed",
  "1 to 2 tablespoons milk","8 oz chopped walnuts"];
var est = N.estimate(BREAD);
eq(est.matched, 9, "all 9 ingredients matched");
ok(est.kcal > 3000 && est.kcal < 5500, "total kcal in plausible range (" + Math.round(est.kcal) + ")");
var info = N.compute({ yield: "1 loaf (10 slices)", ingredients: BREAD, nutrition: null });
eq(info.source, "estimated", "compute uses estimate when no site data");
eq(info.servings, 10, "compute servings");
ok(info.perServing.calories > 300 && info.perServing.calories < 520, "per-serving cal plausible (" + Math.round(info.perServing.calories) + ")");
ok(info.perServing.protein > 0 && info.perServing.fat > 0 && info.perServing.carbs > 0, "macros populated");
var siteInfo = N.compute({ yield: "Serves 2", ingredients: [],
  nutrition: { calories: "240 calories", protein: "5 g", fat: "10 g", carbs: "30 g" } });
eq(siteInfo.source, "site", "compute prefers site nutrition");
eq(siteInfo.perServing.calories, 240, "site calories parsed");

// parser nutrition normalization
var nn = P.normNutrition({ calories: "240 calories", proteinContent: "5 g", fatContent: "10 g", carbohydrateContent: "30 g" });
ok(nn && nn.calories === "240 calories" && nn.protein === "5 g", "normNutrition keeps raw strings");
eq(P.normNutrition({}), null, "normNutrition empty -> null");

print("\n" + passed + " passed, " + failed + " failed");
if (failed) { print("FAILURES:"); failures.forEach(function (f) { print("  ✗ " + f); }); throw new Error(failed + " test(s) failed"); }
print("ALL GREEN");
