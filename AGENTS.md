# Agent Instructions

## Mandatory Project Skills

When working in this repository, always inspect and use the applicable skills in `.agents/`.

Use Bun for all package management and project commands in this repository. Prefer `bun install`, `bun run ...`, and `bunx ...`; do not use npm, pnpm, or yarn unless explicitly requested.

At the start of any non-trivial task:

1. List the available `.agents/*/SKILL.md` files.
2. Read the relevant skill instructions before editing code.
3. Apply the relevant rules from the skill and its referenced files.
4. If a skill appears relevant but is not applicable, state why before proceeding.

Current project skill folders include:

- `.agents/emil-design-eng`
- `.agents/next-best-practices`
- `.agents/vercel-composition-patterns`
- `.agents/vercel-react-best-practices`

Backend work should at minimum check `.agents/next-best-practices` before implementation. Frontend or React component work should also check the Vercel React/composition skills and `emil-design-eng` when design quality is relevant.
