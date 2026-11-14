# Squad Cup OCR service

Reads Free Fire end-of-match result screenshots and returns every team's rank and each player's name, eliminations, OCR confidence and a crop of the name. Built with FastAPI, PaddleOCR (PP-OCRv5, plus the Tamil model for Tamil names) and OpenCV.

The service only reads images. It never writes to the database: the admin checks the result on **Admin → Upload screenshots** and publishes it from the site.

## Files
| File | What it does |
|---|---|
| `app.py` | API (`GET /health`, `POST /extract`), staff login check, digit re-read, Tamil pass, name crops, merging the two screenshots by rank |
| `parser.py` | Turns OCR text boxes into ranks → teams → players. Knows the layout: ranks 1–5 on the left, 6–12 on the right, 2 rows × 2 players per team, and names that run into "Eliminations" |
| `eval_samples.py`, `test_extract.py` | Score the parser against `samples/expected.json` |
| `samples/` | The two reference screenshots and their correct results |

## Run on this computer
```bash
cd "/Users/vicky/Downloads/OUR_SPACE/untitled folder/free-fire-template/ocr-service"
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8765
```
The offline demo (`demo/config.js`) already points at `http://127.0.0.1:8765`. The first start downloads the OCR models (about 200 MB) to `~/.paddlex`.

Check accuracy on the samples:
```bash
cd "/Users/vicky/Downloads/OUR_SPACE/untitled folder/free-fire-template/ocr-service" && OCR_LAZY=1 .venv/bin/python test_extract.py
```

## API
`POST /extract` takes multipart form data: `shot1` (required) and `shot2` (optional, the list scrolled to the bottom). Each image must be under 10 MB.
```json
{ "teams": [ { "rank": 1, "shot": 1, "partial": false,
    "players": [ { "name": "Jd.kuttyy!", "conf": 0.984, "kills": 3, "kills_conf": 0.981, "kills_checked": false,
                   "crop": "data:image/png;base64,…", "kills_crop": "data:image/png;base64,…" } ] } ],
  "seconds": 14.5 }
```
- `conf` is the OCR confidence of the name.
- `kills_checked: true` means the digit was missed on the first read and re-read from a close crop. The site asks the admin to verify it.

**Security:** when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, every request must send `Authorization: Bearer <staff access token>`. The service checks it with Supabase Auth and the `staff` table, so only signed-in admins and room creators can use it. Without those variables (local only) there is no login check.

## Deploy on an Oracle Cloud VM
1. **VM shape.** The OCR models need about 2–3 GB of RAM.
   - The free **VM.Standard.E2.1.Micro** (1 GB) is too small.
   - **Ampere A1 (ARM)** is a good fit, but first confirm PaddlePaddle installs on ARM: `pip install paddlepaddle==3.0.0` on the VM. If that fails, use an x86 shape such as **VM.Standard.E4.Flex** with 1 OCPU and 4 GB.
2. **Network.**
   - Open ports 80 and 443 in the VCN security list.
   - Open them in the VM firewall too: `sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT` (Oracle images block them by default).
3. **Domain.** Point a subdomain at the VM's public IP, for example `ocr.yourdomain.com` (an A record). HTTPS is required because the site is HTTPS.
4. **Install Docker**, copy this folder to the VM, and create `.env` with:
   ```
   OCR_DOMAIN=ocr.yourdomain.com
   OCR_ALLOW_ORIGINS=https://squad-cup.vercel.app
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_ANON_KEY=<the same anon key that is in config.js>
   ```
5. Start it: `docker compose up -d --build`. Caddy gets the HTTPS certificate automatically. Then check `https://ocr.yourdomain.com/health`.
6. **Connect the site.**
   - In `prototype/config.js`, set `ocrUrl: 'https://ocr.yourdomain.com'`.
   - In `prototype/vercel.json`, add `https://ocr.yourdomain.com` to `connect-src` in the Content-Security-Policy. Without this the browser blocks the call.

Steps 4–6 change the live site, so do them only when you're ready to go live.
