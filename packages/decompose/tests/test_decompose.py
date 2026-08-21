"""Tests for the Canvas mapping layer of ``scripts/html_to_canvas_proto.py``.

The browser-side extraction (``EXTRACT``) is exercised end-to-end by the
decomposer CLI; here we lock the pure-Python mapping (``_canvas_element`` /
``to_canvas``) that turns extracted elements into editable Canvas JSON.

Two behaviours matter for the detail-page editor and are pinned below:

* **Every text background is its own shape.** The extractor emits a badge/chip
  as a separate ``box`` element plus a plain ``text`` element (``bg=""``); the
  mapper must never resurrect an inline ``backgroundEnabled`` for such text, and
  must vertically centre the text over its box.
* **A colour-split line stays one unit.** A ``group`` element wraps the
  fragments of a line that had to be split (Canvas text holds a single colour),
  and the mapper must emit a real ``type:"group"`` whose children keep their
  absolute page coordinates and stay locked decoration (never slots).
"""

import copy
from pathlib import Path

import pytest

from leviosa_decompose import decompose as proto


class _DecomposerRuntime:
    """브라우저 프로세스 하나를 모듈의 browser E2E들이 재사용한다."""

    def __init__(self):
        self.loop = None
        self.playwright = None
        self.browser = None

    def _start(self):
        import asyncio

        pytest.importorskip("playwright.async_api")
        from playwright.async_api import async_playwright

        self.loop = asyncio.new_event_loop()
        try:
            self.playwright = self.loop.run_until_complete(async_playwright().start())
            self.browser = self.loop.run_until_complete(
                self.playwright.chromium.launch(args=["--headless=new"])
            )
        except Exception as exc:  # browser binary가 없는 환경만 skip한다.
            self.close()
            pytest.skip(f"browser unavailable for e2e decompose: {exc}")

    def process(self, html_path, out_dir, sections):
        if self.browser is None:
            self._start()
        # 이 모듈의 브라우저 테스트는 모두 자체 ``sans-serif`` fixture로 DOM 추출
        # 구조를 검증한다. 원격 render-fonts의 가용성은 전용 font-warmup 테스트에서
        # 따로 잠그므로, 여기서는 외부 요청 없이 결정적인 시스템 폰트로 측정한다.
        original_families = proto.BUNDLE_FONT_FAMILIES
        original_family_names = proto.BUNDLE_FONT_FAMILY_NAMES
        original_warmup = proto.FONT_WARMUP_JS
        proto.BUNDLE_FONT_FAMILIES = ()
        proto.BUNDLE_FONT_FAMILY_NAMES = ()
        proto.FONT_WARMUP_JS = "async () => ({ok: true})"
        try:
            self.loop.run_until_complete(
                proto.process_template(
                    self.browser,
                    html_path,
                    out_dir,
                    sections,
                )
            )
        finally:
            proto.BUNDLE_FONT_FAMILIES = original_families
            proto.BUNDLE_FONT_FAMILY_NAMES = original_family_names
            proto.FONT_WARMUP_JS = original_warmup

    def close(self):
        if self.loop is None:
            return
        if self.browser is not None:
            self.loop.run_until_complete(self.browser.close())
        if self.playwright is not None:
            self.loop.run_until_complete(self.playwright.stop())
        self.loop.close()
        self.loop = None
        self.playwright = None
        self.browser = None


_decomposer_runtime = None
_decompose_cache = {}


@pytest.fixture(scope="module", autouse=True)
def _reuse_decomposer_browser():
    """필요한 첫 E2E에서만 Chromium을 띄우고 모듈 종료 때 확실히 닫는다."""

    global _decomposer_runtime
    runtime = _DecomposerRuntime()
    _decomposer_runtime = runtime
    _decompose_cache.clear()
    yield
    runtime.close()
    _decompose_cache.clear()
    _decomposer_runtime = None


def _box(x, y, w, h, rotation=0):
    return {"x": x, "y": y, "width": w, "height": h, "rotation": rotation}


def _text_element(**overrides):
    """A minimal extracted ``text`` element with sane defaults."""

    element = {
        "kind": "text",
        "box": _box(0, 0, 100, 30),
        "text": "안녕",
        "color": "rgb(58, 26, 58)",
        "fontSize": 20,
        "fontFamily": "Pretendard Variable",
        "fontWeight": "600",
        "textAlign": "start",
        "lineHeight": "30px",
        "opacity": 1,
        "run": False,
        "slot": False,
        "tag": "P",
        "vcenter": False,
        "decoration": "",
        "fontStyle": "normal",
        "textTransform": "none",
        "strokeWidth": 0,
        "strokeColor": "",
        "bg": "",
    }
    element.update(overrides)
    return element


def _chip_box(**overrides):
    """The standalone background rectangle the extractor emits behind a badge."""

    element = {
        "kind": "box",
        "box": _box(48, 96, 163, 40),
        "fill": "rgb(123, 214, 255)",
        "gradient": "",
        "shadow": "none",
        "radius": 20,
        "borderWidth": 0,
        "borderColor": "rgb(0,0,0)",
        "borderStyle": "none",
        "opacity": 1,
    }
    element.update(overrides)
    return element


def _image_element(**overrides):
    """A minimal extracted ``image`` element (a .ph photo slot)."""

    element = {
        "kind": "image",
        "box": _box(45, 45, 430, 430),
        "src": "",
        "ph": "",
        "phBg": "",
        "phBgImage": 'url("assets/cica_leaf.jpg")',
        "objectFit": "cover",
        "objectPosition": "50% 50%",
        "naturalWidth": 1024,
        "naturalHeight": 1536,
        "radius": 999,
        "slot": True,
        "tag": "img",
    }
    element.update(overrides)
    return element


def test_round_image_mask_maps_to_corner_radius():
    """A .ph photo with a large border-radius (a circular mask like the 5D CICA
    leaf disc) carries cornerRadius = half the box, so it renders as a circle."""

    el = proto._canvas_element(_image_element(), "img-1")
    assert el["type"] == "image"
    # 430x430 disc: cornerRadius clamps to half (215), a true circle.
    assert el["cornerRadius"] == 215


def test_rounded_card_image_keeps_small_corner_radius():
    """A product card image with an 18px border keeps its modest rounded corner,
    not clamped to a circle."""

    el = proto._canvas_element(
        _image_element(box=_box(0, 0, 308, 380), radius=18), "img-2"
    )
    assert el["cornerRadius"] == 18


def test_square_image_has_no_corner_radius():
    """An image with no border-radius stays a hard rectangle (no cornerRadius)."""

    el = proto._canvas_element(_image_element(radius=0), "img-3")
    assert "cornerRadius" not in el


def test_cover_object_position_maps_to_final_box_ratio_crop():
    image = proto._canvas_element(
        _image_element(
            box=_box(0, 0, 1080, 860),
            objectPosition="50% 28%",
        ),
        "img-4",
    )

    assert image["cropX"] == 0
    assert image["cropY"] == pytest.approx(0.13136, abs=0.00001)
    assert image["cropWidth"] == 1
    assert image["cropHeight"] == pytest.approx(0.53086, abs=0.00001)


def _border_box(borders, **overrides):
    """An extracted ``box`` element carrying per-side border info."""

    element = {
        "kind": "box",
        "box": _box(56, 100, 638, 120),
        "fill": "rgba(0, 0, 0, 0)",
        "gradient": "",
        "shadow": "none",
        "radius": 0,
        "borderWidth": 0,
        "borderColor": "rgb(51, 51, 51)",
        "borderStyle": "none",
        "borders": borders,
        "opacity": 1,
    }
    element.update(overrides)
    return element


def _side(w=0, c="", st="none"):
    return {"w": w, "c": c, "st": st}


def test_single_side_border_is_a_thin_line_not_a_full_stroke():
    """A box that draws only a border-bottom (a spec-table row divider) must NOT
    become a uniform four-sided rect stroke — the canvas editor's stroke is uniform, so it
    would paint a full black rectangle where the source has one 1px rule. The rect
    keeps strokeWidth 0 and the divider is emitted as its own thin rect line sitting
    on the bottom edge."""
    e = _border_box(
        {
            "top": _side(),
            "right": _side(),
            "bottom": _side(1, "rgb(228, 232, 221)", "solid"),
            "left": _side(),
        }
    )
    node = proto._canvas_element(e, "row")
    assert node["strokeWidth"] == 0, "no uniform full-box stroke for a one-side border"
    lines = proto._side_border_lines(e, "row")
    assert len(lines) == 1, "the single border side becomes one thin rect line"
    ln = lines[0]
    assert ln["type"] == "figure" and ln["subType"] == "rect"
    assert ln["fill"] == "rgb(228, 232, 221)", "the line carries the border colour"
    assert ln["height"] == 1, "a 1px border-bottom is a 1px-tall bar"
    assert ln["width"] == 638, "the bar spans the box width"
    assert ln["y"] == 100 + 120 - 1, "the bar sits on the bottom edge"
    assert ln["x"] == 56


def test_top_rule_line_sits_on_the_top_edge():
    """A container's border-top (a spec table's top rule) becomes a bar on the top
    edge, keeping its full width and colour."""
    e = _border_box(
        {
            "top": _side(2, "rgb(51, 51, 51)", "solid"),
            "right": _side(),
            "bottom": _side(),
            "left": _side(),
        }
    )
    assert proto._canvas_element(e, "tbl")["strokeWidth"] == 0
    lines = proto._side_border_lines(e, "tbl")
    assert len(lines) == 1
    assert lines[0]["y"] == 100 and lines[0]["height"] == 2


