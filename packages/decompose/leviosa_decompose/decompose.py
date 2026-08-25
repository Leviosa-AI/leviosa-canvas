"""Prototype ①: HTML section -> fully-editable Canvas-style elements.

Not a screenshot background. Every visible thing (gradient bg, cards, SVG
icons, text, images) is decomposed into an individually editable primitive,
the way option ① (constrained-HTML -> lossless Canvas compiler) would.

Fixes over the first run:
  1. Text living directly in <div> (e.g. .txt/.sub/eyebrow) is now captured,
     not just h1-h4/p/li/span. Inline emphasis stays part of its block, and
     containers of separate text blocks are not collapsed.
  2. The proxy waits for document.fonts.ready so Pretendard weights render.
  3. transform: rotate() is read from the computed matrix; geometry uses the
     layout size (offsetWidth/Height) around the element center so rotated
     elements (e.g. the tilted hero badge) keep their real shape and angle.

Outputs, per section:
  <label>.canvas.json   the editable element tree
  <label>.proxy.png      a faithful render of that element tree (fidelity ceiling)
  <label>.original.png   the untouched browser render for comparison
"""

import argparse
import asyncio
import base64
import html as htmllib
import json
import math
import os
import re
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

from .profiles import CAROUSEL, DETAIL_PAGE, Profile

# Defaults — override from the command line instead of editing this file:
#   one template: python -m leviosa_decompose.decompose <html> [--out BASE]
#   every template: python -m leviosa_decompose.decompose --all [--out BASE]
# Each template is written to its OWN folder, <out_base>/<template_stem>/, so
# sections never collide between templates. With no --sections, every
# [data-screen-label] section in the HTML is built.
DEFAULT_HTML = "Detail-Page/casual_10_N_0602_01.html"
DEFAULT_TEMPLATE_DIR = Path("Detail-Page")
DEFAULT_OUT_BASE = "output/canvas_proto"
# Reference/component sheets that are not real detail-page templates.
SKIP_TEMPLATES = {"00 Components.html"}
CANVAS = 750

_BROWSER_RUNTIME_PATH = (
    Path(__file__).resolve().parents[2] / "canvas" / "decompose" / "runtime.js"
)
_BROWSER_RUNTIME_SOURCE = _BROWSER_RUNTIME_PATH.read_text(encoding="utf-8")


def _browser_function(name: str) -> str:
    """Read one browser function from the canvas package's canonical JS module."""
    start = f"// {name}:start\nexport const {name} = "
    end = f";\n// {name}:end"
    try:
        return _BROWSER_RUNTIME_SOURCE.split(start, 1)[1].split(end, 1)[0]
    except IndexError as exc:
        raise RuntimeError(f"browser function not found: {name}") from exc


EXTRACT = _browser_function("EXTRACT")


# Group a labeled header with its following unlabeled body siblings into one
# temporary wrapper, so extraction and the screenshot both see the WHOLE screen
# (header + body), not just the header. The wrapper is a plain block div, so it
# preserves flow layout; the CSS only uses descendant selectors (.dp section),
# never direct-child combinators, so nesting does not change computed styles.
WRAP_JS = _browser_function("WRAP_JS")

# Superscript / subscript footnote markers (<sup>*</sup>, "2배**", "3)4)") are
# NOT flattened before extraction: the reference render shows them as small
# raised markers, and where a line already splits into fragments (a value-stat
# row "· 속 피지<sup>2)</sup> 7.95% 개선", a colour-split headline) ``walkRuns``
# emits each marker at its own real rect, so it lands small and raised beside its
# text — matching the target. The overlap the old blanket-flatten was guarding
# against came from a LONE marker fragmenting an otherwise-plain paragraph; that
# is prevented instead in ``hasSpecial`` / ``hasSizeSplit`` (a sup/sub is never
# the sole trigger for a split), so a body paragraph whose only emphasis is a
# footnote marker stays ONE editable element with the marker inline, while a line
# that splits for another reason keeps the marker as a raised run. This is a
# no-op kept only so the extraction pipeline's shape is unchanged.
NORMALIZE_JS = r"""
() => 0
"""

# Force the extraction page to lay out with the SAME bytes the Canvas editor
# draws with, so measured text widths match what the seller sees. Without a
# webfont the headless browser falls back to the narrower Apple SD Gothic Neo:
# every width we record comes out too small, so in the (wider) editor the copy
# re-wraps, chip labels clip, colour-split runs seam-overlap, and superscripts
# detach.
#
# Those bytes come from OUR bundle -- the frontend's `public/render-fonts/`,
# generated from the `@leviosa-ai/konva` manifest and served from our origin --
# not from a public CDN. The bundle IS what the editor and the server-side
# renderer draw with; measuring against jsDelivr's Pretendard v1.3.9 measured a
# *different* font than we render, which is exactly the drift that
# `applyTextLineFit` exists to paper over.
#
# The bundle ships Google-style unicode-range slices (~90 per weight, ~830 faces
# for Pretendard), so the browser fetches only the ranges a page actually uses.
# That is also why the warm-up below feeds it the page's OWN text instead of a
# fixed sample: a sample covers a handful of ranges, the remaining slices then
# load *while* we measure, and two identical runs disagree by a pixel. That was
# the real flake -- the same node came out at y=59 in one run and y=60 in the
# next.
#
# Families the editor CANNOT draw are deliberately absent. Neither the bundle
# nor the CDN catalog (frontend `src/config/detail-page-fonts.json`) carries
# "Pretendard Variable" or Poppins, so registering them here would measure
# glyphs the canvas will never render -- the templates that name them fall back
# to static Pretendard in the editor, and now they do so here too.
RENDER_FONTS_BASE_URL = os.environ.get(
    "DETAIL_PAGE_RENDER_FONTS_BASE_URL", "https://dev.leviosa.ai.kr/render-fonts"
).rstrip("/")

#: Bundle family slugs to register before measuring (`family-css/<slug>.css`).
BUNDLE_FONT_FAMILIES = ("pretendard",)

#: Families the warm-up must confirm resolved. Same list, editor spelling.
BUNDLE_FONT_FAMILY_NAMES = ("Pretendard",)


def bundle_font_css_url(slug: str) -> str:
    return f"{RENDER_FONTS_BASE_URL}/family-css/{slug}.css"


async def allow_bundle_font_cors(page) -> None:
    """Let the measuring page load the bundle's woff2 slices.

    A stylesheet may be fetched cross-origin without permission, but a *font*
    may not: @font-face always issues a CORS request, and the origin must send
    `Access-Control-Allow-Origin` or the browser fails the request outright.

    The editor never hits this because the bundle is same-origin there. We do:
    the page is built with `set_content`, so its origin is `about:blank` and
    every slice under `RENDER_FONTS_BASE_URL` is cross-origin. Without this,
    all ~600 slices fail with ERR_FAILED, every face settles into `error`, and
    the layout below is measured against a fallback font -- ~11% off on text
    width, which is exactly what the warm-up gate exists to prevent. (The gate
    did not catch it: `fonts.check()` treats an errored face as settled, so it
    answered "true" while nothing had loaded.)

    Granting it here rather than at the origin is deliberate. The bundle sits
    behind an edge cache pinned for a year, so a header added at nginx does not
    reach an already-cached response; this path needs no cache to expire.
    """

    async def _grant(route) -> None:
        try:
            response = await route.fetch()
        except Exception:
            # Let it fail the way it would have. The gate reports what happened.
            await route.abort()
            return
        headers = dict(response.headers)
        headers["access-control-allow-origin"] = "*"
        await route.fulfill(response=response, headers=headers)

    await page.route(f"{RENDER_FONTS_BASE_URL}/**", _grant)


