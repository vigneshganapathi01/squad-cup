# Squad Cup: screenshot results (OCR) plan

Status (13 Nov 2026): built and tested locally (Phases 4–9). Nothing is deployed and no database has been changed.
- `ocr-service/` (FastAPI + PaddleOCR + OpenCV). Results on the two sample screenshots: 78/78 eliminations and 68/78 names read correctly, plus the Tamil names.
- Admin → **Upload screenshots** (`prototype/ocr.js`), a **Match results** card on the dashboard, a **Players** tab on the Leaderboard, and player eliminations on match pages.
- Per-player results are stored inside the existing `matches.results` (no new table needed). Screenshots are not stored online yet: that needs the Storage bucket below, at go-live.
- Deployment steps for Oracle Cloud are in `ocr-service/README.md`.

## Phase 1: how the app is actually built

| Part | What it really is | Where |
|---|---|---|
| Production app | `prototype/`. It's deployed to squad-cup.vercel.app and its `config.js` points at Supabase project `ltovogzz…` | `prototype/` |
| Offline test site | A copy of `prototype/` plus `demo-seed.js`, with no database (localStorage only). It's deployed to squad-cup-test.vercel.app | `demo/` |
| Demo copy | An older copy of `prototype/` that points at a second Supabase project (`vjecknrm…`) | `squad-cup-demo-site/` |
| `blueprint.html` | The original design notes. No code runs from it | root |
| Frontend | One-page vanilla JS app with no framework and no build step: `index.html`, `app.js` (screens and handlers, about 1,900 lines), `engine.js` (points, stages, validation), `app.css` | `prototype/` |
| Backend | **There is no Node.js backend.** `package.json` only runs `node engine.test.js`. All server logic is Supabase: Postgres tables, row-level security, `security definer` SQL functions, Supabase Auth for staff, and Brevo email sent from SQL | `prototype/cloud.js`, `prototype/supabase/*.sql` |
| Database | Postgres (Supabase). Tables: `settings`, `staff` (admin/room), `teams` (players as a jsonb list of `{name (In Game Name), mobile, email, uid}`), `stages` (jsonb), `matches` (`results` jsonb, `result_status`, `screenshots` jsonb), `match_rooms`, `checkins`, `complaints`, `audit_log`, `notifications`, `group_links`, plus team login tables | `supabase/schema.sql` and add-on files |
| Sync model | The browser keeps the whole tournament in memory (`S`), and `cloud.js` upserts changed rows on `save()`. Staff permissions come from `is_staff()` / `is_admin()` in RLS | `cloud.js` |
| Deployment | Static files on Vercel. A CSP in `vercel.json` only allows connections to the Supabase URL | `vercel.json` |

### How results work today
- **Room panel** (`#/room`, `viewRoom`, form `results`): the room creator types a position and kills **per team**, or marks a no-show, and attaches screenshots. **Only the file names are kept; the images are not stored.** Admin entries publish at once. Room-creator entries go to `submitted`.
- **Admin → Results** (`#/admin/results`, `viewResults`): approve, or send back. Corrections happen in `viewMatchPoints` / `changeResult`.
- **Points:** `engine.js`. Placement is `[12,9,8,7,6,5,4,3,2,1,0,0]` and each kill is worth 1. `standings()` builds the team leaderboard from approved results only. Match history is `viewMatchResult`.
- **There is no per-player data anywhere.** Kills are stored per team, and there is no player leaderboard.

## Phase 2: files that would change

| File | Change |
|---|---|
| `prototype/app.js` | Add a new **Upload screenshots** panel on the existing Results/Room flow (two slots, preview, process, status, team results, 48-player review table, corrections, duplicate flags, validation, publish). Add a **Match results** table on the admin dashboard (`viewAdmin`). Publishing updates the public **Leaderboard** (`viewLeaderboard`) with a team tab and a new player tab. Store per-player results in `m.results[teamId].players`. No Excel file |
| `prototype/engine.js` | Add `validateOcrResult()` (12 teams, 4 players each, 48 unique, valid placements, kills ≥ 0, uncertain names confirmed) and `playerStandings()`, with tests in `engine.test.js` |
| `prototype/cloud.js` | Upload screenshots to Supabase Storage, call the OCR service with the staff login token, and read and write the new player-results table |
| `prototype/app.css` | Styles for the review table, crops and confidence badges, reusing the existing `.card`, `.tw`, `.badge` and `.btn` |
| `prototype/vercel.json` | Allow the OCR service URL in the CSP `connect-src` |
| `prototype/supabase/ocr-results.sql` (new) | Migration (below). You run it yourself when going live |
| `ocr-service/` (new, Python) | FastAPI + PaddleOCR + OpenCV service, Dockerfile, deploy notes |
| `demo/` | Gets the same UI. With no OCR server it falls back to manual entry or a sample OCR response |