def test_full_uniform_border_keeps_its_rect_stroke():
    """A real four-side outline (a pill, a card ``border:2px solid``) keeps the canvas editor's
    uniform rect stroke and emits no extra line elements."""
    side = _side(2, "rgb(185, 220, 180)", "solid")
    e = _border_box(
        {"top": side, "right": side, "bottom": side, "left": side},
        box=_box(0, 0, 206, 65),
        fill="rgb(234, 244, 230)",
        radius=18,
        borderWidth=2,
        borderColor="rgb(185, 220, 180)",
        borderStyle="solid",
    )
    node = proto._canvas_element(e, "pill")
    assert node["strokeWidth"] == 2, "a full four-side border stays a uniform stroke"
    assert proto._side_border_lines(e, "pill") == [], "no thin lines for a full border"


def test_contain_slot_box_shrinks_to_painted_image_rect(tmp_path):
    """A background-size:contain slot emits the aspect-fitted, centred rect.

    The live Canvas canvas cover-fills the element box (no object-fit), so a tall
    frame around a narrow product shot would crop the photo. Emitting the box as
    the contain-painted rect makes cover-fill show the whole image — the source's
    contain framing, reproduced. Here a 100x400 image in a 200x600 frame fits to
    height (scale 1.5 -> 150x600) and centres horizontally.
    """
    from PIL import Image
    from urllib.request import pathname2url

    img_path = tmp_path / "hero_bottle.png"
    Image.new("RGB", (100, 400), "green").save(img_path)
    url = f'url("file://{pathname2url(str(img_path))}")'

    el = proto._canvas_element(
        _image_element(
            box=_box(100, 100, 200, 600),
            objectFit="fill",
            phBgSize="contain",
            phBgImage=url,
            radius=0,
        ),
        "hero-slot",
    )
    assert (el["width"], el["height"]) == (150, 600)
    assert (el["x"], el["y"]) == (125, 100)


def test_cover_slot_box_is_left_untouched(tmp_path):
    """A cover/fill slot keeps its full frame — only contain letterboxes."""

    from PIL import Image
    from urllib.request import pathname2url

    img_path = tmp_path / "splash.png"
    Image.new("RGB", (100, 400), "green").save(img_path)
    url = f'url("file://{pathname2url(str(img_path))}")'

    el = proto._canvas_element(
        _image_element(
            box=_box(100, 100, 200, 600),
            objectFit="cover",
            phBgSize="cover",
            phBgImage=url,
            radius=0,
        ),
        "cover-slot",
    )
    assert (el["x"], el["y"], el["width"], el["height"]) == (100, 100, 200, 600)


def _txt(x, y, w, h, text="값", align="left"):
    return {
        "type": "text",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "text": text,
        "align": align,
    }


def test_single_line_text_gets_headroom_into_empty_space():
    """A left-aligned single-line label with room to its right is widened a bit."""

    children = [_txt(400, 100, 109, 22, "62.04% 개선")]
    proto._relieve_single_line_text_wrap(children, proto.CANVAS)
    # 109 + ceil(6%) -> at least +7px of headroom, bounded only by the page edge.
    assert children[0]["width"] >= 115


def test_headroom_never_crosses_a_right_neighbour():
    """The label stops short of the next element on its row — no overlap ever."""

    children = [
        _txt(300, 100, 62, 22, "· 속 피지"),  # blocked by the run to its right
        _txt(368, 100, 19, 22, "2)"),
    ]
    proto._relieve_single_line_text_wrap(children, proto.CANVAS)
    # 305..367 must not grow into the "2)" fragment starting at 368 (gap kept).
    assert children[0]["x"] + children[0]["width"] <= 368


def test_centred_and_multiline_text_are_left_alone():
    """Only start/left single-line text is cushioned; centred or wrapped stay put."""

    centred = _txt(100, 100, 120, 30, "가운데", align="center")
    wrapped = _txt(100, 200, 120, 60, "첫 줄\n둘째 줄", align="left")
    children = [centred, wrapped]
    proto._relieve_single_line_text_wrap(children, proto.CANVAS)
    assert centred["width"] == 120
    assert wrapped["width"] == 120


def _run(x, y, w, h, text, align="left"):
    return {**_txt(x, y, w, h, text, align), "custom": {"run": True}}


def test_narrow_centred_run_fragment_widens_right_and_reanchors():
    """A snug centred RUN fragment — a trailing superscript "3)4)5)" after a
    centred headline whose left neighbour "100%" is flush against it — cannot
    widen symmetrically, so it re-anchors to the left and grows into the empty
    space on its right. That removes the one-line-marker wrap without moving the
    glyphs (``x`` is unchanged)."""

    headline = _run(300, 998, 264, 63, "만족도", align="center")  # ends at 564
    marker = _run(565, 998, 54, 25, "3)4)5)", align="center")
    children = [headline, marker]
    proto._relieve_single_line_text_wrap(children, proto.CANVAS)
    assert marker["align"] == "left"  # re-anchored so the glyphs stay at x
    assert marker["x"] == 565  # left edge unchanged
    assert marker["width"] > 54  # widened into the empty space on the right


def test_wide_centred_run_fragment_is_not_reanchored():
    """The re-anchor is guarded to NARROW marker-sized fragments: a genuinely
    centred label sitting in a wide slot keeps its centre alignment and width."""

    wide = _run(100, 100, 300, 40, "가운데 정렬 유지", align="center")
    proto._relieve_single_line_text_wrap([wide], proto.CANVAS)
    assert wide["align"] == "center"
    assert wide["width"] == 300


def test_badge_text_carries_no_inline_background_and_centres_over_its_box():
    """A badge's text element is plain + vertically centred; the fill is a box."""

    box = _chip_box()
    text = _text_element(
        box=_box(62, 96, 135, 40), text="🍬 시험기간 필수템", vcenter=True
    )
    sec = {
        "label": "hero",
        "height": 900,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [box, text],
    }

    children = proto.to_canvas(sec)["pages"][0]["children"]
    # children[0] is the section background; then the chip box, then the text.
    chip = children[1]
    badge_text = children[2]

    assert chip["type"] == "figure" and chip["subType"] == "rect"
    assert chip["fill"] == "rgb(123, 214, 255)"
    assert chip["cornerRadius"] == 20

    assert badge_text["type"] == "text"
    assert badge_text["text"] == "🍬 시험기간 필수템"
    # The text never re-grows an inline background of its own ...
    assert "backgroundEnabled" not in badge_text
    assert "backgroundColor" not in badge_text
    # ... and sits centred over its separate box.
    assert badge_text["verticalAlign"] == "center"


def test_plain_text_has_no_background_or_vertical_align():
    sec = {
        "label": "body",
        "height": 600,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [_text_element(text="본문 한 줄")],
    }
    text = proto.to_canvas(sec)["pages"][0]["children"][1]
    assert "backgroundEnabled" not in text
    assert "verticalAlign" not in text
    # A start-aligned block with no hcenter hint stays left -- the horizontal
    # mirror must never over-centre ordinary copy.
    assert text["align"] == "start"


def test_ls_px_parses_computed_letter_spacing():
    # getComputedStyle always yields px, but em/rem are parsed for safety.
    assert proto._ls_px("normal") == 0.0
    assert proto._ls_px("") == 0.0
    assert proto._ls_px(None) == 0.0
    assert proto._ls_px("-0.8px") == -0.8
    assert proto._ls_px("2px") == 2.0
    assert proto._ls_px("-0.02em", font_size=40) == -0.8
    assert proto._ls_px(-0.5) == -0.5


def test_negative_letter_spacing_is_emitted_as_em_so_editor_matches_the_box():
    """The box width is measured WITH 자간 (getBoundingClientRect); the editor's
    Konva measures without it and re-wraps. Emitting letterSpacing keeps the
    editor render at the same width the box was sized for. Canvas multiplies
    letterSpacing by fontSize, so the value must be an EM ratio (px / fontSize),
    never raw px (which would crush every glyph onto the next)."""

    el = proto._canvas_element(
        _text_element(text="모두 모아 한병으로", fontSize=40, letterSpacing="-0.8px"),
        "run-1",
    )
    assert el["type"] == "text"
    # -0.8px at fontSize 40 -> -0.02em; Canvas renders -0.02 * 40 = -0.8px.
    assert el["letterSpacing"] == -0.02


def test_zero_or_normal_letter_spacing_is_omitted():
    for value in ("normal", "0px", None):
        el = proto._canvas_element(_text_element(text="본문", letterSpacing=value), "t")
        assert "letterSpacing" not in el


def test_flex_centred_badge_text_is_horizontally_centred():
    """A number/icon dot (display:flex; justify-content:center) centres its glyph.

    Its computed ``text-align`` stays ``start``, so the extractor flags ``hcenter``
    (the horizontal analog of ``vcenter``); the mapper must emit ``align:"center"``
    so the glyph sits centred instead of hugging the left edge of a box far wider
    than it.
    """

    sec = {
        "label": "detail",
        "height": 600,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [
            _chip_box(box=_box(72, 830, 52, 52), fill="rgb(255, 78, 154)", radius=16),
            _text_element(
                box=_box(72, 830, 52, 52),
                text="1",
                textAlign="start",
                hcenter=True,
                vcenter=True,
            ),
        ],
    }

    dot = proto.to_canvas(sec)["pages"][0]["children"][2]
    assert dot["type"] == "text" and dot["text"] == "1"
    # hcenter overrides the source text-align:start on both axes.
    assert dot["align"] == "center"
    assert dot["verticalAlign"] == "center"