# After the faces are registered they still must be *loaded* before layout is
# stable — document.fonts.ready only waits for faces already referenced by the
# page. Kick every weight with the page's own text, so a sliced family fetches
# every unicode-range this document will actually paint, then wait for
# fonts.ready and confirm the family resolved.
#
# Passing the real text (not a sample) is load-bearing: with ~90 slices per
# weight, a sample warms only the ranges it happens to contain and the rest
# stream in mid-measurement.
#
# The report counts faces instead of trusting `fonts.check()` alone. check()
# answers "is anything still in flight", and a face that FAILED to download is
# not in flight -- so a run where every slice 403'd or was blocked by CORS
# passed the old gate and measured against fallback metrics. Whether it passed
# at all came down to timing: if a slice happened to still be pending, check()
# said false and the whole decompose died with "Pretendard did not resolve",
# which is how the silent version was finally noticed. So: at least one slice
# must have loaded, and none may have failed.
FONT_WARMUP_JS = _browser_function("FONT_WARMUP_JS")


def describe_font_warmup(report) -> str:
    """One-line face census for the failure message.

    Without it the message names a symptom ("did not resolve") and every cause
    -- unreachable host, blocked CORS, a slice still in flight -- looks the
    same. `error=N loaded=0` says the bytes never arrived; `loading=N` says we
    gave up too early.
    """

    fields = ("loaded", "error", "loading", "unloaded", "resolved")
    return "[" + " ".join(f"{k}={(report or {}).get(k)}" for k in fields) + "]"


# Restore the DOM after a screen is captured: move the wrapped children back to
# their original place and drop the wrapper, so the next screen sees pristine
# layout (sibling adjacency, :first/:last-child, margins all unchanged).
UNWRAP_JS = _browser_function("UNWRAP_JS")


def _single_line_height(e):
    """the canvas editor's collapsed on-load height for one line of this text.

    ``lineHeight`` arrives as the CSS computed value: a unitless ratio ("1.2"), a
    pixel string ("27px"), or "normal". Canvas renders a single line at
    ``fontSize * ratio`` and treats "normal" as ~1.27 (matches Konva's measured
    single-line box), so fall back to that when no explicit ratio is given.
    """
    fs = e["fontSize"]
    lh = e.get("lineHeight")
    if isinstance(lh, (int, float)) and lh > 0:
        return fs * lh if lh < 4 else lh
    if isinstance(lh, str):
        s = lh.strip()
        if s.endswith("px"):
            try:
                return float(s[:-2])
            except ValueError:
                pass
        try:
            v = float(s)
            return fs * v if v < 4 else v
        except ValueError:
            pass
    return fs * 1.27


def _rot(e):
    return e["box"].get("rotation", 0) or 0


_SVG_ROOT_RE = re.compile(r"<svg\b([^>]*)>", re.IGNORECASE)


def _ensure_svg_xmlns(svg: str) -> str:
    """Force an explicit SVG namespace on the root ``<svg>`` tag.

    Inline SVG inside HTML may legally omit ``xmlns`` (the HTML parser assumes
    the SVG namespace). But Canvas recolours an SVG element by re-parsing its
    source standalone with ``DOMParser().parseFromString(str, "image/svg+xml")``.
    Without ``xmlns`` that strict XML parse puts every node in the *null*
    namespace, so they are plain ``Element``s with ``style === undefined`` — and
    the canvas editor's ``replaceColors`` crashes reading ``node.style.stroke`` (seen on
    gradient/def nodes). Injecting the namespace on the root makes the
    standalone serialisation valid and keeps it inert in the HTML render path.
    """
    m = _SVG_ROOT_RE.search(svg)
    if not m or "xmlns" in m.group(1):
        return svg
    return svg[: m.start(1)] + ' xmlns="http://www.w3.org/2000/svg"' + svg[m.start(1) :]


# Layout properties on the ROOT <svg> that positioned it in the source page but
# break it once the SVG is a standalone data-URI drawn in a Canvas box. Canvas
# rasterises the source verbatim; ``position:absolute; bottom:-14px`` (how the
# speech-bubble tail was pinned below its bubble) then shifts the whole drawing
# out of the SVG's own viewport, so it rasterises to nothing (confirmed: 0 painted
# pixels vs a full triangle once removed). The element's x/y already places the
# shape, so drop these from the root style; inner nodes keep their own styles.
_SVG_ROOT_POS_RE = re.compile(
    r"\s*(?:position|top|right|bottom|left|inset|margin(?:-[a-z]+)?|transform)"
    r"\s*:[^;\"']*;?",
    re.IGNORECASE,
)


def _strip_svg_root_positioning(svg: str) -> str:
    """Remove layout/position declarations from the root ``<svg>`` inline style."""
    m = _SVG_ROOT_RE.search(svg)
    if not m or "style" not in m.group(1).lower():
        return svg
    attrs = m.group(1)
    cleaned = _SVG_ROOT_POS_RE.sub("", attrs)
    if cleaned == attrs:
        return svg
    return svg[: m.start(1)] + cleaned + svg[m.end(1) :]


_LS_RE = re.compile(r"^(-?[0-9]*\.?[0-9]+)(px|em|rem)?$")


def _ls_px(value, font_size=0):
    """Computed ``letter-spacing`` -> px number for a Canvas element.

    getComputedStyle always yields px ("normal" or "-0.8px"), but parse em/rem too
    for safety. Konva/Canvas letterSpacing is a px number; 0 means "omit".
    """
    if value is None:
        return 0.0
    s = str(value).strip().lower()
    if not s or s == "normal":
        return 0.0
    m = _LS_RE.match(s)
    if not m:
        return 0.0
    num = float(m.group(1))
    unit = m.group(2) or "px"
    return round(num * font_size, 3) if unit in ("em", "rem") else round(num, 3)


_CSS_URL_RE = re.compile(r"""url\(\s*['"]?(file://[^'")]+)""")


def _slot_contain_letterbox(base, e):
    """Shrink a ``background-size:contain`` slot box to its painted image rect.

    A ``.ph`` slot sized with ``background-size:contain`` (e.g. the hero product
    shot in a tall 420x900 frame) only paints the aspect-fitted, centred image;
    the rest of the box is transparent. The live Canvas canvas has no
    object-fit — it cover-fills the element box — so emitting the full frame makes
    the editor crop the photo (the seller sees a chopped bottle). Emit the box as
    the actual painted rect instead: a cover-fill of an image-aspect box shows the
    whole image, reproducing the source's contain framing in editor + export + the
    replaceable slot alike. Needs the background image's natural size, read from
    its ``file://`` source with PIL (best-effort: any miss leaves the box as-is).
    """
    if "contain" not in (e.get("phBgSize") or ""):
        return base
    m = _CSS_URL_RE.search(e.get("phBgImage") or "")
    if not m:
        return base
    from urllib.parse import unquote, urlparse

    path = unquote(urlparse(m.group(1)).path)
    try:
        from PIL import Image

        with Image.open(path) as im:
            nw, nh = im.size
    except Exception as exc:  # noqa: BLE001 - missing/undecodable asset, keep box
        print(f"warning: contain letterbox skipped for {path}: {exc}")
        return base
    bw, bh = base["width"], base["height"]
    if nw <= 0 or nh <= 0 or bw <= 0 or bh <= 0:
        return base
    sc = min(bw / nw, bh / nh)
    fw, fh = nw * sc, nh * sc
    return {
        **base,
        "x": round(base["x"] + (bw - fw) / 2),
        "y": round(base["y"] + (bh - fh) / 2),
        "width": round(fw),
        "height": round(fh),
    }


