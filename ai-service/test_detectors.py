"""
Offline sanity check: run every detector on a folder of still images.

    python test_detectors.py path\\to\\images

Prints persons, weapons, fire/smoke boxes, raw violence probability and blood
verdict per image, plus the threat score the pipeline would assign.
Fire/smoke temporal confirmation is bypassed here (single still image).
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from app import config
from app.camera import ModelRegistry, _overlaps
from app.scoring import compute_score, level_for


def main(folder):
    reg = ModelRegistry()
    reg.load()
    for name, src in reg.sources.items():
        print(f"[model] {name:<10} {src}")
    for path in sorted(Path(folder).glob("*.jpg")):
        frame = cv2.imread(str(path))
        if frame is None:  # e.g. WebP/PNG saved with a .jpg name
            try:
                frame = cv2.cvtColor(np.array(Image.open(path).convert("RGB")), cv2.COLOR_RGB2BGR)
            except Exception as exc:
                print(f"{path.name:<16} unreadable: {exc}")
                continue
        t0 = time.time()
        persons, coco_knives = reg.person.detect(frame)
        weapons = reg.weapon.detect(frame) + coco_knives
        fire_boxes, _ = reg.fire.detect(frame)
        reg.fight.reset()
        p_fight = reg.fight.predict(frame)
        _, blood, scene = reg.blood.detect(frame)
        p_blood = scene["blood"]
        if scene["fire"] + scene["smoke"] < config.FIRE_CLIP_MIN:
            fire_boxes = []  # same CLIP cross-check as the live pipeline

        threats = {w["type"] for w in weapons} | {b["type"] for b in fire_boxes}
        if p_fight >= 0.70 and len(persons) >= 2:
            threats.add("fight")
        if blood:
            threats.add("blood")
        pww = any(_overlaps(w["box"], p["box"]) for w in weapons for p in persons)
        score, _ = compute_score(threats, p_fight, pww)
        fmt = lambda ds: ",".join(f"{d['label']}:{d['conf']:.2f}" for d in ds) or "-"
        print(f"{path.name:<16} persons={len(persons)} weapons=[{fmt(weapons)}] fire=[{fmt(fire_boxes)}] "
              f"violence={p_fight:.2f} blood={blood}({p_blood:.2f}) clip_fire={scene['fire']:.2f} "
              f"clip_smoke={scene['smoke']:.2f} -> score {score} {level_for(score)} "
              f"{sorted(threats)} ({time.time() - t0:.2f}s)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "test_images")