## Phase 3: database and API proposal

### Migration `ocr-results.sql` (adds tables only; nothing existing changes)
```sql
-- private bucket for the two screenshots of each match
insert into storage.buckets (id, name, public) values ('match-shots', 'match-shots', false) on conflict do nothing;
-- storage policies: staff can upload and read; nobody else

create table match_uploads (
  id bigint generated by default as identity primary key,
  match_id text references matches(id) on delete cascade,
  slot int check (slot in (1, 2)),
  path text not null,               -- storage path
  uploaded_by uuid, uploaded_at timestamptz default now(),
  ocr jsonb                          -- raw OCR output kept for audit
);

create table match_player_results (
  match_id text references matches(id) on delete cascade,
  team_id text references teams(id),
  player_uid text not null,          -- the registered Free Fire UID: this is the identity, never a fuzzy name
  ign_ocr text,                      -- exactly what OCR read (Unicode kept)
  ign_final text not null,           -- the name the admin confirmed
  kills int not null check (kills >= 0),
  confidence real,
  verified_by uuid, verified_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  primary key (match_id, player_uid)  -- one record per player per match: blocks duplicates
);
-- RLS: staff read/write; public read only where status = 'approved' (for the player leaderboard)
```
`matches.results` keeps its current shape (`{place, kills}` per team), so the existing team leaderboard keeps working. Team kills = the sum of that team's player kills.

### OCR service API (FastAPI)
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Uptime check |
| `POST` | `/extract` | Body: 2 images, plus the group's registered players (team ID, UID, In Game Name). Returns rows `{rank, team_guess, players:[{text, kills, confidence, crop_png_base64, matched_uid or null, candidates[]}]}` |

- **Auth:** the browser sends the staff member's Supabase access token, and the service checks it against Supabase before running. The service never writes to the database. The admin publishes through the existing Supabase path, so permissions stay in RLS.
- **Name matching:** an exact match (after Unicode NFC normalisation only, case kept) against the 48 registered In Game Names in that group links the player automatically. Anything else is marked **uncertain**, with suggestions shown, and the admin must pick or type the name. Nothing is ever merged automatically on similarity.
- **Team matching:** each leaderboard row's team is inferred from which registered players appear in it. The admin confirms it if the players don't all belong to one team.

## Questions to settle before building (these change the design)
1. **Sample screenshots.** I need 2–3 real pairs of Free Fire end-of-match leaderboard screenshots (and a note of what the correct result was). The parser depends on the exact layout: how many teams per image, where names and kills sit, phone resolution.
2. **"Exactly 12 teams / 48 players" vs the current rules.** Groups can have fewer than 12 teams, the Quick format's final has 8, and no-shows are allowed. Should the check be "every team in this group, 4 players each", with no-shows allowed?
3. **Substitutes.** If someone plays who isn't a registered player (a different In Game Name), should the admin be able to record them, or must every row match a registered player?
4. **Who uploads.** The admin only, or room creators too (with results going to `submitted` as today)?
5. **Oracle Cloud VM.** Which shape? The free Ampere (ARM) VM has plenty of memory, but I need to confirm that PaddlePaddle runs on ARM before relying on it. The service also needs HTTPS (a domain or subdomain) because the site is HTTPS.

## Proposed order once approved
4. Upload slots + Storage bucket → 5. `ocr-service/` tested on your screenshots → 6. review table + validation + publish → 7. admin dashboard results tables → 8. Leaderboard update on publish → 9. end-to-end test on real screenshots → 10. Oracle VM deploy guide (Docker + Caddy for HTTPS).

## Results display (replaces the Excel export)
No Excel file is generated. Everything is shown as tables on the site, built only from **approved** records:

**Admin dashboard (`#/admin`), new "Match results" card**
- Pick a stage, group and match, or "All matches".
- **Team table:** Rank, Team, Placement, Kills, Placement pts, Kill pts, Total. One row per team, sorted by finishing position.
- **Player table:** Team, In Game Name, UID, Kills, and an OCR confidence badge plus "verified by" for any name the admin corrected.
- **Match totals:** teams, players, total kills, top fragger, Booyah team.
- Rows link to the existing match page (`viewMatchResult`) for screenshots and corrections.

**Public Leaderboard (`#/leaderboard`), updated automatically when the admin publishes**
- **Teams tab** (the existing table): points, Booyahs, kills. These now come from the sum of player kills, using the same `standings()` and tie-breaks.
- **Players tab** (new): Rank, In Game Name, Team, Matches, Kills, Top kills in one match. Sorted by kills. Approved matches only.
- Match history stays where it is today. Each match page also shows the per-player kill table once published.

Publishing changes the match from draft to approved in one step. Until then nothing shows on the dashboard totals or the Leaderboard.

Everything is built and tested locally first. No deploys and no live database changes until you say go live.