def _position(value, axis):
    tokens = str(value or "50% 50%").lower().split()
    token = tokens[min(axis, len(tokens) - 1)] if tokens else "50%"
    keywords = (
        {"left": 0, "center": 0.5, "right": 1},
        {"top": 0, "center": 0.5, "bottom": 1},
    )[axis]
    if token in keywords:
        return keywords[token], 0
    try:
        if token.endswith("%"):
            return float(token[:-1]) / 100, 0
        if token.endswith("px"):
            return 0, float(token[:-2])
    except ValueError:
        pass
    return 0.5, 0


def _image_crop(e, base):
    """Map CSS cover/contain framing to the Canvas document crop contract."""
    iw, ih = e.get("naturalWidth", 0), e.get("naturalHeight", 0)
    bw, bh = base["width"], base["height"]
    if e.get("objectFit") != "cover" or min(iw, ih, bw, bh) <= 0:
        return {"cropX": 0, "cropY": 0, "cropWidth": 1, "cropHeight": 1}
    scale = max(bw / iw, bh / ih)
    cw, ch = bw / scale, bh / scale
    px, dx = _position(e.get("objectPosition"), 0)
    py, dy = _position(e.get("objectPosition"), 1)
    left = min(max(((iw * scale - bw) * px - dx) / scale, 0), iw - cw)
    top = min(max(((ih * scale - bh) * py - dy) / scale, 0), ih - ch)
    return {
        "cropX": left / iw,
        "cropY": top / ih,
        "cropWidth": cw / iw,
        "cropHeight": ch / ih,
    }


def _canvas_element(e, eid):
    """Map one extracted element to an editable Canvas child dict.

    Recurses for ``group`` so a colour-split line's fragments map exactly like
    top-level elements; their boxes are absolute page coordinates, which is what
    the canvas editor's group rendering expects (the canvas Group carries no offset).
    """
    b = e["box"]
    base = {
        "id": eid,
        "x": round(b["x"]),
        "y": round(b["y"]),
        "width": round(b["width"]),
        "height": round(b["height"]),
        "rotation": _rot(e),
        "opacity": e.get("opacity", 1),
        "selectable": True,
    }
    if e["kind"] == "group":
        # One editable unit for a line that had to be split into single-colour
        # fragments. The group is locked design (not a slot); its run children
        # already carry run=true so the bridge never promotes them either.
        #
        # The children carry ABSOLUTE page coordinates, so the group wrapper must
        # carry no transform of its own — a Konva/Canvas Group translates its
        # children by the group's x/y, which would double-offset every fragment
        # (e.g. a run at x=305 inside a group at x=305 renders at 610, shoving the
        # line off the card and overlapping neighbours). Pin the group to the
        # origin; Canvas recomputes its selection box from the children's rects.
        # A DECLARED group (a data-group wrapper: a box + its text + a decoration)
        # is a real content unit, so mark it so the bridge can promote its primary
        # text to an editable slot; a colour-split group stays locked decoration.
        declared = bool(e.get("declared"))
        # A declared CLAIM (a moisture-wicking diagram, a cutaway callout) rides
        # on the group so the bind can drop the whole unit — drawing, axis labels
        # and caption together — when the bound product cannot support it.
        claim_custom = (
            {"claim": {"slug": e["claim"], "label": e.get("claimLabel") or ""}}
            if e.get("claim")
            else {}
        )
        return {
            **base,
            "x": 0,
            "y": 0,
            "type": "group",
            "custom": {
                **claim_custom,
                "run": True,
                "source": "html-declared-group"
                if declared
                else "html-decomposed-decoration",
                "declaredGroup": declared,
                # 'flow' (one line, re-laid-out as a whole) vs 'row' (separate
                # cells). The bridge routes flow groups to a single group-level
                # slot and row groups to per-cell slots.
                "lineKind": e.get("lineKind") or "",
                "filter": e.get("filter") or "none",
            },
            "children": _children_with_borders(
                e.get("children") or [], lambda j, c: f"{eid}-c{j}"
            ),
        }
    if e["kind"] == "box":
        custom = {"gradient": e["gradient"], "shadow": e["shadow"]}
        if e.get("clip"):
            # Whole circle, but the integration should clip it to this card
            # rect (Konva clipFunc) so it shows partially by default.
            custom["clipToRect"] = e["clip"]
        # the canvas editor's rect stroke is UNIFORM (all four sides). A box whose source
        # draws only some sides (a spec table's border-top rule, a row's
        # border-bottom divider) must NOT get that stroke, or a single line
        # becomes a full black rectangle around the row. Keep the uniform stroke
        # only for a real four-side outline (a pill, a card); the other sides are
        # emitted as thin rect lines by ``_side_border_lines`` in to_canvas.
        borders = e.get("borders")
        if borders is not None and not _border_is_full_uniform(borders):
            stroke_w = 0
        else:
            stroke_w = round(e["borderWidth"])
        return {
            **base,
            "type": "figure",
            "subType": "rect",
            "fill": e["fill"],
            "cornerRadius": round(e["radius"]),
            "strokeWidth": stroke_w,
            "stroke": e["borderColor"],
            "custom": custom,
        }
    if e["kind"] == "svg":
        svg = _ensure_svg_xmlns(_strip_svg_root_positioning(e["svg"]))
        data = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
        custom = {"color": e["color"]}
        if e.get("bubble"):
            # 말풍선 파라미터를 그대로 실어 보낸다. 편집기의 bubble-path.ts가 같은 엔진으로
            # path를 재생성하므로, 꼬리 끝점 드래그·리사이즈에도 모양이 유지된다.
            try:
                custom["bubble"] = json.loads(e["bubble"])
            except (TypeError, ValueError):
                pass
        return {**base, "type": "svg", "src": data, "custom": custom}
    if e["kind"] == "image":
        # Images are the one element where a fractional CSS box changes every
        # raster pixel. Keep Chromium's measured fractions through to Konva.
        if e.get("fractionalBox"):
            base.update(
                x=round(b["x"], 3),
                y=round(b["y"], 3),
                width=round(b["width"], 3),
                height=round(b["height"], 3),
            )
        base = _slot_contain_letterbox(base, e)
        image_el = {
            **base,
            "type": "image",
            "src": e["src"],
            "custom": {
                "placeholder": e["ph"],
                "placeholderBg": e.get("phBg", ""),
                "placeholderBgImage": e.get("phBgImage", ""),
                "objectFit": e["objectFit"],
                "filter": e.get("filter", "none"),
                "tag": e.get("tag", ""),
                "slotCandidate": bool(e.get("slot")),
                # 템플릿이 스스로 선언한 슬롯 이름(``data-slot``). 디컴포저의 이름과
                # 어휘가 달라, 브릿지가 둘을 이어 줄 때 이 값이 열쇠가 된다.
                "contractSlot": e.get("contractSlot", ""),
            },
        }
        # A rounded / circular image mask (a .ph with border-radius, e.g. the 5D
        # CICA leaf disc) must carry its radius as cornerRadius, or the image
        # renders as a hard rectangle. Konva clamps to half the box, so a huge
        # radius (border-radius:999px / 50%) becomes a true circle.
        r = round(e.get("radius", 0) or 0)
        if r > 0:
            image_el["cornerRadius"] = min(
                r, round(min(base["width"], base["height"]) / 2)
            )
        image_el.update(_image_crop(e, base))
        return image_el
    if e["kind"] == "text":
        # ``indent`` is a first-line indent — the proxy replays it as
        # ``text-indent``, but a canvas text element has one x and no first-line
        # indent, so the copy would paint from the block's left edge, on top of
        # the inline ``::before`` marker that made room for it (a list item's
        # "05" and "나이아신" sharing one x in the editor while the proxy and the
        # source page both read fine). ``indentTo`` is where the copy's first
        # glyph really sits in flow: start the box there and keep the right edge,
        # so nothing re-wraps. The proto — and therefore the proxy render — is
        # untouched.
        lead_x = round(e.get("indentTo") or 0)
        if lead_x > base["x"] and lead_x - base["x"] < base["width"] - 8:
            base = {
                **base,
                "x": lead_x,
                "width": base["width"] - (lead_x - base["x"]),
            }
        # slotCandidate marks primary, un-split copy the bridge turns into a
        # named editable slot; run/badge fragments stay locked decoration.
        custom = {
            "tag": e.get("tag", ""),
            "run": bool(e.get("run")),
            "slotCandidate": bool(e.get("slot")),
            # Text decoration travels in custom so the renderer keeps
            # strikethrough / underline / outline / italic / uppercase.
            "decoration": e.get("decoration", ""),
            "fontStyle": e.get("fontStyle", ""),
            "textTransform": e.get("textTransform", ""),
            "strokeWidth": e.get("strokeWidth", 0),
            "strokeColor": e.get("strokeColor", ""),
            "shadow": e.get("shadow", "none"),
            "filter": e.get("filter", "none"),
            # 템플릿이 스스로 선언한 슬롯 이름(``data-slot``). 없으면 빈 문자열.
            "contractSlot": e.get("contractSlot", ""),
        }
        text_el = {
            **base,
            "type": "text",
            "text": e["text"],
            "fill": e["color"],
            "fontSize": round(e["fontSize"]),
            "fontFamily": e["fontFamily"].split(",")[0].strip("'\" "),
            "fontWeight": e["fontWeight"],
            "align": (
                "center"
                if e.get("hcenter") or e.get("stickerCenter")
                else e["textAlign"]
            ),
            "lineHeight": e["lineHeight"],
            "custom": custom,
        }
        # Replay the source letter-spacing so the editor's Konva renders at the same
        # width the box was measured at (getBoundingClientRect includes 자간). Without
        # it, negative-spaced Korean headlines re-wrap their last word in the editor.
        # Canvas stores letterSpacing as an EM ratio (it renders
        # ``letterSpacing * fontSize`` px, see canvas/canvas/*-element.js), so
        # convert the computed px value to em — emitting raw px would multiply by the
        # font size and crush every glyph on top of the next.
        ls_px = _ls_px(e.get("letterSpacing"), text_el["fontSize"])
        if ls_px and text_el["fontSize"] > 0:
            text_el["letterSpacing"] = round(ls_px / text_el["fontSize"], 4)
        if e.get("decoration") == "line-through":
            text_el["textDecoration"] = "line-through"
        elif e.get("decoration") == "underline":
            text_el["textDecoration"] = "underline"
        # A badge's text now sits over a standalone background box (see pushText);
        # centre it vertically in that box exactly as the old text-background did.
        if e.get("vcenter"):
            text_el["verticalAlign"] = "center"
            # Canvas collapses a text element's height to its content on load and
            # anchors it at ``y``, so ``verticalAlign:center`` is a no-op for a
            # single line in a box taller than it — the glyph clings to the top of
            # the badge/pill (e.g. a step number "01" or a CTA "주문하기 →" sitting
            # 12–21px above centre). Pre-centre by shifting ``y`` down half the
            # slack and pinning the height to one line, so the collapse leaves the
            # text exactly where flex ``align-items:center`` put it in the source.
            # Content lines we can place EXACTLY: a single line always; a widened
            # decorative sticker whose explicit "\n" count is its real line count
            # (its box was sized so no line re-wraps). Any other multi-line chip
            # may wrap unpredictably, so we can't pre-place it and leave it be.
            line_h = _single_line_height(e)
            n_lines = (
                1
                if "\n" not in e["text"]
                else e["text"].count("\n") + 1
                if e.get("stickerCenter")
                else 0
            )
            content_h = n_lines * line_h
            # Only shift when the box carries real slack above the content (a
            # padded pill/CTA or a tall badge), not a snug chip that already reads
            # centred — 0.4 of a line keeps the vertical padding out of it.
            # NEVER pin a text that actually WRAPS (long copy in a wide cell whose
            # box is tall because it spans several visual lines, not because of
            # padding): pinning it to one line makes the frontend treat it as
            # single-line and overflow the page. Keep its real multi-line height.
            if (
                n_lines
                and not e.get("wraps")
                and base["height"] - content_h > line_h * 0.4
            ):
                text_el["y"] = round(base["y"] + (base["height"] - content_h) / 2)
                text_el["height"] = round(content_h)
        if e.get("bg"):
            # Legacy path (kept for any caller still emitting an inline text
            # background): a gradient/url background is not a valid solid fill, so
            # it rides in custom and backgroundColor stays transparent.
            bg = e["bg"]
            is_grad = "gradient" in bg or "url(" in bg
            if is_grad:
                custom["backgroundGradient"] = bg
            text_el.update(
                {
                    "backgroundEnabled": True,
                    "backgroundColor": "rgba(0,0,0,0)" if is_grad else bg,
                    "backgroundCornerRadius": round(e.get("radius", 0)),
                    "backgroundPadding": round(
                        max(e.get("padTop", 0), e.get("padLeft", 0))
                    ),
                    "verticalAlign": "center",
                }
            )
        return text_el
    return None


