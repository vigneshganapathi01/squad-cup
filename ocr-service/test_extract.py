"""End-to-end check: run the service pipeline on both samples and score against expected.json."""
import json, difflib, cv2, sys
import app
exp = json.load(open("samples/expected.json", encoding="utf-8")); norm = lambda s: "".join(c for c in s.upper() if c.isalnum())
tot = dict(players=0, kills=0, names=0)
for f, ranks in exp.items():
    if f.startswith("_"): continue
    img = cv2.imread("samples/" + f)
    if img is None: print("skipped (image not in samples/):", f); continue
    r = app.read_shot(img); got = {b["rank"]: b for b in r["blocks"]}
    for rk, players in ranks.items():
        if rk.startswith("_"): continue
        ps = got.get(int(rk), {"players": []})["players"]
        for name, k in players:
            tot["players"] += 1
            best = max(ps, key=lambda p: difflib.SequenceMatcher(None, p["name"].upper(), name.upper()).ratio(), default=None)
            ratio = difflib.SequenceMatcher(None, best["name"].upper(), name.upper()).ratio() if best else 0
            tot["names"] += ratio >= 0.8; tot["kills"] += bool(best and best["kills"] == k)
            if ratio < 0.8 or not best or best["kills"] != k: print(f, rk, repr(name), k, "->", best and repr(best["name"]), best and best["kills"], round(ratio, 2))
print(tot)
