"""Dump raw OCR boxes for a screenshot (development helper). Uses the same models as the service."""
import sys, json
import cv2
from app import engines

ocr = engines()["ocr"]
for path in sys.argv[1:]:
    img = cv2.imread(path)
    res = ocr.predict(img)[0]
    out = [{"t": t, "s": round(float(s), 3), "b": [int(v) for v in b]} for t, s, b in zip(res["rec_texts"], res["rec_scores"], res["rec_boxes"])]
    json.dump(out, open(path + ".raw.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(path, img.shape, len(out))