def _relieve_single_line_text_wrap(children, page_width):
    """Give left-aligned single-line text a little width headroom, safely.

    A text box is emitted at its headless-measured width. The editor renders with
    the real webfont, which is a hair wider (Latin ~2-4%, Korean ~1%), so a label
    like ``62.04% 개선`` (box 109) needs ~111 and wraps its last word to a second
    line — visible as a stray ``개선`` floating under the row. Widening the box a
    few percent fixes it, but only when it cannot collide: this expands a box to
    the right ONLY into genuinely empty space (bounded by the nearest element to
    its right on the same horizontal band) and only for start/left-aligned,
    single-line text (never multi-line, never centred — those would reflow or
    shift). By construction it can remove a wrap but never create an overlap.
    """
    GAP, MARGIN = 3, 8

    boxes = []

    def collect(eltree, ox=0, oy=0):
        for el in eltree:
            x = el.get("x", 0) + ox
            y = el.get("y", 0) + oy
            boxes.append((el, x, y, x + el.get("width", 0), y + el.get("height", 0)))
            kids = el.get("children") or []
            if kids:
                # groups carry no offset (x=y=0); nested items are absolute.
                collect(kids, x if el.get("type") == "group" else 0, oy=0)

    collect(children)

    for el, x, y, right, bottom in boxes:
        if el.get("type") != "text":
            continue
        if "\n" in (el.get("text") or ""):
            continue
        width = el.get("width", 0)
        if width <= 0:
            continue
        align = el.get("align")
        is_left = align in ("left", "start")
        # A narrow RUN fragment (a colour/size-split piece positioned at its own
        # snug rect, e.g. a trailing superscript "3)4)5)" after a centred
        # headline) can also widen rightward even when it inherited centre/right
        # alignment: its box already hugs the glyphs, so re-anchoring it to the
        # left and extending into the empty space on the right removes a wrap
        # without visibly moving the text. Guarded to narrow boxes so a genuinely
        # centred label sitting in a wide slot is never disturbed.
        is_run = bool((el.get("custom") or {}).get("run"))
        reanchor = not is_left and is_run and width <= 140
        if not is_left and not reanchor:
            continue
        limit = page_width - MARGIN
        for other, ox0, oy0, oright, obottom in boxes:
            if other is el or ox0 < right:
                continue  # only blockers that start to the right of this box
            if oy0 < bottom and obottom > y:  # vertical bands overlap
                limit = min(limit, ox0 - GAP)
        cushion = max(4, math.ceil(width * 0.06))
        new_width = min(width + cushion, limit - x)
        if new_width > width:
            el["width"] = round(new_width)
            if reanchor:
                # Keep the glyphs at ``x`` while the box grows to the right.
                el["align"] = "left"


