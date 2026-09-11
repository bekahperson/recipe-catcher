"use strict";
/*
 * reader.js — renders the clean recipe tab.
 *
 * Layout: instructions in the main column; a right rail with a batch scaler,
 * a tickable Shopping list, and an estimated Nutrition block.
 *
 * Ingredients are parsed into canonical measurements ONCE. Every render derives
 * the display from that canonical form + the current unit system + batch scale,
 * so unit-toggling and scaling never compound rounding. Theme follows the
 * browser (Auto) unless the user overrides it to Light/Dark.
 */
const api = typeof browser !== "undefined" ? browser : chrome;

const FACTORS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];

const els = {
  content: document.getElementById("content"),
  sidebar: document.getElementById("sidebar"),
  scaler: document.getElementById("scaler"),
  shopping: document.getElementById("shopping"),
  nutrition: document.getElementById("nutrition"),
  footer: document.getElementById("footer"),
  toggle: document.getElementById("unit-toggle"),
  theme: document.getElementById("theme"),
  print: document.getElementById("print"),
};

let state = {
  recipe: null,
  parsedIngredients: [], // [{ original, parsed }]
  system: "imperial",
  checked: new Set(), // ticked shopping indices
  baseServings: null, // parsed from yield, if any
  servings: null, // target servings (when baseServings is known)
  factorIndex: FACTORS.indexOf(1), // fallback multiplier when servings unknown
  theme: "auto",
};

