#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator


REPO = Path(__file__).resolve().parents[2]
DECOMPOSE = REPO / "packages" / "decompose"
sys.path.insert(0, str(DECOMPOSE))

from leviosa_decompose import CAROUSEL  # noqa: E402
from leviosa_decompose.decompose import compare_pixels, process_template  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

PIXEL_LIMIT = 0.1


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class Files:
    def __init__(self) -> None:
        self.values: dict[str, tuple[bytes, str]] = {}

    def add(self, path: Path) -> str:
        key = str(len(self.values))
        self.values[key] = (
            path.read_bytes(),
            mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        )
        return key

    def add_document(self, path: Path) -> str:
        value = json.loads(path.read_text(encoding="utf-8"))

        def rewrite(item: Any) -> Any:
            if isinstance(item, dict):
                return {key: rewrite(child) for key, child in item.items()}
            if isinstance(item, list):
                return [rewrite(child) for child in item]
            if isinstance(item, str) and item.startswith("file://"):
                asset = Path(urllib.request.url2pathname(urllib.parse.urlparse(item).path))
                return f"http://127.0.0.1:{self.port}/file/{self.add(asset)}"
            return item

        encoded = json.dumps(rewrite(value), ensure_ascii=False).encode()
        key = str(len(self.values))
        self.values[key] = (
            encoded,
            "application/json",
        )
        return key

    @contextmanager
    def serve(self) -> Iterator[str]:
        self.port = free_port()
        files = self.values

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                key = self.path.rsplit("/", 1)[-1]
                value = files.get(key)
                if value is None:
                    self.send_error(404)
                    return
                body, content_type = value
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, _format: str, *_args: object) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", self.port), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{self.port}"
        finally:
            server.shutdown()
            thread.join()