_DECLARED_ALIGN = {
    "start": "left",
    "left": "left",
    "center": "center",
    "centre": "center",
    "end": "right",
    "right": "right",
}


def _apply_declared_groups(elements):
    """Wrap runs of same-``groupKey`` extracted elements into one group.

    A ``data-group`` container stamps every element its subtree emits (a painted
    box, the text riding on it, a sibling decoration like a speech-bubble tail
    SVG) with one key; those arrive consecutively in document order, so a run of
    equal keys is exactly that unit. Merging them into a Canvas group keeps the
    unit together when the editor re-measures text. A ``data-align`` on the same
    container is carried as ``groupAlign`` and applied to the unit's text so it is
    aligned on purpose (never force-centred). Unkeyed elements pass through
    unchanged, so nothing outside an annotated container is affected.
    """
    out = []
    i = 0
    n = len(elements)
    while i < n:
        gk = elements[i].get("groupKey")
        if not gk:
            out.append(elements[i])
            i += 1
            continue
        members = []
        while i < n and elements[i].get("groupKey") == gk:
            members.append(elements[i])
            i += 1
        claim = str(members[0].get("groupClaim") or "").strip()
        # A lone member normally needs no group — except when it declares a claim.
        # The bind drops an unsupported claim by group, so the unit must exist.
        if len(members) == 1 and not claim:
            out.append(members[0])
            continue
        for m in members:
            ga = m.get("groupAlign")
            if m.get("kind") == "text" and ga:
                mapped = _DECLARED_ALIGN.get(str(ga).lower())
                if mapped:
                    m["textAlign"] = mapped
                    # A declared alignment overrides the auto flex/sticker
                    # centring so the copy is placed exactly as the template asks.
                    m["hcenter"] = False
                    m["stickerCenter"] = False
        xs = [m["box"]["x"] for m in members]
        ys = [m["box"]["y"] for m in members]
        x1 = [m["box"]["x"] + m["box"]["width"] for m in members]
        y1 = [m["box"]["y"] + m["box"]["height"] for m in members]
        group = {
            "kind": "group",
            "declared": True,
            "box": {
                "x": min(xs),
                "y": min(ys),
                "width": max(x1) - min(xs),
                "height": max(y1) - min(ys),
                "rotation": 0,
            },
            "children": members,
        }
        chains = [m.get("filterChain") for m in members]
        if chains[0] and all(chain == chains[0] for chain in chains):
            group["filterChain"] = chains[0]
        if claim:
            group["claim"] = claim
            group["claimLabel"] = str(members[0].get("groupClaimLabel") or "").strip()
        out.append(group)
    return out


def _apply_filter_groups(elements, depth=0):
    """Wrap each CSS-filtered container once so its children are composited first."""
    out = []
    i = 0
    while i < len(elements):
        chain = elements[i].get("filterChain") or []
        if len(chain) <= depth:
            out.append(elements[i])
            i += 1
            continue
        info = chain[depth]
        members = []
        while i < len(elements):
            current = elements[i].get("filterChain") or []
            if len(current) <= depth or current[depth]["key"] != info["key"]:
                break
            members.append(elements[i])
            i += 1
        out.append(
            {
                "kind": "group",
                "declared": True,
                "filter": info["value"],
                "box": info["box"],
                "children": _apply_filter_groups(members, depth + 1),
            }
        )
    return out


def _border_sides(borders):
    """Present, visible border sides of an extracted box as (side, width, color)."""
    sides = []
    if borders:
        for side in ("top", "right", "bottom", "left"):
            s = borders.get(side) or {}
            w = s.get("w") or 0
            st = s.get("st") or "none"
            c = s.get("c") or ""
            if w > 0 and st != "none" and c:
                sides.append((side, w, c))
    return sides


def _border_is_full_uniform(borders):
    """True when all four sides are drawn in one colour — a real rectangle outline
    (a pill, a card) that keeps the canvas editor's uniform rect stroke. A box with only some
    sides (a table's border-top rule, a row's border-bottom divider) is not uniform;
    a uniform stroke would paint a full rectangle where the source has a single line,
    so those sides are split into thin rect lines instead."""
    sides = _border_sides(borders)
    if len(sides) != 4:
        return False
    return len({c for _, _, c in sides}) == 1


def _side_border_lines(e, eid):
    """Thin rect elements reproducing each present border side of a box whose border
    is NOT a full uniform rectangle. A ``border-bottom:1px`` row divider or a table's
    ``border-top`` rule becomes a 1px bar at that edge — exactly as the proxy draws
    it — instead of being promoted to a full four-sided outline. Returns [] for a
    full uniform border (kept as the rect's own stroke) or a border-less box."""
    borders = e.get("borders")
    if not borders or _border_is_full_uniform(borders):
        return []
    b = e["box"]
    x, y = round(b["x"]), round(b["y"])
    w, h = round(b["width"]), round(b["height"])
    lines = []
    for side, bw, color in _border_sides(borders):
        t = max(1, round(bw))
        if side == "top":
            rect = (x, y, w, t)
        elif side == "bottom":
            rect = (x, y + h - t, w, t)
        elif side == "left":
            rect = (x, y, t, h)
        else:  # right
            rect = (x + w - t, y, t, h)
        lines.append(
            {
                "id": f"{eid}-bd-{side}",
                "type": "figure",
                "subType": "rect",
                "x": rect[0],
                "y": rect[1],
                "width": rect[2],
                "height": rect[3],
                "rotation": 0,
                "fill": color,
                "cornerRadius": 0,
                "strokeWidth": 0,
                "stroke": "",
                "selectable": True,
                "custom": {"source": "html-border-side"},
            }
        )
    return lines


def _children_with_borders(elements, id_fn):
    """Map extracted elements to Canvas children, following each box with the thin
    rect lines for any single-side / partial border (a row divider, a table's top
    rule). Shared by the top-level pass and the group recursion so a bordered box
    inside a grouped grid row (a spec-table row) keeps its divider instead of it
    vanishing when the uniform stroke is suppressed."""
    out = []
    for j, c in enumerate(elements):
        cid = id_fn(j, c)
        node = _canvas_element(c, cid)
        if node is None:
            continue
        out.append(node)
        if c.get("kind") == "box":
            out.extend(_side_border_lines(c, cid))
    return out


def to_canvas(sec):
    """Map extracted elements to editable Canvas-style JSON."""
    page_width = sec.get("width", CANVAS)
    children = [
        {
            "type": "figure",
            "subType": "rect",
            "id": f"{sec['label']}-bg",
            "x": 0,
            "y": 0,
            "width": page_width,
            "height": sec["height"],
            "fill": sec["bg"],
            "rotation": 0,
            "selectable": True,
            "custom": {"gradient": sec["bgImage"] if sec["bgImage"] != "none" else ""},
        }
    ]
    children.extend(
        _children_with_borders(
            _apply_filter_groups(_apply_declared_groups(sec["elements"])),
            lambda i, e: f"{sec['label']}-{e['kind']}-{i}",
        )
    )
    _relieve_single_line_text_wrap(children, page_width)
    return {
        "width": page_width,
        "height": sec["height"],
        "pages": [{"id": sec["label"], "children": children}],
    }


