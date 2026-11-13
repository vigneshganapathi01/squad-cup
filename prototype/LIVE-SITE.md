# Squad Cup – live site (set up 4 Nov 2026)

| What | Where |
|---|---|
| Website | https://squad-cup.vercel.app (Vercel project `squad-cup`) |
| Database | Supabase project `squad-cup` (ltovogzztttbjrhgojhc), free plan, Mumbai region |
| Emails | Brevo free plan (300/day). Sender: vigneshg2k01@gmail.com. The API key is in Supabase Vault as `brevo_api_key` |
| Admin | vigneshg2k01@gmail.com (Staff → sign in). Open sign-ups are turned off |

## How teams use it
1. **Register:** team name, logo and 4 players. Player 1 is the captain.
2. **Email:** the captain's email (Player 1 only) receives the Team ID and a password.
3. **My Team:** log in with the captain email + password.
4. **Forgot password:** "Email me a new password" sends a new one to the captain email only.

## Wild Cards (admin)
- **Admin → Wild Cards → Create invite link.** Send it with **Copy**, **WhatsApp** or **Send by email** (sent through Brevo).
- The team registers through the private link. It arrives as **Pending**; approve or reject it.
- Wild Card teams stay off the public site until you place them and publish their stage.
- **Edit** (on Teams or Wild Cards) changes a team's name, logo or players. The database refuses any player who is already in another team.

## Complaints and result fixes (admin)
- **Admin → Complaints** shows the team's screenshot; click it to see it full size.
- **Keep result** sends a reply. **✎ Fix result** changes the position or kills. If another team already has that position, the two swap, and the team is told.
- **Edit team → Match results** lets you fix any approved result with ✎. Points, rank, kills and Booyahs update everywhere. Teams can only view these, never change them.

## Before opening registration (admin)
Go to **Staff → sign in → Settings**, then set and **Save**:
- Tournament name, slots, Wild Cards, prize, organiser, start date and closing date.
- Turn **Registration open** on.

## Database files (run in Supabase SQL Editor, in this order, on a new project)
1. `supabase/schema.sql`, which already includes the other two
2. `supabase/email-login.sql`
3. `supabase/security-fixes.sql`
4. `supabase/wildcards.sql` (Wild Card invites, hiding Wild Cards until their stage, and the duplicate-player guard)
5. `supabase/complaint-screenshots.sql` (stores complaint screenshots for the admin)

## Redeploy after changing files
```bash
cd "/Users/vicky/Downloads/OUR_SPACE/untitled folder/free-fire-template/prototype" && npx vercel@latest deploy --prod --yes
```

## Security
See `SECURITY-AUDIT.md`. Never paste API keys or passwords into chats; enter them only in Supabase or Brevo.

## Team passwords (admin)
- **Admin → Teams** has a Password column (Show/Hide, Copy). **Edit** on a team has a *Login password* card: type a password or leave it empty for a random one, optionally email it to the captain.
- Logins still check a bcrypt hash. An encrypted copy (key `team_pass_key` in Supabase Vault) lets only the admin read it back. Every change is in the Activity log and signs the team out on all devices.
- Passwords emailed before this update were stored only as a hash, so they show as "Hidden · set a new one".
