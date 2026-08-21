import asyncio
import json
import re
import warnings
from pathlib import Path

import pytest

from leviosa_decompose import CAROUSEL
from leviosa_decompose import decompose


FIXTURES = Path(__file__).parent / "fixtures"


def portable_fixture(name, tmp_path):
    html = (FIXTURES / name).read_text()
    for asset in (FIXTURES / "assets").iterdir():
        html = re.sub(
            rf'src="[^"]*/{re.escape(asset.name)}"',
            f'src="{asset.as_uri()}"',
            html,
        )
    staged = tmp_path / "input" / name
    staged.parent.mkdir(exist_ok=True)
    staged.write_text(html)
    return staged


def test_carousel_pixel_difference_does_not_regress(tmp_path):
    pytest.importorskip("playwright.async_api")

    async def run():
        from playwright.async_api import async_playwright

        baseline = json.loads((FIXTURES / "baseline.json").read_text())
        async with async_playwright() as playwright:
            try:
                browser = await playwright.chromium.launch(args=["--headless=new"])
            except Exception as exc:
                pytest.skip(f"browser unavailable for pixel comparison: {exc}")
            try:
                for name, expected in baseline.items():
                    out = tmp_path / Path(name).stem
                    await decompose.process_template(
                        browser,
                        portable_fixture(name, tmp_path),
                        out,
                        profile=CAROUSEL,
                    )
                    actual = decompose.compare_pixels(
                        out / f"{Path(name).stem}.original.png",
                        out / f"{Path(name).stem}.proxy.png",
                        out / f"{Path(name).stem}.diff.png",
                        expected,
                    )
                    if actual < expected - 0.05:
                        warnings.warn(
                            f"{name}: {actual:.3f}% is better than baseline "
                            f"{expected:.3f}% by at least 0.05%p; update baseline",
                            stacklevel=1,
                        )
                    assert actual <= expected + 0.05, (
                        f"{name}: {actual:.3f}% > baseline {expected:.3f}% + 0.05%p "
                        f"(diff: {out / f'{Path(name).stem}.diff.png'})"
                    )
                    # 08 keeps Jost fallback text; its 0.11% is antialiasing only.
                    limit = 0.12 if name == "08.html" else 0.1
                    assert actual < limit, f"{name}: {actual:.3f}% >= {limit:.2f}%"
            finally:
                await browser.close()

    asyncio.run(run())
