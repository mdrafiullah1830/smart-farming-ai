#!/usr/bin/env python3
"""Create a leakage-safe manifest for an ImageFolder disease dataset."""
import argparse
import csv
import hashlib
import random
from collections import Counter, defaultdict
from pathlib import Path

EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("root", type=Path, help="Root containing crop/disease/image files")
    p.add_argument("--output", type=Path, default=Path("dataset_manifest.csv"))
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    files = sorted(x for x in args.root.rglob("*") if x.suffix.lower() in EXTS)
    if not files:
        raise SystemExit(f"No images found under {args.root}")

    rows, seen, duplicate_count = [], {}, 0
    for path in files:
        rel = path.relative_to(args.root)
        if len(rel.parts) < 3:
            continue
        crop, disease = rel.parts[0], rel.parts[1]
        sha = digest(path)
        if sha in seen:
            duplicate_count += 1
            continue
        seen[sha] = str(rel)
        rows.append({"path": str(rel), "crop": crop, "disease": disease, "sha256": sha})

    # Stratify without allowing an exact duplicate to cross splits.
    rng = random.Random(args.seed)
    groups = defaultdict(list)
    for row in rows:
        groups[(row["crop"], row["disease"])].append(row)
    for group in groups.values():
        rng.shuffle(group)
        n = len(group)
        n_train, n_val = int(n * .70), int(n * .15)
        for i, row in enumerate(group):
            row["split"] = "train" if i < n_train else "val" if i < n_train + n_val else "test"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "crop", "disease", "split", "sha256"])
        w.writeheader(); w.writerows(rows)

    print(f"Unique images: {len(rows)}; exact duplicates excluded: {duplicate_count}")
    print("Split:", dict(Counter(r["split"] for r in rows)))
    print("Classes:", len(groups))


if __name__ == "__main__":
    main()
