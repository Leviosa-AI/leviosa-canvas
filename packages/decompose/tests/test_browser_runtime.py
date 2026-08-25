import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from leviosa_decompose import decompose


RUNTIME = Path(__file__).resolve().parents[2] / "canvas" / "decompose" / "runtime.js"
SYSTEM_FONTS = (
    Path("/System/Library/Fonts/Geneva.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
)
HTML = """<!doctype html><html><head><style>
* { box-sizing: border-box; margin: 0 }
body { width: 1080px; height: 1350px; background: #f6e3da; font-family: D2Test }
.card { position: absolute; left: 80px; top: 100px; width: 500px; height: 220px;
  padding: 30px; border-radius: 24px; background: #fff; box-shadow: 0 8px 20px #0002 }
h1 { font-size: 48px; line-height: 1.2 }
</style></head><body><div class="card"><h1 data-block="text">같은 측정값</h1></div></body></html>"""


def _server(font_path):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            if self.path == "/runtime.js":
                body, content_type = RUNTIME.read_bytes(), "text/javascript"
            elif self.path.startswith("/font.ttf"):
                body, content_type = font_path.read_bytes(), "font/ttf"
            else:
                body, content_type = b"<!doctype html><body></body>", "text/html"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, requests


def test_playwright_and_iframe_measurements_match_and_font_gate_is_real():
    pytest.importorskip("playwright.async_api")
    font_path = next((path for path in SYSTEM_FONTS if path.exists()), None)
    if not font_path:
        pytest.skip("no system test font")

    async def run():
        from playwright.async_api import async_playwright

        server, requests = _server(font_path)
        origin = f"http://127.0.0.1:{server.server_port}"
        direct_css = f"@font-face{{font-family:D2Test;src:url('{origin}/font.ttf?direct')}}"
        iframe_css = "@font-face{font-family:D2Test;src:url('/font.ttf?iframe')}"
        broken_css = "@font-face{font-family:D2Test;src:url('/missing.ttf')}"
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(args=["--headless=new"])
                try:
                    direct = await browser.new_page(viewport={"width": 1080, "height": 1350})
                    await direct.goto(origin)
                    await direct.set_content(HTML, wait_until="load")
                    await direct.add_style_tag(content=direct_css)
                    report = await direct.evaluate(decompose.FONT_WARMUP_JS, ["D2Test"])
                    assert report["ok"] is True
                    await direct.evaluate("() => new Promise(requestAnimationFrame)")
                    await direct.evaluate("() => new Promise(requestAnimationFrame)")
                    expected = await direct.evaluate(
                        decompose.EXTRACT,
                        {
                            "label": "fixture",
                            "sliceBy": None,
                            "placeholderClass": None,
                            "splitSvgParts": False,
                        },
                    )
                    await direct.close()

                    host = await browser.new_page()
                    await host.goto(origin)
                    actual = await host.evaluate(
                        """async ({origin, html, fontCss}) => {
                          const runtime = await import(origin + '/runtime.js');
                          const measurement = await runtime.measureHtmlInIframe(html, {
                            fontCss, fontFamilies: ['D2Test'], label: 'fixture',
                          });
                          return {measurement, iframeCount: document.querySelectorAll('iframe').length};
                        }""",
                        {"origin": origin, "html": HTML, "fontCss": iframe_css},
                    )
                    assert actual["measurement"] == expected
                    assert actual["iframeCount"] == 0

                    failure = await host.evaluate(
                        """async ({origin, html, fontCss}) => {
                          const runtime = await import(origin + '/runtime.js');
                          try {
                            await runtime.measureHtmlInIframe(html, {
                              fontCss, fontFamilies: ['D2Test'], label: 'fixture',
                            });
                            return null;
                          } catch (error) {
                            return {
                              name: error.name, report: error.report,
                              iframeCount: document.querySelectorAll('iframe').length,
                            };
                          }
                        }""",
                        {"origin": origin, "html": HTML, "fontCss": broken_css},
                    )
                    assert failure["name"] == "FontWarmupError"
                    assert failure["report"]["ok"] is False
                    assert failure["report"]["loaded"] == 0
                    assert failure["report"]["error"] == 1
                    assert failure["iframeCount"] == 0
                    await host.close()
                finally:
                    await browser.close()
        finally:
            server.shutdown()
            server.server_close()

        iframe_faces = [path for path in requests if path == "/font.ttf?iframe"]
        assert len(iframe_faces) == 1
        return len(expected["elements"]), failure["report"], len(iframe_faces)

    fragments, failure_report, iframe_faces = asyncio.run(run())
    print(
        "iframe parity:",
        json.dumps(
            {
                "fragments": fragments,
                "different": 0,
                "broken_font": failure_report,
                "same_origin_faces": iframe_faces,
            },
            ensure_ascii=False,
        ),
    )