// Scale factor: exact target/original servings when we know the yield,
// otherwise the fixed ×-multiplier fallback.
function scale() {
  if (state.baseServings) return state.servings / state.baseServings;
  return FACTORS[state.factorIndex];
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only ever put http(s) URLs into an href, so a page can't slip in a
// javascript:/data:/file: scheme via the captured source URL.
function safeHref(u) {
  return /^https?:\/\//i.test(String(u == null ? "" : u)) ? String(u) : "";
}

// Resolve a food (for grams-vs-ml decisions) via the nutrition engine's table.
function foodResolver(text) {
  return typeof Nutrition !== "undefined" ? Nutrition.matchFood(text) : null;
}
function ingredientText(parsed) {
  return Units.formatIngredient(parsed, state.system, scale(), foodResolver);
}
// A shopping list drops parenthetical prep notes ("(about 100°F)", "(optional)").
function stripNotes(text) {
  return text.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
}
// A small warning when the recipe wrote an amount ambiguously and we had to
// guess (e.g. "2-21/2" with a missing space).
function flagHtml(parsed) {
  if (!parsed || !parsed.suspect) return "";
  const tip = "Original recipe may include a typo for this item.";
  return ` <span class="flag" tabindex="0" role="note" aria-label="${esc(tip)}"` +
    ` data-tip="${esc(tip)}">⚠ check amount</span>`;
}

function renderError(message, source) {
  els.content.innerHTML = `
    <div class="error-box">
      <h1>No recipe found</h1>
      <p>${esc(message || "This page didn't contain a recipe Recipe Catcher could read.")}</p>
      ${safeHref(source) ? `<p><a href="${esc(safeHref(source))}">Back to the original page</a></p>` : ""}
    </div>`;
  els.sidebar.hidden = true;
  els.toggle.style.visibility = "hidden";
  els.print.style.visibility = "hidden";
}

// ---- main column: title, meta, times, instructions -------------------
function renderMain() {
  const r = state.recipe;
  const times = [
    ["Prep", r.times && r.times.prep],
    ["Cook", r.times && r.times.cook],
    ["Total", r.times && r.times.total],
  ].filter(([, v]) => v);

  const ingHtml = state.parsedIngredients
    .map(({ parsed }) => `<li>${esc(ingredientText(parsed))}${flagHtml(parsed)}</li>`)
    .join("");

  const stepHtml = (r.steps || [])
    .map((s) => {
      // Convert amounts to the chosen units + batch, then annotate temperatures.
      const converted = Units.convertText(s, state.system, scale(), foodResolver);
      return `<li>${esc(Units.convertTemperatures(converted))}</li>`;
    })
    .join("");

  els.content.innerHTML = `
    <h1 class="recipe-title">${esc(r.title)}</h1>
    ${r.author ? `<p class="meta">By ${esc(r.author)}</p>` : ""}
    ${r.yield ? `<p class="meta">Makes: ${esc(r.yield)}</p>` : ""}
    ${times.length ? `<div class="times">${times
      .map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`)
      .join("")}</div>` : ""}
    ${ingHtml ? `<h2 class="section">Ingredients</h2><ul class="ingredients">${ingHtml}</ul>` : ""}
    ${stepHtml ? `<h2 class="section">Instructions</h2><ol class="steps">${stepHtml}</ol>`
      : `<p class="meta">No instructions were found on the page.</p>`}
  `;
}

// ---- right rail: servings / batch scaler -----------------------------
function fmtFactor(f) {
  if (f === 0.5) return "½×";
  if (f === 1.5) return "1½×";
  return `${f}×`;
}
function fmtMult(f) { return `${Math.round(f * 100) / 100}×`; }

function renderScaler() {
  if (state.baseServings) {
    // Exact servings: type a number or step it.
    const s = state.servings;
    const factor = s / state.baseServings;
    const sub = s === state.baseServings
      ? "original recipe"
      : `${fmtMult(factor)} the original ${state.baseServings}`;
    els.scaler.innerHTML = `
      <div class="scaler">
        <span class="scaler-label">Servings</span>
        <div class="stepper">
          <button class="step" data-dir="-1" aria-label="Fewer servings"${s <= 1 ? " disabled" : ""}>−</button>
          <input id="serv-input" class="serv-input" type="number" min="1" max="999" step="1"
                 value="${s}" inputmode="numeric" aria-label="Servings" />
          <button class="step" data-dir="1" aria-label="More servings">+</button>
        </div>
      </div>
      <div class="scaler-sub">${sub}</div>`;
    return;
  }
  // No yield to anchor servings — fall back to a ×-multiplier.
  const f = FACTORS[state.factorIndex];
  const atMin = state.factorIndex === 0;
  const atMax = state.factorIndex === FACTORS.length - 1;
  els.scaler.innerHTML = `
    <div class="scaler">
      <span class="scaler-label">Batch</span>
      <div class="stepper">
        <button class="step" data-dir="-1" aria-label="Smaller batch"${atMin ? " disabled" : ""}>−</button>
        <span class="scale-val">${fmtFactor(f)}</span>
        <button class="step" data-dir="1" aria-label="Bigger batch"${atMax ? " disabled" : ""}>+</button>
      </div>
    </div>`;
}

// ---- right rail: shopping list (tickable, scaled) --------------------
function renderShopping() {
  if (!state.parsedIngredients.length) { els.shopping.hidden = true; return; }
  els.shopping.hidden = false;
  const items = state.parsedIngredients
    .map(({ parsed }, i) => {
      const on = state.checked.has(i);
      const text = stripNotes(ingredientText(parsed));
      return `<li class="shop-item${on ? " checked" : ""}" data-i="${i}">
        <button class="check" role="checkbox" aria-checked="${on}" aria-label="Toggle ${esc(text)}">
          <span class="circle"></span>
        </button>
        <span class="shop-text">${esc(text)}${flagHtml(parsed)}</span>
      </li>`;
    })
    .join("");
  els.shopping.innerHTML =
    `<h2 class="card-title">Shopping list
       <button id="copy-shopping" class="mini-btn" type="button">Copy</button>
     </h2><ul class="shopping">${items}</ul>`;
}

// Plain-text shopping list in the current units + batch size.
function shoppingText() {
  const lines = state.parsedIngredients.map(({ parsed }) =>
    stripNotes(ingredientText(parsed)));
  return `${state.recipe.title}\n` + lines.join("\n");
}

async function copyShopping(btn) {
  const text = shoppingText();
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    // Fallback for older engines / restricted clipboard.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e2) { ok = false; }
  }
  if (btn) {
    btn.textContent = ok ? "Copied!" : "Press ⌘C";
    btn.classList.toggle("done", ok);
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1600);
  }
}

// ---- right rail: nutrition -------------------------------------------
function round5(n) { return Math.round(n / 5) * 5; }
function g(n) { return n == null ? "—" : `${Math.round(n)} g`; }

function renderNutrition() {
  const info = Nutrition.compute(state.recipe);
  if (!info || info.source === "none" || !info.perServing) {
    els.nutrition.innerHTML =
      `<h2 class="card-title">Nutrition</h2>
       <p class="nutri-note">Not enough recognizable ingredients to estimate nutrition for this recipe.</p>`;
    return;
  }
  const ps = info.perServing;
  const tag = info.source === "site" ? "As published" : "Estimated";
  const note = info.source === "site"
    ? "Per serving, as published."
    : `Rough estimate per serving from ${info.matched} of ${info.total} ingredients. Not a substitute for professional advice.`;

  // Per-serving values are invariant to batch size; the whole-batch total
  // scales with the servings shown by the scaler.
  const shown = state.baseServings ? state.servings : Math.round(info.servings * scale());
  const batchCal = round5(ps.calories * shown);

  els.nutrition.innerHTML = `
    <h2 class="card-title">Nutrition <span class="tag">${tag}</span></h2>
    <div class="cals"><span class="cals-num">${round5(ps.calories)}</span><span class="cals-unit">cal / serving</span></div>
    <div class="macros">
      <div class="macro"><span class="m-v">${g(ps.protein)}</span><span class="m-k">Protein</span></div>
      <div class="macro"><span class="m-v">${g(ps.fat)}</span><span class="m-k">Fat</span></div>
      <div class="macro"><span class="m-v">${g(ps.carbs)}</span><span class="m-k">Carbs</span></div>
    </div>
    <div class="batch">Whole batch (${shown} serving${shown === 1 ? "" : "s"}): <strong>${batchCal.toLocaleString()}</strong> cal</div>
    <p class="nutri-note">${note}</p>`;
}

function render() {
  renderMain();
  renderScaler();
  renderShopping();
  renderNutrition();
  els.sidebar.hidden = false;
  els.footer.innerHTML = state.recipe.source
    ? (safeHref(state.recipe.source)
        ? `Caught from <a href="${esc(safeHref(state.recipe.source))}">${esc(state.recipe.source)}</a>`
        : `Caught from ${esc(state.recipe.source)}`)
    : "";
  els.toggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.system === state.system);
  });
}

function setSystem(system) { state.system = system; render(); }

// ---- theme (Auto follows the browser; Light/Dark override) -----------
function applyTheme(theme) {
  state.theme = theme;
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  if (els.theme) {
    const label = theme[0].toUpperCase() + theme.slice(1);
    els.theme.querySelector(".theme-label").textContent = label;
    els.theme.querySelector(".theme-ico").textContent =
      theme === "dark" ? "🌙" : theme === "light" ? "☀︎" : "◐";
    els.theme.title = `Theme: ${label} (click to change)`;
  }
}

// ---- events ----------------------------------------------------------
els.toggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-system]");
  if (btn) setSystem(btn.dataset.system);
});
els.print.addEventListener("click", () => window.print());

if (els.theme) {
  els.theme.addEventListener("click", () => {
    const order = ["auto", "light", "dark"];
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    applyTheme(next);
    if (api && api.storage) api.storage.local.set({ prefTheme: next });
  });
}

els.scaler.addEventListener("click", (e) => {
  const btn = e.target.closest("button.step");
  if (!btn) return;
  const dir = Number(btn.dataset.dir);
  if (state.baseServings) {
    state.servings = Math.min(999, Math.max(1, state.servings + dir));
  } else {
    const next = state.factorIndex + dir;
    if (next < 0 || next >= FACTORS.length) return;
    state.factorIndex = next;
  }
  render();
});

// Commit a typed servings count (fires on Enter / blur).
els.scaler.addEventListener("change", (e) => {
  const input = e.target.closest("#serv-input");
  if (!input || !state.baseServings) return;
  let v = parseInt(input.value, 10);
  if (!isFinite(v) || v < 1) v = 1;
  if (v > 999) v = 999;
  state.servings = v;
  render();
});

// Copy button + toggling a shopping-list item (in place, to keep scroll).
els.shopping.addEventListener("click", (e) => {
  const copyBtn = e.target.closest("#copy-shopping");
  if (copyBtn) { copyShopping(copyBtn); return; }
  const li = e.target.closest(".shop-item");
  if (!li) return;
  const i = Number(li.dataset.i);
  const on = !state.checked.has(i);
  if (on) state.checked.add(i); else state.checked.delete(i);
  li.classList.toggle("checked", on);
  const box = li.querySelector(".check");
  if (box) box.setAttribute("aria-checked", String(on));
});

async function init() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) return renderError("No recipe id.");

  const store = await api.storage.local.get([id, "prefUnits", "prefTheme"]);
  applyTheme(store.prefTheme || "auto");

  const payload = store[id];
  if (!payload || !payload.ok || !payload.recipe) {
    return renderError(
      (payload && payload.error) || "This page didn't contain a readable recipe.",
      payload && payload.capturedFrom
    );
  }

  state.recipe = payload.recipe;
  state.parsedIngredients = (payload.recipe.ingredients || []).map((original) => ({
    original,
    parsed: Units.parseIngredient(original),
  }));
  state.baseServings = Nutrition.parseServings(payload.recipe.yield);
  state.servings = state.baseServings || 1;

  const pref = store.prefUnits || "auto";
  state.system =
    pref === "metric" || pref === "imperial"
      ? pref
      : Units.detectSystem(payload.recipe.ingredients || []);

  document.title = `${payload.recipe.title} — Recipe Catcher`;
  render();

  api.storage.local.remove(id); // one-shot payload; tidy up
}

init().catch((e) => renderError(String(e && e.message ? e.message : e)));
