# UI, navigation, and accessibility

## Visual direction
- **Aesthetic:** Premium sports analytics × modern mobile app × distinctive custom illustration. Bold rankings, clear rating movement, sculptural podium, compact match cards, and refined typography.
- **Brand Identity:** Signature royal purple (`#7045C6`) as the core accent, paired with neutral dark aubergine-charcoal (`#0f0e17`) in dark mode and crisp off-white (`#f8f9fc`) in light mode. Metallic gold, silver, and bronze reserved for ranks 1, 2, and 3.
- **Typography:** Self-hosted `@fontsource/plus-jakarta-sans` weights (400, 500, 600, 700, 800) with robust system font fallbacks. Clean mono digits for ratings (`font-variant-numeric: tabular-nums`).
- **Brand Mark:** Custom SVG shuttlecock icon (`ShuttlecockBrandMark`) paired with "Badminton Tracker".
- Avoid generic oversized dashboard cards, excessive gradients, and decorative animation that slows match entry.
- Group name, logo/avatar and theme are configurable; temporary working name during development.
- Dark theme only; permanently defaulted and locked to athletic dark mode with signature emerald and volt accents. Manual theme switching, light theme, and header sun/moon controls have been removed per owner directive.
- English throughout V1.

## Navigation
Four bottom tabs:
1. Home
2. Leaderboard (active state highlighted in purple with glowing pill indicator)
3. Sessions
4. Profile

Notifications/admin tools are contextual (header icon & modal), not extra bottom tabs.

## Screens
- Home: active/latest session, all-time top players, recent matches in balanced layout.
- Leaderboard:
  - Three scope tabs: All Time (active default), Current / Session Standings, and This Season (with "Coming in Stage 2" explanation).
  - Custom 3D Sculptural Podium for top 3: 2nd place (silver left), 1st place (towering gold center with floating crown), 3rd place (bronze right with sweeping aerodynamic purple ribbons).
  - Ranking list for rank 4+: rank number, avatar, display name, badges ("You", "Guest", "Provisional", "(T)"), readable Elo rating pill, Wins, Win Rate, Matches Played, and subtle chevron.
  - Authenticated viewer's player card highlighted with subtle purple fill, left border, and "You" badge.
  - Graceful fallback when fewer than 3 players are available (empty podium tiers handled without glitches).
- Sessions list: chronological with date, participants, match count, status.
- Session detail: summary first, then standings, match history, attendance, partnership stats.
- Profile tab: signed-in user's player profile first, with ability to browse other players; displays full attendance rates and detailed rating precision.
- Match detail: teams, score, winner, status, rating before/after/change, correction/dispute actions if permitted.
- Admin tools: roster, identities, invitations, approvals, roles/recorders, seasons, disputes, audit and session reopening.

## Interaction and accessibility
- Mobile-first and fully responsive across phone (320px, 390px), tablet (768px), and desktop (1280px).
- Aim for touch targets 44–48 CSS pixels or larger where practical.
- Strong contrast; never rely on colour alone for saved/failed/disputed/provisional states. High-contrast semantic badges (green Current, sky Recalculating, red Stale/Failed, amber Provisional, neutral Guest).
- Subtle transitions; respect reduced motion (`prefers-reduced-motion: reduce`).
- Check loading, empty, error, offline/network-failure and stale-data states.
- Verified with headless browser CDP emulation across all viewports, long names, provisional badges, and reduced player counts; screenshots visually inspected.
