# Test accounts (offline demo)

These are made-up test accounts for trying the site on this computer (http://localhost:8095). They are not real people.

## Staff
In the offline demo, staff choose a role on the **Staff** page, and no password is needed.

| Role | How to enter | What they do |
|---|---|---|
| Admin | Staff → **Enter as Admin** | Approve teams, make groups, add Wild Cards, send WhatsApp messages, approve results, qualify teams |
| Room creator | Staff → **Enter as Room creator** | Open check-in, release room ID and password, enter positions and kills, upload screenshots |

For the online version, create these as real users in Supabase. See SETUP-ONLINE.md.

## Teams (My Team → Team ID + captain mobile)
| Team | Team ID | Captain mobile | Notes |
|---|---|---|---|
| Team Thunder | FF-0001 | 9876543210 | Sample team, Slot 1 |
| Team Lightning | shown after registering (e.g. FF-0259) | 9300000010 | Registered through the form during the demo |
| Creator Kings | FF-0253 | 9000007063 | Wild Card team |

The other 251 sample teams and 5 Wild Cards are created by **Settings → Load sample data**. Each has its own Team ID and captain mobile, which you can see in **Admin → Teams**.

## Test registration data (Team Lightning)
| Player | Name | Mobile | Email | Free Fire UID |
|---|---|---|---|---|
| 1 (captain) | Lightning Captain | 9300000010 | cap@lightning.test | 777777710 |
| 2 | Lightning Two | 9300000011 | p2@lightning.test | 777777711 |
| 3 | Lightning Three | 9300000012 | p3@lightning.test | 777777712 |
| 4 | Lightning Four | 9300000013 | p4@lightning.test | 777777713 |

Test WhatsApp group link: `https://chat.whatsapp.com/DemoGroupA123`
Test room: ID `4455667`, password `ff22`