@contextmanager
def lab_server() -> Iterator[str]:
    port = free_port()
    command = [
        "npx", "--yes", "vite@7.1.5", "--config",
        str(REPO / "apps/detail-page-next-lab/vite.dpnext.config.ts"),
        "--port", str(port), "--strictPort",
    ]
    process = subprocess.Popen(
        command,
        cwd=REPO,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    url = f"http://127.0.0.1:{port}/detail-page-next-lab/"
    try:
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError((process.stderr.read() if process.stderr else "vite failed").strip())
            try:
                urllib.request.urlopen(url, timeout=0.5).close()
                break
            except OSError:
                time.sleep(0.25)
        else:
            raise RuntimeError("lab 서버가 30초 안에 뜨지 않았습니다")
        yield url
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def decompose_html(html_files: list[Path], work: Path) -> list[tuple[Path, Path, float]]:
    results: list[tuple[Path, Path, float]] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--headless=new"])
        try:
            for html in html_files:
                source = html.read_text(encoding="utf-8")
                assets = html.parent / "assets"
                if assets.is_dir():
                    for asset in assets.iterdir():
                        source = re.sub(
                            rf'src="[^"]*/{re.escape(asset.name)}"',
                            f'src="{asset.as_uri()}"',
                            source,
                        )
                staged = work / "input" / html.name
                staged.parent.mkdir(parents=True, exist_ok=True)
                staged.write_text(source, encoding="utf-8")
                target = work / html.stem
                labels = await process_template(browser, staged, target, profile=CAROUSEL)
                for label in labels:
                    results.append((
                        target / f"{label}.canvas.json",
                        target / f"{label}.original.png",
                        0.0,
                    ))
        finally:
            await browser.close()
    return results


def baseline_values(folder: Path) -> dict[str, float]:
    custom = folder / "verify-baseline.json"
    path = custom if custom.exists() else Path(__file__).with_name("carousel-baseline.json")
    return json.loads(path.read_text()) if path.exists() else {}


async def capture(documents: list[tuple[Path, Path | None, float]], out: Path) -> None:
    files = Files()
    parity: list[tuple[str, float, float]] = []
    with files.serve() as file_url, lab_server() as lab_url:
        urls = [(path, original, baseline, f"{file_url}/file/{files.add_document(path)}")
                for path, original, baseline in documents]
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(args=["--headless=new"])
            context = await browser.new_context(device_scale_factor=2)
            await context.add_init_script("delete window.IntersectionObserver")
            page = await context.new_page()
            try:
                for path, original, baseline, url in urls:
                    key = path.stem.removesuffix(".canvas")
                    await page.goto(f"{lab_url}?doc={urllib.parse.quote(url, safe=':/?=&')}")
                    await page.wait_for_function("window.__LEVIOSA_CANVAS_VERIFY__")
                    await page.wait_for_timeout(300)
                    measurement = await page.evaluate("window.__LEVIOSA_CANVAS_VERIFY__()")
                    pages = page.locator("[data-lc-page]")
                    count = await pages.count()
                    if count != len(measurement["pages"]):
                        raise RuntimeError(f"{path}: Stage {len(measurement['pages'])}개, 화면 {count}개")
                    for index in range(count):
                        suffix = "" if count == 1 else f"--{measurement['pages'][index]['id']}"
                        image = out / f"{key}{suffix}.png"
                        await pages.nth(index).screenshot(path=str(image), animations="disabled")
                        if original and count == 1:
                            diff = out / "source-diff" / f"{key}.diff.png"
                            diff.parent.mkdir(exist_ok=True)
                            percent = compare_pixels(original, image, diff, baseline, allowed_drift=PIXEL_LIMIT)
                            measurement["sourcePixelPercent"] = round(percent, 6)
                            measurement["sourcePixelBaseline"] = baseline
                            parity.append((key, percent, baseline))
                    write_json(out / f"{key}.metrics.json", measurement)
            finally:
                await browser.close()
    if parity:
        passed = sum(percent <= baseline + PIXEL_LIMIT for _, percent, baseline in parity)
        print(f"픽셀 비교 {passed}/{len(parity)} 통과")
        failed = [(key, percent, baseline) for key, percent, baseline in parity
                  if percent > baseline + PIXEL_LIMIT]
        if failed:
            details = ", ".join(f"{key} {percent:.3f}% > {baseline:.3f}% + 0.1%p"
                                for key, percent, baseline in failed)
            raise SystemExit(f"픽셀 비교 실패: {details}")


async def snapshot(folder: Path, out: Path) -> None:
    folder = folder.resolve()
    out.mkdir(parents=True, exist_ok=True)
    json_files = [path for path in sorted(folder.rglob("*.json")) if path.name != "baseline.json"]
    documents: list[tuple[Path, Path | None, float]] = []
    baselines = baseline_values(folder)
    for path in json_files:
        try:
            value = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(value, dict) and ("pages" in value or value.get("schema_version") == "detail-document-v2"):
            original = path.with_name(path.name.replace(".canvas.json", ".original.png"))
            documents.append((
                path,
                original if original.exists() else None,
                baselines.get(f"{path.stem.removesuffix('.canvas')}.html", 0.0),
            ))
    html_files = sorted(folder.glob("*.html"))
    if html_files:
        work = out / ".decompose"
        generated = await decompose_html(html_files, work)
        documents.extend((doc, original, baselines.get(f"{doc.parent.name}.html", 0.0))
                         for doc, original, _ in generated)
    if not documents:
        raise SystemExit(f"검사할 JSON/HTML이 없습니다: {folder}")
    await capture(documents, out)
    count = len(documents)
    text_count = sum(len(json.loads(path.read_text())["textNodes"])
                     for path in out.glob("*.metrics.json"))
    print(f"문서 {count}개 / 텍스트 노드 {text_count:,}개")


def indexed(nodes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {node["id"]: node for node in nodes}


def diff(before: Path, after: Path) -> int:
    before_files = {path.name: path for path in before.glob("*.metrics.json")}
    after_files = {path.name: path for path in after.glob("*.metrics.json")}
    names = sorted(before_files.keys() & after_files.keys())
    line_changes = 0
    box_changes = 0
    text_total = 0
    for name in names:
        old = json.loads(before_files[name].read_text())
        new = json.loads(after_files[name].read_text())
        text_total += len(new["textNodes"])
        old_nodes = indexed(old["textNodes"] + old["imageNodes"])
        new_nodes = indexed(new["textNodes"] + new["imageNodes"])
        for node_id in old_nodes.keys() & new_nodes.keys():
            left, right = old_nodes[node_id], new_nodes[node_id]
            if left.get("lineCount") != right.get("lineCount"):
                line_changes += 1
            if (left["width"], left["height"]) != (right["width"], right["height"]):
                box_changes += 1
    pixel_changes = 0
    diff_dir = after / "diff"
    for old_image in sorted(before.glob("*.png")):
        new_image = after / old_image.name
        if not new_image.exists():
            continue
        target = diff_dir / f"{old_image.stem}.diff.png"
        target.parent.mkdir(exist_ok=True)
        percent = compare_pixels(old_image, new_image, target, PIXEL_LIMIT, allowed_drift=0)
        pixel_changes += percent > PIXEL_LIMIT
    if not line_changes and not box_changes and not pixel_changes:
        if diff_dir.exists() and not any(diff_dir.iterdir()):
            diff_dir.rmdir()
        print("변화 없음")
        return 0
    print(f"문서 {len(names)}개 / 텍스트 노드 {text_total:,}개")
    print(f"줄 수 바뀐 노드     {line_changes}")
    print(f"박스 크기 바뀐 노드 {box_changes}")
    print(f"픽셀 0.1% 초과      {pixel_changes}   ({diff_dir})")
    return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="verify")
    commands = parser.add_subparsers(dest="command", required=True)
    take = commands.add_parser("snapshot")
    take.add_argument("folder", type=Path)
    take.add_argument("--out", type=Path, required=True)
    compare = commands.add_parser("diff")
    compare.add_argument("before", type=Path)
    compare.add_argument("after", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "snapshot":
        asyncio.run(snapshot(args.folder, args.out.resolve()))
        return 0
    return diff(args.before.resolve(), args.after.resolve())


if __name__ == "__main__":
    raise SystemExit(main())
