import argparse
import copy
import json
from pathlib import Path


WIDTH = 1080
HEIGHT = 1350


def _nodes(children):
    for child in children:
        yield child
        yield from _nodes(child.get("children", []))


def build_carousel_document(canvas_documents):
    pages = []
    families = set()
    ids = set()

    for number, canvas in enumerate(canvas_documents, 1):
        if canvas.get("width") != WIDTH or canvas.get("height") != HEIGHT:
            raise ValueError(f"carousel page must be {WIDTH}x{HEIGHT}")
        source_pages = canvas.get("pages", [])
        if len(source_pages) != 1:
            raise ValueError("each carousel input must contain exactly one page")

        page = copy.deepcopy(source_pages[0])
        children = list(page.get("children", []))
        background = "#ffffff"
        if children and children[0].get("id", "").endswith("-bg"):
            background = children.pop(0).get("fill") or background

        prefix = f"p{number:02d}-"
        for node in _nodes(children):
            node["id"] = prefix + node["id"]
            if node["id"] in ids:
                raise ValueError(f"duplicate element id: {node['id']}")
            ids.add(node["id"])
            if node.get("type") == "text" and node.get("fontFamily"):
                families.add(node["fontFamily"])

        pages.append(
            {
                **page,
                "id": f"p{number:02d}",
                "background": background,
                "children": children,
            }
        )

    if not pages:
        raise ValueError("at least one carousel page is required")

    return {
        "schema_version": "leviosa-canvas-detail-page-v1",
        "renderer": "leviosa_canvas_detail_page",
        "kind": "carousel",
        "canvas": {"width": WIDTH, "background": pages[0]["background"]},
        "canvas_json": {"width": WIDTH, "height": HEIGHT, "pages": pages},
        "fonts": [{"family": family, "source": "local"} for family in sorted(families)],
        "source": "leviosa_canvas_editor",
    }


def main():
    parser = argparse.ArgumentParser(description="Combine carousel Canvas pages")
    parser.add_argument("canvas", nargs="+")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    document = build_carousel_document(
        [json.loads(Path(path).read_text()) for path in args.canvas]
    )
    Path(args.out).write_text(
        json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
