# game-creator

A web app that turns a genre **Template** plus user **Options** into a playable **Generated game**, rendered in the browser with Babylon.js.

## Language

**Template**:
A complete game of a single genre (e.g. tower defense). It owns that game's mechanics and structure and declares which **Options** can parameterize it. There is exactly one Template per genre.
_Avoid_: Preset, skin, variant, mode, blueprint

**Option**:
A value that customizes a Generated game by filling a slot a Template declares. An Option substitutes *content* — a text label, a color, a texture, a 2D image, or a full 3D model — and never changes the Template's rules, behavior, or structure.
_Avoid_: Setting, knob

**Generated game**:
A concrete, playable instance of a Template, produced by applying a set of **Option** values. It is what the user actually plays in the browser.
_Avoid_: Custom game, build, run, session