def test_vcenter_single_line_badge_is_vertically_pre_centred():
    """A one-line badge is pre-centred in ``y``, not left to ``verticalAlign``.

    Canvas collapses a text element's height to one line on load and anchors it
    at ``y``, so ``verticalAlign:center`` is a no-op in a tall badge box and the
    glyph clings to the top. The mapper shifts ``y`` down half the slack and pins
    the height to one line, so the collapse leaves the text at the box centre.
    """

    box = _chip_box(box=_box(72, 830, 52, 52), fill="rgb(255, 78, 154)", radius=16)
    # fontSize 20, lineHeight "30px" -> one line is 30 tall in a 52 box.
    # vcenterFlex marks a genuine flex align-items:center badge (not a mere chip).
    text = _text_element(
        box=_box(72, 830, 52, 52), text="1", vcenter=True, vcenterFlex=True
    )
    sec = {
        "label": "detail",
        "height": 600,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [box, text],
    }

    dot = proto.to_canvas(sec)["pages"][0]["children"][2]
    assert dot["type"] == "text" and dot["text"] == "1"
    assert dot["verticalAlign"] == "center"
    # Height pinned to one line (30), not the 52 box, and y shifted to centre it.
    assert dot["height"] == 30
    assert dot["y"] == 841  # 830 + (52 - 30) / 2
    # Text centre now equals the box centre (830 + 26 = 856).
    assert dot["y"] + dot["height"] / 2 == 856


def test_sticker_flag_maps_to_centre_align():
    """A multi-line decorative sticker (stickerCenter) centres both lines.

    The JS extractor flags a small multi-line chip as ``stickerCenter`` and hands
    the text the full chip width (so its widest line never re-wraps); the mapper
    must then emit ``align:"center"`` even though the source ``text-align`` is the
    default ``start``.
    """

    box = _chip_box(box=_box(80, 474, 147, 88), fill="rgb(123, 214, 255)", radius=18)
    text = _text_element(
        box=_box(80, 474, 147, 88),
        text="🎒 책가방에\n쏙!",
        textAlign="start",
        stickerCenter=True,
        vcenter=True,
    )
    sec = {
        "label": "hero",
        "height": 900,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [box, text],
    }

    sticker = proto.to_canvas(sec)["pages"][0]["children"][2]
    assert sticker["type"] == "text" and "\n" in sticker["text"]
    # stickerCenter overrides the source text-align:start.
    assert sticker["align"] == "center"
    # Its two known lines (explicit "\n", box widened so neither re-wraps) are
    # also pre-centred vertically: height pinned to 2 lines, y shifted to centre.
    assert sticker["height"] == 60  # 2 lines * 30
    assert sticker["y"] == 488  # 474 + (88 - 60) / 2
    assert sticker["y"] + sticker["height"] / 2 == 518  # == box centre (474 + 44)


def test_colour_split_line_becomes_one_group_with_absolute_children():
    """The pink emphasis keeps its colour as its own child; the line is a group."""

    group = {
        "kind": "group",
        "box": _box(48, 1012, 654, 74),
        "children": [
            _chip_box(
                box=_box(48, 1012, 654, 74), fill="rgb(255, 244, 214)", radius=16
            ),
            _text_element(
                box=_box(74, 1037, 225, 24), text="💡 녹차 한 잔(15~30mg)의", run=True
            ),
            _text_element(
                box=_box(303, 1037, 51, 24),
                text="약 7배",
                color="rgb(255, 78, 154)",
                run=True,
            ),
            _text_element(
                box=_box(354, 1037, 219, 24),
                text="를 한 번에 섭취할 수 있어요.",
                run=True,
            ),
        ],
    }
    sec = {
        "label": "solution-1",
        "height": 1200,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [group],
    }

    mapped = proto.to_canvas(sec)["pages"][0]["children"][1]
    assert mapped["type"] == "group"
    # The wrapper is locked design, not an editable slot candidate.
    assert mapped["custom"].get("slotCandidate") is not True
    # The group must carry NO transform of its own. Its children hold absolute
    # page coordinates, and a Konva/Canvas group translates children by the
    # group's x/y — a non-zero origin (the old bug: the group inherited its
    # bounding-box x/y) double-offsets every fragment, shoving the line off its
    # card and overlapping neighbours.
    assert mapped["x"] == 0 and mapped["y"] == 0

    kids = mapped["children"]
    assert [k["type"] for k in kids] == ["figure", "text", "text", "text"]
    # The pink emphasis run keeps its own colour (Canvas text is single-fill, so
    # this is exactly why the line had to be split and then grouped).
    pink = next(k for k in kids if k.get("text") == "약 7배")
    assert pink["fill"] == "rgb(255, 78, 154)"
    # Children keep absolute page coordinates (the group has no offset), so the
    # first run sits at its real x/y, not rebased to the group.
    first_run = kids[1]
    assert first_run["x"] == 74 and first_run["y"] == 1037
    # Unique ids per child so the editor never collides two run fragments.
    assert len({k["id"] for k in kids}) == len(kids)


# --------------------------------------------------------------------------- #
# End-to-end browser extraction (the ``EXTRACT`` JS): in-label font-size
# emphasis. A painted stat badge whose label enlarges its number and shrinks
# its unit ("진정 57.03% 개선") must decompose into per-run text fragments that
# KEEP each run's own fontSize, not one flat run at the chip's base size. This
# runs the real decomposer via Chromium, so it is skipped when the browser is
# unavailable (the pure-Python mapping tests above still cover the JSON layer).
# --------------------------------------------------------------------------- #

_EMPH_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:60px 56px;background:#eef6ea}
.up{font-size:1.7em;font-weight:800;line-height:1}
.dn{font-size:0.6em;font-weight:700}
.badge{background:#ff5b5b;color:#fff;padding:10px 26px;border-radius:999px;
  font-weight:700;font-size:19px;display:inline-block}
.plain{background:#54b26a;color:#fff;padding:10px 26px;border-radius:999px;
  font-weight:700;font-size:19px;display:inline-block}
</style></head><body><div class="dp">
<section data-screen-label="emph"><div style="text-align:center">
  <span class="badge">물리적 자극 진정 <b class="up" style="color:#ffe000">57.03</b><span
    class="dn" style="color:#ffe000">%</span> 개선</span>
  <span class="plain">순한 진정 케어</span>
</div></section>
</div></body></html>"""


def _run_decomposer(tmp_path):
    """Decompose the emphasis fixture with the real browser; return its JSON.

    Skips the test (not fails) when Chromium/Playwright is not installed, so the
    suite still passes in a browser-less CI while the behaviour is pinned where
    a browser exists.
    """
    import json

    cache_key = (_EMPH_HTML, "emph")
    if cache_key in _decompose_cache:
        return copy.deepcopy(_decompose_cache[cache_key])

    html = tmp_path / "emph_fixture.html"
    html.write_text(_EMPH_HTML, encoding="utf-8")
    out = tmp_path / "out"

    _decomposer_runtime.process(html, out, ["emph"])

    # process_template writes <out_dir>/<label>.canvas.json directly (the CLI's
    # per-template stem subfolder is added by main(), not process_template).
    data = json.loads((out / "emph.canvas.json").read_text(encoding="utf-8"))
    children = data["pages"][0]["children"]
    _decompose_cache[cache_key] = children
    return copy.deepcopy(children)


def test_painted_badge_preserves_per_run_font_size_emphasis(tmp_path):
    """The enlarged number and shrunk unit survive as their own sized runs."""

    children = _run_decomposer(tmp_path)
    groups = [c for c in children if c.get("type") == "group"]
    # The emphasised badge splits into a group (pill box + sized text runs).
    assert groups, "expected the size-emphasis badge to split into a group"
    runs = [c for g in groups for c in g["children"] if c.get("type") == "text"]
    by_text = {r["text"]: r for r in runs}

    assert "57.03" in by_text and "개선" in by_text
    base = by_text["개선"]["fontSize"]  # the chip's own base size (19)
    # The number is markedly larger; the unit markedly smaller than the base.
    assert by_text["57.03"]["fontSize"] > base * 1.4
    pct = by_text.get("%") or by_text.get("％")
    assert pct is not None and pct["fontSize"] < base * 0.8
    # The pill background is preserved as a coral figure behind the runs.
    figs = [c for g in groups for c in g["children"] if c.get("type") == "figure"]
    assert any("255, 91, 91" in (f.get("fill") or "") for f in figs)


def test_uniform_badge_stays_one_editable_run(tmp_path):
    """A badge with NO internal size variation is NOT split — stays one label.

    Guards the blast radius: only genuine per-glyph size emphasis triggers the
    split; an ordinary single-size chip keeps its whole label as one intact run
    (here nested in the shared group with the sibling badge, but never fragmented
    into per-glyph pieces).
    """

    def _all_texts(nodes):
        for n in nodes:
            if n.get("type") == "text":
                yield n
            elif n.get("type") == "group":
                yield from _all_texts(n.get("children") or [])

    texts = list(_all_texts(_run_decomposer(tmp_path)))
    # The uniform chip's whole label survives as exactly one intact run — not
    # broken into several per-glyph fragments the way the emphasis badge is.
    uniform = [t for t in texts if t.get("text") == "순한 진정 케어"]
    assert len(uniform) == 1, "a uniform-size badge must stay one un-split run"


# --------------------------------------------------------------------------- #
# Superscript flattening + small-chip full-width centring. Both defend against
# the decompose-vs-editor font-metric mismatch: a raised <sup> footnote marker
# must not split its paragraph into per-fragment runs (whose seams drift under
# the editor font and float the marker), and a small keyword chip must not have
# its label inset by the chip padding (which re-wraps the last syllable out of
# the pill, "트러블" -> "트러"). These run the real decomposer via Chromium.
# --------------------------------------------------------------------------- #

_SUP_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:60px 56px;background:#eef6ea}
.dp sup{font-size:0.4em;font-weight:600;vertical-align:top;position:relative;top:-0.15em}
.pill{background:#54b26a;color:#fff;font-size:18px;padding:4px 14px;
  border-radius:999px;display:inline-block}
</style></head><body><div class="dp">
<section data-screen-label="sup"><div style="text-align:center">
  <p style="font-size:23px">반복되는 트러블<sup>*</sup> 때문에 힘들어요</p>
  <div style="margin-top:20px"><span class="pill">피지컨트롤세럼</span></div>
</div></section>
</div></body></html>"""


