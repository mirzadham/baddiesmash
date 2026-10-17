# Access, invitations, and player identity

## Authentication and membership
- Require individual accounts; no public group discovery, public viewing, or open join requests.
- Support verified email/password and Google sign-in, subject to current provider support.
- Google sign-in authenticates an account but does not grant group access.
- Only owner/admins issue invitation links.
- Each invitation is bound to one email, single-use, revocable, and expires after 7 days.
- Invitee must authenticate and prove a verified email matching the invitation.
- Redemption does not grant access until an admin approves membership.
- Rejection invalidates the invitation; a new invitation may later be issued.
- Keep invitation state distinct from membership state.
- Any admin or owner may approve/reject.
- Membership roles: member, recorder-authorised member, admin, owner. Model role/recorder permission explicitly and enforce server-side.
- Member departure revokes access but preserves legitimate match history.
- Account deletion must explain that historical results may be retained/anonymised as required by privacy obligations.

## Roles
- **Member:** view leaderboards, profiles, match history, session results and statistics; may dispute a match.
- **Authorised recorder:** member permissions plus record/manage active session when controller.
- **Admin:** manage permanent players, confirm identities, authorise recorders, manage seasons, resolve disputes, correct any session, reopen completed sessions.
- **Owner:** all admin capabilities plus appoint admins, transfer ownership, manage recovery/access and export when supported.

## Player/account separation
- A player profile is not the same as a login account.
- Approved viewer may have no player profile and does not appear on leaderboards.
- New member chooses an existing player profile or requests a new one. Admin verifies/creates official link.
- New profile requests are pending until admin confirmation.
- Until profile link/create is confirmed, the member may view group data but cannot be selected in official matches.
- Returning member re-linking to an old profile requires admin verification and preserves history/rating.
- Display names can change; stable IDs preserve history.
- Duplicate display names are allowed. Admin UI must distinguish them using stable IDs and useful context.
- Never merge by name alone.
- Admin/owner merge guest into permanent profile only after previewing affected matches, stats, and ratings. Merge is transactional or safely versioned, auditable, and reversible.
- Guest may participate immediately in session, season, and all-time stats/ratings. Later merge preserves continuity.
- Inactive profiles retain history/rating; admin manually sets active/inactive. Inactivity does not alter rating.
- Membership access and sporting activity are separate concepts.

## Privacy
- Member emails are not visible to other members. Owner/admin access limited to legitimate admin tasks.
- Public profile data: display name, status, ratings, stats, attendance, partnerships, match history, optional avatar.
- Avoid collecting unnecessary personal details.
