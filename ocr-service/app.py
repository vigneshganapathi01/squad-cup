"""Squad Cup OCR service: reads Free Fire end-of-match leaderboard screenshots.

POST /extract  (multipart: shot1, shot2 optional)  ->  ranked teams with players, kills, confidence and name crops.
The service never writes to the database. The admin reviews the result in the site and publishes it there.

Environment:
  OCR_ALLOW_ORIGINS  comma-separated site origins allowed to call the service (CORS)
  SUPABASE_URL, SUPABASE_ANON_KEY  when set, every request must carry a signed-in staff member's token
"""
from __future__ import annotations
import base64, logging, os, re, statistics as st, threading, time
import cv2
import httpx
import numpy as np
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from parser import parse

log = logging.getLogger("ocr")
logging.basicConfig(level=logging.INFO)
MAX_BYTES = 10 * 1024 * 1024
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
ORIGINS = [o.strip() for o in os.environ.get("OCR_ALLOW_ORIGINS", "http://localhost:8095,http://localhost:8096,http://127.0.0.1:8095,http://127.0.0.1:8096").split(",") if o.strip()]

app = FastAPI(title="Squad Cup OCR", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])

_engines: dict = {}
_lock = threading.Lock()   # PaddleOCR is not thread-safe; one screenshot at a time

# The three models. Once downloaded they are loaded straight from disk: PaddleX otherwise checks its download
# sites every start and refuses to run when none answers, even with the models already here (no internet at a venue).
DET, REC, TA = "PP-OCRv5_server_det", "PP-OCRv5_server_rec", "ta_PP-OCRv3_mobile_rec"
MODEL_HOME = os.path.join(os.environ.get("PADDLE_PDX_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".paddlex"), "official_models")


def model_dir(name):
    d = os.path.join(MODEL_HOME, name)
    return d if os.path.isfile(os.path.join(d, "inference.pdiparams")) and os.path.isfile(os.path.join(d, "inference.yml")) else None


def engines():
    if not _engines:
        from paddleocr import PaddleOCR, TextRecognition
        _engines["ocr"] = PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False,
                                    text_detection_model_name=DET, text_detection_model_dir=model_dir(DET),
                                    text_recognition_model_name=REC, text_recognition_model_dir=model_dir(REC))
        _engines["rec"] = TextRecognition(model_name=REC, model_dir=model_dir(REC))
        _engines["ta"] = TextRecognition(model_name=TA, model_dir=model_dir(TA))
    return _engines


@app.on_event("startup")
def _warm():
    if os.environ.get("OCR_LAZY") != "1":
        engines()


async def staff_only(authorization: str | None = Header(default=None)):
    """When Supabase is configured, accept only signed-in staff (admin or room creator)."""
    if not SUPABASE_URL:
        return None
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in as staff first")
    h = {"apikey": SUPABASE_KEY, "Authorization": authorization}
    async with httpx.AsyncClient(timeout=10) as c:
        u = await c.get(f"{SUPABASE_URL}/auth/v1/user", headers=h)
        if u.status_code != 200:
            raise HTTPException(401, "Your staff login has expired. Sign in again.")
        uid = u.json().get("id")
        r = await c.get(f"{SUPABASE_URL}/rest/v1/staff", params={"select": "role", "user_id": f"eq.{uid}"}, headers=h)
        if r.status_code != 200 or not r.json():
            raise HTTPException(403, "Staff only")
    return uid


def _crop_b64(img, box, pad=4):
    if not box:
        return None
    h, w = img.shape[:2]
    x0, y0, x1, y1 = max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad)
    if x1 <= x0 or y1 <= y0:
        return None
    ok, buf = cv2.imencode(".png", img[y0:y1, x0:x1])
    return "data:image/png;base64," + base64.b64encode(buf).decode() if ok else None


