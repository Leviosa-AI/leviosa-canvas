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

EXTRACT = r"""
({label, sliceBy, placeholderClass}) => {
  // The screen is the temporary wrapper built by WRAP_JS: it holds the labeled
  // header PLUS every following unlabeled sibling up to the next labeled screen.
  // Many templates put data-screen-label on a tiny header div (.sh) and keep the
  // real body in an UNLABELED <section> next to it; grouping them is the only way
  // to capture the whole screen instead of just the header strip.
  const section = sliceBy
    ? document.querySelector('[data-screen-wrap="' + (window.CSS && CSS.escape ? CSS.escape(label) : label) + '"]')
    : document.body;
  if (!section) return null;
  const srect = section.getBoundingClientRect();
  const px = v => { const n = parseFloat(v||'0'); return isFinite(n)?n:0; };
  const transparent = c => { const t=(c||'').replace(/\s/g,'').toLowerCase();
    if(!t||t==='transparent') return true;
    // Only an rgba() whose ALPHA (4th component) is 0 is transparent. A naive
    // endsWith(',0)') also matched any SOLID colour whose last channel is 0 —
    // yellow rgb(255,235,0), red rgb(255,0,0), etc. — so every yellow/red
    // highlight, chip and value-bar fill was wrongly dropped as "transparent".
    const m=t.match(/^rgba?\(([^)]+)\)$/);
    if(m){ const p=m[1].split(','); return p.length===4 && parseFloat(p[3])===0; }
    return false; };
  const vis = el => { const s=getComputedStyle(el), r=el.getBoundingClientRect();
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0; };
  // Only skip pure-icon wrappers. num/dot carry real numbers (step badges) and
  // must be captured.
  const SKIP=new Set(['ico','icon']);
  const lhPx = s => { const v=s.lineHeight;
    return v==='normal' ? px(s.fontSize)*1.2 : (px(v)||px(s.fontSize)*1.2); };
  // Natural single-line width of a text run, measured in the decomposer's own
  // font metrics (same canvas the frontend adapter uses). Used to tell whether a
  // vcentred text truly fits one line in its box (a step number "01" in a circle)
  // or actually WRAPS to several visual lines (a long 전성분 list in a wide td):
  // the two look identical by box height alone, but only the wrapper must keep its
  // multi-line height instead of being pinned to one line.
  const _mctx = document.createElement('canvas').getContext('2d');
  const measureLineW = (txt, s) => {
    _mctx.font = `${s.fontWeight||'400'} ${px(s.fontSize)}px ${s.fontFamily||'sans-serif'}`;
    // Match how the editor's Konva measures: it adds letter-spacing per glyph and
    // ignores it for wrapping only if absent. Korean headlines use negative 자간
    // (letter-spacing:-0.02em); getBoundingClientRect reflects it (narrower) but a
    // bare measureText does NOT, so a box sized from the rect looks too narrow and
    // the editor re-wraps the last word. Applying the same letter-spacing here (and
    // emitting it onto the element) keeps measurement, box and render in lock-step.
    const ls = (s.letterSpacing && s.letterSpacing !== 'normal') ? s.letterSpacing : '0px';
    try { _mctx.letterSpacing = ls; } catch (_) { /* pre-Chrome-99: best effort */ }
    let w = 0;
    for (const ln of String(txt).split('\n')) w = Math.max(w, _mctx.measureText(ln).width);
    return w;
  };
  // Collapse spaces/tabs but PRESERVE explicit newlines (innerText turns <br>
  // and block boundaries into \n); otherwise headline/badge line breaks vanish.
  const clean=v=>(v||'').replace(/[ \t\f\v\r]+/g,' ').replace(/ *\n */g,'\n')
    .replace(/\n{3,}/g,'\n\n').trim();
  // The element's OWN copy — the text baked into an inline <svg> is not it.
  //
  // innerText DOES include an svg's <text> (verified in Chromium: a div wrapping
  // an "Fe/철" emblem reads back "Fe\n철"), but that copy belongs to the svg: the
  // svg branch lifts each centred <text> out as its own native, editable element.
  // If a block also claimed it, the label would be emitted TWICE — once as the
  // badge's split text, once as a full-width ghost text under it (the layers
  // panel then reads group[도형, Fe, 철] + a stray "Fe 철").
  //
  // Hiding the svgs for the read is deliberate: a hand-rolled walk would have to
  // re-derive innerText's line-break rules, and getting those wrong silently
  // mangles every headline. display:none is restored before anything is measured.
  const htmlText = el => {
    if (el.closest('svg')) return clean(el.textContent||'');
    const svgs=[...el.querySelectorAll('svg')].filter(s=>s.querySelector('text'));
    if (!svgs.length) return clean(el.innerText||el.textContent||'');
    const prev=svgs.map(s=>s.style.display);
    svgs.forEach(s=>{ s.style.display='none'; });
    const t=clean(el.innerText||'');   // NOT textContent: that leaks the hidden svg copy
    svgs.forEach((s,i)=>{ s.style.display=prev[i]; });
    return t;
  };
  // Block-level tags. A text block must not contain another block that itself
  // carries text (that means it is a container of separate text blocks).
  const BLOCK=new Set(['DIV','SECTION','ARTICLE','UL','OL','LI','TABLE','TBODY',
    'TR','TD','TH','P','H1','H2','H3','H4','H5','H6','HEADER','FOOTER','NAV','FIGURE','FIGCAPTION']);
  const hasBlockTextChild = el => [...el.children].some(
    c => BLOCK.has(c.tagName) && htmlText(c).length>0);
  const isTextBlock = el => {
    if (el.tagName==='svg' || el.closest('svg')) return false;
    if ([...el.classList].some(c=>SKIP.has(c))) return false;
    const t = htmlText(el);
    if (!t.length) return false;
    if (hasBlockTextChild(el)) return false;
    // Single-glyph text: keep real content (a big "0" stat, a "%", comparison
    // marks O/X/△/○/●). Only a purely DECORATIVE mark (bullet/dot/dash) needs a
    // painted badge to count — otherwise it is noise. Denylist, not allowlist,
    // so symbol content (△ ○ ✓ ✕) is never dropped.
    if (t.length<=1 && /[·•‣⋅∙・･▪▫◦▸▹‧※＊*–—\-]/.test(t)){
      const s=getComputedStyle(el);
      const painted=!transparent(s.backgroundColor)||(s.backgroundImage&&s.backgroundImage!=='none');
      if(!painted) return false;
    }
    return true;
  };
  // Rotation from the computed transform matrix, in degrees.
  const rotationDeg = s => {
    const t=s.transform; if(!t||t==='none') return 0;
    const m=t.match(/matrix\(([^)]+)\)/); if(!m) return 0;
    const p=m[1].split(',').map(Number);
    return Math.round(Math.atan2(p[1], p[0]) * 180 / Math.PI * 100)/100;
  };
  // Geometry around the element CENTER using the layout size, so a rotated
  // element is not stretched to its axis-aligned bounding box.
  const geom = el => {
    const r=el.getBoundingClientRect();
    const w=el.offsetWidth>0 ? el.offsetWidth : r.width;
    const h=el.offsetHeight>0 ? el.offsetHeight : r.height;
    const cx=r.left + r.width/2 - srect.left;
    const cy=r.top + r.height/2 - srect.top;
    return {x:cx-w/2, y:cy-h/2, width:w, height:h, rotation:rotationDeg(getComputedStyle(el))};
  };
  // Effective screen background: templates frequently paint the page background
  // on an ancestor (the .dp page wrapper / body), not on the section itself, so
  // reading only the wrapper's own (transparent) background would render the
  // screen on white and make light-on-dark copy vanish. Use the labeled head's
  // own paint first (e.g. casual paints the <section>); otherwise climb to the
  // nearest painted ancestor; finally fall back to <body>.
  const head = section.querySelector('[data-screen-label]') || section;
  const paints = s => !transparent(s.backgroundColor) || (s.backgroundImage && s.backgroundImage!=='none');
  const firstPainted = (start, climb) => {
    let n = start;
    while(n && n!==document.documentElement){
      const cs=getComputedStyle(n);
      if(paints(cs)) return {bg:cs.backgroundColor,
        img:(cs.backgroundImage && cs.backgroundImage!=='none') ? cs.backgroundImage : 'none'};
      if(!climb) break; n=n.parentElement;
    }
    return null;
  };
  let eff = firstPainted(head, false) || firstPainted(section.parentElement, true);
  if(!eff){ const bs=getComputedStyle(document.body);
    eff={bg:bs.backgroundColor, img:(bs.backgroundImage!=='none')?bs.backgroundImage:'none'}; }
  const out={label, width:srect.width, height:Math.max(section.scrollHeight, srect.height),
    bg:eff.bg, bgImage:eff.img, elements:[]};
  const textSet=new Set();
  const handled=new Set();
  // ---- Declared grouping (data-group / data-align) -------------------------
  // A container marked ``data-group`` binds EVERYTHING its subtree emits (a
  // painted box, the text that rides on it, a sibling decoration like a speech
  // bubble's tail SVG) into ONE Canvas group downstream, so the unit moves and
  // aligns as a whole instead of drifting apart when re-measured in the editor.
  // ``data-align`` on the same container declares the intended text alignment
  // (start|center|end|left|right) so the group is aligned on purpose, never
  // force-centred. Both resolve to the OUTERMOST marked ancestor so nested marks
  // still yield a single unit. Every emitted element is stamped with the current
  // element's group key; a Python pass (`_apply_declared_groups`) wraps runs of
  // the same key into a group and applies the declared alignment.
  let _gk='', _ga='', _gc='', _gcl='', _gidc=0;
  // ``data-claim`` on the same container declares WHAT the unit asserts about the
  // product (a moisture-wicking diagram, a cutaway callout). It rides along to
  // ``custom.claim`` so the bind can drop the whole unit when the bound product
  // does not support that claim — the drawing would otherwise keep asserting it.
  const groupInfo=el=>{
    let key='', al='', cl='', cll='', node=el;
    while(node && node!==section && node.nodeType===1){
      if(node.hasAttribute && node.hasAttribute('data-group')){
        if(!node.__gid) node.__gid='grp'+(++_gidc);
        key=node.__gid;
        const a=node.getAttribute('data-align');
        if(a) al=a;
      }
      if(node.hasAttribute && node.hasAttribute('data-claim')){
        cl=node.getAttribute('data-claim')||'';
        cll=node.getAttribute('data-claim-label')||'';
      }
      node=node.parentElement;
    }
    return {key, al, claim:cl, claimLabel:cll};
  };
  const stampGroup=from=>{
    if(!_gk) return;
    for(let i=from;i<out.elements.length;i++){
      if(out.elements[i].groupKey) continue;
      out.elements[i].groupKey=_gk;
      if(_ga && (out.elements[i].kind==='text')) out.elements[i].groupAlign=_ga;
      if(_gc){ out.elements[i].groupClaim=_gc; out.elements[i].groupClaimLabel=_gcl; }
    }
  };
  // getComputedStyle returns border-radius percentages verbatim ("50%"), which
  // parseFloat would wrongly read as 50px. Resolve % against the box so a
  // border-radius:50% square stays a true circle (radius = half its size).
  const radiusOf=(cs, w, h)=>{
    const v=cs.borderTopLeftRadius||'0';
    return v.indexOf('%')>=0 ? Math.min(w,h)*parseFloat(v)/100 : px(v);
  };
  // Per-side borders, so a row divider drawn with border-BOTTOM (spec tables,
  // FAQ rules, comparison rows) survives — the old code only read border-TOP and
  // dropped every bottom/left/right rule.
  const sideBorders=cs=>({
    top:    {w:px(cs.borderTopWidth),    c:cs.borderTopColor,    st:cs.borderTopStyle},
    right:  {w:px(cs.borderRightWidth),  c:cs.borderRightColor,  st:cs.borderRightStyle},
    bottom: {w:px(cs.borderBottomWidth), c:cs.borderBottomColor, st:cs.borderBottomStyle},
    left:   {w:px(cs.borderLeftWidth),   c:cs.borderLeftColor,   st:cs.borderLeftStyle},
  });
  const anyBorder=cs=>['Top','Right','Bottom','Left'].some(d=>
    px(cs['border'+d+'Width'])>0 && cs['border'+d+'Style']!=='none');
  // The template's own slot contract (``data-slot``), read from the nearest
  // enclosing declaration. The decomposer names its slots by position
  // (``hero.text_02``); a composed template names them by meaning
  // (``hero.eyebrow``) and generates copy under THOSE names. Carrying the
  // declaration here is what lets the two vocabularies be joined later —
  // without it the editor drops the generated copy on the floor and shows the
  // mockup text instead. Authored templates that declare nothing get ''.
  const slotOf=(el)=>{
    if(!el || !el.closest) return '';
    const owner = el.closest('[data-slot]');
    return owner ? (owner.getAttribute('data-slot')||'') : '';
  };
  // Emit one editable text element from a geometry + computed style.
  const pushText=(g, text, s, opts)=>{
    opts=opts||{};
    // An inline highlight drawn with a url() image (e.g. .mk-under's wavy
    // underline SVG) is decoration, NOT a solid chip: rendering it as a chip
    // both misplaces the text and leaks the raw <svg> markup into the page.
    // Keep only solid colours / real gradients as the element's own chip
    // background; url() backgrounds fall back to plain text.
    const bgImg = (s.backgroundImage && s.backgroundImage!=='none') ? s.backgroundImage : '';
    const isUrlBg = /url\(/.test(bgImg);
    const useBg = !!opts.ownBg && !isUrlBg;
    const grad = useBg && !!opts.grad && !!bgImg;
    // Only a REAL background (solid colour or gradient) makes this a chip/badge.
    // A transparent background must NOT: a text block "painted" only by a border
    // (a footnote with border-top, a list row with a divider) would otherwise be
    // rendered as a centred, full-bordered pill. Keep its border (per-side) but
    // leave it as normal left-aligned copy.
    const solidBg = useBg && !transparent(s.backgroundColor);
    const ownBorder = useBg && anyBorder(s);
    // A box that holds a single line of text must never re-wrap: a tiny font
    // metric difference would otherwise spill the last syllable onto line 2.
    // Compare the CONTENT height (minus vertical padding) to one line: a padded
    // badge (e.g. "OPTIONS · 4 PACKS" with 8px padding) is still one line, but its
    // padded box height exceeds lh*1.4 and would otherwise be misread as multi-line
    // and allowed to wrap its last word out of the chip.
    // A run fragment's geometry IS the text node's own rect (no padding); only a
    // whole block carries its element's padding. Subtracting the parent's padding
    // from a run's height would shrink innerH below one line and wrongly mark a
    // 2-line wrapped fragment as single-line — nowrap then clips it off-screen.
    const innerH = opts.run ? g.height
      : g.height - px(s.paddingTop) - px(s.paddingBottom);
    const singleLine = !text.includes('\n') && innerH <= lhPx(s)*1.4;
    // A flex/grid box that vertically centres its content (a number/letter circle:
    // 56×56, display:flex, align-items:center) holds a single line in a box far
    // taller than that line. singleLine above is false (box >> line), so without a
    // dedicated flag the digit renders top-aligned and clips at the circle's edge.
    // Mirror the original's centring when the box genuinely centres one line.
    const vcenter = !text.includes('\n')
      && /flex|grid/.test(s.display) && s.alignItems==='center'
      && innerH > lhPx(s)*1.4;
    // Horizontal analog of vcenter: a flex/grid box that centres its content on
    // the inline axis (row -> justify-content, column -> align-items) also centres
    // its text, even though computed text-align stays "start". Without this a
    // number/icon dot's single glyph renders left-aligned in a box far wider than
    // it. Single-line only, so a genuinely left-aligned paragraph is never touched.
    const hcenter = !text.includes('\n') && /flex|grid/.test(s.display)
      && (/column/.test(s.flexDirection||'')
            ? s.alignItems==='center'
            : /center|space-around|space-evenly/.test(s.justifyContent||''));
    // text-decoration so strikethrough prices and underline accents survive.
    const deco = (s.textDecorationLine && s.textDecorationLine!=='none') ? s.textDecorationLine
               : (s.textDecoration||'').split(' ')[0];
    // A chip/badge/highlight background becomes its OWN editable rectangle drawn
    // behind the text, not a property of the text element. Canvas paints a text
    // element's background at the element *width* and clips it there, so a badge
    // whose box is narrower than the re-measured text shows a fill that stops
    // partway across the words ("the background doesn't follow the text"). A
    // separate box can never drift from the text width, and it unifies every
    // badge with the callouts whose background was already a standalone shape.
    const chipFill = solidBg ? s.backgroundColor : '';
    const chipGrad = grad ? bgImg : '';
    const hasChip = !!chipFill || !!chipGrad || ownBorder;
    const op = opts.opacity==null?1:opts.opacity;
    const padL = opts.run ? 0 : px(s.paddingLeft);
    const padR = opts.run ? 0 : px(s.paddingRight);
    // A small chip / badge / highlight (a coloured keyword pill like "트러블",
    // a hashtag "#피지컨트롤세럼", a 2-word sticker) is shrink-wrapped to its own
    // label, so subtracting the chip's horizontal padding from the text box leaves
    // the label without room. It measures tighter in headless Chromium than the
    // editor's own (wider) font re-renders it, so the last syllable then re-wraps
    // out of the pill ("트러블" -> "트러", "#피지컨트롤세럼" -> 2 lines). Give every
    // SMALL chip the FULL chip width (no inset) and centre the label, so it can
    // never re-wrap inside its own box — the multi-line sticker and the common
    // single-line highlight are one and the same fix. Guarded to small boxes so a
    // wide left-aligned callout paragraph (which has real inner room) is untouched.
    // A multi-line chip whose text is CENTRED hits the same headless-vs-editor width
    // gap once per hard line: the padding-inset text box equals the widest line's
    // headless width, so the editor's slightly wider font re-wraps that line into an
    // extra one and overflows the fixed-height pill (the "아침에 사용 시…발라주어 피부를
    // 보호해주세요" sunscreen note spilling its 2nd line into a 3rd). Centred text sits
    // identically with or without the padding inset, so give it the FULL box width
    // too — each hard line then keeps the whole pill to fit in, and the widest line's
    // centred slack equals exactly the padding the source drew.
    const centred = /center/.test(s.textAlign || '');
    const stickerLike = hasChip
      && ((g.width < 300 && g.height < 200) || (centred && text.includes('\n')));
    let textBox = g;
    if(hasChip){
      // Konva clamps cornerRadius to half the box, but cap it here too so the
      // emitted JSON reads as a clean pill (the decomposer uses a huge px radius
      // — e.g. 999 — to mean "fully rounded").
      const r = Math.min(radiusOf(s, g.width, g.height), Math.min(g.width, g.height)/2);
      out.elements.push({kind:'box',
        box:{x:g.x, y:g.y, width:g.width, height:g.height, rotation:g.rotation},
        fill: chipFill || 'rgba(0,0,0,0)', gradient: chipGrad, shadow: solidBg ? s.boxShadow : 'none',
        radius: r, borderWidth: ownBorder ? px(s.borderTopWidth) : 0,
        borderColor: s.borderTopColor, borderStyle: s.borderTopStyle,
        borders: ownBorder ? sideBorders(s) : null, opacity: op});
      // Inset the text by the chip padding and keep the full box height with
      // vertical centering, so a one-line badge sits centred in its pill exactly
      // as the old text-background did — just as a separate, drift-free layer.
      // A sticker keeps the full width so its widest line never re-wraps.
      textBox = stickerLike
        ? {x:g.x, y:g.y, width:g.width, height:g.height, rotation:g.rotation}
        : {x:g.x+padL, y:g.y, width:Math.max(1, g.width-padL-padR),
           height:g.height, rotation:g.rotation};
    }
    // Does the copy actually spill onto more than one visual line inside its box?
    // (natural width, in our narrower fallback font, already exceeds the box width
    // -> it wraps in the wider editor font too). A wrapper must not be pinned to a
    // single line's height downstream, or the frontend reads it as one line and
    // lets it overflow the page instead of wrapping.
    const wraps = !text.includes('\n') && measureLineW(text, s) > textBox.width + 1;
    out.elements.push({kind:'text', box:textBox, run:!!opts.run, text:text, singleLine:singleLine, wraps:wraps,
      vcenter:vcenter||hasChip, vcenterFlex:vcenter, hcenter:hcenter,
      stickerCenter:stickerLike, justify:s.justifyContent,
      tag: opts.tag||'', slot: !!opts.slot, contractSlot: slotOf(opts.el),
      indent: Math.round(opts.indent||0),
      indentTo: Math.round(opts.indentTo||0), opacity: op,
      color:s.color, fontSize:px(s.fontSize), fontWeight:s.fontWeight,
      fontFamily:s.fontFamily,
      lineHeight:s.lineHeight, textAlign:opts.alignStart ? 'left' : s.textAlign,
      letterSpacing:s.letterSpacing, display:s.display,
      // Korean typography commonly pairs word-break:keep-all with
      // overflow-wrap:anywhere so a long no-space token (e.g. "3000~6500K")
      // breaks mid-token instead of overflowing its column into the next stat.
      // Without replaying these, a narrow multi-line value renders on one line
      // and collides with its neighbour.
      overflowWrap:s.overflowWrap, wordBreak:s.wordBreak,
      // Decoration / outline / italic / uppercase so strikethrough prices,
      // underline accents, outlined (text-stroke + transparent fill) headlines,
      // italics and text-transform all survive instead of flattening.
      decoration: (deco==='underline'||deco==='line-through') ? deco : '',
      fontStyle: s.fontStyle, textTransform: s.textTransform,
      strokeWidth: px(s.webkitTextStrokeWidth||'0'),
      strokeColor: s.webkitTextStrokeColor||'',
      padTop:px(s.paddingTop), padRight:px(s.paddingRight),
      padBottom:px(s.paddingBottom), padLeft:px(s.paddingLeft),
      // The chip background now lives in its own box element above; the text
      // element carries no background of its own.
      bg:'', borders:null, radius:0, borderWidth:0,
      borderColor: s.borderTopColor, borderStyle: s.borderTopStyle,
      shadow:'none'});
  };
  const pushBox=(g, cs, opacity)=>{
    const grad=cs.backgroundImage&&cs.backgroundImage!=='none';
    out.elements.push({kind:'box', box:g, fill:cs.backgroundColor,
      gradient:grad?cs.backgroundImage:'', radius:radiusOf(cs, g.width, g.height),
      borderWidth:px(cs.borderTopWidth), borderColor:cs.borderTopColor,
      borderStyle:cs.borderTopStyle, borders:sideBorders(cs), shadow:cs.boxShadow,
      opacity: opacity==null?1:opacity});
  };
  // ::before / ::after are not in the DOM, so capture them explicitly. A
  // decorative shape (e.g. the step cards' circle) becomes a full standalone
  // box: it stays a whole circle, but carries the owning card's clip rect so it
  // renders clipped to the card exactly like the original overflow:hidden —
  // visible in part, never spilling outside the card. A pseudo carrying text
  // (e.g. the "!" bullet marker) becomes a badge.
  // First / last direct text-node client rect of an element — used to locate an
  // auto-sized inline ::before / ::after text marker (a bullet / ❋ / ♡), whose
  // own width getComputedStyle reports as `auto` (→ 0).
  const edgeTextRect=(el, last)=>{
    const ns=[...el.childNodes].filter(n=>n.nodeType===3 && clean(n.textContent));
    const n=last ? ns[ns.length-1] : ns[0];
    if(!n) return null;
    const rg=document.createRange(); rg.selectNodeContents(n);
    const rs=rg.getClientRects();
    return rs.length ? rs[last ? rs.length-1 : 0] : null;
  };
  // ── CSS 카운터 ──────────────────────────────────────────────────────────
  // getComputedStyle serialises `content:counter(n,decimal-leading-zero)` with the
  // counter() call UNRESOLVED (`counter(vv, decimal-leading-zero)` comes back
  // verbatim), so the digits appear in no DOM read at all. A numbered list written
  // the documented way — an empty marker span plus a ::before counter, see
  // shared/SECTION_VARIANT_AUTHORING.md — therefore lost its numbers completely:
  // the marker emitted nothing and the item's copy slid left into its place.
  // Replay the counter algorithm ourselves, once per counter name, walking the
  // document in tree order. Nested scopes (the same counter reset again inside its
  // own subtree) collapse into one running value; every authored list resets once
  // on its container, which this gets exactly right.
  const _counterMaps={};
  const counterAt=(name, el)=>{
    let map=_counterMaps[name];
    if(!map){
      map=_counterMaps[name]=new Map();
      const safe=String(name).replace(/[^\w-]/g,'');
      const re=new RegExp('(?:^|\\s)'+safe+'(?:\\s+(-?\\d+))?(?![\\w-])');
      let value=0;
      const apply=(decl, isReset)=>{
        if(!decl || decl==='none') return;
        const m=String(decl).match(re);
        if(!m) return;
        const n = m[1]==null ? (isReset?0:1) : Number(m[1]);
        value = isReset ? n : value+n;
      };
      const visit=node=>{
        const cs=getComputedStyle(node);
        apply(cs.counterReset, true);
        apply(cs.counterIncrement, false);
        // The documented pattern declares the increment on the PSEUDO rule
        // (`.pn::before{counter-increment:ptn;content:counter(ptn)}`), so the
        // element's own computed style carries nothing.
        const before=getComputedStyle(node,'::before');
        apply(before.counterReset, true);
        apply(before.counterIncrement, false);
        map.set(node, value);          // the value this element's ::before paints
        const after=getComputedStyle(node,'::after');
        apply(after.counterReset, true);
        apply(after.counterIncrement, false);
        for(const kid of node.children) visit(kid);
      };
      visit(document.body);
    }
    const v=map.get(el);
    return v==null?0:v;
  };
  const _ALPHA='abcdefghijklmnopqrstuvwxyz';
  const fmtCounter=(v, style)=>{
    const s=String(style||'decimal').toLowerCase();
    if(s==='decimal-leading-zero') return (v>=0&&v<10?'0':'')+v;
    if(/^(lower|upper)-(alpha|latin)$/.test(s)){
      let n=v, out='';
      while(n>0){ const r=(n-1)%26; out=_ALPHA[r]+out; n=Math.floor((n-1)/26); }
      if(!out) return String(v);
      return s.indexOf('upper')===0 ? out.toUpperCase() : out;
    }
    if(s==='upper-roman'||s==='lower-roman'){
      if(v<1||v>3999) return String(v);
      const T=[[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],
               [50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
      let n=v, out='';
      for(const pair of T){ while(n>=pair[0]){ out+=pair[1]; n-=pair[0]; } }
      return s==='upper-roman'?out.toUpperCase():out;
    }
    return String(v);
  };
  // getComputedStyle serialises content strings with CSS escapes: a
  // `content:'"'` quote comes back as `"\""`, and `content:'\201C'` as a
  // `\HHHH` sequence. Decode both so a decorative quote renders as " and not
  // a stray `\"`.
  const unescapeCss=s=>String(s)
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g,(_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/\\(.)/g,'$1');
  // The text a pseudo actually paints: quoted strings, counters and attr() joined
  // in order. Anything we cannot read (url(), gradients, counters() with a
  // separator, open-quote) makes the WHOLE marker unreadable — return '' so the
  // caller drops it, rather than paint half a marker.
  const pseudoText=(content, el)=>{
    const re=/"((?:[^"\\]|\\.)*)"|counter\(\s*([\w-]+)\s*(?:,\s*([\w-]+)\s*)?\)|attr\(\s*([\w-]+)\s*\)/g;
    let out='', last=0, m, unknown=false;
    while((m=re.exec(content))){
      if(content.slice(last, m.index).trim()) unknown=true;
      last=re.lastIndex;
      if(m[1]!==undefined) out+=unescapeCss(m[1]);
      else if(m[2]) out+=fmtCounter(counterAt(m[2], el), m[3]);
      else if(m[4]) out+=(el.getAttribute(m[4])||'');
    }
    if(content.slice(last).trim()) unknown=true;
    return unknown ? '' : out;
  };
  const emitPseudo=el=>{
    const es=getComputedStyle(el);
    const clips=es.overflow!=='visible' && es.overflow!=='';
    let beforeInset=0;  // width an inline ::before marker steals from the copy
    ['::before','::after'].forEach(which=>{
      const cs=getComputedStyle(el, which);
      const content=cs && cs.content;
      if(!content || content==='none' || content==='normal') return;
      let w=px(cs.width), h=px(cs.height);
      const grad=cs.backgroundImage&&cs.backgroundImage!=='none';
      const painted=!transparent(cs.backgroundColor)||grad;
      const text=clean(pseudoText(content, el));
      const pr=el.getBoundingClientRect();  // abs container = positioned box
      // An inline text marker (content:"❋ "/"♡ "/"• ") is auto-sized, so width
      // comes back 0 and it was being dropped. Reconstruct its box from the
      // owner's layout: it sits at the content-box start (::before) or after the
      // last glyph (::after); its advance width is the gap to the first/last real
      // glyph. The copy is then indented by that width so the two don't overlap.
      const isInlineText = text && (w<1||h<1) && cs.position!=='absolute'
        && cs.left==='auto' && cs.right==='auto';
      let mx, my;
      if(isInlineText){
        const cl=pr.left+px(es.paddingLeft)+px(es.borderLeftWidth);
        const cr=pr.right-px(es.paddingRight)-px(es.borderRightWidth);
        const fr=edgeTextRect(el, which==='::after');
        h = lhPx(cs) || px(cs.fontSize) || lhPx(es);
        if(which==='::before'){
          mx=cl; my=fr ? fr.top : pr.top+px(es.paddingTop);
          w = fr ? Math.max(2, fr.left-cl) : (px(cs.fontSize)||12);
          beforeInset=w;
        } else {
          my=fr ? fr.top : pr.top+px(es.paddingTop);
          mx=fr ? fr.right : cr; w = px(cs.fontSize)||12;
        }
      } else {
        // A 24×1 eyebrow dash or a 1×40 accent bar is a real divider: reject only
        // zero-size pseudos and sub-pixel noise (both dimensions <2), but keep a
        // thin LINE where one dimension is ≥2.
        if(w<1||h<1) return;            // nothing laid out
        if(w<2&&h<2) return;           // sub-pixel noise dot
        if(!painted && !text) return;   // nothing visible
        mx = cs.left!=='auto' ? pr.left+px(cs.left)
              : cs.right!=='auto' ? pr.right-px(cs.right)-w : pr.left;
        my = cs.top!=='auto' ? pr.top+px(cs.top)
              : cs.bottom!=='auto' ? pr.bottom-px(cs.bottom)-h : pr.top;
      }
      const g={x:mx-srect.left, y:my-srect.top, width:w, height:h, rotation:rotationDeg(cs)};
      const clip = clips && !isInlineText ? {x:pr.left-srect.left, y:pr.top-srect.top,
        width:pr.width, height:pr.height, radius:radiusOf(es, pr.width, pr.height)} : null;
      const opacity=Number(cs.opacity||1);
      if(text){ pushText(g, text, cs, {ownBg:painted&&!isInlineText, grad:grad, opacity:opacity, el:el});
        if(clip) out.elements[out.elements.length-1].clip=clip; }
      else { pushBox(g, cs, opacity);
        if(clip) out.elements[out.elements.length-1].clip=clip; }
    });
    return beforeInset;
  };
  // innerText inserts a \n between flex/grid items even when they sit on one
  // visual line (e.g. <b>name</b> · age in a display:flex row). Collapse those
  // spurious breaks when the element is only one line tall.
  const blockText=el=>{
    let t=htmlText(el);
    // An absolutely-positioned leading marker (a list bullet pinned at left:0)
    // shows up in innerText as its own line ("·\nANC…"); fold it back inline so
    // it doesn't render stacked above the copy.
    const fe=el.firstElementChild;
    if(fe && getComputedStyle(fe).position==='absolute')
      t=t.replace(/^(\S{1,3})\n/, '$1 ');
    // innerText inserts a line break between horizontally laid-out flex/grid
    // items, so a one-line chip like `<span>02</span> FINISH` comes back as
    // "02\nFINISH". When the chip's padding makes it taller than 1.4×line-height
    // the single-line guard below misses it and the spurious newline renders the
    // label STACKED inside a box sized for one line (short background, no
    // centring). A horizontal flex row (direction not column, no wrap) is a
    // single visual line by construction — fold its newlines to spaces too.
    const cs0=getComputedStyle(el);
    const flexRow = /flex/.test(cs0.display)
      && !/column/.test(cs0.flexDirection||'')
      && !/^wrap/.test(cs0.flexWrap||'');   // 'nowrap' passes; 'wrap'/'wrap-reverse' don't
    if(t.includes('\n') && (el.offsetHeight <= lhPx(cs0)*1.4 || flexRow))
      t=t.replace(/\n+/g,' ').replace(/[ \t]{2,}/g,' ').trim();
    return t;
  };
  const elPainted=cs=>!transparent(cs.backgroundColor)||(cs.backgroundImage&&cs.backgroundImage!=='none');
  // A block needs splitting when a descendant carries its own paint (a
  // highlight pill / dot / icon), a distinct text colour (e.g. a pink "Q."
  // prefix), OR a markedly different font-size (a superscript "%", a small unit
  // like "dB"): emitting "91<sup>%</sup>" as one 140px run blows the "%" up to
  // full size and overflows into the next column. Otherwise it stays one run.
  // Resolve a computed font-weight to a number. getComputedStyle usually returns
  // a numeric string ("400"/"700"); keep the keyword fallback for safety.
  const weightNum=(w)=>{
    const n=parseInt(w,10);
    if(!isNaN(n)) return n;
    if(w==='bold') return 700;
    if(w==='bolder') return 700;
    if(w==='lighter') return 300;
    return 400;
  };
  const hasSpecial=(el, blockColor)=>{
    const st=getComputedStyle(el);
    const baseFs=parseFloat(st.fontSize)||0;
    const baseFw=weightNum(st.fontWeight);
    return [...el.querySelectorAll('*')].some(c=>{
      if(!vis(c)||c.closest('svg'))return false;
      // A footnote marker (<sup>/<sub>) is never on its own a reason to split a
      // block: a plain paragraph "...트러블<sup>*</sup> 때문에" must stay ONE
      // editable element (the marker just rides inline). When the block splits
      // for a real reason (a coloured run, a painted chip), walkRuns still walks
      // into the marker and emits it at its own small raised rect.
      if(c.tagName==='SUP'||c.tagName==='SUB')return false;
      const cs=getComputedStyle(c);
      const hasText=htmlText(c).length>0;
      const fs=parseFloat(cs.fontSize)||0;
      const fw=weightNum(cs.fontWeight);
      return elPainted(cs)
        || (cs.color!==blockColor && hasText)
        // An inline <b>/<strong> (same colour/size, heavier weight) must split so
        // each run keeps its own weight — Konva renders one weight per text
        // element, so a flattened paragraph would drop the bold entirely. The
        // wrapsBadly guard (below) still keeps a multi-line emphasis as one block.
        || (fw-baseFw>=200 && hasText)
        || (baseFs>0 && fs>0 && Math.abs(fs-baseFs)/baseFs>0.3 && hasText);
    });
  };
  // True if a descendant carries a MARKEDLY different font-size (a deliberately
  // enlarged number "57.03" or a shrunk unit "%"/"dB" inside one label). Unlike
  // hasSpecial this ignores colour/paint, so it only forces the size-run split
  // where a real per-glyph size emphasis exists — not for every colour accent.
  const hasSizeSplit=el=>{
    const baseFs=parseFloat(getComputedStyle(el).fontSize)||0;
    if(!baseFs) return false;
    return [...el.querySelectorAll('*')].some(c=>{
      if(!vis(c)||c.closest('svg'))return false;
      // A footnote marker's 0.4em size is not the deliberate per-glyph emphasis
      // this split is for (an enlarged "57.03" / a shrunk "%"); it stays inline
      // in a chip label unless the label splits for another reason.
      if(c.tagName==='SUP'||c.tagName==='SUB')return false;
      if(!htmlText(c).length)return false;
      const fs=parseFloat(getComputedStyle(c).fontSize)||0;
      return fs>0 && Math.abs(fs-baseFs)/baseFs>0.3;
    });
  };
  // True if a descendant actually PAINTS (chip / dot / bar) — such a child needs
  // its own box, so the block must split even when it is tall.
  const hasPaintedDesc=el=>[...el.querySelectorAll('*')].some(c=>
    vis(c) && !c.closest('svg') && elPainted(getComputedStyle(c)));
  // True if an inline-level emphasis child WRAPS across more than one line.
  // Per-fragment positioning then overlaps (a multi-line <b> shares lines with
  // the copy that follows it), so such a block should stay one editable block.
  const inlineWraps=el=>[...el.children].some(c=>{
    if(!vis(c)||c.closest('svg'))return false;
    const cs=getComputedStyle(c);
    if(elPainted(cs)||/block|flex|grid|table/.test(cs.display))return false;
    // An explicit <br> inside the emphasis is a HARD break, not a fluid soft-wrap:
    // its lines are separate text nodes, so walkRuns/emitTextRuns emits each at its
    // own real rect (no mid-line-start overlap). Splitting is safe — and required,
    // else a multi-line <b> (a chat-bubble emphasis "유분은 폭발하고<br>피부 속은
    // 건조해요") flattens to weight-400 and loses its bold. Only a fluid wrap with
    // no <br> risks the first-line-indent overlap this guard defends against.
    if(c.querySelector && c.querySelector('br'))return false;
    const rg=document.createRange(); rg.selectNodeContents(c);
    // getClientRects() returns one rect per inline FRAGMENT, not per line: a single
    // line broken up by a nested coloured <span> or a raised <sup> ("5D 복합 시카
    // <span>2배</span><sup>**</sup>") yields several rects that all sit on the SAME
    // line. Counting them (>1) false-flags that line as a multi-line wrap and blocks
    // the split, flattening the block's headline to weight-400. A GENUINE wrap has
    // two rects that are vertically DISJOINT (one fully below the other); fragments
    // and superscripts on one line always vertically overlap, so only a real second
    // line trips this.
    const rects=[...rg.getClientRects()].filter(r=>r.width>0 && r.height>0);
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
      const a=rects[i], b=rects[j];
      if(a.bottom<=b.top+1 || b.bottom<=a.top+1) return true;
    }
    return false;
  });
  // Emit a text node as one run per VISUAL LINE. A wrapped run's first line
  // begins after a coloured sibling (e.g. cyan "1일 최대 4알") while the wrapped
  // remainder falls back to the block's left edge — but a Canvas text element
  // has a single x and no first-line indent (Konva ignores text-indent), so a
  // one-box wrapped run would draw line 1 at the left edge, overlapping the
  // sibling. Splitting per line gives each line its own single-line box at its
  // real rect, so nothing overlaps and each keeps its colour. Whitespace is
  // trimmed per segment so a wrapped line's leading space never offsets its x.
  const emitTextRuns=(textNode, sourceEl)=>{
    const raw=textNode.textContent;
    if(!clean(raw)) return;
    const cs=getComputedStyle(sourceEl);
    const lead=raw.length-raw.replace(/^\s+/,'').length;
    const trail=raw.length-raw.replace(/\s+$/,'').length;
    const from0=lead, to0=raw.length-trail;
    if(to0<=from0) return;
    const emitSeg=(from,to)=>{
      let a=from,b=to;
      while(a<b && /\s/.test(raw[a])) a++;
      while(b>a && /\s/.test(raw[b-1])) b--;
      if(b<=a) return;
      const rg=document.createRange();
      try{ rg.setStart(textNode,a); rg.setEnd(textNode,b); }catch(_){ return; }
      const r=rg.getBoundingClientRect(); if(r.width<1) return;
      const txt=clean(raw.slice(a,b)); if(!txt) return;
      pushText({x:r.left-srect.left, y:r.top-srect.top, width:r.width, height:r.height, rotation:0},
        txt.replace(/\n/g,' '), cs, {run:true, el:textNode.parentElement});
    };
    const full=document.createRange();
    try{ full.setStart(textNode, from0); full.setEnd(textNode, to0); }
    catch(_){ full.selectNodeContents(textNode); }
    const rects=full.getClientRects();
    if(rects.length<=1){ emitSeg(from0, to0); return; }
    // Multiple visual lines: find line boundaries by walking characters (a jump
    // in the character rect's top marks a new line) and flush a segment per line.
    let segStart=from0, curTop=null;
    for(let i=from0;i<to0;i++){
      const rg=document.createRange();
      try{ rg.setStart(textNode,i); rg.setEnd(textNode,i+1); }catch(_){ continue; }
      const rc=rg.getBoundingClientRect();
      if(rc.width<0.5 && rc.height<0.5) continue;
      if(curTop===null){ curTop=rc.top; }
      else if(Math.abs(rc.top-curTop)>2){ emitSeg(segStart,i); segStart=i; curTop=rc.top; }
    }
    emitSeg(segStart, to0);
  };
  // A row-layout cell whose author DECLARED text-align:right needs a real BOX to
  // align inside. The default row path positions every cell at its ink Range rect
  // (see emitTextRuns), which pins a value to the width of its own text: a
  // key/value line's value then hugs its digits at whatever x the flex layout
  // left them, and text-align:right has no box to act in — so a `flex:1` value
  // that should span to the row's right edge collapses to a tight box and reads
  // as "right align isn't working" in the editor. Emit such a cell at its
  // flex-ITEM box instead (getBoundingClientRect of the cell element, which
  // honours flex-grow/basis and padding), carrying its own alignment, so the
  // editor shows a wide right-anchored box exactly as the source row reads.
  // Scoped hard to avoid regressing existing rows: only a RIGHT/END-aligned,
  // single-colour, unpainted, non-icon, non-size-split simple text cell is
  // intercepted. A painted chip, an icon cell, a colour/size-split cell, and —
  // crucially — every LEFT/START cell (a key, a checklist label) fall through to
  // the unchanged ink-run walk, so their tight boxes are untouched.
  const emitRowCell=(c)=>{
    const cs=getComputedStyle(c);
    const ta=(cs.textAlign||'').trim().toLowerCase();
    if(ta!=='right' && ta!=='end') return false;
    if(c.querySelector('svg')) return false;
    if(elPainted(cs) || hasPaintedDesc(c) || hasSizeSplit(c)) return false;
    if(hasSpecial(c, cs.color)) return false;           // uniform colour only
    const t=blockText(c); if(!t) return false;
    const gb=geom(c);
    if(gb.width<2 || gb.height<2) return false;
    pushText(gb, t, cs, {slot:true, tag:c.tagName, el:c});
    handled.add(c);
    [...c.querySelectorAll('*')].forEach(d=>handled.add(d));
    return true;
  };
  // Walk the block into positioned fragments: each text node lands at its real
  // Range rect with its own parent's colour (so a coloured prefix keeps its
  // colour and the inter-run gap), each painted element keeps its own
  // box/badge, and plain wrapper spans are recursed through.
  // ``rowCells`` (set only for the top-level of an isRowLayout block) diverts a
  // declared right-aligned cell to emitRowCell above; it is NOT propagated into
  // recursion, so only direct row cells get the box treatment.
  const walkRuns=(node, rowCells)=>{
    [...node.childNodes].forEach(c=>{
      if(c.nodeType===3){
        // Position by the NON-whitespace content and split per visual line so a
        // wrapped run never overlaps a coloured sibling (see emitTextRuns).
        emitTextRuns(c, c.parentElement);
      } else if(c.nodeType===1 && c.tagName!=='BR' && vis(c) && !c.closest('svg')){
        if(rowCells && emitRowCell(c)) return;
        const cs=getComputedStyle(c);
        const grad=cs.backgroundImage&&cs.backgroundImage!=='none';
        if(elPainted(cs)){
          const t=blockText(c);
          // A single-line chip carrying a <sup>/<sub> footnote ("트러블<sup>*</sup>
          // 원인", "장벽이 약해지면 트러블<sup>*</sup> 이 반복되기 쉬워요!"): emitting the
          // whole label as one run renders the marker at FULL size (Konva has no
          // inline superscript), widening the copy and breaking its centring. Walk
          // the chip so the marker lands as its own small raised run — the same
          // sup-chip split the top-level decision applies, but here the chip sits
          // one level below the captured block (a centred wrapper div), so it must
          // be re-detected as walkRuns descends. Scoped to short one-line chips so a
          // multi-line body chip with a lone footnote keeps the sup-skip guard.
          const chipSup = !!c.querySelector('sup,sub')
            && geom(c).height <= (parseFloat(cs.fontSize) || 0) * 2.5;
          if(t.length && (hasSizeSplit(c) || chipSup)){
            // A painted badge/chip whose label MIXES font sizes (an emphasised
            // number: "진정 <b·1.7em>57.03</b><·.6em>%</b> 개선") — or carries a small
            // superscript marker. Emitting the whole label as one run flattens every
            // glyph to the chip's base size and loses the emphasis, since a Canvas
            // text element holds a single fontSize. Paint the pill box, then walk the
            // label into positioned runs so each keeps its own size/colour (groupFrom
            // binds them into one locked unit). A chip with no size variation and no
            // marker stays one clean run.
            pushBox(geom(c), cs);
            handled.add(c);
            walkRuns(c);
          } else if(t.length){
            // A painted element WITH its own text is a badge/chip: it owns its
            // whole label, so consume the descendants to avoid double-emitting.
            pushText(geom(c), t, cs, {ownBg:true, grad:grad, el:c});
            handled.add(c);
            [...c.querySelectorAll('*')].forEach(d=>handled.add(d));
          } else {
            // A painted wrapper with NO text of its own (e.g. a value-bar TRACK
            // whose child is the % FILL, or a tinted card holding nested
            // segments). Emit the box, then recurse so nested painted fills are
            // still captured instead of being swallowed by a blanket handled().
            pushBox(geom(c), cs);
            handled.add(c);
            walkRuns(c);
          }
        } else if(anyBorder(cs) && !hasBlockTextChild(c)){
          // A border-only chip with no solid fill (an outlined eyebrow pill
          // "DEVICE_ID · M3-HBP", an outlined discount badge): its outline belongs
          // to the container, not to the inner text node, so recursing as a plain
          // wrapper would emit the text and DROP the box. Render it as a bordered
          // chip carrying its own outline.
          pushText(geom(c), blockText(c), cs, {ownBg:true, grad:grad, el:c});
          handled.add(c);
          [...c.querySelectorAll('*')].forEach(d=>handled.add(d));
        } else {
          walkRuns(c);  // plain wrapper span: keep splitting by colour
          handled.add(c);
        }
      }
    });
  };
  // Emit the DIRECT text nodes of a mixed container (own text + a block child),
  // positioned at their range rects. Such text is not a clean text block (the
  // block child disqualifies it), so it would otherwise be orphaned — e.g. the
  // "87%" stat's label "12주 사용자 자가 만족도 …" sits as a bare text node next to
  // a nested .src note div, and the whole caption would vanish.
  const emitDirectText=el=>{
    [...el.childNodes].forEach(c=>{
      if(c.nodeType!==3) return;
      // Split per visual line too, so a wrapped bare caption never draws its
      // first line over a preceding coloured run (see emitTextRuns).
      emitTextRuns(c, el);
    });
  };
  // Collapse everything emitted since ``start`` (a block's own background box,
  // its pseudo decoration, and its colour-split text runs) into ONE group, so a
  // line that had to be split into fragments — because Canvas text elements
  // hold a single colour and an inline highlight ("약 7배" in pink) cannot live
  // in the same element as the surrounding copy — still selects and moves as a
  // single unit. Canvas group children keep absolute page coordinates (the
  // canvas Group is created with no offset), so the fragments need no rebasing.
  const groupFrom=(start, declared, lineKind)=>{
    const frags=out.elements.slice(start);
    if(frags.length<2) return;          // a single fragment needs no group
    out.elements.length=start;          // pop the loose fragments
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const f of frags){const b=f.box;
      x0=Math.min(x0,b.x); y0=Math.min(y0,b.y);
      x1=Math.max(x1,b.x+b.width); y1=Math.max(y1,b.y+b.height);}
    const grp={kind:'group',
      box:{x:x0, y:y0, width:x1-x0, height:y1-y0, rotation:0},
      children:frags};
    if(declared) grp.declared=true;     // an editable text-on-box unit, not locked decoration
    // lineKind marks WHY a block was fragmented so the bridge fills it right:
    // 'flow' = one visual line split only by inline colour/size/footnote (the LLM
    // writes the whole line, the apply re-lays it out into runs); 'row' = a
    // flex/grid row of separate cells (each cell is its own slot).
    if(lineKind) grp.lineKind=lineKind;
    out.elements.push(grp);
  };
  // A composite inline SVG (a bar chart, a chevron flow, a 5-step diagram) extracts
  // as ONE locked "도형" the user cannot take apart — they can't recolour a single
  // bar, hide a gridline, or move a callout. Split its top-level shapes so each one
  // becomes its own svg element (and, via groupFrom, one layer in the tree).
  //
  // Each part is RE-CROPPED rather than positioned inside the original viewBox: the
  // emitted svg is sized to the part's own screen rect and carries a matrix that maps
  // the source user space into that box, so the pixels are identical to the whole svg
  // (no re-derived geometry, no rounding of the source coordinates). The original
  // <defs> ride along with every part, or a bar filled with url(#coralg) would lose
  // its gradient.
  //
  // Small icons stay WHOLE: a 46px leaf or a 26px check is one idea, and shattering
  // it into three strokes is layer noise, not control. The templates are cleanly
  // bimodal — icons are <=90px, composites are >=158px — so the area gate separates
  // them without a per-template list.
  // An svg's LAYOUT box is not what it paints. preserveAspectRatio (default
  // "xMidYMid meet") letterboxes the viewBox inside that box: a 108x130 seal in a
  // 215x86 grid cell paints as a 71x86 stamp, centred. Handing the layout box to
  // Canvas — which stretches the svg to fill its element box — squashes that stamp
  // to 215x86: a flat oval where a round seal should be. Emit the box it actually
  // paints. (Same fix as object-fit:contain on an <img>, one layer down.)
  const fitSvgBox=(el, g)=>{
    const par=(el.getAttribute('preserveAspectRatio')||'').trim();
    // "none" stretches on purpose; a non-centred align (xMinYMax…) would not sit in
    // the middle, so leave those alone rather than guess.
    if(par && !par.startsWith('xMidYMid')) return;
    const vb=(el.getAttribute('viewBox')||'').split(/[\s,]+/).filter(Boolean).map(Number);
    if(vb.length!==4 || !(vb[2]>0) || !(vb[3]>0)) return;   // no viewBox -> fills the box
    if(!(g.width>0 && g.height>0)) return;
    const sc=Math.min(g.width/vb[2], g.height/vb[3]);
    const fw=vb[2]*sc, fh=vb[3]*sc;
    if(fw>=g.width-0.5 && fh>=g.height-0.5) return;         // already flush: nothing to trim
    g.x+=(g.width-fw)/2; g.y+=(g.height-fh)/2;
    g.width=fw; g.height=fh;
  };
  const SVG_DEFS=new Set(['defs','style','title','desc','metadata','script','filter',
    'lineargradient','radialgradient','clippath','mask','pattern','symbol','marker']);
  const SVG_MIN_AREA=20000;   // ~a 158x158 emblem; every icon is far below this
  const SVG_MAX_PARTS=24;     // past this the layers tree is noise, not control
  const svgKids=(node, dropText)=>[...node.children].filter(c=>{
    const t=c.tagName.toLowerCase();
    if(SVG_DEFS.has(t)) return false;
    // Already emitted as a native, editable text element — don't paint it twice.
    return !(dropText && t==='text');
  });
  // getBoundingClientRect on an SVG shape reports its GEOMETRY box — the stroke is
  // not in it. A horizontal <line> therefore measures 0px tall (it would be dropped)
  // and an axis path's 2.5px stroke would be sliced in half by the part svg's
  // viewport. Pad the crop by the widest stroke in the part (a mitre join can reach
  // strokeWidth * miterlimit / 2 past the geometry), so every part carries its ink.
  const strokePad=(node)=>{
    let mx=0;
    for(const n of [node, ...node.querySelectorAll('*')]){
      const cs=getComputedStyle(n);
      if(!cs.stroke || cs.stroke==='none') continue;
      const w=parseFloat(cs.strokeWidth)||0;
      const ml=Math.max(1, parseFloat(cs.strokeMiterlimit)||4);
      mx=Math.max(mx, w*ml/2);
    }
    return mx;                       // in the node's own user units
  };
  const pushSvgParts=(root, g, color, dropText)=>{
    if(g.width*g.height < SVG_MIN_AREA) return false;
    // Descend through a lone <g> wrapper to the level that actually holds the shapes.
    let host=root, kids=svgKids(host, dropText);
    while(kids.length===1 && kids[0].tagName.toLowerCase()==='g'){
      host=kids[0]; kids=svgKids(host, dropText);
    }
    if(kids.length<2 || kids.length>SVG_MAX_PARTS) return false;
    // The parts' coordinates live in HOST's user space (a <g>'s own transform is part
    // of its CTM), so map from there — not from the root — or a transformed wrapper
    // would shift every part.
    const m=host.getScreenCTM();
    if(!m) return false;
    const dset=new Set();
    root.querySelectorAll('defs,style').forEach(d=>dset.add(d));
    for(const node of [root, host]) for(const c of node.children){
      if(SVG_DEFS.has(c.tagName.toLowerCase())) dset.add(c);
    }
    let defs=''; dset.forEach(d=>{ defs+=d.outerHTML; });
    const scale=Math.hypot(m.a, m.b) || 1;       // user units -> screen px
    const parts=[];
    for(const k of kids){
      const r=k.getBoundingClientRect();
      if(r.width<=0 && r.height<=0) continue;    // an empty <g>, a zero-length path
      const c=k.cloneNode(true);
      if(dropText) c.querySelectorAll('text').forEach(t=>t.remove());
      if(c.tagName.toLowerCase()==='g' && !c.children.length) continue;  // text-only wrapper
      const pad=strokePad(k)*scale + 1;          // +1: antialiasing fringe
      const x=r.left-pad, y=r.top-pad;
      const w=r.width+2*pad, h=r.height+2*pad;
      const tr='matrix('+m.a+' '+m.b+' '+m.c+' '+m.d+' '+(m.e-x)+' '+(m.f-y)+')';
      parts.push({kind:'svg',
        box:{x:x-srect.left, y:y-srect.top, width:w, height:h, rotation:0},
        svg:'<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"'
          +' viewBox="0 0 '+w+' '+h+'">'+defs+'<g transform="'+tr+'">'+c.outerHTML+'</g></svg>',
        color:color});
    }
    if(parts.length<2) return false;      // nothing gained — keep the svg whole
    for(const p of parts) out.elements.push(p);
    return true;
  };
  [...section.querySelectorAll('*')].forEach(el=>{
    if(!vis(el)||['SCRIPT','STYLE'].includes(el.tagName))return;
    if(handled.has(el))return;
    const _gi=groupInfo(el); _gk=_gi.key; _ga=_gi.al;
    _gc=_gi.claim; _gcl=_gi.claimLabel;
    const _grpStart=out.elements.length;
    if(el.tagName.toLowerCase()==='svg'){
      // A NESTED <svg> (e.g. an arrow inside a bar-chart svg) is already painted by
      // its outer svg's outerHTML; extracting it again as its own element draws the
      // arrow twice (two overlapping SVGs). Only emit top-level svgs.
      if(el.parentElement && el.parentElement.closest('svg')) return;
      const g=geom(el);
      fitSvgBox(el, g);
      const svgColor=getComputedStyle(el).color;
      // An inline SVG that bakes its own <text> (a certification badge: two
      // circles + a document icon + two <text> lines) extracts as ONE locked
      // "도형", so the copy can't be edited in the editor. Split it: each <text>
      // becomes a native, editable text element at its real screen rect, and the
      // graphics go through ``pushSvgParts`` (one element per shape for a
      // composite, one whole svg for an icon). Bind the pieces into one group so
      // the badge still moves/selects as a unit and the layers panel reads
      // group[도형, 도형, 텍스트, 텍스트].
      //
      // Scoped by ANCHOR, not by count: every <text> must be CENTRED
      // (text-anchor:middle), which is what an emblem/badge/label-on-a-shape does
      // — the copy is centred on the graphic it labels. A data-viz svg (bar chart,
      // ECG, gamut plot) instead pins start/end-anchored axis and value labels to
      // its geometry; lifting those out would leave the numbers floating free of
      // the ticks they name, so they stay baked into the graphics. (In production
      // templates every svg <text> is start/end-anchored, so this never fires
      // there — but the graphics still split into parts.)
      //
      // There is deliberately NO cap on the number of lines: a 3-step chevron flow
      // carries 6 centred labels and must split just like a 2-line cert badge.
      const svgTexts=[...el.querySelectorAll('text')].filter(t=>clean(t.textContent));
      const anchorOf=t=>(t.getAttribute('text-anchor')
        || getComputedStyle(t).textAnchor || 'start');
      const allCentred=svgTexts.length>0 && svgTexts.every(t=>anchorOf(t)==='middle');
      {
        const _svgStart=out.elements.length;
        // Graphics: one element per top-level shape when the svg is a composite,
        // otherwise the whole svg as before.
        if(!pushSvgParts(el, g, svgColor, allCentred)){
          const bg=el.cloneNode(true);
          if(allCentred) bg.querySelectorAll('text').forEach(t=>t.remove());
          // data-bubble: 말풍선의 생성 파라미터(몸통 크기·라운드·꼬리 끝점). 편집기가
          // 이걸로 path를 다시 굽는다 — 없으면 말풍선은 굳은 그림이라 꼬리를 못 옮긴다.
          out.elements.push({kind:'svg', box:g, svg:bg.outerHTML, color:svgColor,
            bubble:el.getAttribute('data-bubble')||null});
        }
        if(allCentred) for(const t of svgTexts){
          const r=t.getBoundingClientRect();
          if(!(r.width>0 && r.height>0)) continue;
          const ctm=t.getScreenCTM();
          // user-unit -> screen px scale (viewBox may shrink a 200-unit badge to
          // ~120px), so the emitted fontSize matches what the browser painted.
          const scale=ctm ? Math.hypot(ctm.a, ctm.b) : 1;
          const ts=getComputedStyle(t);
          const anchor=anchorOf(t);
          const align=anchor==='middle'?'center':anchor==='end'?'right':'left';
          out.elements.push({kind:'text',
            box:{x:r.left-srect.left, y:r.top-srect.top, width:r.width, height:r.height, rotation:0},
            text:clean(t.textContent), run:false, singleLine:true, wraps:false,
            // NOT a slot candidate: cert-badge copy is template-fixed, so the
            // bridge must not promote it to an AI-filled slot. It stays freely
            // editable in the editor regardless (any text element is).
            slot:false, tag:'',
            hcenter:align==='center', stickerCenter:false, vcenter:false,
            color:ts.fill||svgColor, fontSize:(parseFloat(ts.fontSize)||12)*(scale||1),
            fontWeight:ts.fontWeight||'400', fontFamily:ts.fontFamily||'sans-serif',
            lineHeight:'1', letterSpacing:'normal', textAlign:align});
        }
        // Bind the pieces into one unit. `declared` marks a real content unit whose
        // copy the bridge may promote to an editable slot — that is the text-split
        // case; a graphics-only split is decoration. Skip when already inside a
        // data-group wrapper: that path binds the subtree itself and would double-wrap.
        if(!_gk && out.elements.length-_svgStart>=2) groupFrom(_svgStart, allCentred);
        stampGroup(_grpStart);
        return;
      }
    }
    if(el.closest('svg'))return;
    const s=getComputedStyle(el);
    const isPh = !!placeholderClass && [...el.classList].includes(placeholderClass);
    const isImg = el.tagName==='IMG' || isPh;
    if(isImg){
      const g=geom(el);
      // object-fit:contain letterboxes a real photo inside its box; Canvas
      // instead stretches the source to fill the element box, which distorts /
      // crops it. Shrink the emitted box to the actual painted (aspect-fitted)
      // rect and centre it, so the stretch-to-box render reproduces the contain
      // result 1:1. Only a real <img> with known natural dimensions qualifies
      // (a .ph slot has none, and cover already fills the box).
      if(el.tagName==='IMG' && s.objectFit==='contain'
          && el.naturalWidth>0 && el.naturalHeight>0){
        const sc=Math.min(g.width/el.naturalWidth, g.height/el.naturalHeight);
        const fw=el.naturalWidth*sc, fh=el.naturalHeight*sc;
        g.x+=(g.width-fw)/2; g.y+=(g.height-fh)/2; g.width=fw; g.height=fh;
      }
      // A .ph placeholder caption is the box's OWN direct text only; nested
      // corner-tick labels (FIG.01 / SCALE 1:1 …) are real child elements and
      // get captured separately at their own corners, so they must NOT be
      // concatenated into the central caption (that was the "label leak").
      let cap='';
      if(isPh){
        cap=clean([...el.childNodes].filter(n=>n.nodeType===3)
          .map(n=>n.textContent).join(' '));
      }
      if(!cap) cap=clean(el.getAttribute('alt')||'');
      const phImg=(s.backgroundImage && s.backgroundImage!=='none') ? s.backgroundImage : '';
      out.elements.push({kind:'image', box:g, slot:true, tag:'img',
        contractSlot: slotOf(el),
        src:el.currentSrc||el.getAttribute('src')||'', ph:cap,
        // The blueprint grid / diagonal hatch / warm tint lives in the .ph
        // background (color + layered gradients); capture it so the placeholder
        // is the real textured box, not a flat grey rectangle.
        phBg: isPh ? s.backgroundColor : '', phBgImage: isPh ? phImg : '',
        phBgSize: isPh ? s.backgroundSize : '', phBgRepeat: isPh ? s.backgroundRepeat : '',
        phBgPosition: isPh ? s.backgroundPosition : '',
        phBorderW: isPh ? px(s.borderTopWidth) : 0,
        phBorderC: s.borderTopColor, phBorderS: s.borderTopStyle,
        // radiusOf resolves a "50%"/"999px" mask (a circular photo disc like the
        // 5D CICA leaf) against the box, so a round-cropped image stays round.
        radius:radiusOf(s, g.width, g.height), objectFit:s.objectFit});
      stampGroup(_grpStart);
      return;
    }
    const g=geom(el);
    const hasBg=!transparent(s.backgroundColor);
    const hasGrad=s.backgroundImage && s.backgroundImage!=='none';
    const hasBorder=anyBorder(s);
    const painted=(hasBg||hasGrad||hasBorder) && g.width*g.height>40;

    let emitText=false;
    if(isTextBlock(el)){
      let a=el.parentElement, anc=null;
      while(a&&a!==section){ if(textSet.has(a)){anc=a;break;} a=a.parentElement; }
      if(!anc){
        textSet.add(el);
        // A block splits into positioned fragments when (a) a descendant carries
        // its own paint / distinct colour / size, OR (b) it is a flex/grid ROW
        // with more than one child: its visual gaps come from `gap`/margin, so
        // innerText would either drop the space ("고객후기") or invent one
        // ("고객 의"). Walking each child to its real rect preserves the spacing.
        // EXCEPTION: a tall paragraph whose only emphasis is inline colour/size
        // and whose emphasis WRAPS across lines must stay one block — splitting
        // it overlaps the wrapped fragment with the copy after it (the .lead
        // "...아답토겐(Adaptogen) 허브" over "입니다. 특히 KSM-66…"). A real painted
        // chip/dot still forces a split (it needs its own box).
        const isRowLayout = /(flex|grid)/.test(s.display)
          && [...el.children].filter(c=>vis(c)).length>1;
        const wrapsBadly = inlineWraps(el) && !hasPaintedDesc(el) && !isRowLayout;
        // A small single-line painted chip whose only emphasis is a <sup> footnote
        // (a coral pill "트러블<sup>*</sup> 원인") must still split: Konva cannot draw
        // an inline superscript, so a flattened one-element chip renders the "*" at
        // full size, widening the copy past the pill and crushing its centring.
        // Splitting lets walkRuns emit the "*" as its own small raised run — matching
        // the source. Scoped to one-line chips so a multi-line body paragraph with a
        // lone footnote (a chat bubble) is NOT fragmented (the sup-skip guard holds).
        const supChip = painted && !!el.querySelector('sup,sub')
          && g.height <= (parseFloat(s.fontSize) || 0) * 2.5;
        if((hasSpecial(el, s.color) || isRowLayout || supChip) && !wrapsBadly){
          const groupStart=out.elements.length;
          if(painted) pushBox(g, s, Number(s.opacity||1));  // block's own bg
          emitPseudo(el);
          walkRuns(el, isRowLayout);
          // Bind the block's fragments into one unit — unless a declared
          // data-group already binds the whole row (a checklist row: checkbox svg
          // + the line's runs). Nesting here would wrap the runs in a second group
          // inside it, so the layers panel reads 그룹>그룹>텍스트 and the checkbox
          // ends up a sibling of a run-blob instead of a member of its row.
          // Tag flex/grid rows as 'row' (separate cells) and everything else —
          // colour/size emphasis, footnote chips — as 'flow' (one line).
          if(!_gk) groupFrom(groupStart, false, isRowLayout ? 'row' : 'flow');
          stampGroup(_grpStart);
          return;
        }
        emitText=true;
      }
      // If an ancestor already captured this text (or fragments consumed it via
      // `handled`), skip it to avoid duplicate, overlapping text.
    }

    // Decorative box: a standalone painted non-text element (card, circle).
    // A painted text block keeps its own background instead (see ownBg below).
    if(painted && !emitText){
      out.elements.push({kind:'box', box:g, fill:s.backgroundColor,
        gradient:hasGrad?s.backgroundImage:'', radius:radiusOf(s, g.width, g.height),
        borderWidth:px(s.borderTopWidth), borderColor:s.borderTopColor,
        borderStyle:s.borderTopStyle, borders:sideBorders(s), shadow:s.boxShadow,
        opacity:Number(s.opacity||1)});
    }
    // Pseudo shapes sit above the element's own background but below its
    // children, which are visited later in document order.
    const lead=emitPseudo(el);
    if(emitText){
      // A standalone, un-split text block (simple heading / body copy / badge)
      // is the primary editable content -> a slot candidate carrying its tag.
      // If a leading inline ::before marker was emitted, indent the first line by
      // its width so the copy starts after the marker (no overlap), matching flow.
      // A flex/grid button/chip that packs its text next to a sibling icon
      // (e.g. `<button>4+1 주문하기 <svg/></button>`, gap:8px, justify:flex-start)
      // has computed text-align:center (a <button> default) that never actually
      // centres in flow — the flex item is content-sized. Copying that center
      // onto the over-measured text box then slides the copy right, over the icon
      // that sits just past it. Keep it flex-start so the gap to the icon survives.
      // Centred on the INLINE axis? (row -> justify-content, column -> align-items,
      // same split hcenter uses.) If so the icon+text group really is centred and
      // must stay so; only suppress the misapplied text-align when it is not.
      const inlineCentred = /column/.test(s.flexDirection||'')
        ? s.alignItems==='center'
        : /center|space-around|space-evenly/.test(s.justifyContent||'');
      const flexIconRow = /(flex|grid)/.test(s.display) && !inlineCentred
        && [...el.children].some(c => vis(c)
             && (c.tagName==='svg' || c.querySelector('svg')));
      // Inset the box by the block's own vertical padding so the text sits where
      // it actually paints, not at the top of a tall padded cell. Some layouts
      // position a label WITH padding (e.g. the wave diagram's grid cells use
      // padding-top:120px to drop "속 피지 케어" below a crest); capturing the
      // padded cell rect and top-aligning the copy loses that offset and floats
      // every label up onto the wave. Painted text keeps its padded box (the
      // padding is its chip, balanced by verticalAlign:center).
      // Only substantial padding (deliberate positioning like the wave's 120px)
      // triggers the inset; small incidental padding is left as-is so ordinary
      // copy keeps its existing box.
      if(!painted){
        const pt=px(s.paddingTop), pb=px(s.paddingBottom);
        if(pt>=16||pb>=16){ g.y+=pt; g.height=Math.max(1, g.height-pt-pb); }
      }
      // Where the copy's first glyph ACTUALLY starts. ``indent`` above is a
      // FIRST-LINE indent, and only the proxy can honour it (text-indent); a
      // canvas text element has a single x and no first-line indent, so the copy
      // would paint from the block's left edge — straight over the inline
      // ::before marker that made room for it. That is the editor's "05" numeral
      // wearing the item name it numbers. A Range over the element's contents
      // excludes the pseudo (it is not in the DOM), so its first client rect is
      // exactly where the copy sits in flow.
      let indentTo=0;
      if(lead>0){
        try{
          const rg=document.createRange();
          rg.selectNodeContents(el);
          const rs=[...rg.getClientRects()].filter(r=>r.width>0.5 && r.height>0.5);
          if(rs.length) indentTo=rs[0].left-srect.left;
        }catch(_){ indentTo=0; }
      }
      const _chipStart=out.elements.length;
      pushText(g, blockText(el), s,
        {ownBg:painted, grad:hasGrad, slot:true, tag:el.tagName, indent:lead,
         indentTo:indentTo, alignStart:flexIconRow, el:el});
      // A painted text block (a coral keyword badge, a rounded pill) just emitted
      // its box + its label as two layers. Bind them into one editable unit so
      // the label can never drift off its pill when the editor re-measures it —
      // this is the "text on a box behaves like a highlight" grouping. Skip when
      // the element is already inside a declared data-group wrapper (that binds
      // the whole unit, tail and all) to avoid nesting a group inside a group.
      if(painted && !_gk && out.elements.length-_chipStart>=2){
        groupFrom(_chipStart, true);
      }
    } else if(hasBlockTextChild(el)){
      // Mixed container: rescue its own orphaned direct text (e.g. a caption
      // sitting next to a nested note div).
      emitDirectText(el);
    }
    stampGroup(_grpStart);
  });
  return out;
}
"""


