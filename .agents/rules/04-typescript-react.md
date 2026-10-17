---
trigger: model_decision
description: Apply when implementing or reviewing React, TypeScript, Vite, UI components, frontend state, or client-side data access.
---
# Frontend engineering

- Use React + TypeScript + Vite as the approved starting stack, subject to repository inspection.
- Keep components cohesive and typed; avoid `any` unless justified and documented.
- Treat browser validation as usability only; server/database validation is authoritative.
- Represent loading, saving, saved, failed, disputed, provisional, and recalculating states with text/icons as well as colour.
- Match entry must preserve the entered data after failed requests and clearly show unconfirmed state.
- Disable duplicate submission while in flight and use a stable idempotency key per logical submission attempt.
- Mobile-first, responsive, keyboard-accessible where relevant; aim for 44–48 CSS-pixel touch targets.
- Respect reduced motion, contrast, and light/dark theme settings.
- Do not add dependencies or UI libraries without checking compatibility, maintenance status, and justification.
