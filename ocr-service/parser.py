"""Turn PaddleOCR text boxes from a Free Fire end-of-match leaderboard into ranked teams.

Screen layout (custom room result screen):
  left panel  = ranks 1-5 (always), right panel = ranks 6-12 (scrolls)
  each team   = 1 or 2 rows; each row = 2 player slots: <name> <N Eliminations>
On the right panel the "Eliminations" text of slot 1 runs under the slot-2 name, so OCR often
returns them as one box ("3EliminationsALPHAXJACK"); those are split here.
"""
from __future__ import annotations
import re
import statistics as st
import unicodedata

ANCHOR = re.compile(r"l[il1]m[il1]nat", re.I)                 # matches Eliminations / Eliminati / Elimination5 ...
KILLS = re.compile(r"^\s*([0-9OoIl|SZB]{1,2})?\s*E?\s*l[il1]m[il1]nat", re.I)
SPLIT = re.compile(r"^.*?E?l[il1]m[il1]nat(?:i(?:o[nr]?)?)?[sS5]?", re.I)
DIGIT_FIX = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "|": "1", "S": "5", "Z": "2", "B": "8"})
# The main model knows Latin and Chinese but not Tamil, so Tamil names come out as Chinese characters; never drop those
# as icon noise, app.py re-reads them with the Tamil model.
CJK = re.compile(r"[㐀-鿿]")
# Where the kills + "Eliminations" text starts inside a box. The OCR sometimes joins a name to its "Eliminations"
# ("KG_SHADOw OEliminations"): the text in front is that player's name, and positions must use this start, not the box's.
LEAD = re.compile(r"([0-9OoIl|SZB]{1,2})?\s*E?\s*l[il1]m[il1]nat", re.I)


def _anchor_x(a):
    """x where the kills digit / "Eliminations" starts inside an anchor box (the box may start with a name)."""
    m = LEAD.search(a["t"])
    if not m or m.start() == 0:
        return a["b"][0]
    x0, x1 = a["b"][0], a["b"][2]
    return int(x0 + (x1 - x0) * m.start() / max(len(a["t"]), 1))


def _clean(t: str) -> str:
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", t)).strip()


def _kills(text: str):
    m = KILLS.match(text)
    if not m or not m.group(1):
        return None
    try:
        return int(m.group(1).translate(DIGIT_FIX))
    except ValueError:
        return None


def parse(boxes: list[dict], width: int, height: int) -> dict:
    """boxes: [{t: text, s: score, b: [x0, y0, x1, y1]}]  ->  {blocks: [...], panels: n}"""
    for b in boxes:
        x0, y0, x1, y1 = b["b"]
        b["yc"], b["h"] = (y0 + y1) / 2, y1 - y0
    anchors = [b for b in boxes if ANCHOR.search(b["t"])]
    if len(anchors) < 2:
        return {"blocks": [], "error": "No 'Eliminations' text found. Is this a Free Fire match result screen?"}
    ah = st.median(a["h"] for a in anchors)

    # Anchor columns: x0 of every "Eliminations" box clusters into (up to) 4 columns.
    xs = sorted(_anchor_x(a) for a in anchors)
    gaps = sorted(((xs[i + 1] - xs[i], i) for i in range(len(xs) - 1)), reverse=True)
    cuts = sorted(i for g, i in gaps[:3] if g > 3 * ah)
    cols, start = [], 0
    for i in cuts + [len(xs) - 1]:
        cols.append((xs[start], xs[i])); start = i + 1
    col_of = lambda x: min(range(len(cols)), key=lambda k: 0 if cols[k][0] - ah <= x <= cols[k][1] + ah else abs(x - cols[k][0]))
    # Panels: columns 0-1 left, 2-3 right. The boundary sits just right of column 1's boxes.
    if len(cols) >= 3:
        right_edge = max(a["b"][2] for a in anchors if col_of(_anchor_x(a)) <= 1)
        panels = [(0, right_edge + ah * 0.5), (right_edge + ah * 0.5, width)]
    else:
        panels = [(0, width)]

    blocks = []
    for pi, (px0, px1) in enumerate(panels):
        p_anchors = sorted((a for a in anchors if px0 <= _anchor_x(a) < px1), key=lambda a: a["yc"])
        if not p_anchors:
            continue
        first_col_x = min(_anchor_x(a) for a in p_anchors)
        # rows = anchors with the same y
        rows = []
        for a in p_anchors:
            if rows and abs(rows[-1]["yc"] - a["yc"]) < ah * 0.6:
                rows[-1]["anchors"].append(a); rows[-1]["yc"] = st.mean(x["yc"] for x in rows[-1]["anchors"])
            else:
                rows.append({"yc": a["yc"], "anchors": [a]})
        # rank labels: digits only, well left of the first name column
        labels = [b for b in boxes if px0 <= b["b"][0] < px1 and re.fullmatch(r"\d{1,2}", b["t"].strip())
                  and b["b"][2] < first_col_x - ah * 4 and 1 <= int(b["t"]) <= 12 and b["h"] >= ah * 0.8]
        label_ids = {id(b) for b in labels}
        # words in each row
        for r in rows:
            r["tokens"] = sorted((b for b in boxes if px0 <= b["b"][0] < px1 and id(b) not in label_ids
                                  and abs(b["yc"] - r["yc"]) < ah * 0.6 and b["h"] < ah * 1.8),
                                 key=lambda b: b["b"][0])
        # group rows into teams: rows of one team sit closer together than rows of different teams
        ys = [r["yc"] for r in rows]
        g = [ys[i + 1] - ys[i] for i in range(len(ys) - 1)]
        thr = min(g) * 1.2 if g else 0
        teams = []
        for i, r in enumerate(rows):
            if teams and len(teams[-1]["rows"]) < 2 and r["yc"] - teams[-1]["rows"][-1]["yc"] <= thr:
                teams[-1]["rows"].append(r)
            else:
                teams.append({"rows": [r]})
        # rank: from labels where found, else counted from neighbours; the left panel is always 1-5
        for t in teams:
            top, bot = t["rows"][0]["yc"] - ah, t["rows"][-1]["yc"] + ah
            hit = [l for l in labels if top <= l["yc"] <= bot]
            t["rank"] = int(hit[0]["t"]) if hit else None
        if pi == 0 and len(panels) == 2:
            for i, t in enumerate(teams):
                t["rank"] = t["rank"] or i + 1
        known = [i for i, t in enumerate(teams) if t["rank"]]
        for i, t in enumerate(teams):
            if not t["rank"] and known:
                k = min(known, key=lambda j: abs(j - i)); t["rank"] = teams[k]["rank"] + (i - k)
        for t in teams:
            players = []
            for r in t["rows"]:
                players += _row_players(r["tokens"], ah)
            blocks.append({"rank": t["rank"], "panel": pi, "players": players,
                           "partial": len(t["rows"]) == 1 and (t["rows"][0]["yc"] < height * 0.3 or t["rows"][0]["yc"] > height * 0.8)})
    return {"blocks": blocks}


