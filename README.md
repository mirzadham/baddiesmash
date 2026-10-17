# Badminton Group Tracker — Knowledge Base and Antigravity Prompt Pack

**Status:** Discovery decisions consolidated; implementation not started.  
**Purpose:** Give a fresh AI coding agent the context needed to plan and build the app safely.  
**Primary harness:** Google Antigravity.  
**Project state:** Requirements and roadmap only. The agent must inspect the repository before modifying anything.

## Start here

1. Read [`AGENTS.md`](AGENTS.md) before doing project work.
2. Read [`docs/00-project/vision-and-principles.md`](docs/00-project/vision-and-principles.md).
3. Read [`docs/00-project/decision-register.md`](docs/00-project/decision-register.md).
4. Read [`docs/00-project/roadmap-and-scope.md`](docs/00-project/roadmap-and-scope.md).
5. Run the **Bootstrap / Repository Inspection** prompt in [`docs/prompts/01-bootstrap-inspect.md`](docs/prompts/01-bootstrap-inspect.md).
6. Do not implement anything until you have inspected the repository, presented findings and a proposed plan, and received explicit approval.

## What is in this pack?

- `AGENTS.md`: concise, always-relevant project rules.
- `.agents/rules/`: focused Antigravity rules. Each file uses supported YAML frontmatter.
- `docs/00-project/`: product vision, decision register, scope, and terminology.
- `docs/01-product/`: functional requirements and business rules.
- `docs/02-engineering/`: architecture, data, security, ratings, testing, operations.
- `docs/03-delivery/`: implementation governance, acceptance matrix, and release gates.
- `docs/prompts/`: standalone, reusable prompts for the guided workflow.
- `docs/references/`: authoritative external documentation consulted while preparing this pack.

## Important usage notes

- This is a **requirements and workflow pack**, not application code. Do not treat the presence of these files as permission to scaffold or deploy the application.
- The coding agent must verify current provider capabilities, prices, limits, and Antigravity conventions when the relevant task begins. Facts about hosted services can change.
- Product behaviour is specified here. Physical database schema, indexes, transaction boundaries, and implementation mechanics are proposals until reviewed against the actual repository and current platform capabilities.
- If two documents conflict, stop, explain the conflict, propose a resolution, and wait for the owner. Do not silently apply “latest file wins.”
- Treat security, authorization, match history, ratings, and auditability as release-critical.
- The owner must explicitly approve each phase plan before implementation. Production deployment, production migrations, destructive data actions, pushes, force pushes, and recurring costs require separate approval.

## Suggested repository layout

```text
/
├── AGENTS.md
├── README.md
├── .agents/
│   └── rules/
├── docs/
│   ├── 00-project/
│   ├── 01-product/
│   ├── 02-engineering/
│   ├── 03-delivery/
│   ├── prompts/
│   └── references/
└── src/                 # Created only after a phase plan is approved
```

The prompts are portable Markdown files rather than relying exclusively on Antigravity’s legacy workflow feature. Antigravity’s official documentation has announced a workflow-system transition around 19 October 2026, so verify current support before choosing a harness-specific automation mechanism.

## Current high-level decisions

- Mobile-first responsive web app; one group in V1 UI, multi-group-ready data model.
- React + TypeScript + Vite; Supabase PostgreSQL/Auth/Realtime; Vercel frontend hosting.
- Free-tier-first; no recurring paid services without owner approval.
- Doubles, one court, one game to 21, win by 2 after 20–20, cap at 30.
- Elo is a candidate methodology; K-factor and production configuration are not yet approved.
- Build in three stages; do not silently expand Stage 1.
