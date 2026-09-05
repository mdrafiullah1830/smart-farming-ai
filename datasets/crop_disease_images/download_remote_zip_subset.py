#!/usr/bin/env python3
"""Download selected files from a remote ZIP using HTTP byte ranges."""

from __future__ import annotations

import argparse
import io
import json
import shutil
import time
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path


class HTTPRangeReader(io.RawIOBase):
    def __init__(self, url: str):
        self.url = url
        request = urllib.request.Request(
            url,
            headers={"Range": "bytes=0-0", "User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            content_range = response.headers.get("Content-Range", "")
            self.size = int(content_range.rsplit("/", 1)[-1])
            self.final_url = response.url
        self.position = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.position

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.position = offset
        elif whence == io.SEEK_CUR:
            self.position += offset
        elif whence == io.SEEK_END:
            self.position = self.size + offset
        else:
            raise ValueError(f"unsupported whence: {whence}")
        return self.position

    def read(self, size: int = -1) -> bytes:
        if self.position >= self.size:
            return b""
        if size < 0:
            end = self.size - 1
        else:
            end = min(self.position + size - 1, self.size - 1)
        request = urllib.request.Request(
            self.final_url,
            headers={
                "Range": f"bytes={self.position}-{end}",
                "User-Agent": "Mozilla/5.0",
            },
        )
        last_error = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    data = response.read()
                break
            except Exception as exc:
                last_error = exc
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        else:  # pragma: no cover - loop either succeeds or raises
            raise last_error  # type: ignore[misc]
        self.position += len(data)
        return data


def is_image(name: str) -> bool:
    return Path(name).suffix.casefold() in {".jpg", ".jpeg", ".png", ".webp"}


def class_name(name: str) -> str:
    lowered = name.casefold()
    if "affected leaf" in lowered:
        return "affected"
    if "healthy leaf" in lowered:
        return "healthy"
    parts = [part for part in Path(name).parts if part not in {".", ".."}]
    if len(parts) < 2:
        return "unclassified"
    return parts[-2]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--per-class", type=int, default=150)
    parser.add_argument("--include-token")
    parser.add_argument("--exclude-token")
    parser.add_argument("--list-only", action="store_true")
    args = parser.parse_args()

    remote = HTTPRangeReader(args.url)
    selected: dict[str, list[zipfile.ZipInfo]] = defaultdict(list)
    with zipfile.ZipFile(remote) as archive:
        for info in archive.infolist():
            if info.is_dir() or not is_image(info.filename):
                continue
            if "__MACOSX" in info.filename or Path(info.filename).name.startswith("._"):
                continue
            if args.include_token and args.include_token.casefold() not in info.filename.casefold():
                continue
            if args.exclude_token and args.exclude_token.casefold() in info.filename.casefold():
                continue
            selected[class_name(info.filename)].append(info)

        inventory = {
            "remote_zip_bytes": remote.size,
            "classes": {label: len(files) for label, files in sorted(selected.items())},
            "sample_paths": {
                label: [info.filename for info in files[:3]]
                for label, files in sorted(selected.items())
            },
        }
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "remote_inventory.json").write_text(
            json.dumps(inventory, indent=2), encoding="utf-8"
        )
        if args.list_only:
            print(json.dumps(inventory, indent=2))
            return

        manifest = []
        for label, files in sorted(selected.items()):
            for index, info in enumerate(files[: args.per_class]):
                suffix = Path(info.filename).suffix.casefold() or ".jpg"
                destination = args.output_dir / "images" / label / f"{index:04d}{suffix}"
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not destination.exists() or destination.stat().st_size == 0:
                    partial = destination.with_suffix(destination.suffix + ".part")
                    with archive.open(info) as source, partial.open("wb") as target:
                        shutil.copyfileobj(source, target)
                    partial.replace(destination)
                manifest.append({
                    "local_path": str(destination.relative_to(args.output_dir)),
                    "class": label,
                    "source_path": info.filename,
                })

    with (args.output_dir / "subset_manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    print(json.dumps({"downloaded_images": len(manifest)}, indent=2))


if __name__ == "__main__":
    main()
