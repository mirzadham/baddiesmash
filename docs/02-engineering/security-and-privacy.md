# Security and privacy requirements

## Trust boundaries
- Frontend is untrusted. Client checks improve UX only.
- PostgreSQL RLS and trusted functions/RPCs enforce authorization.
- Service-role keys, database passwords and privileged secrets must never enter browser code, committed files, client logs or public artifacts.
- SECURITY DEFINER functions need explicit authorization checks, least privilege, constrained search path where applicable, and tests.
- Validate user-controlled values on the server/database boundary.
- Use least privilege for provider/project permissions.

## Access controls
- No public group data.
- Verify membership and role for every read/write path.
- Group-level isolation is mandatory.
- Invitation email matching, expiry, revocation and single-use redemption must be enforced server-side.
- Membership approval is separate from invitation redemption.
- Controller ownership/session version is enforced server-side.
- Role/recorder checks must be revalidated inside privileged functions, not trusted from frontend state.

## Sensitive operations
- Recent reauthentication for high-risk actions using supported auth method.
- Explicit confirmation for merges, deletions, ownership transfers and destructive actions.
- Audit actor, timestamp, reason, relevant old/new values, and outcome.
- Merge preview and reversible/versioned execution.
- Production migration/data changes require owner approval and recovery plan.
- Bootstrap is one-time, server-side, safely retryable without duplicate owner/group, then disabled. No reusable bootstrap secret in browser.

## Privacy
- Keep member emails private; admin access only for legitimate needs.
- Collect minimal personal information.
- Explain account deletion/anonymisation and retention of historical sporting results before action.
- Follow applicable privacy law and provider requirements; verify specifics rather than making unsupported legal claims.
- Avoid putting personal data/secrets in audit payloads, logs or exported summaries.