def render_proxy(sec):
    """Faithful HTML render of the editable element tree (fidelity ceiling)."""
    parts = []

    # Every value below is concatenated into a style="..." attribute. Some carry
    # quotes / angle brackets (e.g. a url("data:image/svg+xml;...<svg>...")
    # background), which would otherwise terminate the attribute early and dump
    # raw CSS/SVG as visible text. Escaping the assembled style string keeps the
    # attribute intact; the browser decodes the entities back before CSS parsing.
    def esc(style):
        return htmllib.escape(style, quote=True)

    def border_css(e):
        # Render each border side independently so a single bottom/left rule (a
        # row divider, a left accent bar) is drawn exactly — not promoted to a
        # full rectangle and not dropped. Falls back to the legacy single border.
        bd = e.get("borders")
        if bd:
            out = []
            for side in ("top", "right", "bottom", "left"):
                s = bd.get(side) or {}
                if s.get("w", 0) > 0 and s.get("st", "none") != "none":
                    out.append(f"border-{side}:{s['w']}px {s['st']} {s['c']};")
            return "".join(out)
        return (
            f"border:{e['borderWidth']}px {e['borderStyle']} {e['borderColor']};"
            if e.get("borderWidth", 0) > 0
            else ""
        )

    bgcss = sec["bgImage"] if sec["bgImage"] != "none" else sec["bg"]

    # Groups are a structural wrapper only (their children keep absolute page
    # coordinates), so flatten them for the flat-positioned proxy render.
    def _flatten(elements):
        flat = []
        for el in elements:
            if el.get("kind") == "group":
                if el.get("filter"):
                    flat.append({"kind": "filter-start", "filter": el["filter"]})
                flat.extend(_flatten(el.get("children") or []))
                if el.get("filter"):
                    flat.append({"kind": "filter-end"})
            else:
                flat.append(el)
        return flat

    grouped = _apply_filter_groups(_apply_declared_groups(sec["elements"]))
    for e in _flatten(grouped):
        if e["kind"] == "filter-start":
            parts.append(
                f'<div style="position:absolute;inset:0;filter:{esc(e["filter"])}">'
            )
            continue
        if e["kind"] == "filter-end":
            parts.append("</div>")
            continue
        b = e["box"]
        pos = (
            f"position:absolute;left:{b['x']}px;top:{b['y']}px;"
            f"width:{b['width']}px;height:{b['height']}px;opacity:{e.get('opacity', 1)};"
            f"transform:rotate({_rot(e)}deg);transform-origin:center center;"
        )
        if e["kind"] == "box":
            bg = e["gradient"] if e["gradient"] else e["fill"]
            border = border_css(e)
            shadow = e["shadow"] if e["shadow"] != "none" else "none"
            box_css = (
                f"background:{bg};border-radius:{e['radius']}px;"
                f"box-shadow:{shadow};{border}"
            )
            cl = e.get("clip")
            if cl:
                # The shape stays a whole circle but is clipped to the owning
                # card (overflow:hidden), so it shows only in part — exactly the
                # original look, with nothing spilling outside the card.
                inner = (
                    f"position:absolute;left:{b['x'] - cl['x']}px;top:{b['y'] - cl['y']}px;"
                    f"width:{b['width']}px;height:{b['height']}px;opacity:{e.get('opacity', 1)};"
                    f"transform:rotate({_rot(e)}deg);transform-origin:center center;"
                )
                clip_css = (
                    f"position:absolute;left:{cl['x']}px;top:{cl['y']}px;"
                    f"width:{cl['width']}px;height:{cl['height']}px;"
                    f"border-radius:{cl['radius']}px;overflow:hidden;"
                )
                parts.append(
                    f'<div style="{esc(clip_css)}">'
                    f'<div style="{esc(inner + box_css)}"></div></div>'
                )
            else:
                parts.append(f'<div style="{esc(pos + box_css)}"></div>')
        elif e["kind"] == "svg":
            parts.append(
                f'<div style="{esc(pos + "color:" + e["color"] + ";")}">{e["svg"]}</div>'
            )
        elif e["kind"] == "image":
            if e["src"]:
                img_css = (
                    f"{pos}object-fit:{e['objectFit']};"
                    f"object-position:{e.get('objectPosition') or '50% 50%'};"
                    f"filter:{e.get('filter') or 'none'};"
                    f"border-radius:{e['radius']}px;"
                )
                parts.append(f'<img src="{esc(e["src"])}" style="{esc(img_css)}"/>')
            else:
                # A .ph placeholder is a textured box (blueprint grid / diagonal
                # hatch / warm tint), not flat grey. Replay its captured
                # background layers + border so it matches the original, and show
                # only the central caption (corner ticks are separate elements).
                layers = []
                if e.get("phBgImage"):
                    layers.append(f"background-image:{e['phBgImage']};")
                    if e.get("phBgSize"):
                        layers.append(f"background-size:{e['phBgSize']};")
                    if e.get("phBgRepeat"):
                        layers.append(f"background-repeat:{e['phBgRepeat']};")
                    if e.get("phBgPosition"):
                        layers.append(f"background-position:{e['phBgPosition']};")
                bgcolor = e.get("phBg") or "rgba(0,0,0,.04)"
                border = (
                    f"border:{e['phBorderW']}px {e.get('phBorderS', 'solid')} "
                    f"{e.get('phBorderC', '')};"
                    if e.get("phBorderW")
                    else ""
                )
                ph_css = (
                    f"{pos}border-radius:{e['radius']}px;display:flex;"
                    f"align-items:center;justify-content:center;text-align:center;"
                    f"color:rgba(0,0,0,.4);font-size:14px;padding:12px;line-height:1.5;"
                    f"background-color:{bgcolor};{''.join(layers)}{border}"
                )
                parts.append(
                    f'<div style="{esc(ph_css)}">{htmllib.escape(e["ph"])}</div>'
                )
        elif e["kind"] == "text":
            # Convert explicit newlines to <br> so line breaks always render.
            safe = htmllib.escape(e["text"]).replace("\n", "<br>")
            pad = (
                f"padding:{e.get('padTop', 0)}px {e.get('padRight', 0)}px "
                f"{e.get('padBottom', 0)}px {e.get('padLeft', 0)}px;"
            )
            talign = e["textAlign"]
            # Badges/chips and any genuinely single-line copy keep their line
            # intact (nowrap) so a font-metric difference can't spill a syllable
            # onto a second line; multi-line copy still wraps to fit its box
            # (its width matches the original, so the wrapping matches too). The
            # text is wrapped in an inline-block span so white-space actually
            # applies (it does not on an anonymous flex item).
            # Only a genuinely single-line element keeps nowrap (a badge can't
            # spill a syllable); a multi-line callout box must wrap inside itself.
            nowrap = bool(e.get("singleLine"))
            # text-decoration does NOT propagate across an inline-block boundary
            # (CSS spec: atomic inline establishes a new decoration context), so a
            # strikethrough price wrapped in the nowrap span would lose its line.
            # Carry the line-through/underline ON the span itself.
            deco = e.get("decoration") or ""
            span_deco = f"text-decoration:{deco};" if deco else ""
            body = (
                f'<span style="display:inline-block;white-space:nowrap;{span_deco}">{safe}</span>'
                if nowrap
                else safe
            )
            el_border = border_css(e)
            shadow = (
                e.get("shadow") if e.get("shadow") not in (None, "", "none") else "none"
            )
            # A pill/outline BUTTON has a border on all four sides plus a radius but
            # often NO background (e.g. a "♡ 위시리스트" / outlined CTA). It is still a
            # centred chip and must keep its rounded shape — without this it falls to
            # the plain-copy branch, which drops the radius and renders a sharp box.
            # A one-sided border (a footnote / row divider) is NOT a pill.
            bd = e.get("borders") or {}
            full_box = all(
                (bd.get(s) or {}).get("w", 0) > 0
                for s in ("top", "right", "bottom", "left")
            )
            is_pill = e.get("singleLine") and (
                e.get("bg") or (e.get("radius", 0) > 0 and full_box)
            )
            if e.get("vcenter"):
                # A flex/grid box that vertically centres a single line in a box far
                # taller than that line — a number/letter circle (56×56, the digit
                # centred by align-items:center). Replay that centring so the glyph
                # sits in the middle instead of top-aligning and clipping at the
                # circle's edge. Works whether the badge is filled or border-only.
                talign = "center"
                bgpart = f"background:{e['bg']};" if e.get("bg") else ""
                container = (
                    f"{bgpart}border-radius:{e.get('radius', 0)}px;{el_border}"
                    f"box-shadow:{shadow};display:flex;flex-direction:column;"
                    f"justify-content:center;align-items:center;{pad}"
                )
            elif is_pill:
                # A short pill / badge / highlight / outline button: centred both
                # ways so it hugs its text symmetrically — no right-side slack from a
                # lost flex `gap` — and always stays contained, keeping its radius.
                talign = "center"
                bgpart = f"background:{e['bg']};" if e.get("bg") else ""
                container = (
                    f"{bgpart}border-radius:{e.get('radius', 0)}px;{el_border}"
                    f"box-shadow:{shadow};display:flex;flex-direction:column;"
                    f"justify-content:center;align-items:center;{pad}"
                )
            elif e.get("bg"):
                # A multi-line box WITH a real background (a callout / abstract
                # with a left accent): keep the bg, border and padding but let the
                # copy WRAP at the element's own alignment — never nowrap-clip it.
                container = (
                    f"background:{e['bg']};border-radius:{e.get('radius', 0)}px;"
                    f"{el_border}box-shadow:{shadow};{pad}"
                )
            elif e.get("run"):
                # Plain heading fragment positioned at its real Range rect: render
                # top-left with no padding so the glyphs land exactly where the
                # browser flowed them (keeps the gap before a trailing word). A
                # border-only run (a divider rule on the fragment) keeps its sides.
                container = el_border
            else:
                # Plain flowing copy: normal top-left block with the original
                # padding, keeping the element's own alignment and any border
                # divider (e.g. a footnote/list-row with only border-top) — NOT a
                # centred full-box pill.
                container = pad + el_border
            indent = f"text-indent:{e['indent']}px;" if e.get("indent") else ""
            # Outline (text-stroke + transparent fill), strikethrough/underline,
            # italics and uppercase: replay each so an outlined headline shows its
            # stroke, a sale price keeps its line-through, etc.
            fstyle = e.get("fontStyle") or "normal"
            ttransform = e.get("textTransform") or "none"
            sw = e.get("strokeWidth") or 0
            deco_css = (
                (f"text-decoration:{deco};" if deco else "")
                + (f"font-style:{fstyle};" if fstyle not in ("", "normal") else "")
                + (
                    f"text-transform:{ttransform};"
                    if ttransform not in ("", "none")
                    else ""
                )
                + (
                    f"-webkit-text-stroke:{sw}px {e.get('strokeColor') or 'currentColor'};"
                    if sw and sw > 0
                    else ""
                )
            )
            # Replay word-break / overflow-wrap so a no-space token that the
            # original broke mid-word (overflow-wrap:anywhere) wraps inside its box
            # instead of overflowing onto its neighbour. nowrap badges are immune
            # (their inner span forces white-space:nowrap).
            wb = e.get("wordBreak") or "normal"
            ow = e.get("overflowWrap") or "normal"
            wrap_props = (
                f"word-break:{wb};overflow-wrap:{ow};"
                if wb not in ("", "normal") or ow not in ("", "normal")
                else ""
            )
            text_css = (
                f"{pos}{container}{indent}{deco_css}{wrap_props}text-shadow:{shadow};"
                f"filter:{e.get('filter') or 'none'};"
                f"color:{e['color']};"
                f"font-size:{e['fontSize']}px;font-weight:{e['fontWeight']};"
                f"text-align:{talign};line-height:{e['lineHeight']};"
                f"letter-spacing:{e['letterSpacing']};font-family:{e['fontFamily']};"
                f"overflow:visible;"
            )
            parts.append(f'<div style="{esc(text_css)}">{body}</div>')
    wrap_css = (
        f"position:relative;width:{sec['width']}px;height:{sec['height']}px;"
        f"background:{bgcss};overflow:hidden;"
    )
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        "<style>*{box-sizing:border-box;margin:0}"
        "body{font-family:'Pretendard Variable',Pretendard,-apple-system,system-ui,sans-serif}</style></head><body>"
        f'<div style="{esc(wrap_css)}">' + "".join(parts) + "</div></body></html>"
    )


