# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Number tickets from `01`; do not use one combined tickets file.
- Record triage state near the top with a `Status:` line.
- Append conversation history under a `## Comments` heading.

## When a skill says “publish to the issue tracker”

Create a new file under `.scratch/<feature-slug>/`.

## When a skill says “fetch the relevant ticket”

Read the referenced markdown file.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`
- Use `Type:`, `Status:`, and `Blocked by:` lines near the top.
- A ticket is unblocked when every listed dependency is resolved.
- Resolve a ticket by adding an `## Answer` section and setting
  `Status: resolved`.
