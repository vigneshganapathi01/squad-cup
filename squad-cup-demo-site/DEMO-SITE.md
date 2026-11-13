# Squad Cup – demo copy

A full copy of the live site with its own database, filled with demo data. Nothing here touches the real tournament.

- **Site:** https://squad-cup-demo.vercel.app (hidden from search engines)
- **Database:** Supabase project `squad_test` (ref `vjecknrmvfnqdnqcgmts`)
- **Admin:** testuser@gmail.com (you set the password in Supabase → Authentication → Users)
- **Demo data:** 252 slot teams + 6 Wild Cards. Stages 1–3 finished; Stage 4 in progress with the Wild Cards placed. Team Thunder (FF-0001) has room 5566778 / sq4d released, 1 result waits for approval, and 1 complaint has a screenshot.
- **Team logins:** demo teams have made-up emails, so no passwords were sent. To test a team login, edit a team's captain email to your own in Admin → Teams → Edit, then click Send login. This needs Brevo (below).
- **Emails:** off until you add the Brevo key to this project's Vault (name `brevo_api_key`) and set the sender in Settings.
- **Deploy:** `npx --yes vercel@latest deploy --prod --yes` from this folder (Vercel project `squad-cup-demo`).
- **Reload the demo data:** Admin → Settings → Load sample data (gives a fresh start at registration).
