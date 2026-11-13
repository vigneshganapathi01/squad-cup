# Squad Cup security audit (4 Nov 2026)

Scope: the live site at https://squad-cup.vercel.app, the Supabase database (`ltovogzztttbjrhgojhc`), and the code in this folder.
Method: a code review, plus attacks run against the live database using the public key, the same access any visitor has.

## Findings and status
| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | 🔴 Critical | **Stored XSS through the team logo.** The database accepted any text as a "logo", and the site placed it in an image tag without escaping it. A crafted registration could run script in every visitor's browser, including the admin's, and steal the admin session. | **Fixed.** The database only accepts real PNG/JPG/WEBP image data (max 60 KB), and the site escapes the logo and ignores anything that isn't image data. Re-tested: blocked. |
| 2 | 🟠 High | **No rate limits.** A script could fill all slots with junk teams, guess passwords across many accounts, or trigger "forgot password" emails until the Brevo daily quota ran out. | **Fixed.** Per connection: 10 registrations an hour, 20 login tries per 15 minutes and 5 password resets an hour. Per account: lock for 15 minutes after 5 wrong passwords. Overall: a cap of 280 emails a day. Re-tested: spraying was blocked after 20 tries. |
| 3 | 🟡 Medium | **No Content-Security-Policy and no anti-framing header.** Any script injection would have had full access, and the site could be framed for clickjacking. | **Fixed.** A strict CSP (scripts only from this site and jsDelivr; connections only to this Supabase project), `frame-ancestors 'none'`, `X-Frame-Options: DENY` and a Permissions-Policy. |
| 4 | 🟡 Medium | **Third-party script without an integrity check.** If the CDN were compromised, it could serve altered code. | **Fixed.** supabase-js is pinned to 2.45.4 with an SRI sha384 hash. |
| 5 | 🟢 Low | **Database schema could be downloaded** (`/supabase/schema.sql`). | **Fixed.** It's no longer deployed (404). |
| 6 | 🟢 Low | **CSV export formula injection.** A team name such as `=HYPERLINK(...)` would run as a formula in Excel or Sheets. | **Fixed.** Cells starting with `= + - @` are exported as text. |
| 7 | 🟢 Low | **No length limits and extra fields stored** for players. | **Fixed.** Names are limited to 40 characters and emails to 100; only name, mobile, email and UID are stored. |
| 8 | 🟢 Low | **The login message showed whether an email was registered.** | **Fixed.** One generic message is used; "forgot password" always gives the same answer. |
| 9 | 🟢 Low | **An unapproved team trying to check in got "Please log in again".** | **Fixed.** It now says "Your team is not approved yet". |
| 10 | ℹ️ Action needed | **Supabase Auth allows open sign-ups.** Anyone can create an auth account. They get **no** access, because staff rights come only from the `staff` table, but it's tidier to turn this off. | **You:** Authentication → Sign In / Providers → turn off **Allow new users to sign up**. |
| 11 | ℹ️ By design | **Passwords are sent by email** (your choice). Anyone who can read the captain's inbox can log in. | Accepted. The captain can request a new password at any time, and old sessions then stop working. |
| 12 | ℹ️ By design | **Room creators can see players' mobiles and emails** in the staff screens. | Accepted. Remove a room creator from `staff` when they no longer need access. |

## Verified on the live database (all passed)
- **Visitors can't:**
  - Read `teams`, `team_secrets`, `team_sessions`, `match_rooms`, `staff`, `email_log` or `rate_limits` (0 rows).
  - Insert or update teams, stages or settings (blocked by row security).
  - Call internal functions such as `send_login_email`, `gen_team_password`, `rate_ok`, `client_ip`, `session_team` or `admin_reset` (permission denied).
- **Registration rules:** checked with 6 test teams.
  - Duplicate UID, mobile, captain email or team name is blocked (case and spaces ignored).
  - The same UID can't appear twice inside one team.
  - Full slots put a team on the waitlist, and closed registration is refused.
  - Script tags are stored as plain text only.
- **Login rules:**
  - The captain email (any case) plus the right password gives a 30-day session; a non-captain email is refused.
  - A made-up token is refused, and logging out ends the session.
  - 5 wrong passwords lock the account for 15 minutes.
- **Row-level security** is on for all 15 tables (14 checked in the test run; `rate_limits` was added afterwards, and a visitor read of it returned 0 rows).
- **Test data was removed afterwards.**

## Tournament logic
`engine.test.js` passes. I also ran full simulations with 24, 180, 252, 253, 300, 500 and 1,000 teams, and 0, 6 or 12 Wild Cards:
- No group ever had more than 12 teams.
- Wild Cards joined exactly once, at the first stage with 60 teams or fewer.
- The Grand Final always had exactly 12 teams.