# Group a labeled header with its following unlabeled body siblings into one
# temporary wrapper, so extraction and the screenshot both see the WHOLE screen
# (header + body), not just the header. The wrapper is a plain block div, so it
# preserves flow layout; the CSS only uses descendant selectors (.dp section),
# never direct-child combinators, so nesting does not change computed styles.
WRAP_JS = r"""
(label) => {
  const head = [...document.querySelectorAll('[data-screen-label]')]
    .find(n => n.getAttribute('data-screen-label') === label);
  if (!head) return false;
  const group = [head];
  let s = head.nextElementSibling;
  while (s && !s.hasAttribute('data-screen-label')) { group.push(s); s = s.nextElementSibling; }
  const wrap = document.createElement('div');
  wrap.setAttribute('data-screen-wrap', label);
  head.parentNode.insertBefore(wrap, head);
  group.forEach(n => wrap.appendChild(n));
  return true;
}
"""

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
FONT_WARMUP_JS = r"""
async (families) => {
  // Every character the page will paint, deduped — the argument to
  // fonts.load() selects which unicode-range slices get fetched.
  const text = [...new Set((document.body.innerText || '') + 'ABCabc0123')].join('');
  const weights = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
  const jobs = [];
  for (const family of families) {
    const quoted = '"' + family + '"';
    for (const w of weights) {
      jobs.push(document.fonts.load(w + ' 16px ' + quoted, text).catch(() => {}));
    }
  }
  await Promise.all(jobs);
  await document.fonts.ready;
  // Only our families. The authored document may register faces of its own,
  // and one of those failing says nothing about the bundle.
  const wanted = new Set(families.map((f) => f.toLowerCase()));
  const report = {loaded: 0, error: 0, loading: 0, unloaded: 0};
  document.fonts.forEach((face) => {
    const family = String(face.family || '').replace(/^['"]|['"]$/g, '').toLowerCase();
    if (!wanted.has(family)) return;
    if (face.status in report) report[face.status] += 1;
  });
  report.resolved = families.every((family) =>
    document.fonts.check('700 16px "' + family + '"', text),
  );
  // A slice is only fetched when the text needs its unicode-range, so leftover
  // `unloaded` faces are normal and say nothing about health.
  report.ok = report.resolved && report.loaded > 0 && report.error === 0;
  return report;
}
"""


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
UNWRAP_JS = r"""
(label) => {
  const wrap = document.querySelector('[data-screen-wrap="' + (window.CSS && CSS.escape ? CSS.escape(label) : label) + '"]');
  if (!wrap) return;
  const parent = wrap.parentNode;
  while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
  parent.removeChild(wrap);
}
"""


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
            custom["shadow"] = e.get("shadow", "none")
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
        if claim:
            group["claim"] = claim
            group["claimLabel"] = str(members[0].get("groupClaimLabel") or "").strip()
        out.append(group)
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
            _apply_declared_groups(sec["elements"]),
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
                flat.extend(_flatten(el.get("children") or []))
            else:
                flat.append(el)
        return flat

    for e in _flatten(sec["elements"]):
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
                    f"{pos}object-fit:{e['objectFit']};border-radius:{e['radius']}px;"
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
                f"{pos}{container}{indent}{deco_css}{wrap_props}color:{e['color']};"
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
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css">'
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
            await pp.evaluate("() => document.fonts.ready")
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
