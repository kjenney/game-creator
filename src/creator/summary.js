// summary.js — the pre-export review (issue #11 / US18): lists every slot of
// the active Template, Customized (with the value that will be exported) or
// Default, so the user can confirm they set everything they intended before
// the download. Data-driven, never hardcoded (US32): one row per manifest
// slot. The customized/default call per kind is the shared contract's
// summarize (US33: one source of truth), computed from the SAME collected
// data the export consumes — what the user confirms here is what ships.
import GameGC from "../shared/gamegc.js";
import { collect } from "./collector.js";

function renderRow(row) {
  const li = document.createElement("li");
  li.className = "summary-row " + row.status;
  li.dataset.slot = row.id;
  li.dataset.status = row.status;

  const label = document.createElement("span");
  label.className = "summary-label";
  label.textContent = row.label;
  li.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "summary-badge";
  badge.textContent = row.status === "customized" ? "Customized" : "Default";
  li.appendChild(badge);

  const value = document.createElement("span");
  value.className = "summary-value";
  if (row.status === "customized") {
    value.textContent = row.value;
    if (row.kind === "color") {
      value.classList.add("summary-color");
      value.style.setProperty("--swatch", row.value); // the actual color, next to the hex
    }
  } else {
    value.textContent = "the game's original";
  }
  li.appendChild(value);
  return li;
}

export function renderSummary(container, manifest, formEl) {
  const result = GameGC.summarize(manifest.slots, collect(formEl));
  container.textContent = "";

  const count = document.createElement("p");
  count.className = "summary-count";
  count.textContent = result.customized === 0
    ? "No customizations yet — the exported game will be the Template as-is."
    : result.customized + " of " + result.total + " slots customized — the rest keep the game's original values.";
  container.appendChild(count);

  const list = document.createElement("ul");
  list.className = "summary-list";
  result.slots.forEach((row) => list.appendChild(renderRow(row)));
  container.appendChild(list);
}
