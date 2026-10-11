# Options customize content, not behavior

An Option is the only mechanism by which a Generated game differs from its Template. We decided an Option may substitute *content* (a text label, a color, a texture, a 2D image, or a full 3D model) but may **never** change the Template's rules, behavior, structure, or numeric balance.

**Why:** Keeping Options content-only makes each Template a stable, self-contained game and keeps "generation" a simple content-injection step. We explicitly considered letting Options tune numbers (difficulty, wave count, damage) and rejected it: it blurred the line between *customizing* and *re-designing* the game, and would have forced every Template to expose and guard a large surface of gameplay parameters.

**Consequences:** A user who wants different gameplay (harder, new tower types, new rules) needs a *different Template*, not a new set of Options. This is intentional — it bounds what a Template must support and keeps the authoring form trivially simple.
