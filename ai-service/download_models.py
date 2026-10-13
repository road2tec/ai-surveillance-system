"""
Verify and pre-download every pretrained model (no training).

Run once after `pip install -r requirements.txt`:
    python download_models.py
It loads each detector exactly as the service does and prints the chosen source,
so the first `uvicorn` start is fast and you can see which candidates were picked.
"""
import logging
import time

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(name)s: %(message)s")

from app.camera import ModelRegistry  # noqa: E402  (logging must be configured first)

if __name__ == "__main__":
    t0 = time.time()
    reg = ModelRegistry()
    reg.load()
    print("\n=== Model selection (device: %s) ===" % reg.device)
    for name, src in reg.sources.items():
        print(f"  {name:<11} {src}")
    print(f"Done in {time.time() - t0:.0f}s")
