# Sotiría frontend

## Remix remediation
- [x] Empty migration set for the new project's database: no copied migration files, journal has zero entries, no orphan snapshots, and the new database records nothing as applied. Verified against the live database.
- [ ] Remaining remix steps (awaiting the next items from the user).

## Product
- [x] Backend foundation (uploaded brief): parent accounts, family setup, child profiles, PIN sessions, access rules, screens, security tests.
- [ ] Phase 2 wellbeing database (uploaded brief): tables + access rules, server functions, child pages, parent pages, security tests, end-to-end check.
- [x] Establish the design system and illustrated public website.
- [x] Build public navigation and demo authentication.
- [x] Build all six child pages with saved interactions.
- [x] Build all four parent pages with reports, routines, and privacy settings.
- [ ] Integration & quality pass (uploaded brief):
  - [ ] Shared dated demo data: screen time log, activity history, lesson progress, breaks, routine completions
  - [ ] Parent views read only a privacy-safe summary; export preview excludes moods
  - [ ] Fix stale form values after reload; persist break completion; split notification settings
  - [ ] Meaningful actions for bell, reminders, consent, reset confirmation, contact form
  - [ ] Accessibility + mobile fixes (offscreen sidebar, nav)
  - [ ] Tests for summary/privacy rules; end-to-end QA journey in browser
