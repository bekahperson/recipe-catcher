"use strict";
/*
 * background.js — service worker. Orchestrates: ask the active tab's content
 * script to extract a recipe, stash it in storage.local under a fresh id, then
 * open the reader page pointed at that id. Using storage (rather than passing
 * the recipe to a freshly-created tab by message) sidesteps the race where the
 * reader tab isn't listening yet.
 */
const api = typeof browser !== "undefined" ? browser : chrome;

// `tab` is {id, url}. Message the content script; if it isn't present (page was
// open before the extension was enabled), inject it on demand and retry.
async function catchRecipe(tab) {
  if (!tab || tab.id == null) return;
  let response;
  try {
    response = await api.tabs.sendMessage(tab.id, { type: "CATCH_RECIPE" });
  } catch (e) {
    try {
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["units.js", "parser.js", "content.js"],
      });
      response = await api.tabs.sendMessage(tab.id, { type: "CATCH_RECIPE" });
    } catch (e2) {
      response = { ok: false, error: "Couldn't read this page." };
    }
  }

  const id = "recipe_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
  await api.storage.local.set({
    [id]: {
      ok: !!(response && response.ok),
      recipe: response && response.recipe ? response.recipe : null,
      error: response && response.error ? response.error : null,
      capturedFrom: (tab && tab.url) || "",
    },
  });

  const url = api.runtime.getURL("reader.html") + "?id=" + encodeURIComponent(id);
  await api.tabs.create({ url });
}

// Resolve the tab to act on: prefer the id the popup captured (reliable),
// otherwise fall back to querying the active tab.
async function resolveTab(msg) {
  if (msg && msg.tabId != null) return { id: msg.tabId, url: msg.tabUrl };
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Popup "Catch this recipe" button, or the in-page prompt's "Catch recipe".
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "CATCH_FROM_POPUP") {
    (async () => {
      const tab = await resolveTab(msg);
      await catchRecipe(tab);
      sendResponse({ started: true });
    })();
    return true;
  }
  if (msg && msg.type === "CATCH_FROM_CONTENT") {
    // The prompt lives in the page, so the sender's tab is the one to read.
    if (sender && sender.tab) catchRecipe({ id: sender.tab.id, url: sender.tab.url });
    sendResponse({ started: true });
    return true;
  }
});

// If the popup is ever removed, a direct toolbar click still works.
if (api.action && api.action.onClicked) {
  api.action.onClicked.addListener((tab) => { catchRecipe(tab); });
}
