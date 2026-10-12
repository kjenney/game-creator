// collector.js — form DOM → { options: {slotId: string|null}, files: {slotId: File} }
// (NOTES §2). Empty text/color fields and empty file inputs are omitted
// (null / absent) so buildBundle keeps the Template defaults.
export function collect(formEl) {
  const options = {};
  const files = {};
  for (const slot of formEl.querySelectorAll(".slot")) {
    const id = slot.dataset.slot;
    const kind = slot.dataset.kind;
    const field = slot.querySelector("input");
    if (kind === "text" || kind === "color") {
      const v = field.value.trim();
      options[id] = v === "" ? null : field.value;
    } else {
      const file = field.files && field.files[0];
      if (file) files[id] = file;
    }
  }
  return { options, files };
}
