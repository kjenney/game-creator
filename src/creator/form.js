// form.js — renders the authoring form from a Template's Option declarations
// (data-driven, never hardcoded — spec US4). One <div class="slot" data-slot=id>
// per declared slot; collector.js reads values back by data-slot.
//
// Per-kind renderers: text (input), color (picker, default from the manifest),
// texture/image2d/model3d (file input + that slot's requirements line).

function requirementsText(slot) {
  const r = slot.requirements;
  if (!r) return null;
  const parts = [];
  if (r.format) parts.push("Format: " + r.format.toUpperCase());
  if (r.requiredNodes && r.requiredNodes.length) parts.push("Required node(s): " + r.requiredNodes.join(", "));
  if (r.pivot) parts.push("Pivot: " + r.pivot);
  if (r.targetScale != null) parts.push("Scale: " + r.targetScale + "×");
  if (r.maxBytes) parts.push("Max size: " + Math.round(r.maxBytes / (1024 * 1024)) + " MB");
  return parts.join(" · ");
}

function renderText(slot) {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 120;
  input.placeholder = "Leave blank to keep the default";
  return { field: input, isAsset: false };
}

function renderColor(slot) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = slot.default || "#e8a33d"; // the Template's own accent (manifest `default`)
  return { field: input, isAsset: false };
}

function renderBinary(slot) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = slot.kind === "model3d" ? ".glb" : "image/png,image/jpeg,image/webp";
  return { field: input, isAsset: true };
}

const RENDERERS = { text: renderText, color: renderColor, texture: renderBinary, image2d: renderBinary, model3d: renderBinary };

export function renderForm(container, slots) {
  container.textContent = "";
  for (const slot of slots) {
    const renderer = RENDERERS[slot.kind];
    if (!renderer) throw new Error("no form renderer for kind " + slot.kind + " (slot " + slot.id + ")");
    const { field, isAsset } = renderer(slot);

    const div = document.createElement("div");
    div.className = "slot";
    div.dataset.slot = slot.id;
    div.dataset.kind = slot.kind;

    const label = document.createElement("label");
    label.className = "slot-label";
    label.textContent = slot.label;
    label.htmlFor = field.id = "slot-" + slot.id.replace(/[^a-zA-Z0-9_-]/g, "-");
    div.appendChild(label);

    div.appendChild(field);

    const req = requirementsText(slot);
    if (req) {
      const p = document.createElement("p");
      p.className = "slot-requirements";
      p.textContent = req;
      div.appendChild(p);
    }
    if (isAsset) {
      const hint = document.createElement("p");
      hint.className = "slot-hint";
      hint.textContent = "Leave empty to keep the game's default art.";
      div.appendChild(hint);
    }
    container.appendChild(div);
  }
}
