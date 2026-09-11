"use strict";
const api = typeof browser !== "undefined" ? browser : chrome;

const catchBtn = document.getElementById("catch");
const statusEl = document.getElementById("status");
const unitsSel = document.getElementById("units");
const promptChk = document.getElementById("prompt");

// Load saved preferences (units + the on-page suggestion prompt, default on).
api.storage.local.get(["prefUnits", "prefPrompt"]).then((res) => {
  unitsSel.value = res && res.prefUnits ? res.prefUnits : "auto";
  promptChk.checked = !res || res.prefPrompt == null ? true : !!res.prefPrompt;
});
unitsSel.addEventListener("change", () => {
  api.storage.local.set({ prefUnits: unitsSel.value });
});
promptChk.addEventListener("change", () => {
  api.storage.local.set({ prefPrompt: promptChk.checked });
});

catchBtn.addEventListener("click", async () => {
  catchBtn.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = "Catching…";
  try {
    // Capture the active tab here in the popup, where "current window" is
    // unambiguous, and pass it to the background worker.
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("no active tab");
    await api.runtime.sendMessage({ type: "CATCH_FROM_POPUP", tabId: tab.id, tabUrl: tab.url });
    statusEl.textContent = "Opened in a new tab.";
    // The reader tab now has focus; close the popup shortly after.
    setTimeout(() => window.close(), 400);
  } catch (e) {
    statusEl.className = "status error";
    statusEl.textContent = "Couldn't catch this page.";
    catchBtn.disabled = false;
  }
});
