# Sotiría backend foundation

## Goal
Replace simulated account access with secure parent accounts, parent-managed child profiles, and independent child PIN sessions. Preserve existing screens, styling, navigation paths, and wellbeing features. No paid external services or account upgrades.

## Existing project findings
- This app already uses React, TypeScript, Vite, and **TanStack Start**, not React Router. Preserve that framework; no migration or separate server.
- Login currently selects a demo role; signup saves first names locally. Switching roles currently follows unrestricted links.
- A single browser-local sample family powers all child and parent pages. Parent summaries explicitly exclude moods and reflections.
- There is no real child profile picker or PIN form to connect yet; add these necessary controls using the existing design.
- Cloud is not connected. The existing privacy/navigation baseline passes 12 tests; these do not verify backend security.
- User profile storage is confirmed.

## 1. Provision accounts and family records
- Enable Lovable Cloud and email/password authentication. Retain email confirmation; signup success shows a confirmation message rather than pretending the parent is signed in.
- Create `profiles` for parent display names/preferences, linked to `auth.users`, with own-profile access and automatic creation on signup.
- Create the requested `families`, `family_members`, `child_profiles`, `child_sessions`, and `pin_attempts` tables with constraints, indexes, timestamps, explicit grants, and RLS.
- Keep authorization roles in `family_members`, not profile fields. No client-accessible membership creation or role escalation.
- Create a family and its first parent membership together in one authorized database transaction. Family setup resumes after email confirmation.
- Do not insert private demo family data into production records.

## 2. Parent account screens
- Adapt `/login` and `/signup` to real email/password forms while retaining their existing appearance.
- Add forgot-password and a public `/reset-password` page with recovery validation and password update.
- Use the managed protected layout for all parent pages, preserving `/parent/*` URLs. An internal `/auth` entry supports the managed gate and forwards to the existing login experience.
- Make public account buttons reflect the actual session, and clear private caches on logout.
- Add family setup and child management controls to the parent dashboard/settings: create multiple children, edit nickname/avatar, reset PIN, deactivate, and choose a child for parent summaries.

## 3. Independent child access
- Add a profile-selection/PIN screen. A parent opens the family’s child entry screen; any reusable selector access is authorized by a separate revocable, narrow family-picker credential, not a public family identifier. It exposes only active nicknames/avatars, never family records or hashes.
- Default PIN policy: six digits. Use PostgreSQL `pgcrypto` bcrypt hashing through tightly scoped secure operations, avoiding unsupported native hashing packages.
- Atomically serialize PIN verification for each child so concurrent attempts cannot bypass lockout. Default: five failed attempts in 15 minutes trigger a 15-minute lockout.
- Generate a cryptographically random 256-bit child token; persist only its SHA-256 hash. Store the browser token in a same-origin HttpOnly cookie, never localStorage or client-visible responses.
- Default child session lifetime: two hours, with 20-minute idle expiry. Enforce expiry, revocation, and active-profile checks on the server. PIN resets and deactivation revoke existing child sessions.
- Use Secure cookies on HTTPS, restrictive SameSite, CSRF protection, and no-store responses. Test the actual preview origin and a top-level browser; if embedded-cookie restrictions prevent reliable access, explain that limitation rather than weakening cookie protections.
- Child pages use a separate client-only guarded layout and reusable server authorization; identity always comes from the validated session, never a submitted child ID.
- Switching to parent controls requires explicit parent reauthentication. A background parent session on a shared device must not grant a child access. Parent handlers also reject access while that device is in child mode, until verified parent unlock.
- Parent and child logout are independent; switching identities clears private caches and in-memory state. Leaving a child profile revokes its session before another profile can enter.

## 4. Access boundaries and policies
- Family/member reads require verified parent membership; no unrelated-family reads, arbitrary joins, or elevated roles.
- Parents manage only their own family's child profiles through authorized operations.
- Use explicit safe-column profile projections and column-level grants so even direct parent queries cannot read `pin_hash`.
- Session hashes and attempt records are server-only: no anonymous or parent Data API access.
- Privileged database operations are narrow and explicitly verify membership or a valid child credential. Revoke unsafe public execution privileges on secure SQL functions; fix search paths.
- Every new table includes grants and RLS in the migration. Route protection is not a substitute for endpoint authorization.
- Future mood endpoints must be child-session-only. Do not add parent mood access, mood tables, or wellbeing persistence in this phase.

## 5. Preserve wellbeing features without mixing identities
- Keep the existing local demo archive intact; do not import it into real accounts or erase it automatically.
- Separate the existing structured demo content from real account identity. Provide isolated in-memory sample wellbeing state per selected child while feature endpoints are deferred.
- Private reflections entered during this phase remain session-only and clear on logout/profile change; do not write new reflections to localStorage.
- Parent charts/reports remain explicitly sample wellbeing data, not production records. Real profile names and family management use Cloud.
- Preserve all existing lessons, activities, routines, charts, and privacy-safe exports. Do not imply those feature records are saved in Cloud yet.

## 6. Verification and handover
- Keep focused automated tests for input rules, lockouts, session lifetime/idle expiry, revocation, and identity boundaries.
- Execute database access tests with separate parents/families: own-family access, unrelated-family denial, forbidden membership changes, hash-column denial, and child-session/attempt-table denial.
- Execute real PIN/session tests: correct/incorrect PINs, concurrent attempts, lockout, inactive profiles, expired/revoked sessions, and tampered child IDs.
- Verify browser journeys: signup/email confirmation state, login, wrong password, family setup, create/edit/reset/deactivate children, PIN entry, navigation, parent unlock, password recovery where email delivery is available, and both logout paths. Check desktop and mobile without redesigning.
- Run backend and deep security scans, existing regressions, and inspect current build/runtime errors. Report executed pass/fail results separately from unavailable or untested checks.
- Deliver migration/policy explanations, table/function lists, modified screens, variable names without secrets, test report, limitations, and free-tier considerations. No claim of completion for checks not executed.

## Technical implementation
- Use TanStack `createServerFn` for internal account/family/child operations and server-only authorization helpers. No Supabase Edge Functions or separate Node server: the requested function deliverable will list the equivalent app server functions.
- Parent functions use generated bearer middleware and authenticated RLS clients. Load privileged clients only inside verified server handlers, never browser-reachable module scope.
- Use Cloud migration tools, transactional SQL operations for family creation and PIN concurrency, and Web Crypto for random tokens/hashing.
- Preserve existing CSRF middleware and the SSR bootstrap. Add unique metadata to new content pages and retain existing route metadata.
- Update architecture rules and the roadmap to distinguish the preserved demo experience from the new production identity boundaries.

## Scope and cost limits
This phase saves accounts, family relationships, child profiles, PIN attempts, and sessions. Screen-time, moods, breaks, activities, lessons, and routine persistence are deferred exactly as requested. No invitation system, social tracking, or social login is required. Cloud has usage-based limits; verify the available allowance before provisioning and do not promise unlimited free operation.