def _decompose_html(tmp_path, html, label):
    """Run the real decomposer on an arbitrary one-section fixture."""
    import json

    cache_key = (html, label)
    if cache_key in _decompose_cache:
        return copy.deepcopy(_decompose_cache[cache_key])

    src = tmp_path / f"{label}_fixture.html"
    src.write_text(html, encoding="utf-8")
    out = tmp_path / "out"

    _decomposer_runtime.process(src, out, [label])

    data = json.loads((out / f"{label}.canvas.json").read_text(encoding="utf-8"))
    children = data["pages"][0]["children"]
    _decompose_cache[cache_key] = children
    return copy.deepcopy(children)


def _iter_text(nodes):
    for n in nodes:
        if n.get("type") == "text":
            yield n
        elif n.get("type") == "group":
            yield from _iter_text(n.get("children") or [])


def test_superscript_marker_keeps_paragraph_one_element(tmp_path):
    """A paragraph whose only emphasis is a <sup> footnote marker stays ONE
    text element, and the marker survives inline at (near) the base size.

    A lone <sup>/<sub> is never a split trigger in ``hasSpecial`` — a paragraph
    with no other emphasis is not fragmented into per-fragment runs (which would
    misalign under the editor font and float the mark), so it stays one editable
    element with the marker inline. (When a line splits for another reason, the
    marker instead rides along as its own small raised run — see the value-row
    test below.)
    """

    texts = list(_iter_text(_decompose_html(tmp_path, _SUP_HTML, "sup")))
    para = [t for t in texts if "때문에 힘들어요" in (t.get("text") or "")]
    assert len(para) == 1, "the sup paragraph must stay one un-fragmented element"
    whole = para[0]
    assert "반복되는" in whole["text"] and "트러블" in whole["text"]
    assert "*" in whole["text"], "the footnote marker stays inline in the copy"
    # No tiny lone-'*' fragment split off at a shrunken superscript size.
    lone = [t for t in texts if (t.get("text") or "").strip() == "*"]
    assert not lone, "the marker must not fragment an otherwise-plain paragraph"


_BOLD_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:60px 56px;background:#fff}
.dp p{font-size:23px;font-weight:400;color:#222}
.dp b{font-weight:700}
</style></head><body><div class="dp">
<section data-screen-label="bold"><div style="text-align:center">
  <p>지속되는 <b>피지</b> 고민</p>
</div></section>
</div></body></html>"""


def test_inline_bold_run_splits_to_keep_its_weight(tmp_path):
    """An inline <b> (same colour/size, only heavier weight) splits into its own
    run so Konva keeps the bold: a single Canvas text element renders one weight,
    so a flattened paragraph would drop the emphasis entirely."""
    texts = list(_iter_text(_decompose_html(tmp_path, _BOLD_HTML, "bold")))
    bold = [t for t in texts if (t.get("text") or "").strip() == "피지"]
    assert len(bold) == 1, "the inline <b> word must split into its own run"
    assert int(bold[0]["fontWeight"]) >= 600, "the bold run keeps its heavier weight"
    # the surrounding copy stays a separate, lighter run (not merged with the bold)
    rest = [t for t in texts if "지속되는" in (t.get("text") or "")]
    assert rest and all("피지" not in (t.get("text") or "") for t in rest), (
        "the bold word must not stay flattened into the base paragraph"
    )


_MULTILINE_BOLD_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:60px 56px;background:#eef6ea}
.bub{background:#fff;border-radius:42px;padding:34px 36px;font-size:23px;line-height:1.55}
</style></head><body><div class="dp">
<section data-screen-label="ml"><div class="bub">피지 때문에 <b>유분은 폭발하고<br/>피부 속은 건조해요</b> 😂</div></section>
</div></body></html>"""


def test_bold_spanning_explicit_br_splits_per_line_keeping_weight(tmp_path):
    """A <b> that contains an explicit <br> (emphasis spans two lines) splits per
    visual line so each bold line keeps weight 700. The hard break makes the split
    safe — each line lands at its own real rect, no overlap — unlike a fluid
    soft-wrap (no <br>), which stays one block to avoid the first-line-indent
    overlap. Without this a multi-line chat-bubble <b> flattens to weight-400 and
    loses its bold entirely."""
    texts = list(_iter_text(_decompose_html(tmp_path, _MULTILINE_BOLD_HTML, "ml")))
    b1 = [t for t in texts if (t.get("text") or "").strip() == "유분은 폭발하고"]
    b2 = [t for t in texts if (t.get("text") or "").strip() == "피부 속은 건조해요"]
    assert b1 and b2, "each bold line splits into its own run"
    assert int(b1[0]["fontWeight"]) >= 600 and int(b2[0]["fontWeight"]) >= 600, (
        "both bold lines keep their heavier weight"
    )
    # the second bold line sits below the first (per-line split, no overlap)
    assert b2[0]["y"] > b1[0]["y"], "the second bold line is below the first"


_SUP_CHIP_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:23px 36px;background:#f6f5f0}
.chip{background:#ff5b5b;color:#fff;font-size:18px;font-weight:800;
  padding:4px 14px;border-radius:8px}
.dp sup{font-size:0.4em;font-weight:600;vertical-align:top;position:relative;top:-0.15em}
</style></head><body><div class="dp">
<section data-screen-label="chip"><div class="card" style="display:grid;
  grid-template-columns:minmax(0,auto) 1fr;gap:28px;align-items:center;">
  <div><span class="chip">트러블<sup>*</sup> 원인</span>
    <h3 style="margin-top:10px;font-size:26px;">과잉 피지 컨트롤</h3></div>
  <div style="font-size:19px;">· 속 피지 개선</div>
</div></section>
</div></body></html>"""


def test_sup_chip_splits_so_marker_renders_small(tmp_path):
    """A small single-line painted chip whose only emphasis is a <sup> still splits.
    Konva cannot draw an inline superscript, so a flattened chip renders the "*" at
    full size and crushes the pill's centring; splitting emits the marker as its own
    small raised run. (A multi-line body paragraph with a lone sup is NOT split — the
    sup-skip guard holds — because this is scoped to one-line chips.)"""
    texts = list(_iter_text(_decompose_html(tmp_path, _SUP_CHIP_HTML, "chip")))
    label = [t for t in texts if (t.get("text") or "").strip() == "트러블"]
    star = [t for t in texts if (t.get("text") or "").strip() == "*"]
    assert label, "the chip splits into runs (the label is its own run)"
    assert star, "the footnote marker is its own run"
    assert star[0]["fontSize"] < 14, "the marker renders small (a raised superscript)"


_BANNER_SUP_CHIP_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif;font-size:18px}
.dp section{padding:60px 56px;background:#fff}
.dp sup{font-size:0.6em;vertical-align:top}
</style></head><body><div class="dp">
<section data-screen-label="banner"><div style="text-align:center;"><span
  style="background:#2e6b3e;color:#fff;padding:10px 22px;border-radius:8px;font-weight:700;font-size:19px;"
  >장벽이 약해지면 트러블<sup>*</sup> 이 반복되기 쉬워요!</span></div>
</section></div></body></html>"""


def test_centred_wrapper_chip_splits_its_sup_marker(tmp_path):
    """A single-line painted chip that sits inside a centred wrapper div (a dark
    banner "장벽이 약해지면 트러블<sup>*</sup> 이 반복되기 쉬워요!") still splits its <sup>
    into a small raised run. The captured text block is the wrapper (unpainted), so
    the chip is one level below; walkRuns must re-detect the sup-chip as it descends
    into the painted span, or the marker flattens to full size and breaks centring."""
    texts = list(_iter_text(_decompose_html(tmp_path, _BANNER_SUP_CHIP_HTML, "banner")))
    star = [t for t in texts if (t.get("text") or "").strip() == "*"]
    assert star, "the sup marker splits into its own run"
    assert star[0]["fontSize"] < 14, "the marker renders small (a raised superscript)"
    # the label before the marker is its own run, not flattened with the copy after
    head = [t for t in texts if "트러블" in (t.get("text") or "")]
    assert head and all("반복" not in (t.get("text") or "") for t in head), (
        "the pre-marker label is a separate run from the post-marker copy"
    )


_NESTED_INLINE_LABEL_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif;font-size:18px}
.dp section{padding:60px 56px;background:#eef6ea}
.em{color:#54b26a;font-weight:800}
</style></head><body><div class="dp">
<section data-screen-label="venn">
<div style="position:absolute;left:160px;top:96px;width:300px;text-align:center;"><b style="font-size:29px;font-weight:800;">피부 진정</b><sup>3)4)</sup><br/><span style="font-size:18px;">5D 복합 시카 <span class="em">2배</span><sup>**</sup></span></div>
</section></div></body></html>"""


def test_nested_inline_fragments_do_not_block_the_bold_split(tmp_path):
    """A centred label whose subtext holds nested inline styling (a coloured/heavier
    <span>2배</span> and a <sup>**</sup>) must still split its <b> headline into a
    heavier run. getClientRects() returns one rect per inline FRAGMENT, so that single
    subtext line yields several rects on the SAME line; counting them (>1) once
    false-flagged the block as a multi-line wrap and flattened the 800-weight headline
    to 400. inlineWraps now checks for vertically DISJOINT rects (a real second line),
    which one styled line never trips."""
    texts = list(
        _iter_text(_decompose_html(tmp_path, _NESTED_INLINE_LABEL_HTML, "venn"))
    )
    head = [t for t in texts if (t.get("text") or "").strip() == "피부 진정"]
    assert len(head) == 1, "the headline splits into its own run (not flattened)"
    assert int(head[0]["fontWeight"]) >= 600, "the headline keeps its 800 weight"
    assert head[0]["fontSize"] > 24, (
        "the headline keeps its 29px size, not the 18px base"
    )
    # the coloured emphasis in the subtext still becomes its own run
    emph = [t for t in texts if (t.get("text") or "").strip() == "2배"]
    assert emph, "the coloured subtext run is preserved"


_NESTED_SVG_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px}
.dp section{padding:40px;background:#fff}
</style></head><body><div class="dp">
<section data-screen-label="ns">
<svg width="260" height="230" viewBox="0 0 260 230">
  <rect x="0" y="0" width="80" height="200" fill="#cccccc"/>
  <svg x="100" y="30" width="47" height="61" viewBox="0 0 100 100">
    <path d="M10 90 L50 10 L90 90 Z" fill="green"/>
  </svg>
</svg>
</section></div></body></html>"""


