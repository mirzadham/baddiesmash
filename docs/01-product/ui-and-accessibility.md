# UI, navigation, and accessibility

## Visual direction
- Premium sports analytics aesthetic: bold rankings, clear rating movement, compact match cards, polished but restrained charts, strong typography.
- Avoid generic oversized dashboard cards, excessive gradients, and decorative animation that slows match entry.
- Use a design system first: typography, spacing, colour, surfaces, status indicators, reusable components.
- Group name, logo/avatar and theme are configurable; temporary working name during development.
- Light and dark modes; follow device setting by default, manual switch.
- English throughout V1.

## Navigation
Four bottom tabs:
1. Home
2. Leaderboard
3. Sessions
4. Profile

Notifications/admin tools are contextual, not extra bottom tabs.

## Screens
- Home: active/latest session, all-time top players, recent matches in balanced layout.
- Leaderboard: All-time default, Season and Current Session filters.
- Sessions list: chronological with date, participants, match count, status.
- Session detail: summary first, then standings, match history, attendance, partnership stats.
- Profile tab: signed-in user's player profile first, with ability to browse other players.
- Match detail: teams, score, winner, status, rating before/after/change, correction/dispute actions if permitted.
- Admin tools: roster, identities, invitations, approvals, roles/recorders, seasons, disputes, audit and session reopening.

## Interaction and accessibility
- Mobile-first and responsive on phone/tablet/desktop.
- Aim for touch targets 44–48 CSS pixels or larger where practical.
- Strong contrast; never rely on colour alone for saved/failed/disputed/provisional states.
- Subtle transitions; respect reduced motion.
- Check loading, empty, error, offline/network-failure and stale-data states.
- Browser verify key flows at mobile and desktop sizes when available; inspect screenshots/layout/overflow and keyboard/touch behaviour.
- Milestone reviews: dashboard/navigation, match entry, leaderboard/profiles, admin workflows.
- If browser automation or screenshot capability is unavailable, disclose that and provide a manual review checklist; never pretend visual testing occurred.
