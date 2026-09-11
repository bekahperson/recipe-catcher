"use strict";
/*
 * content.js — injected into pages (declared in the manifest, and injected
 * on demand as a fallback). Shares scope with units.js + parser.js.
 *
 * Two jobs:
 *   1. Reply with the extracted recipe when the toolbar button asks.
 *   2. On a page that carries a recipe, show a small dismissible "Catch recipe"
 *      prompt (unless the user turned it off). It's an in-page element in a
 *      Shadow DOM — not a window pop-up — so pop-up blockers don't affect it.
 */
const api = typeof browser !== "undefined" ? browser : chrome;

if (!globalThis.__recipeCatcherReady) {
  globalThis.__recipeCatcherReady = true;

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "CATCH_RECIPE") return;
    try {
      const recipe = RecipeParser.extractFromDocument(document, location.href);
      sendResponse({ ok: !!recipe, recipe });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
    return true; // keep the message channel open for the response
  });

  maybeSuggest();
}

// Show the prompt only on real recipe pages, only on http(s), and only if the
// user hasn't disabled it.
function maybeSuggest() {
  if (!/^https?:$/.test(location.protocol)) return;
  let has = false;
  try { has = RecipeParser.hasStructuredRecipe(document); } catch (e) { return; }
  if (!has) return;
  Promise.resolve(api.storage.local.get("prefPrompt"))
    .then((res) => {
      const on = res && res.prefPrompt != null ? res.prefPrompt : true; // default on
      if (on) showSuggestBanner();
    })
    .catch(() => {});
}

function showSuggestBanner() {
  if (document.getElementById("recipe-catcher-suggest")) return;

  const host = document.createElement("div");
  host.id = "recipe-catcher-suggest";
  host.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;";
  // Closed shadow root: the page can't reach into or introspect our prompt.
  const root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;

  root.innerHTML = `
    <style>
      .wrap { display:flex; justify-content:flex-end; padding:14px; }
      .card {
        pointer-events:auto; display:flex; align-items:center; gap:10px;
        background:#ffffff; color:#23201d; border:1px solid #e7e2da;
        border-radius:12px; box-shadow:0 10px 34px rgba(0,0,0,.20);
        padding:9px 10px 9px 13px; max-width:340px;
        font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
        transform:translateY(120%); transition:transform .28s cubic-bezier(.2,.8,.2,1);
      }
      .card.in { transform:translateY(0); }
      .ico { font-size:18px; line-height:1; }
      .txt { flex:1; font-size:14px; font-weight:600; white-space:nowrap; }
      .catch {
        border:0; background:#b4513a; color:#fff; cursor:pointer; white-space:nowrap;
        border-radius:8px; padding:8px 12px; font:600 13px inherit;
      }
      .catch:active { transform:translateY(1px); }
      .close {
        border:0; background:transparent; color:#7a746c; cursor:pointer;
        font-size:20px; line-height:1; padding:4px 6px; border-radius:6px;
      }
      .close:hover { color:#23201d; }
      @media (max-width:600px){
        .wrap { justify-content:center; padding:10px; }
        .card { width:100%; max-width:none; }
        .txt { white-space:normal; }
      }
      @media (prefers-color-scheme:dark){
        .card { background:#221f1c; color:#f0ece5; border-color:#35312c; }
        .close { color:#a49d93; }
        .close:hover { color:#f0ece5; }
        .catch { background:#e0785f; color:#191715; }
      }
    </style>
    <div class="wrap">
      <div class="card" role="dialog" aria-label="Recipe Catcher">
        <span class="ico" aria-hidden="true">🍴</span>
        <span class="txt">Catch this recipe?</span>
        <button class="catch" type="button">Catch recipe</button>
        <button class="close" type="button" aria-label="Dismiss">×</button>
      </div>
    </div>`;

  (document.body || document.documentElement).appendChild(host);
  const card = root.querySelector(".card");
  requestAnimationFrame(() => card && card.classList.add("in"));

  const remove = () => host.remove();
  root.querySelector(".close").addEventListener("click", remove);
  root.querySelector(".catch").addEventListener("click", () => {
    try { api.runtime.sendMessage({ type: "CATCH_FROM_CONTENT" }); } catch (e) {}
    remove();
  });
}