def build_comparison(labels, out_dir, stem):
    """Stitch one tall PNG: proxy | black separator | original, per section.

    Both sides use their rendered width, so 750px detail pages and 1080px
    carousels can be checked without cropping.
    """
    SEP = 200
    GAP = 24
    rows = []
    for lbl in labels:
        po, oo = out_dir / f"{lbl}.proxy.png", out_dir / f"{lbl}.original.png"
        if not (po.exists() and oo.exists()):
            continue

        proxy = Image.open(po).convert("RGB")
        original = Image.open(oo).convert("RGB")
        width = max(proxy.width, original.width)
        if proxy.width != width:
            proxy = proxy.resize((width, round(proxy.height * width / proxy.width)))
        if original.width != width:
            original = original.resize(
                (width, round(original.height * width / original.width))
            )
        rows.append((proxy, original, max(proxy.height, original.height)))
    if not rows:
        return None
    total_h = sum(r[2] for r in rows) + GAP * (len(rows) - 1)
    width = max(max(proxy.width, original.width) for proxy, original, _ in rows)
    total_w = width + SEP + width
    canvas = Image.new("RGB", (total_w, total_h), (255, 255, 255))
    canvas.paste(Image.new("RGB", (SEP, total_h), (0, 0, 0)), (width, 0))
    y = 0
    for proxy, original, h in rows:
        canvas.paste(proxy, (0, y))
        canvas.paste(original, (width + SEP, y))
        y += h + GAP
    out_path = out_dir / f"compare_{stem}.png"
    canvas.save(out_path)
    return out_path


def compare_pixels(
    original_path, proxy_path, diff_path, baseline_percent, allowed_drift=0.05
):
    """Return the different-pixel percentage and keep a diff on regression."""
    original = Image.open(original_path).convert("RGB")
    proxy = Image.open(proxy_path).convert("RGB")
    if original.size != proxy.size:
        raise AssertionError(
            f"image size differs: original={original.size}, proxy={proxy.size}"
        )
    diff = ImageChops.difference(original, proxy)
    different = sum(pixel != (0, 0, 0) for pixel in diff.getdata())
    percent = different / (original.width * original.height) * 100
    if percent > baseline_percent + allowed_drift:
        diff.point(lambda value: min(255, value * 4)).save(diff_path)
    elif diff_path.exists():
        diff_path.unlink()
    return percent


