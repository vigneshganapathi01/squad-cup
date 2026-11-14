"""Compare parser output on the sample screenshots with samples/expected.json."""
import json, sys, difflib
from parser import parse
import cv2
exp = json.load(open("samples/expected.json", encoding="utf-8"))
norm = lambda s: "".join(ch for ch in s.upper() if ch.isalnum())
tot = dict(players=0, found=0, kills=0, names=0)
for f, ranks in exp.items():
    if f.startswith("_"): continue
    img = cv2.imread("samples/" + f)
    try: raw = json.load(open("samples/" + f + ".raw.json", encoding="utf-8"))
    except FileNotFoundError: raw = None
    if img is None or raw is None: print("skipped (image or saved OCR boxes missing):", f); continue
    h, w = img.shape[:2]
    out = parse(raw, w, h)
    got = {b["rank"]: b for b in out["blocks"]}
    print("==", f, "ranks found:", sorted(got))
    for r, players in ranks.items():
        if r.startswith("_"): continue
        b = got.get(int(r)); ps = b["players"] if b else []
        for name, k in players:
            tot["players"] += 1
            best = max(ps, key=lambda p: difflib.SequenceMatcher(None, norm(p["name"]), norm(name)).ratio(), default=None)
            ratio = difflib.SequenceMatcher(None, norm(best["name"]), norm(name)).ratio() if best else 0
            ok_n = ratio >= 0.8; ok_k = best is not None and best["kills"] == k
            tot["found"] += best is not None and ratio >= 0.5; tot["names"] += ok_n; tot["kills"] += ok_k
            if not (ok_n and ok_k) or "-v" in sys.argv:
                print(f"  rank {r}: want {name!r} {k} | got {best and best['name']!r} {best and best['kills']} ({ratio:.2f})")
print(tot)
