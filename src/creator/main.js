// main.js — creator bootstrap (NOTES §2):
// registry → template list → manifest-driven form → export button.
import { TEMPLATES, loadManifest } from "./registry.js";
import { renderForm } from "./form.js";
import { collect } from "./collector.js";
import { exportBundle } from "./export.js";

const $ = (id) => document.getElementById(id);
let active = null; // { template, manifest }

function status(msg, isError) {
  const el = $("export-status");
  el.textContent = msg || "";
  el.className = isError ? "status-error" : "status-ok";
}

async function selectTemplate(t) {
  const loaded = await loadManifest(t);
  active = loaded;
  document.querySelectorAll(".template-card").forEach((c) => c.classList.toggle("active", c.dataset.id === t.id));
  $("form-heading").textContent = "Customize " + loaded.manifest.name;
  renderForm($("form"), loaded.manifest.slots);
  $("form-section").hidden = false;
  $("export-btn").disabled = false;
  $("export-btn").textContent = "Export my " + loaded.manifest.name + "…";
  status("");
}

function renderTemplateList() {
  const list = $("template-list");
  for (const t of TEMPLATES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "template-card";
    card.dataset.id = t.id;
    card.innerHTML = "<span class=\"template-name\"></span>";
    card.querySelector(".template-name").textContent = t.name;
    card.addEventListener("click", () => {
      selectTemplate(t).catch((e) => status(e.message, true));
    });
    list.appendChild(card);
  }
}

$("export-btn").addEventListener("click", async () => {
  if (!active) return;
  const btn = $("export-btn");
  btn.disabled = true;
  status("Building your game…");
  try {
    const collected = collect($("form"));
    await exportBundle(active, collected);
    status("Done — check your downloads. Unzip, then open index.html in your browser.");
  } catch (e) {
    status(e.name === "ValidationError" ? "That value won't work: " + e.message : e.message, true);
  } finally {
    btn.disabled = false;
  }
});

renderTemplateList();