async def process_template(
    browser, html_path, out_dir, sections=None, profile: Profile = DETAIL_PAGE
):
    """Decompose one template HTML into per-section editable Canvas JSON +
    proxy/original renders + a side-by-side comparison PNG, all under out_dir.

    Returns the list of section labels actually built (empty if none)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    done = []
    page = await browser.new_page(
        viewport={"width": CANVAS, "height": 9000}, device_scale_factor=2
    )
    try:
        await page.goto(html_path.as_uri(), wait_until="networkidle")
        if not profile.slice_by:
            width = await page.evaluate(
                "() => Math.max(document.body.scrollWidth, "
                "...Array.from(document.body.children, n => n.getBoundingClientRect().right))"
            )
            await page.set_viewport_size({"width": width, "height": 9000})
        await page.evaluate("() => document.fonts.ready")
        # Register + warm up the editor's own font bytes so every width we
        # measure below matches what the canvas draws (see BUNDLE_FONT_FAMILIES).
        await allow_bundle_font_cors(page)
        for _slug in BUNDLE_FONT_FAMILIES:
            await page.add_style_tag(url=bundle_font_css_url(_slug))
        report = await page.evaluate(FONT_WARMUP_JS, list(BUNDLE_FONT_FAMILY_NAMES))
        if not (report or {}).get("ok"):
            # Refuse rather than warn. A silent fallback here produces geometry
            # that looks fine and is wrong by a few pixels everywhere, which is
            # far more expensive to notice than a failed run.
            raise RuntimeError(
                "Pretendard did not resolve from the render-fonts bundle "
                f"({RENDER_FONTS_BASE_URL}); refusing to measure against "
                f"fallback metrics {describe_font_warmup(report)}"
            )
        print(f"font warm-up: Pretendard {describe_font_warmup(report)}")
        # Flatten sup/sub markers inline so paragraphs with only weight/superscript
        # emphasis stay one un-fragmented text element (see NORMALIZE_JS).
        await page.evaluate(NORMALIZE_JS)
        labels = sections or (
            await page.evaluate(
                "() => [...document.querySelectorAll('[data-screen-label]')]"
                ".map(n => n.getAttribute('data-screen-label'))"
            )
            if profile.slice_by
            else [html_path.stem]
        )
        print(f"template: {html_path.name}  sections: {len(labels)}")
        for lbl in labels:
            # Group the labeled header with its unlabeled body siblings, so both
            # the extraction and the screenshot cover the whole screen; always
            # unwrap afterwards so the next screen sees pristine DOM.
            wrapped = not profile.slice_by or await page.evaluate(WRAP_JS, lbl)
            if not wrapped:
                print("missing", lbl)
                continue
            try:
                sec = await page.evaluate(
                    EXTRACT,
                    {
                        "label": lbl,
                        "sliceBy": profile.slice_by,
                        "placeholderClass": profile.placeholder_class,
                        "splitSvgParts": profile.split_svg_parts,
                    },
                )
                if not sec:
                    print("missing", lbl)
                    continue
                # A display:none screen (e.g. a hidden alternate solution-2/-3)
                # has a zero-size box. Skip it: nothing to decompose and the
                # screenshot would retry-scroll forever on an invisible node.
                if sec["width"] < 2 or sec["height"] < 2:
                    print(f"{lbl}: skipped (hidden, {sec['width']}x{sec['height']})")
                    continue
                tp = to_canvas(sec)
                (out_dir / f"{lbl}.canvas.json").write_text(
                    json.dumps(tp, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                handle = await page.evaluate_handle(
                    "l=>l ? document.querySelector('[data-screen-wrap=\"'+"
                    "(window.CSS&&CSS.escape?CSS.escape(l):l)+'\"]') : document.body",
                    lbl if profile.slice_by else None,
                )
                # animations="disabled" freezes any CSS animation/transition so
                # the element reaches a stable frame; the wider timeout absorbs
                # the rare transient stall that aborted a whole template.
                await handle.as_element().screenshot(
                    path=str(out_dir / f"{lbl}.original.png"),
                    animations="disabled",
                    timeout=60000,
                )
                await handle.dispose()
            finally:
                if profile.slice_by:
                    await page.evaluate(UNWRAP_JS, lbl)
            pp = await browser.new_page(
                viewport={
                    "width": max(CANVAS, int(sec["width"])),
                    "height": max(800, int(sec["height"])),
                },
                device_scale_factor=2,
            )
            await pp.goto(html_path.as_uri(), wait_until="networkidle")
            await pp.set_content(render_proxy(sec), wait_until="networkidle")
            await allow_bundle_font_cors(pp)
            for _slug in BUNDLE_FONT_FAMILIES:
                await pp.add_style_tag(url=bundle_font_css_url(_slug))
            report = await pp.evaluate(FONT_WARMUP_JS, list(BUNDLE_FONT_FAMILY_NAMES))
            if not (report or {}).get("ok"):
                raise RuntimeError(
                    "Pretendard did not resolve in proxy render "
                    f"{describe_font_warmup(report)}"
                )
            await pp.wait_for_timeout(400)
            await pp.screenshot(path=str(out_dir / f"{lbl}.proxy.png"), full_page=True)
            await pp.close()
            kinds = {}
            for e in sec["elements"]:
                kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
            print(f"{lbl}: {len(sec['elements'])} elements {kinds}")
            done.append(lbl)
    finally:
        await page.close()
    compare = build_comparison(done, out_dir, html_path.stem)
    if compare:
        print(f"comparison -> {compare}")
    return done


async def main(templates, out_base, sections, profile=DETAIL_PAGE):
    """Launch one browser and decompose every template into its own folder.

    A failure on one template is logged and skipped so the batch still finishes
    the rest — one broken HTML must not abort the whole sweep."""
    total = len(templates)
    ok = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--headless=new"])
        try:
            for idx, html_path in enumerate(templates, 1):
                out_dir = out_base / html_path.stem
                print(f"\n=== [{idx}/{total}] {html_path.stem} -> {out_dir} ===")
                try:
                    done = await process_template(b, html_path, out_dir, sections, profile)
                    if done:
                        ok += 1
                except Exception as exc:  # noqa: BLE001 - keep the batch going
                    print(f"FAILED {html_path.name}: {exc}")
        finally:
            await b.close()
    print(f"\ndone: {ok}/{total} templates")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Compile a detail-page HTML template into editable Canvas "
        "JSON + proxy renders + a side-by-side comparison PNG."
    )
    parser.add_argument(
        "html",
        nargs="?",
        default=None,
        help=f"Path to a single template HTML. Omit and pass --all to build "
        f"every template. (default: {DEFAULT_HTML})",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help=f"Build every *.html template in {DEFAULT_TEMPLATE_DIR.name}/ "
        f"(skips {sorted(SKIP_TEMPLATES)}), each into its own "
        f"<out>/<template>/ folder.",
    )
    parser.add_argument(
        "--out",
        default=DEFAULT_OUT_BASE,
        help=f"Base output directory; each template is written to "
        f"<out>/<template>/ (default: {DEFAULT_OUT_BASE})",
    )
    parser.add_argument(
        "--sections",
        nargs="+",
        default=None,
        help="Section labels to build (default: every "
        "[data-screen-label] section in the HTML)",
    )
    parser.add_argument(
        "--profile",
        choices=("detail-page", "carousel"),
        default="detail-page",
    )
    return parser.parse_args()


if __name__ == "__main__":
    _args = parse_args()
    _out_base = Path(_args.out)
    if _args.all:
        if _args.html:
            raise SystemExit("Pass either a single HTML path or --all, not both.")
        _templates = sorted(
            p.resolve()
            for p in DEFAULT_TEMPLATE_DIR.glob("*.html")
            if p.name not in SKIP_TEMPLATES
        )
        if not _templates:
            raise SystemExit(f"No templates found in {DEFAULT_TEMPLATE_DIR}")
    else:
        _html = Path(_args.html or DEFAULT_HTML).resolve()
        if not _html.exists():
            raise SystemExit(f"HTML not found: {_html}")
        _templates = [_html]
    _profile = CAROUSEL if _args.profile == "carousel" else DETAIL_PAGE
    asyncio.run(main(_templates, _out_base, _args.sections, _profile))