def test_nested_svg_is_not_double_extracted(tmp_path):
    """A nested <svg> (an arrow inside a bar-chart svg) is already painted by the
    part that contains it; walking into it a second time as its own top-level
    element would draw two overlapping arrows. The arrow's markup must appear in
    exactly ONE emitted element — whether the outer svg stayed whole or split
    into per-shape parts."""

    def _iter_all(nodes):
        for n in nodes:
            yield n
            yield from _iter_all(n.get("children") or [])

    els = list(_iter_all(_decompose_html(tmp_path, _NESTED_SVG_HTML, "ns")))
    svgs = [e for e in els if e.get("type") == "svg"]
    painted = [s for s in svgs if "M10 90" in _decode_svg(s)]
    assert len(painted) == 1, (
        f"the nested arrow must be painted exactly once (got {len(painted)})"
    )


_MULTILINE_CHIP_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:60px 56px;background:#fff}
</style></head><body><div class="dp">
<section data-screen-label="chip"><div style="text-align:center;"><span
  style="background:#cdeccd;padding:14px 26px;border-radius:12px;font-size:19px;"
  >아침에 사용 시 기초 마지막 단계에서<br/>자외선 차단제를 발라주어 피부를 보호해주세요.</span></div>
</section></div></body></html>"""


def test_centred_multiline_chip_uses_full_box_width_so_it_never_rewraps(tmp_path):
    """A centred, multi-line painted chip gives its text the FULL box width (no
    padding inset). The padding-inset text box would equal the widest hard line's
    headless width, so the editor's slightly wider font re-wraps that line into an
    extra one and overflows the fixed-height pill (the sunscreen note's 2nd line
    spilling into a 3rd). Full width keeps each hard line inside the pill; centred
    text sits identically either way."""

    def _iter_all(ns):
        for n in ns:
            yield n
            yield from _iter_all(n.get("children") or [])

    nodes = list(_iter_all(_decompose_html(tmp_path, _MULTILINE_CHIP_HTML, "chip")))
    box = next(
        n
        for n in nodes
        if n.get("type") == "figure" and "205, 236, 205" in (n.get("fill") or "")
    )
    text = next(
        t
        for t in nodes
        if t.get("type") == "text" and "자외선 차단제" in (t.get("text") or "")
    )
    assert "\n" in text["text"], "the chip keeps its explicit two-line break"
    assert text["align"] == "center"
    # the text spans the whole pill (not inset by the 26px side padding) and starts
    # at the box's own left edge, so neither hard line can re-wrap inside it.
    assert text["width"] == box["width"], "text uses the full box width"
    assert text["x"] == box["x"], "text is not inset from the box"


_VALUE_ROW_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:60px 56px;background:#fff}
.dp sup{font-size:0.4em;font-weight:600;vertical-align:top;position:relative;top:-0.15em}
.em-green{color:#3fa34d}
.dp ul{list-style:none}
.dp li{font-size:19px;line-height:1.2;margin-bottom:14px}
</style></head><body><div class="dp">
<section data-screen-label="row"><ul>
  <li>· 속 피지<sup>2)</sup> <span class="em-green">7.95% 개선</span></li>
</ul></section>
</div></body></html>"""


def test_value_row_superscript_stays_a_small_raised_run(tmp_path):
    """A value-stat row splits (its green value is a coloured run), so its <sup>
    footnote marker rides along as its OWN fragment at the real superscript size
    — small (~0.4em) and raised above the row baseline — matching the reference,
    instead of being flattened to the row's full font size."""

    texts = list(_iter_text(_decompose_html(tmp_path, _VALUE_ROW_HTML, "row")))
    label = next(t for t in texts if (t.get("text") or "").strip() == "· 속 피지")
    marker = next(t for t in texts if (t.get("text") or "").strip() == "2)")
    # The marker is its own run at the superscript size, well under the 19px row.
    assert marker["fontSize"] < label["fontSize"] * 0.6
    # …and raised. Compare vertical CENTRES, not box tops: a box top is set by the
    # line box, not by the lift, so the two tops land within a pixel of each other
    # and the assertion turns into a coin flip (it read 59 < 59 on macOS and 58 < 59
    # on CI, from the same commit). Centres separate the two states properly —
    # raised sits ~7px above the label, baseline-aligned ~3px below.
    label_centre = label["y"] + label["height"] / 2
    marker_centre = marker["y"] + marker["height"] / 2
    assert marker_centre < label_centre - 3


def test_small_single_line_chip_uses_full_width_centre(tmp_path):
    """A small single-line keyword chip centres its label across the FULL chip
    width (no padding inset), so the label can never re-wrap inside its pill."""

    children = _decompose_html(tmp_path, _SUP_HTML, "sup")
    pill = [t for t in _iter_text(children) if t.get("text") == "피지컨트롤세럼"]
    assert len(pill) == 1, "the pill label stays one intact run"
    label = pill[0]
    assert label["align"] == "center", "a small chip label is centred"
    # The pill background box sits directly behind the label at the same width;
    # the label is NOT inset narrower than that box (which is what re-wrapped it).

    def _iter_all(nodes):
        for n in nodes:
            yield n
            if n.get("type") == "group":
                yield from _iter_all(n.get("children") or [])

    boxes = [
        n
        for n in _iter_all(children)
        if n.get("type") == "figure" and "84, 178, 106" in (n.get("fill") or "")
    ]
    assert boxes, "the pill keeps its green background box"
    box = boxes[0]
    # Full-width centring: the label width matches the chip box (within rounding),
    # not the padding-inset width that clipped the last syllable.
    assert label["width"] >= box["width"] - 2


def test_ensure_svg_xmlns_injects_namespace_when_absent():
    """Inline SVG that omitted xmlns gets an explicit SVG namespace on its root.

    Canvas re-parses the SVG standalone as ``image/svg+xml``; without a
    namespace the nodes land in the null namespace (no ``.style``) and its
    ``replaceColors`` crashes on gradient/def nodes reading ``node.style.stroke``.
    """
    svg = '<svg width="100" height="100"><defs><linearGradient id="g"/></defs></svg>'
    fixed = proto._ensure_svg_xmlns(svg)
    assert 'xmlns="http://www.w3.org/2000/svg"' in fixed
    # namespace is injected on the ROOT tag, before any child markup.
    assert fixed.index("xmlns=") < fixed.index("<defs")


def test_ensure_svg_xmlns_is_noop_when_already_namespaced():
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
    assert proto._ensure_svg_xmlns(svg) == svg


