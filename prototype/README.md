# Squad Cup – tournament prototype

A demo that runs on this computer, with 252 sample teams. All data is saved in the browser (localStorage).

## Run it
```bash
cd "/Users/vicky/Downloads/OUR_SPACE/untitled folder/free-fire-template/prototype" && python3 -m http.server 8095
```
Then open http://localhost:8095

## Try the flow
1. **Staff → Enter as Admin → Settings → Load sample data** (252 slot teams + 6 Wild Cards).
2. **Stages & groups → Generate** → **Lock & publish** (21 groups of 12).
3. **Room panel**: open check-in → enter room ID/password → Live → Completed → enter positions and kills (+ screenshot) → submit.
4. **Results**: approve. Or use **Simulate all results** to fill a whole stage.
5. **Approve Top 8 / Top 6 & close stage** → **Generate next stage**. At Stage 4 the 6 Wild Cards wait in a tray: choose a group for each, or click **Auto place**.
6. Keep going until the Grand Final, then **Finish tournament** → the Champion shows on the Leaderboard.

Team view: **My Team** → `FF-0001` + `9876543210` (Team Thunder).
Register a new team: **Register** (only before Stage 1 is generated). A team logo is required.

## Files
- `engine.js` – fixed logic: groups of 12, Top 8 then Top 6, Wild Card join stage, points, tie-breakers, form checks
- `engine.test.js` – run `node engine.test.js`
- `app.js` / `app.css` / `index.html` – screens

## Online version
Follow [SETUP-ONLINE.md](SETUP-ONLINE.md): create a Supabase project, run `supabase/schema.sql`, add your staff login, paste the URL and key into `config.js`, and drag this folder onto Netlify Drop.

## WhatsApp (hybrid)
Admin → **WhatsApp**: paste each group's WhatsApp invite link (you create the groups yourself), then track whether each captain was sent the invite or has joined. Captain messages are queued automatically for approval, group and slot, invites, room details and results. **Send** opens WhatsApp with the message ready. Every message is also shown on the team's My Team page.

## Not done yet
Automatic WhatsApp sending (needs WhatsApp Business Platform), storing screenshot images (only file names are saved), and OTP for team login.