def _rec(name, img, box, scale=3, pad=3):
    h, w = img.shape[:2]
    x0, y0, x1, y1 = max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return "", 0.0
    c = cv2.resize(img[y0:y1, x0:x1], None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    r = engines()[name].predict(input=c)[0]
    return r["rec_text"], float(r["rec_score"])


def read_shot(img) -> dict:
    h, w = img.shape[:2]
    if w < h:   # portrait photo of a landscape screen: rotate
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE); h, w = img.shape[:2]
    if w < 1200:   # small screenshots: enlarge so the small names are readable
        f = 1600 / w; img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC); h, w = img.shape[:2]
    res = engines()["ocr"].predict(img)[0]
    boxes = [{"t": t, "s": float(s), "b": [int(v) for v in b]} for t, s, b in zip(res["rec_texts"], res["rec_scores"], res["rec_boxes"])]
    out = parse(boxes, w, h)
    for blk in out.get("blocks", []):
        for p in blk["players"]:
            p["kills_checked"] = False
            if p["kills"] is None and p.get("kills_box"):   # digit not read: re-read just the digit area
                x0, y0, x1, y1 = p["kills_box"]; bh = y1 - y0
                t, s = _rec("rec", img, [x0, y0, int(x0 + 0.75 * bh), y1], scale=4)
                d = re.sub(r"[^0-9]", "", t.translate(str.maketrans("OoIl|SZB", "00111528")))
                if d:
                    p["kills"], p["kills_conf"], p["kills_checked"] = int(d[:2]), round(s * 0.8, 3), True
            # Tamil: the main model cannot read Tamil (it gives Chinese characters or digits instead). Every name is also
            # read with the Tamil model: a confident Tamil reading replaces a weak main reading, otherwise it is sent as an
            # alternative the site may use to find the registered player (alts).
            p["alts"] = []
            if p["box"]:
                t, s = _rec("ta", img, p["box"]); t = t.strip()
                if s >= 0.6 and re.search(r"[஀-௿]", t) and t != p["name"]:
                    weak = p["conf"] < 0.7 or not re.search(r"[A-Za-z]{2,}", p["name"]) or re.search(r"[㐀-鿿]", p["name"])
                    if weak and s >= max(p["conf"], 0.8):
                        if p["name"]:
                            p["alts"].append(p["name"])   # keep the main model's reading as the alternative
                        p["name"], p["conf"] = t, round(s, 3)
                    else:
                        p["alts"].append(t)
            # a Chinese character left in a Latin name is an icon (☣, 모 …) the main model misread: drop it
            if re.search(r"[A-Za-z]{2,}", p["name"]) and re.search(r"[㐀-鿿]", p["name"]):
                p["name"] = re.sub(r"\s+", " ", re.sub(r"[㐀-鿿]+", " ", p["name"])).strip()
            p["crop"] = _crop_b64(img, p["box"])
            p["kills_crop"] = _crop_b64(img, p.get("kills_box"))
            for k in ("box", "kills_box"):
                p.pop(k, None)
    return out


def merge(shots: list[dict]) -> list[dict]:
    """Same rank on both screenshots (the scrolled part overlaps): keep the most complete reading."""
    best = {}
    for si, s in enumerate(shots):
        for b in s.get("blocks", []):
            if not b["rank"]:
                continue
            b["shot"] = si + 1
            score = (len(b["players"]) - (2 if b.get("partial") else 0), st.mean([p["conf"] for p in b["players"]] or [0]))
            if b["rank"] not in best or score > best[b["rank"]][0]:
                best[b["rank"]] = (score, b)
    return [best[r][1] for r in sorted(best)]


@app.get("/health")
def health():
    return {"ok": True, "models_loaded": bool(_engines)}


@app.post("/extract")
async def extract(shot1: UploadFile = File(...), shot2: UploadFile | None = File(default=None), _uid=Depends(staff_only)):
    t0 = time.time(); shots = []
    for f in [shot1, shot2]:
        if f is None:
            continue
        data = await f.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"{f.filename}: screenshot must be under 10 MB")
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(400, f"{f.filename}: not an image")
        with _lock:
            r = read_shot(img)
        if r.get("error"):
            raise HTTPException(422, f"{f.filename}: {r['error']}")
        shots.append(r)
    teams = merge(shots)
    log.info("extract: %d shots, %d teams, %.1fs", len(shots), len(teams), time.time() - t0)
    return {"teams": teams, "seconds": round(time.time() - t0, 1)}