def test_svg_element_src_decodes_to_namespaced_markup():
    """The mapped ``type:"svg"`` element's data URI must decode to XML that a
    strict ``image/svg+xml`` parser accepts (i.e. carries the namespace)."""
    import base64

    element = {
        "kind": "svg",
        "box": _box(0, 0, 40, 40),
        "svg": '<svg viewBox="0 0 100 100"><defs><linearGradient id="g">'
        '<stop offset="0" stop-color="#54b26a"/></linearGradient></defs>'
        '<circle cx="50" cy="50" r="40" fill="url(#g)"/></svg>',
        "color": "#54b26a",
    }
    node = proto._canvas_element(element, "svg-1")
    assert node["type"] == "svg"
    prefix = "data:image/svg+xml;base64,"
    assert node["src"].startswith(prefix)
    decoded = base64.b64decode(node["src"][len(prefix) :]).decode()
    assert 'xmlns="http://www.w3.org/2000/svg"' in decoded


def test_strip_svg_root_positioning_removes_layout_from_root():
    """A tail SVG pinned in the source with ``position:absolute; bottom:-14px``
    rasterises to nothing once it is a standalone data-URI (the drawing shifts
    out of its own viewport). Strip those layout props from the root so it paints
    inside its box; the Canvas element's x/y already places it."""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="20" '
        'viewBox="0 0 26 20" style="position:absolute; left:30px; bottom:-14px;">'
        '<path d="M2 0 H24 L6 18 Z" fill="#ffffff"/></svg>'
    )
    out = proto._strip_svg_root_positioning(svg)
    root = out.split(">", 1)[0]
    for prop in ("position", "bottom", "left"):
        assert prop not in root, f"{prop} must be stripped from the root <svg>"
    assert 'd="M2 0 H24 L6 18 Z"' in out, "the path geometry is untouched"


def test_strip_svg_root_positioning_keeps_inner_transforms():
    """Only the ROOT style is cleaned; a child ``transform`` (real geometry) stays."""
    svg = (
        '<svg style="position:absolute;transform:rotate(5deg)" viewBox="0 0 10 10">'
        '<g transform="translate(2,2)"><rect/></g></svg>'
    )
    out = proto._strip_svg_root_positioning(svg)
    assert "translate(2,2)" in out
    assert "position" not in out.split(">", 1)[0]


def test_apply_declared_groups_binds_box_text_and_decoration():
    """A run of same-``groupKey`` elements (a speech bubble's box + label + tail)
    becomes ONE declared group; the declared ``groupAlign`` overrides auto-centre;
    an unkeyed element passes through untouched."""
    els = [
        {"kind": "box", "groupKey": "g1", "box": _box(56, 150, 325, 139)},
        {
            "kind": "text",
            "groupKey": "g1",
            "groupAlign": "start",
            "textAlign": "center",
            "hcenter": True,
            "box": _box(92, 150, 253, 100),
        },
        {"kind": "svg", "groupKey": "g1", "box": _box(86, 283, 26, 20)},
        {"kind": "text", "box": _box(0, 400, 50, 20)},
    ]
    out = proto._apply_declared_groups(els)
    assert len(out) == 2
    grp = out[0]
    assert grp["kind"] == "group" and grp["declared"] is True
    assert [c["kind"] for c in grp["children"]] == ["box", "text", "svg"]
    txt = grp["children"][1]
    assert txt["textAlign"] == "left", "declared start alignment is applied"
    assert txt["hcenter"] is False, "auto flex-centre is cleared by the declaration"
    assert grp["box"]["x"] == 56 and grp["box"]["width"] == 325
    assert out[1]["kind"] == "text", "an unkeyed element is left loose"


def test_apply_declared_groups_leaves_a_lone_keyed_element_loose():
    els = [{"kind": "text", "groupKey": "g1", "box": _box(0, 0, 10, 10)}]
    assert proto._apply_declared_groups(els)[0]["kind"] == "text"


def test_declared_group_maps_to_group_flagged_for_the_bridge():
    """A declared group maps to a Canvas group tagged so the bridge promotes its
    label to an editable slot (a colour-split group stays locked decoration)."""
    e = {
        "kind": "group",
        "declared": True,
        "box": _box(80, 35, 113, 39),
        "children": [
            {
                "kind": "box",
                "box": _box(80, 35, 113, 39),
                "fill": "#f55",
                "gradient": "",
                "radius": 20,
                "borderWidth": 0,
                "borderColor": "",
                "borderStyle": "none",
                "borders": None,
                "shadow": "none",
            },
            {
                "kind": "text",
                "box": _box(80, 35, 113, 39),
                "text": "트러블 원인",
                "color": "#fff",
                "fontSize": 18,
                "fontFamily": "A",
                "fontWeight": "700",
                "lineHeight": 1.2,
                "textAlign": "center",
                "slot": True,
                "tag": "SPAN",
            },
        ],
    }
    node = proto._canvas_element(e, "badge")
    assert node["type"] == "group"
    assert node["custom"]["declaredGroup"] is True
    assert node["custom"]["source"] == "html-declared-group"


def test_webfont_injection_is_wired_for_editor_metric_parity():
    """The extraction page lays out with the SAME bytes the editor draws with,
    so measured text widths match the seller's canvas (no re-wrap / clip /
    overlap).

    Guards the plumbing without a network round-trip: the families must come
    from our own render-fonts bundle rather than a public CDN, and the warm-up
    must confirm the family actually resolved before measuring.
    """
    assert proto.BUNDLE_FONT_FAMILIES, "at least one bundle family must register"
    assert "pretendard" in proto.BUNDLE_FONT_FAMILIES
    assert "/render-fonts" in proto.RENDER_FONTS_BASE_URL
    assert "Pretendard" in proto.BUNDLE_FONT_FAMILY_NAMES
    assert "document.fonts.check" in proto.FONT_WARMUP_JS
    # Neither the bundle nor the CDN catalog carries these, so measuring with
    # them would measure glyphs the canvas can never draw.
    assert "Pretendard Variable" not in proto.BUNDLE_FONT_FAMILY_NAMES
    assert "Poppins" not in proto.BUNDLE_FONT_FAMILY_NAMES
    assert not hasattr(proto, "WEBFONT_LINKS"), "CDN stylesheet list must be gone"


def test_bundle_font_css_url_points_at_our_own_bundle():
    url = proto.bundle_font_css_url("pretendard")
    assert url.startswith(proto.RENDER_FONTS_BASE_URL)
    assert url.endswith("/family-css/pretendard.css")
    assert "jsdelivr" not in url and "googleapis" not in url


def test_font_warmup_uses_the_pages_own_text_not_a_fixed_sample():
    """The bundle slices each family by unicode-range (~90 per weight). Warming
    with a fixed sample loads only the ranges that sample happens to contain,
    and the rest stream in while we measure — the y=59/y=60 flake. The warm-up
    must therefore derive its text from the document itself."""
    js = proto.FONT_WARMUP_JS
    assert "document.body.innerText" in js, "warm-up must read the page's own text"
    assert "new Set(" in js, "characters should be deduped before loading"
    assert "await document.fonts.ready" in js
    assert "document.fonts.check" in js
    # A hardcoded Hangul sample is exactly what this replaced.
    assert "가나다라" not in js


# A 2:1 raster placed in a square box under object-fit:contain: the browser
# letterboxes it (whole image, centred, no crop). Canvas instead stretches the
# source to fill the element box, so the decomposer must emit the aspect-fitted
# rect, not the full container.
_CONTAIN_HTML = (
    '<!doctype html><html><head><meta charset="utf-8"><style>'
    "*{margin:0;box-sizing:border-box}.dp{width:750px;font-family:sans-serif}"
    ".dp section{padding:0;background:#fff}.frame{width:200px;height:200px;margin:40px}"
    ".frame img{width:100%;height:100%;object-fit:contain;display:block}"
    '</style></head><body><div class="dp">'
    '<section data-screen-label="contain"><div class="frame">'
    "<img src=\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'"
    "%20width='40'%20height='20'%3E%3Crect%20width='40'%20height='20'%20"
    "fill='%23cc0000'/%3E%3C/svg%3E\"/>"
    "</div></section></div></body></html>"
)


def test_object_fit_contain_image_shrinks_to_aspect_fitted_rect(tmp_path):
    """A real <img> with object-fit:contain is emitted at its letterboxed rect
    (aspect preserved, centred), not stretched to fill the container box."""

    children = _decompose_html(tmp_path, _CONTAIN_HTML, "contain")

    def _iter_all(nodes):
        for n in nodes:
            yield n
            for c in n.get("children") or []:
                yield from _iter_all([c])

    images = [n for n in _iter_all(children) if n.get("type") == "image"]
    assert images, "the contained <img> must decompose to an image element"
    img = images[0]
    # 40x20 source (2:1) fit into a 200x200 box -> 200x100, centred (y offset 50).
    assert abs(img["width"] / img["height"] - 2.0) < 0.15, (
        "aspect ratio must be preserved (not distorted to the 1:1 container)"
    )
    assert img["height"] < 180, "the box is letterboxed shorter than the container"


# ── Inline-SVG-with-<text> split (certification badges) ──────────────────────
# A badge inline-SVG that bakes its own centred <text> lines (torriden's cert
# emblems: two circles + an icon + "민감 피부 자극" / "인체적용시험 완료") extracts as
# ONE locked svg, so the copy can't be edited. The extractor splits it into a
# group[background svg, native text, native text]; the mapper must carry those
# through as an editable group whose texts are centred and are NOT AI-fill slots.
def _svg_element(**overrides):
    """A minimal extracted background ``svg`` element (badge graphics only)."""

    element = {
        "kind": "svg",
        "box": _box(100, 100, 120, 120),
        "svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
        '<circle cx="100" cy="100" r="94" fill="#fff" stroke="#cfe0c9"/></svg>',
        "color": "rgb(63, 158, 87)",
    }
    element.update(overrides)
    return element