def _row_players(tokens: list[dict], ah: float) -> list[dict]:
    """Walk a row left to right: names until an 'Eliminations' box, whose leading digits are that player's kills."""
    players, name_parts = [], []
    for b in tokens:
        if ANCHOR.search(b["t"]):
            m = LEAD.search(b["t"])
            if m and m.start() > 0 and b["t"][:m.start()].strip():
                # a name joined in front of its "Eliminations" ("KG_SHADOw OEliminations"): split it off
                prefix, digits = b["t"][:m.start()], m.group(1) or ""
                if len(digits) == 2 and not prefix[-1:].isspace():   # "Shinra182Elim…": the name ends in a digit
                    prefix, digits = prefix + digits[0], digits[1]
                x0, y0, x1, y1 = b["b"]; cut = int(x0 + (x1 - x0) * len(prefix) / max(len(b["t"]), 1))
                name_parts.append({"t": prefix.strip(), "s": b["s"], "b": [x0, y0, cut, y1]})
                after_digits = b["t"][m.start() + len(m.group(1) or ""):]   # "Eliminations…" and anything after it
                b = {**b, "t": digits + after_digits, "b": [cut, y0, x1, y1]}
            kills = _kills(b["t"])
            parts = [p for p in name_parts if not (p["s"] < 0.45 and len(p["t"].strip()) <= 2 and not CJK.search(p["t"]))]   # icons read as junk
            text = _clean(" ".join(p["t"] for p in parts))
            if parts or kills is not None:
                xs = [p["b"] for p in parts]
                box = [min(x[0] for x in xs), min(x[1] for x in xs), max(x[2] for x in xs), max(x[3] for x in xs)] if xs else None
                players.append({"name": text, "conf": round(min([p["s"] for p in parts] or [0]), 3), "kills": kills,
                                "kills_box": b["b"], "kills_conf": round(b["s"], 3), "box": box, "raw": [p["t"] for p in name_parts]})
            # text after "Eliminations" in the same box = start of the next name
            rest = SPLIT.sub("", b["t"], count=1).strip()
            name_parts = []
            if rest:
                x0, y0, x1, y1 = b["b"]
                frac = 1 - len(rest) / max(len(b["t"]), 1)
                name_parts.append({"t": rest, "s": b["s"] * 0.9, "b": [int(x0 + (x1 - x0) * frac), y0, x1, y1]})
        else:
            name_parts.append(b)
    return players
