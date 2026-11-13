# Put Squad Cup online (about 20 minutes)

You need two free accounts. Only you can create them: **Supabase** (database + staff login) and **Netlify** (hosting the site).

## 1. Create the database
1. Go to https://supabase.com, sign up, and click **New project**. Pick the region **Mumbai (ap-south-1)** and save the database password somewhere safe.
2. Open **SQL Editor → New query**. Paste everything from [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. You should see "Success". It's safe to run it again later.

## 2. Create your admin login
1. Go to **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick **Auto Confirm User**.
2. Click the new user and copy its **User UID**.
3. In **SQL Editor**, run this with your UID pasted in:
   ```sql
   insert into staff (user_id, role, name) values ('PASTE-USER-UID-HERE', 'admin', 'Your name');
   ```
   For each room creator, add another user the same way and use `'room'` in place of `'admin'`.

## 3. Connect the site to the database
1. Go to **Project Settings → API** (or **Data API / API Keys**).
2. Copy the **Project URL** and the **anon / publishable** key. Do **not** use the `service_role` or secret key.
3. Open [`config.js`](config.js) and paste them in:
   ```js
   window.SQUAD_CONFIG = {
     supabaseUrl: 'https://xxxx.supabase.co',
     supabaseKey: 'eyJ... or sb_publishable_...'
   };
   ```
   The anon key is meant to be public. The database rules in schema.sql control what visitors can see.

## 4. Publish the site
1. Go to https://app.netlify.com/drop and sign up.
2. Drag the whole **`prototype`** folder onto the page. After a few seconds you get a link such as `https://squad-cup-123.netlify.app`.
3. Optional: in Netlify, click **Site configuration → Change site name** to pick a nicer address.

Whenever you change `config.js` or any file, drag the folder onto the same site's **Deploys** page again.

## 5. Check it works
1. Open your link. The footer should say **Live**.
2. Click **Staff** and sign in with the admin email and password from step 2.
3. Go to **Settings** and set the slots, Wild Cards and dates. Turn **Registration open** on.
4. On your phone, open the link and register a test team. It should appear in **Admin → Teams** within a few seconds.
5. Open **My Team** with that Team ID and the captain's mobile number.
6. When you've finished testing, go to **Settings → Reset everything** before real teams register.

## Good to know
- **Free plan limits:** Supabase pauses a free project after 1 week with no visits. Open the dashboard to wake it. For a live tournament, the Pro plan is about $25 a month.
- **Room passwords, mobiles, emails and UIDs** are visible only to staff. A team sees its own room details only after checking in, once the room creator releases the room.
- **WhatsApp:** the **Send** button opens WhatsApp with the message ready, and you press send. Automatic sending needs the WhatsApp Business Platform (a Meta business account, approved message templates and captain opt-in). It can be connected later.
- **Offline demo:** leave `config.js` empty and the site runs as before, saving data only in your browser.