def _svg_text(y, text):
    """A text element as the extractor emits it from an SVG <text> line."""

    return _text_element(
        box=_box(110, y, 100, 20),
        text=text,
        textAlign="center",
        hcenter=True,
        slot=False,
        letterSpacing="normal",
        lineHeight="1",
    )


def test_inline_svg_badge_splits_into_editable_group():
    group = {
        "kind": "group",
        "box": _box(100, 100, 120, 120),
        "declared": True,
        "children": [
            _svg_element(),
            _svg_text(110, "민감 피부 자극"),
            _svg_text(180, "인체적용시험 완료"),
        ],
    }
    sec = {
        "label": "test-cert",
        "height": 900,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [group],
    }

    grp = proto.to_canvas(sec)["pages"][0]["children"][1]
    assert grp["type"] == "group"
    kinds = [c["type"] for c in grp["children"]]
    assert kinds == ["svg", "text", "text"], (
        "the badge is background svg + two native (editable) text lines"
    )
    for line in grp["children"][1:]:
        # Centred like the source text-anchor:middle ...
        assert line["align"] == "center"
        # ... and freely editable, but NOT promoted to an AI-filled slot (cert
        # copy is template-fixed, so slot=False -> slotCandidate False).
        assert line["custom"]["slotCandidate"] is False
    assert grp["children"][1]["text"] == "민감 피부 자극"
    assert grp["children"][2]["text"] == "인체적용시험 완료"


def test_svg_text_line_centres_without_a_slot_or_letterspacing_crash():
    """One SVG-derived text line maps to a centred, non-slot text with no
    letterSpacing (``normal`` is omitted, never a KeyError in the proxy path)."""

    el = proto._canvas_element(_svg_text(110, "사용 적합"), "cert-c1")
    assert el["type"] == "text"
    assert el["align"] == "center"
    assert el["custom"]["slotCandidate"] is False
    assert "letterSpacing" not in el


def test_many_centred_svg_lines_still_split_no_line_cap():
    """A 3-step chevron flow bakes SIX centred <text> lines into one svg. The
    split is gated on the ANCHOR (all centred = an emblem/label graphic), never on
    a line count — a cap would leave the chevron as one un-editable "도형" while a
    2-line cert badge split, which is exactly the inconsistency users hit."""

    lines = ["트러블*", "원인 케어", "트러블*", "집중 케어", "트러블*", "차단"]
    group = {
        "kind": "group",
        "box": _box(0, 0, 638, 110),
        "declared": True,
        "children": [_svg_element(box=_box(0, 0, 638, 110))]
        + [_svg_text(20 + 30 * i, t) for i, t in enumerate(lines)],
    }
    sec = {
        "label": "flow",
        "height": 400,
        "bg": "#ffffff",
        "bgImage": "none",
        "elements": [group],
    }

    grp = proto.to_canvas(sec)["pages"][0]["children"][1]
    kinds = [c["type"] for c in grp["children"]]
    assert kinds == ["svg"] + ["text"] * 6
    assert [c["text"] for c in grp["children"][1:]] == lines


# --------------------------------------------------------------------------- #
# Inline-SVG part split. A composite illustration (a bar chart, a chevron flow)
# used to extract as ONE locked "도형": the user could not recolour a single bar,
# hide a gridline, or move a callout. Its top-level shapes now each become their
# own svg element, grouped. Small icons stay whole — a 46px leaf is one idea, and
# shattering it into three strokes is layer noise, not control. Runs the real
# decomposer via Chromium.
# --------------------------------------------------------------------------- #

_SVG_PARTS_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:60px 56px;background:#fff}
</style></head><body><div class="dp">
<section data-screen-label="parts">
  <svg xmlns="http://www.w3.org/2000/svg" width="560" height="420"
       viewBox="0 0 560 420" style="width:100%; height:auto;">
    <path d="M70 20 V380 H540" fill="none" stroke="#333" stroke-width="2.5"/>
    <line x1="70" y1="200" x2="540" y2="200" stroke="#eee" stroke-width="1.5"/>
    <path d="M150 380 V210 h110 V380 Z" fill="#4caf68"/>
    <path d="M360 380 V95 h110 V380 Z" fill="url(#coralg)"/>
    <defs><linearGradient id="coralg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff5b5b"/><stop offset="1" stop-color="#ffb3b3"/>
    </linearGradient></defs>
  </svg>
  <svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46">
    <circle cx="23" cy="23" r="22" fill="#eef6ea"/>
    <path d="M14 23 l6 6 l12 -12" fill="none" stroke="#54b26a" stroke-width="3"/>
  </svg>
</section>
</div></body></html>"""


def _decode_svg(node):
    import base64

    prefix = "data:image/svg+xml;base64,"
    assert node["src"].startswith(prefix)
    return base64.b64decode(node["src"][len(prefix) :]).decode()


def test_composite_svg_splits_into_one_element_per_shape(tmp_path):
    """The chart's axis, gridline and two bars each become their own layer."""

    children = _decompose_html(tmp_path, _SVG_PARTS_HTML, "parts")
    groups = [c for c in children if c.get("type") == "group"]
    assert groups, "the composite svg must bind its parts into one group"
    parts = [c for c in groups[0]["children"] if c.get("type") == "svg"]
    assert len(parts) == 4, f"expected 4 shape parts, got {len(parts)}"

    # Each part is cropped to its own shape, not left at the full svg box: the
    # bars are narrow columns, the axis spans the chart.
    widths = sorted(p["width"] for p in parts)
    assert widths[0] < widths[-1] / 2, "parts were not cropped to their shapes"

    # The gradient bar keeps the <defs> it references, or it would render empty.
    grad = [p for p in parts if "url(#coralg)" in _decode_svg(p)]
    assert len(grad) == 1
    assert "linearGradient" in _decode_svg(grad[0])


def test_zero_height_gridline_survives_the_split(tmp_path):
    """A horizontal <line> measures 0px tall (getBoundingClientRect ignores the
    stroke). Without the stroke pad it is dropped and the chart loses its grid."""

    children = _decompose_html(tmp_path, _SVG_PARTS_HTML, "parts")
    groups = [c for c in children if c.get("type") == "group"]
    parts = [c for c in groups[0]["children"] if c.get("type") == "svg"]
    grid = [p for p in parts if "<line " in _decode_svg(p)]  # not <linearGradient
    assert len(grid) == 1, "the gridline part was dropped"
    # Wide and thin, and its box has real height (the padded stroke), so the
    # 1.5px rule is actually painted inside it.
    assert grid[0]["width"] > 300 and 0 < grid[0]["height"] < 20


def test_small_icon_svg_is_not_split(tmp_path):
    """A 46px icon stays ONE svg — splitting it would only add layer noise."""

    children = _decompose_html(tmp_path, _SVG_PARTS_HTML, "parts")
    icons = [
        c
        for c in children
        if c.get("type") == "svg" and c["width"] < 100 and c["height"] < 100
    ]
    assert len(icons) == 1, "the icon must stay a single, whole svg element"
    markup = _decode_svg(icons[0])
    assert "<circle" in markup and "<path" in markup


# An emblem whose copy lives in the svg ("Fe"/"철"), wrapped in a plain div — the
# shape the mineral strip uses. innerText reads that copy back through the
# wrapper, so the wrapper used to be captured as a text block TOO, and the label
# came out twice: once split out of the badge, once as a full-width ghost.
_SVG_TEXT_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:40px;background:#fff}
</style></head><body><div class="dp">
<section data-screen-label="emblem">
  <div style="margin:12px 0 0;">
    <svg xmlns="http://www.w3.org/2000/svg" width="66" height="66" viewBox="0 0 66 66">
      <circle cx="33" cy="33" r="25" fill="none" stroke="#8A5D4E" stroke-width="1.4"/>
      <text x="33" y="34" fill="#5B3A30" font-size="18" text-anchor="middle">Fe</text>
      <text x="33" y="48" fill="#5B3A30" font-size="10" text-anchor="middle">철</text>
    </svg>
  </div>
  <p style="font-size:20px; color:#7C6A62;">신비한 붉은빛을 띄는 온천수</p>
</section>
</div></body></html>"""


def test_svg_baked_copy_is_not_also_claimed_by_its_wrapper(tmp_path):
    """The emblem's copy is emitted ONCE — by the badge, not by the div around it."""

    children = _decompose_html(tmp_path, _SVG_TEXT_HTML, "emblem")
    texts = [t["text"] for t in _iter_text(children)]

    assert texts.count("Fe") == 1 and texts.count("철") == 1
    # The ghost: the wrapper flattening both svg lines into one block.
    assert not [t for t in texts if "Fe" in t and "철" in t], (
        f"the svg's copy was emitted twice (wrapper ghost): {texts}"
    )
    assert "신비한 붉은빛을 띄는 온천수" in texts, "real copy must still be captured"


