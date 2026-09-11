"use strict";
/*
 * units.js — Recipe Catcher unit engine.
 *
 * Pure, dependency-free. Runs in three contexts:
 *   - Safari content script (shared global scope with parser.js/content.js)
 *   - the reader page (loaded via <script src>)
 *   - Node test runner (via the module.exports tail at the bottom)
 *
 * Design: parse a quantity + unit ONCE into a canonical measurement
 * ({dimension, base}) where base is ml (volume), g (weight), or °C (temp).
 * Render into whichever system the user picks. Because we always render from
 * the canonical base, toggling metric<->imperial is lossless and reversible —
 * we never convert an already-converted display value.
 */
const Units = (function () {
  // ---- Unicode + ascii fraction handling -------------------------------
  const UNICODE_FRACTIONS = {
    "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875, "⅐": 1 / 7, "⅑": 1 / 9, "⅒": 0.1,
  };

  // ---- Unit tables ------------------------------------------------------
  // Every alias maps to {dim, toBase} where toBase converts 1 unit -> base.
  // Volume base = ml, weight base = g.
  const UNITS = {};
  function reg(dim, toBase, aliases) {
    for (const a of aliases) UNITS[a] = { dim, toBase };
  }
  // Volume (base: ml)
  // Note: single-letter t/T (tsp vs Tbsp) is case-sensitive by convention, but
  // matching is case-insensitive here, so those ambiguous aliases are omitted.
  reg("volume", 4.92892, ["tsp", "teaspoon", "teaspoons"]);
  reg("volume", 14.7868, ["tbsp", "tablespoon", "tablespoons", "tbs", "tbl"]);
  reg("volume", 236.588, ["cup", "cups", "c"]);
  reg("volume", 29.5735, ["floz", "fl oz", "fluid ounce", "fluid ounces", "fl. oz.", "fl.oz."]);
  reg("volume", 473.176, ["pint", "pints", "pt"]);
  reg("volume", 946.353, ["quart", "quarts", "qt"]);
  reg("volume", 3785.41, ["gallon", "gallons", "gal"]);
  reg("volume", 1, ["ml", "milliliter", "milliliters", "millilitre", "millilitres", "cc"]);
  reg("volume", 1000, ["l", "liter", "liters", "litre", "litres"]);
  // Weight (base: g)
  reg("weight", 28.3495, ["oz", "ounce", "ounces"]);
  reg("weight", 453.592, ["lb", "lbs", "pound", "pounds", "#"]);
  reg("weight", 1, ["g", "gram", "grams", "gm", "gramme", "grammes"]);
  reg("weight", 1000, ["kg", "kilogram", "kilograms", "kilo", "kilos"]);
  reg("weight", 0.001, ["mg", "milligram", "milligrams"]);

  // Longest-alias-first so "fl oz" wins over "oz", "tablespoon" over "t", etc.
  const UNIT_ALIASES = Object.keys(UNITS).sort((a, b) => b.length - a.length);

  // Which aliases are metric (used to tag each ingredient's native system, so
  // we only convert when the user actually toggles to the *other* system).
  const METRIC_ALIASES = new Set([
    "ml", "milliliter", "milliliters", "millilitre", "millilitres", "cc",
    "l", "liter", "liters", "litre", "litres",
    "g", "gram", "grams", "gm", "gramme", "grammes",
    "kg", "kilogram", "kilograms", "kilo", "kilos",
    "mg", "milligram", "milligrams",
  ]);

  // ---- Quantity parsing -------------------------------------------------
  // Returns a number, or null if the token isn't a quantity.
  // Handles: "1", "1.5", "1/2", "1 1/2", "½", "1½", ranges "1-2" / "1 to 2".
  function parseQuantity(str) {
    if (str == null) return null;
    let s = String(str).trim();
    if (!s) return null;

    // Ranges: take the low end for conversion, keep it simple & predictable.
    const rangeMatch = s.match(/^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i);
    if (rangeMatch) {
      const lo = parseQuantity(rangeMatch[1]);
      const hi = parseQuantity(rangeMatch[2]);
      if (lo && hi) return { value: lo.value, high: hi.value };
      if (lo) return { value: lo.value };
    }

    let total = 0;
    let matchedAny = false;

    // Leading unicode fractions possibly attached to a whole number ("1½").
    const uniMatch = s.match(/^(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⅐⅑⅒])/u);
    if (uniMatch) {
      if (uniMatch[1]) total += parseInt(uniMatch[1], 10);
      total += UNICODE_FRACTIONS[uniMatch[2]];
      return { value: total };
    }

    // "1 1/2" (whole + ascii fraction) or "1/2" or "1.5" or "1"
    const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    if (mixed) {
      total = parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
      return { value: total };
    }
    const frac = s.match(/^(\d+)\s*\/\s*(\d+)/);
    if (frac) return { value: parseInt(frac[1], 10) / parseInt(frac[2], 10) };
    const dec = s.match(/^(\d+(?:\.\d+)?)/);
    if (dec) return { value: parseFloat(dec[1]) };

    return null;
  }

  // ---- Ingredient line parsing -----------------------------------------
  // Splits "1 1/2 cups flour" -> {qty, unitToken, rest}. Leaves the food name
  // (rest) untouched. Returns a measurement or a raw passthrough.
  const FRAC_CLASS = "½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⅐⅑⅒";
  const QTY_ATOM =
    "(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d+(?:\\.\\d+)?\\s*[" +
    FRAC_CLASS + "]|\\d+(?:\\.\\d+)?|[" + FRAC_CLASS + "])";
  const QTY_LEAD = new RegExp("^\\s*(" + QTY_ATOM + ")\\s*", "u");
  // Range endpoints can themselves be fractions/mixed numbers ("1 to 2 1/2").
  const RANGE_LEAD = new RegExp(
    "^\\s*(" + QTY_ATOM + ")\\s*(?:-|–|—|to)\\s*(" + QTY_ATOM + ")\\s*", "iu");

  // "2-21/2" (a missing space) really means "2-2 1/2". Detect it (to flag the
  // ingredient) and repair it so it parses as a 2–2½ range, not 2–21.
  const RUN_TOGETHER_RE = /(\d+\s*[-–—]\s*)(\d+)(\d)\s*\/\s*(\d+)/;
  function fixRunTogether(text) {
    return text.replace(new RegExp(RUN_TOGETHER_RE.source, "g"),
      (m, pre, whole, num, den) => `${pre}${whole} ${num}/${den}`);
  }

  function findUnit(afterQty) {
    const lower = afterQty.toLowerCase();
    for (const alias of UNIT_ALIASES) {
      // Word-ish boundary: alias followed by end, space, period, or ')'
      if (lower.startsWith(alias)) {
        const nextChar = afterQty.charAt(alias.length);
        if (nextChar === "" || /[\s.,)\-]/.test(nextChar) || alias === "#") {
          return { alias, len: alias.length + (nextChar === "." ? 1 : 0) };
        }
      }
    }
    return null;
  }

  // Parse an ingredient string into a structured measurement.
  // { hasMeasure, value, high?, dim, base, unitToken, rest, raw }
  function parseIngredient(raw) {
    const original = String(raw == null ? "" : raw).trim();

    // Flag + repair a run-together amount like "2-21/2 pounds".
    let suspect = false, suspectNote = "";
    let s = original;
    const rt = original.match(RUN_TOGETHER_RE);
    if (rt) {
      suspect = true;
      suspectNote = rt[0].trim();
      s = fixRunTogether(original);
    }

    let value = null, high = null;
    const rangeM = s.match(RANGE_LEAD);
    if (rangeM) {
      const lo = parseQuantity(rangeM[1]);
      const hi = parseQuantity(rangeM[2]);
      if (lo) value = lo.value;
      if (hi) high = hi.value;
      s = s.slice(rangeM[0].length);
    } else {
      const qtyM = s.match(QTY_LEAD);
      if (qtyM) {
        const q = parseQuantity(qtyM[1]);
        if (q) { value = q.value; if (q.high != null) high = q.high; }
        s = s.slice(qtyM[0].length);
      }
    }

    if (value == null) return { hasMeasure: false, raw: original, suspect, suspectNote };

    const unit = findUnit(s);
    if (!unit) {
      // A count like "2 eggs" or "3 onions" — no unit to convert, but the
      // number can still be scaled. `rest` is the food name after the count.
      return { hasMeasure: false, value, high, rest: s.trim(), raw: original, suspect, suspectNote };
    }
    const rest = s.slice(unit.len).replace(/^[\s.,)]+/, "").trim();
    const def = UNITS[unit.alias];
    return {
      hasMeasure: true,
      dim: def.dim,
      system: METRIC_ALIASES.has(unit.alias) ? "metric" : "imperial",
      base: value * def.toBase,
      baseHigh: high != null ? high * def.toBase : null,
      value, high,
      suspect, suspectNote,
      unitToken: unit.alias,
      rest,
      raw: original,
    };
  }

  // ---- Formatting helpers ----------------------------------------------
  function roundNice(n, step) {
    return Math.round(n / step) * step;
  }
  function fmtNum(n) {
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  // Turn a decimal into a cook-friendly, fully-reduced fraction string
  // (imperial display). Simplest denominators are tried first so 0.5 -> "1/2",
  // not "4/8".
  function toFraction(n) {
    const whole = Math.floor(n);
    const frac = n - whole;
    const denoms = [2, 3, 4, 8];
    let best = null;
    for (const d of denoms) {
      const num = Math.round(frac * d);
      if (num === 0 || num === d) continue;
      const err = Math.abs(frac - num / d);
      if (err < 0.06 && (!best || err < best.err - 1e-9)) {
        const g = gcd(num, d);
        best = { num: num / g, d: d / g, err };
      }
    }
    if (!best) return fmtNum(n);
    const fracStr = `${best.num}/${best.d}`;
    return whole > 0 ? `${whole} ${fracStr}` : fracStr;
  }

  // Render a measurement's base magnitude into the target system.
  function renderMagnitude(dim, base, system) {
    if (dim === "volume") {
      if (system === "metric") {
        if (base >= 1000) return `${fmtNum(roundNice(base / 1000, 0.05))} l`;
        if (base >= 100) return `${roundNice(base, 10)} ml`;
        if (base >= 10) return `${roundNice(base, 5)} ml`;
        // small amounts (e.g. 1/4 tsp) must not round away to 0
        return `${Math.max(1, roundNice(base, 1))} ml`;
      }
      // imperial volume: pick the nicest customary unit. Prefer cups down to a
      // quarter cup ("3/4 cup" reads better than "12 tbsp").
      const cups = base / 236.588;
      if (cups >= 0.25 - 1e-9) return `${toFraction(cups)} cup${cups > 1 ? "s" : ""}`;
      const tbsp = base / 14.7868;
      if (tbsp >= 1) return `${toFraction(tbsp)} tbsp`;
      const tsp = base / 4.92892;
      return `${toFraction(tsp)} tsp`;
    }
    if (dim === "weight") {
      if (system === "metric") {
        if (base >= 1000) return `${fmtNum(roundNice(base / 1000, 0.05))} kg`;
        if (base >= 100) return `${roundNice(base, 5)} g`;
        return `${roundNice(base, 1)} g`;
      }
      // Weight in decimals, rounded to one place (only cups/tbsp/tsp are fractions).
      const lb = base / 453.592;
      if (lb >= 1) return `${fmtNum(Math.round(lb * 10) / 10)} lb${lb > 1 ? "s" : ""}`;
      const oz = base / 28.3495;
      return `${fmtNum(Math.round(oz * 10) / 10)} oz`;
    }
    return fmtNum(base);
  }

  // Render a bare count (for "2 eggs"): integer when whole, else a fraction.
  function formatCount(n) {
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return toFraction(n);
  }

  // Find an explicit weight the recipe already stated (e.g. the "(168 g)" in
  // "1 1/2 cups almond flour (168 g)"). Returns {grams, index, len} or null.
  let WEIGHT_RE = null;
  function extractWeight(text) {
    if (!text) return null;
    if (!WEIGHT_RE) {
      const w = UNIT_ALIASES
        .filter((a) => UNITS[a] && UNITS[a].dim === "weight" && a !== "#")
        .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      WEIGHT_RE = new RegExp("(" + QTY_RANGE + ")\\s*(" + w + ")\\b", "i");
    }
    const m = String(text).match(WEIGHT_RE);
    if (!m) return null;
    const q = parseQuantity(m[1]);
    const def = UNITS[m[2].toLowerCase()];
    if (!q || !def || def.dim !== "weight") return null;
    return { grams: q.value * def.toBase, index: m.index, len: m[0].length };
  }

  // Remove a span from note text and tidy the leftover parentheses/commas.
  function tidyNote(s) {
    return String(s)
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,)])/g, "$1")
      .replace(/^[\s,]+|[\s,]+$/g, "")
      .trim();
  }

  // Public: render a parsed ingredient in the chosen system, optionally scaled
  // by `scale` (e.g. 2 for a double batch). Parsing happened once; scaling and
  // conversion both derive from the canonical measurement here.
  //
  // gramsResolver(rawLine, ml) is optional: when converting a volume ingredient
  // to metric, if it returns a gram weight (dry goods like flour) we render
  // grams instead of ml; returning null keeps ml (liquids, unknowns).
  function formatIngredient(parsed, system, scale, foodResolver) {
    scale = scale || 1;
    if (!parsed) return "";

    // This ingredient's own food (pins the units of any amounts in its notes,
    // e.g. yeast's "(or 2.25 teaspoons)" -> grams because yeast is a solid).
    const food0 = foodResolver && parsed.raw ? foodResolver(parsed.raw) : null;
    const rest = parsed.rest ? convertText(parsed.rest, system, scale, foodResolver, food0) : "";

    if (!parsed.hasMeasure) {
      // No leading count: still convert any amounts embedded in the text.
      if (parsed.value == null) {
        return parsed.raw ? convertText(parsed.raw, system, scale, foodResolver, food0) : "";
      }
      let qty = formatCount(parsed.value * scale);
      if (parsed.high != null) qty += `–${formatCount(parsed.high * scale)}`;
      return rest ? `${qty} ${rest}` : qty;
    }

    // Metric dry goods measured by volume are weighed in grams (flour, sugar…).
    if (system === "metric" && parsed.dim === "volume" && !(food0 && food0.liquid)) {
      // If the recipe already stated a weight, use THAT (the author's real
      // number) and drop it from the note — avoids two conflicting/duplicate
      // gram values on one line.
      const w = extractWeight(parsed.rest);
      if (w) {
        // Show the author's number faithfully (don't round 168 g -> 170 g).
        const grams = w.grams * scale;
        const q = grams >= 1000
          ? `${fmtNum(Math.round(grams / 10) / 100)} kg`
          : `${Math.round(grams)} g`;
        const leftover = tidyNote(parsed.rest.slice(0, w.index) + parsed.rest.slice(w.index + w.len));
        const note = leftover ? convertText(leftover, system, scale, foodResolver, food0) : "";
        return note ? `${q} ${note}` : q;
      }
      // No stated weight — estimate grams from the food's density.
      if (food0 && food0.density) {
        let q = renderMagnitude("weight", parsed.base * scale * food0.density, "metric");
        if (parsed.baseHigh != null) {
          q += `–${renderMagnitude("weight", parsed.baseHigh * scale * food0.density, "metric")}`;
        }
        return rest ? `${q} ${rest}` : q;
      }
    }

    // Already in the requested system and unscaled: keep the leading wording;
    // still convert amounts in the notes. (Suspect amounts are re-rendered from
    // our repaired interpretation rather than the malformed original.)
    if (parsed.system === system && scale === 1 && !parsed.suspect) {
      return rest ? `${leadingText(parsed)} ${rest}` : parsed.raw;
    }

    let qty = renderMagnitude(parsed.dim, parsed.base * scale, system);
    if (parsed.baseHigh != null) {
      qty += `–${renderMagnitude(parsed.dim, parsed.baseHigh * scale, system)}`;
    }
    return rest ? `${qty} ${rest}` : qty;
  }

  // The original leading "<qty> <unit>" of an ingredient (raw minus the rest),
  // used to preserve the author's exact wording when we only reconvert notes.
  function leadingText(parsed) {
    if (!parsed.rest) return parsed.raw;
    const i = parsed.raw.lastIndexOf(parsed.rest);
    return i > 0 ? parsed.raw.slice(0, i).replace(/[\s,]+$/, "") : parsed.raw;
  }

  // ---- Oven temperatures inside instruction text -----------------------
  // Annotate temperatures with the other unit inline, rounded to the nearest
  // whole degree — "350 degrees F" -> "350 degrees F (177°C)" and
  // "200°C" -> "200°C (392°F)". A single pass over the original text, so the
  // injected conversion is never itself re-matched.
  function convertTemperatures(text) {
    if (!text) return text;
    // The "degree" mark varies by site: ° (U+00B0), º (ordinal U+00BA), ˚, or
    // the combined ℉/℃ symbols. Accept them all. Single pass, so an injected
    // conversion is never itself re-matched.
    return text.replace(
      /(\d{2,3})\s*[°º˚⁰]?\s*(?:degrees?\s*)?(?:(F(?:ahrenheit)?|C(?:elsius)?)\b|(℉|℃))/gi,
      (m, num, word, sym) => {
        const n = parseInt(num, 10);
        const isF = sym ? sym === "℉" : /^f/i.test(word);
        return isF
          ? `${m} (${Math.round(((n - 32) * 5) / 9)}°C)`
          : `${m} (${Math.round((n * 9) / 5 + 32)}°F)`;
      }
    );
  }

  // ---- convert measurements embedded in free text ---------------------
  // For amounts that appear inside ingredient notes and instruction sentences,
  // e.g. "(or 2.25 teaspoons)" or "add 3 1/4 cups flour". Converts each
  // "<qty> <unit>" to the target system (scaled), tidies decimals into
  // fractions, and — like the ingredient list — weighs dry goods in grams for
  // metric by looking at the words that follow the amount.
  const QTY_RANGE = QTY_ATOM + "(?:\\s*(?:-|–|—|to)\\s*" + QTY_ATOM + ")?";
  let MEASURE_RE = null;
  function measureRe() {
    if (MEASURE_RE) return MEASURE_RE;
    const units = UNIT_ALIASES
      .filter((a) => a !== "#")
      .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    MEASURE_RE = new RegExp("(" + QTY_RANGE + ")\\s*(" + units + ")\\b", "gi");
    return MEASURE_RE;
  }

  // foodResolver(text) -> a food record ({density, liquid, …}) or null, used to
  // decide grams (solids) vs ml (liquids/unknown) when converting a volume to
  // metric. fixedFood pins the food for every amount (e.g. all amounts inside
  // one ingredient's notes belong to that ingredient).
  function convertText(text, system, scale, foodResolver, fixedFood) {
    if (!text) return text;
    text = fixRunTogether(text); // repair "2-21/2" style amounts in prose too
    scale = scale || 1;
    const re = measureRe();
    re.lastIndex = 0;
    return text.replace(re, (match, qtyStr, unitStr, offset, whole) => {
      const q = parseQuantity(qtyStr);
      if (!q) return match;
      const alias = unitStr.toLowerCase();
      const def = UNITS[alias];
      if (!def) return match;
      const native = METRIC_ALIASES.has(alias) ? "metric" : "imperial";

      // Same system: keep the author's unit word, tidy the number + scale.
      if (system === native) {
        const lo = formatCount(q.value * scale);
        const out = q.high != null ? `${lo}–${formatCount(q.high * scale)}` : lo;
        return `${out} ${unitStr}`;
      }

      // Identify the food so we know solid (grams) vs liquid (ml). Prefer the
      // words immediately after the amount; else the nearest food earlier in
      // the same clause (handles "1 packet yeast (or 2 tsp)").
      let food = fixedFood || null;
      if (!food && foodResolver) {
        const tail = whole.slice(offset + match.length, offset + match.length + 30);
        food = foodResolver((tail.match(/^[^,.;:)]*/) || [""])[0]);
        if (!food) {
          let pre = whole.slice(Math.max(0, offset - 50), offset);
          const p = Math.max(pre.lastIndexOf(","), pre.lastIndexOf("."), pre.lastIndexOf(";"));
          if (p >= 0) pre = pre.slice(p + 1);
          food = foodResolver(pre);
        }
      }

      const conv = (value) => {
        const base = value * def.toBase * scale;
        if (system === "metric" && def.dim === "volume" && food && food.density && !food.liquid) {
          return renderMagnitude("weight", base * food.density, "metric");
        }
        return renderMagnitude(def.dim, base, system);
      };
      return q.high != null ? `${conv(q.value)}–${conv(q.high)}` : conv(q.value);
    });
  }

  // Guess the source system of a recipe from its ingredient units — used to
  // set a sensible default toggle state.
  function detectSystem(ingredients) {
    let metric = 0, imperial = 0;
    for (const line of ingredients || []) {
      const p = parseIngredient(line);
      if (!p.hasMeasure) continue;
      if (["ml", "l", "g", "kg", "mg"].includes(p.unitToken)) metric++;
      else imperial++;
    }
    return metric > imperial ? "metric" : "imperial";
  }

  return {
    parseQuantity,
    parseIngredient,
    formatIngredient,
    formatCount,
    convertText,
    convertTemperatures,
    detectSystem,
    renderMagnitude,
    toFraction,
    _UNITS: UNITS,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Units;
else if (typeof globalThis !== "undefined") globalThis.Units = Units;
