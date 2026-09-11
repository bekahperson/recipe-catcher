"use strict";
/*
 * parser.js — Recipe Catcher extraction engine.
 *
 * Strategy (best signal first):
 *   1. JSON-LD schema.org/Recipe  — the reason ads/overlays don't matter: the
 *      recipe is embedded as structured data in the DOM regardless of what is
 *      visually covering it or gating it.
 *   2. Microdata (itemtype*="Recipe").
 *   3. Heuristic DOM scan for "Ingredients"/"Instructions" sections.
 *
 * The JSON-LD/microdata normalizers are pure (take plain JS objects) so they
 * are unit-tested in Node. The DOM functions run only in the browser.
 */
const RecipeParser = (function () {
  // ---- text helpers -----------------------------------------------------
  function decodeEntities(str) {
    if (!str) return "";
    // In the browser, let the DOM decode entities. In Node, handle the common few.
    if (typeof document !== "undefined") {
      const el = document.createElement("textarea");
      el.innerHTML = str;
      return el.value;
    }
    return String(str)
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  }
  function stripHtml(str) {
    if (str == null) return "";
    return decodeEntities(String(str).replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }
  function clean(str) {
    // Collapse doubled parentheses that recipe plugins emit, e.g.
    // "warm water ((about 100 degrees F))" -> "warm water (about 100 degrees F)".
    //
    // Only collapse when BOTH parens wrap the same content. Matching "((" and
    // "))" independently also ate the outer paren of a legitimately nested
    // note: WordPress Recipe Maker (RecipeTin Eats et al) emits
    //   "flour (, bread or plain/all purpose (Note 1))"
    // which became "...(Note 1)" — one "(" too many, so the rest of the line
    // read as if it were still inside the note.
    return stripHtml(str)
      .replace(/\(\s*\(([^()]*)\)\s*\)/g, "($1)")
      // Those same plugins wrap a note that already begins with its separator,
      // giving "flour (, bread or …)". Drop the stray leading comma.
      .replace(/\(\s*,\s*/g, "(")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  function firstString(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return firstString(v[0]);
    if (typeof v === "object") return v.name || v.text || v.url || "";
    return String(v);
  }
  function typeMatches(node, wanted) {
    if (!node || typeof node !== "object") return false;
    let t = node["@type"];
    if (!t) return false;
    if (!Array.isArray(t)) t = [t];
    return t.some((x) => String(x).toLowerCase() === wanted.toLowerCase());
  }

  // ---- JSON-LD ----------------------------------------------------------
  // Walk any JSON-LD payload (object, array, or {@graph:[...]}) and return the
  // first node whose @type includes "Recipe".
  function findRecipeNode(data) {
    const seen = new Set();
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) { for (const x of node) stack.push(x); continue; }
      if (typeMatches(node, "Recipe")) return node;
      if (Array.isArray(node["@graph"])) for (const x of node["@graph"]) stack.push(x);
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === "object") stack.push(v);
      }
    }
    return null;
  }

  function normInstructions(ri) {
    const out = [];
    function pushText(t) {
      const s = clean(t);
      if (s) out.push(s);
    }
    function walk(item) {
      if (item == null) return;
      if (typeof item === "string") {
        // A single string may contain multiple sentences/newlines.
        item.split(/\r?\n+/).forEach((line) => {
          const s = clean(line);
          if (s) out.push(s);
        });
        return;
      }
      if (Array.isArray(item)) { item.forEach(walk); return; }
      if (typeof item === "object") {
        if (typeMatches(item, "HowToSection") || Array.isArray(item.itemListElement)) {
          walk(item.itemListElement);
          return;
        }
        if (item.text) { pushText(item.text); return; }
        if (item.name) { pushText(item.name); return; }
      }
    }
    walk(ri);
    return out;
  }

  function normYield(y) {
    if (y == null) return "";
    if (Array.isArray(y)) y = y.find((x) => typeof x === "string") || y[0];
    return clean(String(y));
  }

  // ISO-8601 duration ("PT1H30M") -> "1 hr 30 min".
  function normDuration(d) {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
    if (!m) return "";
    const [, days, hrs, mins] = m;
    const parts = [];
    if (days) parts.push(`${days} day${days === "1" ? "" : "s"}`);
    if (hrs) parts.push(`${hrs} hr`);
    if (mins) parts.push(`${mins} min`);
    return parts.join(" ");
  }

  // schema.org NutritionInformation -> {calories, protein, fat, carbs, ...}.
  // Values are strings like "240 calories" / "3 g"; kept as raw strings here
  // and parsed to numbers by nutrition.js. Returns null if nothing usable.
  function normNutrition(n) {
    if (!n || typeof n !== "object") return null;
    const out = {
      calories: n.calories != null ? String(n.calories) : null,
      protein: n.proteinContent != null ? String(n.proteinContent) : null,
      fat: n.fatContent != null ? String(n.fatContent) : null,
      carbs: n.carbohydrateContent != null ? String(n.carbohydrateContent) : null,
      sugar: n.sugarContent != null ? String(n.sugarContent) : null,
      fiber: n.fiberContent != null ? String(n.fiberContent) : null,
      servingSize: n.servingSize != null ? String(n.servingSize) : "",
    };
    return (out.calories || out.protein || out.fat || out.carbs) ? out : null;
  }

  // Pure: normalize a schema.org Recipe node into Recipe Catcher's shape.
  function normalizeRecipe(node, sourceUrl) {
    if (!node || typeof node !== "object") return null;
    const ingredients = []
      .concat(node.recipeIngredient || node.ingredients || [])
      .map(clean)
      .filter(Boolean);
    const steps = normInstructions(node.recipeInstructions);
    if (!ingredients.length && !steps.length) return null;

    let image = node.image;
    if (Array.isArray(image)) image = image[0];
    if (image && typeof image === "object") image = image.url;

    const recipe = {
      title: clean(firstString(node.name)) || "Recipe",
      author: clean(firstString(node.author)),
      image: typeof image === "string" ? image : "",
      yield: normYield(node.recipeYield),
      times: {
        prep: normDuration(node.prepTime),
        cook: normDuration(node.cookTime),
        total: normDuration(node.totalTime),
      },
      ingredients,
      steps,
      nutrition: normNutrition(node.nutrition),
      source: sourceUrl || "",
      extractedBy: "json-ld",
    };
    return recipe;
  }

  // Build a map of every {"@id": ...} node so references (e.g. author by @id
  // into @graph, as WordPress/NYT emit) can be resolved to the real object.
  function buildIdMap(data) {
    const map = {};
    const seen = new Set();
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== "object" || seen.has(n)) continue;
      seen.add(n);
      if (Array.isArray(n)) { for (const x of n) stack.push(x); continue; }
      if (typeof n["@id"] === "string") map[n["@id"]] = n;
      if (Array.isArray(n["@graph"])) for (const x of n["@graph"]) stack.push(x);
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (v && typeof v === "object") stack.push(v);
      }
    }
    return map;
  }
  // If v is a bare reference {"@id": "..."}, swap in the referenced node.
  function resolveRef(v, map) {
    if (v && typeof v === "object" && !Array.isArray(v) &&
        typeof v["@id"] === "string" && Object.keys(v).length === 1) {
      return map[v["@id"]] || v;
    }
    return v;
  }

  // ---- DOM entry points (browser only) ---------------------------------
  function fromJsonLd(doc, url) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const sc of scripts) {
      let data;
      try {
        data = JSON.parse(sc.textContent.trim());
      } catch (e) {
        // Some sites emit multiple concatenated JSON objects or trailing junk.
        try { data = JSON.parse(sc.textContent.replace(/^[^[{]*/, "").trim()); }
        catch (e2) { continue; }
      }
      const node = findRecipeNode(data);
      if (node) {
        const idMap = buildIdMap(data);
        if (node.author) node.author = resolveRef(node.author, idMap);
        const r = normalizeRecipe(node, url);
        if (r) return r;
      }
    }
    return null;
  }

  function fromMicrodata(doc, url) {
    const scope = doc.querySelector('[itemtype*="Recipe" i]');
    if (!scope) return null;
    const prop = (name) =>
      Array.from(scope.querySelectorAll(`[itemprop="${name}"]`));
    const textOf = (el) =>
      clean(el.getAttribute("content") || el.textContent || "");

    const ingredients = prop("recipeIngredient")
      .concat(prop("ingredients"))
      .map(textOf)
      .filter(Boolean);
    const steps = prop("recipeInstructions").map(textOf).filter(Boolean);
    if (!ingredients.length && !steps.length) return null;

    const nameEl = scope.querySelector('[itemprop="name"]');
    return {
      title: nameEl ? textOf(nameEl) : clean(doc.title),
      author: "",
      image: (scope.querySelector('[itemprop="image"]') || {}).src || "",
      yield: (prop("recipeYield")[0] && textOf(prop("recipeYield")[0])) || "",
      times: { prep: "", cook: "", total: "" },
      ingredients,
      steps,
      nutrition: null,
      source: url,
      extractedBy: "microdata",
    };
  }

  // Last resort: find an "Ingredients" heading and read the list after it,
  // same for "Instructions"/"Directions"/"Method".
  function fromHeuristics(doc, url) {
    function sectionAfter(re) {
      const heads = Array.from(
        doc.querySelectorAll("h1,h2,h3,h4,h5,h6,strong,b,legend")
      ).filter((h) => re.test((h.textContent || "").trim()));
      for (const h of heads) {
        let node = h.parentElement;
        for (let hops = 0; hops < 4 && node; hops++) {
          const list = node.querySelector("ul,ol");
          if (list) {
            const items = Array.from(list.querySelectorAll("li"))
              .map((li) => clean(li.textContent))
              .filter(Boolean);
            if (items.length) return items;
          }
          node = node.nextElementSibling || node.parentElement;
        }
      }
      return [];
    }
    const ingredients = sectionAfter(/^\s*ingredients\s*$/i);
    const steps = sectionAfter(/^\s*(instructions|directions|method|steps|preparation)\s*$/i);
    if (!ingredients.length && !steps.length) return null;
    return {
      title: clean(doc.title).replace(/\s*[-|–].*$/, "") || "Recipe",
      author: "",
      image: "",
      yield: "",
      times: { prep: "", cook: "", total: "" },
      ingredients,
      steps,
      nutrition: null,
      source: url,
      extractedBy: "heuristic",
    };
  }

  // Fast, high-precision check: does this page carry structured recipe data?
  // Used to decide whether to show the auto "Catch recipe" prompt (we only
  // prompt when we're confident, i.e. JSON-LD or microdata — not the heuristic).
  function hasStructuredRecipe(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const sc of scripts) {
      let data;
      try { data = JSON.parse(sc.textContent.trim()); }
      catch (e) {
        try { data = JSON.parse(sc.textContent.replace(/^[^[{]*/, "").trim()); }
        catch (e2) { continue; }
      }
      if (findRecipeNode(data)) return true;
    }
    return !!doc.querySelector('[itemtype*="Recipe" i]');
  }

  // Public browser entry point.
  function extractFromDocument(doc, url) {
    return (
      fromJsonLd(doc, url) ||
      fromMicrodata(doc, url) ||
      fromHeuristics(doc, url) ||
      null
    );
  }

  return {
    // pure (tested in Node)
    findRecipeNode,
    normalizeRecipe,
    normInstructions,
    normDuration,
    normNutrition,
    stripHtml,
    clean,
    // DOM
    hasStructuredRecipe,
    extractFromDocument,
    fromJsonLd,
    fromMicrodata,
    fromHeuristics,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = RecipeParser;
else if (typeof globalThis !== "undefined") globalThis.RecipeParser = RecipeParser;