def test_emblem_still_splits_into_an_editable_group(tmp_path):
    """Suppressing the wrapper must not cost the badge its editable text lines."""

    children = _decompose_html(tmp_path, _SVG_TEXT_HTML, "emblem")
    groups = [c for c in children if c.get("type") == "group"]
    assert len(groups) == 1, "the badge stays one group[svg, text, text]"
    kinds = [c["type"] for c in groups[0]["children"]]
    assert kinds == ["svg", "text", "text"], kinds


_SVG_TEXT_MIXED_HTML = _SVG_TEXT_HTML.replace(
    '<div style="margin:12px 0 0;">', '<div style="margin:12px 0 0;">철분'
)


def test_a_block_with_its_own_copy_drops_only_the_svgs_copy(tmp_path):
    """A block that has real text AND an emblem keeps its own text — and only its
    own: the badge's "Fe"/"철" must not be flattened into the block's label."""

    children = _decompose_html(tmp_path, _SVG_TEXT_MIXED_HTML, "emblem")
    texts = [t["text"] for t in _iter_text(children)]

    assert "철분" in texts, f"the block's own copy was lost: {texts}"
    assert texts.count("Fe") == 1 and texts.count("철") == 1
    assert not [t for t in texts if t.startswith("철분") and len(t) > 2], (
        f"the svg's copy leaked into the block's label: {texts}"
    )


# A checklist row: a checkbox svg + a line whose runs split (a bold phrase, a
# small footnote). The row is DECLARED one unit — without the declaration the
# checkbox drifts out as a loose sibling of the run group.
_CHK_ROW_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:40px;background:#fff}
.chk-row{display:flex;align-items:flex-start;font-size:27px;color:#3B3733;padding:9px 0}
.chk{display:block;width:30px;height:30px;margin-right:14px;flex:none}
</style></head><body><div class="dp">
<section data-screen-label="chk">
  <ul style="margin:0;padding:0;list-style:none">
    <li class="chk-row" data-group data-align="start">
      <span class="chk"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="30" height="30">
        <rect x="6" y="6" width="88" height="88" rx="10" fill="none" stroke="#3B3733" stroke-width="7"/>
        <path d="M28 50 L44 66 L78 28" fill="none" stroke="#3B3733" stroke-width="8"/></svg></span>
      <span>국내외 온천 대비 <b style="font-weight:800">높은 미네랄 함량</b>
        <span style="font-size:15px;color:#6E6862">[*고장성 온천]</span></span>
    </li>
  </ul>
</section>
</div></body></html>"""


def test_checklist_row_binds_its_checkbox_and_runs_into_one_flat_group(tmp_path):
    """The checkbox belongs to its row, not next to it — and one group, not two.

    The line's runs split (bold phrase, small footnote), and that split used to
    bind them into their OWN group nested inside the declared row group, leaving
    the layers panel reading 그룹>그룹>텍스트 with the checkbox a sibling of the blob.
    """

    children = _decompose_html(tmp_path, _CHK_ROW_HTML, "chk")
    groups = [c for c in children if c.get("type") == "group"]
    assert len(groups) == 1, f"the row must be ONE group, got {len(groups)}"

    kids = groups[0]["children"]
    assert not [k for k in kids if k["type"] == "group"], (
        "the run split must not nest a second group inside the declared row"
    )
    assert [k["type"] for k in kids].count("svg") == 1, "the checkbox joins its row"
    assert [k["text"] for k in kids if k["type"] == "text"] == [
        "국내외 온천 대비",
        "높은 미네랄 함량",
        "[*고장성 온천]",
    ]


# A tall seal (viewBox 108x130) dropped into a wide grid cell with
# ``svg{width:100%;height:100%}``. The browser letterboxes it (preserveAspectRatio
# defaults to xMidYMid meet) — but Canvas stretches an svg to fill its element box,
# so handing over the LAYOUT box paints a flat oval where a round stamp should be.
_SVG_STRETCH_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:40px;background:#fff}
.ic{display:flex;align-items:center;justify-content:center;height:86px}
.ic svg{width:100%;height:100%}
.icon{width:60px;height:60px}
</style></head><body><div class="dp">
<section data-screen-label="seal">
  <div class="ic">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 130">
      <path d="M54 3 A50 62 0 1 1 53 3 Z M30 65 L48 84 L80 40" fill="none"
        stroke="#3AB54B" stroke-width="4"/>
    </svg>
  </div>
  <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
    <circle cx="30" cy="30" r="28" fill="#eef6ea"/>
  </svg>
</section>
</div></body></html>"""


def test_letterboxed_svg_is_emitted_at_the_box_it_actually_paints(tmp_path):
    """The seal's box carries the viewBox aspect (108:130), not the 670x86 cell."""

    children = _decompose_html(tmp_path, _SVG_STRETCH_HTML, "seal")
    svgs = [c for c in children if c.get("type") == "svg"]
    seal = max(svgs, key=lambda s: s["height"])

    # 86px tall cell, 108:130 viewBox -> the painted stamp is ~71x86, centred.
    assert seal["height"] == pytest.approx(86, abs=1)
    assert seal["width"] == pytest.approx(86 * 108 / 130, abs=1.5), (
        f"the seal was stretched to its layout box: {seal['width']}x{seal['height']}"
    )


def test_svg_that_already_fills_its_box_is_left_alone(tmp_path):
    """A 60x60 icon in a 60x60 box has nothing to trim — the box must not move."""

    children = _decompose_html(tmp_path, _SVG_STRETCH_HTML, "seal")
    svgs = [c for c in children if c.get("type") == "svg"]
    icon = min(svgs, key=lambda s: s["height"])

    assert icon["width"] == pytest.approx(60, abs=1)
    assert icon["height"] == pytest.approx(60, abs=1)


_MARKER_LIST_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
.dp{width:750px;font-family:sans-serif}
.dp section{padding:40px 40px;background:#fff}
.vv{counter-reset:vv 4;list-style:none;padding:0;margin:0}
.vv li{counter-increment:vv;padding:12px 0;font-size:24px;font-weight:700;color:#7a4a12}
.vv li::before{content:counter(vv,decimal-leading-zero) " ";color:#c98a10}
.nn li::before{content:"※ ";color:#c98a10}
.nn{list-style:none;padding:0;margin:0}
.nn li{padding:12px 0;font-size:24px;color:#7a4a12}
</style></head><body><div class="dp">
<section data-screen-label="marker">
  <ul class="vv"><li><span>나이아신</span></li><li><span>토코페롤</span></li></ul>
  <ul class="nn"><li>보관 방법을 지켜 주세요</li></ul>
</section></div></body></html>"""


def _row_of(texts, needle):
    """The (marker, copy) pair on the line carrying ``needle``."""

    copy = next(t for t in texts if needle in (t.get("text") or ""))

    def mid(t):
        return t["y"] + t["height"] / 2

    left = [
        t
        for t in texts
        if t is not copy
        and t["x"] < copy["x"]
        and abs(mid(t) - mid(copy)) <= copy["height"] * 0.4
    ]
    return (max(left, key=lambda t: t["x"]) if left else None), copy


def test_counter_marker_is_resolved_into_the_canvas(tmp_path):
    """A ``content:counter(...)`` marker must reach the editor as its digits.

    Chrome hands back the counter() call UNRESOLVED in the computed ``content``,
    so a numbered list authored the documented way (marker pseudo + counter)
    used to emit nothing at all — the editor opened a list whose numbers had
    silently vanished, and the item copy slid left into the empty marker slot.
    """

    texts = list(_iter_text(_decompose_html(tmp_path, _MARKER_LIST_HTML, "marker")))
    numbers = [(t.get("text") or "").strip() for t in texts]
    # counter-reset starts at 4, so the two items number 05 and 06.
    assert "05" in numbers and "06" in numbers, numbers


def test_inline_marker_never_paints_over_the_copy_it_numbers(tmp_path):
    """The marker and the copy it precedes must not share an x in the canvas.

    HTML offsets the copy with a first-line indent, which the proxy replays as
    ``text-indent``; a canvas text element has a single x and no first-line
    indent, so the copy has to START where its first glyph really sits — else
    the editor paints "05" and "나이아신" on top of each other.
    """

    texts = list(_iter_text(_decompose_html(tmp_path, _MARKER_LIST_HTML, "marker")))
    for needle in ("나이아신", "보관 방법"):
        marker, copy = _row_of(texts, needle)
        assert marker is not None, f"no marker emitted next to {needle}"
        assert copy["x"] >= marker["x"] + marker["width"], (
            f"{needle}: copy at x={copy['x']} runs under the marker "
            f"{marker['text']!r} ({marker['x']}..{marker['x'] + marker['width']})"
        )


def test_indent_to_moves_the_text_box_and_keeps_its_right_edge():
    """The mapper starts a marked block at the copy's real first glyph."""

    element = _text_element(box=_box(40, 100, 700, 30), indent=36, indentTo=76)
    mapped = proto._canvas_element(element, "e1")
    assert mapped["x"] == 76
    assert mapped["x"] + mapped["width"] == 740, "the right edge must not move"


def test_indent_to_is_ignored_when_it_would_not_move_the_box():
    """No marker (or one that starts left of the box) leaves the box alone."""

    for indent_to in (0, 40, 20):
        element = _text_element(box=_box(40, 100, 700, 30), indentTo=indent_to)
        mapped = proto._canvas_element(element, "e1")
        assert (mapped["x"], mapped["width"]) == (40, 700)
