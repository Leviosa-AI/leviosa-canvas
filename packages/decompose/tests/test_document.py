from leviosa_decompose.document import build_carousel_document


def page(label, font="Pretendard"):
    return {
        "width": 1080,
        "height": 1350,
        "pages": [
            {
                "id": label,
                "children": [
                    {
                        "id": f"{label}-bg",
                        "type": "figure",
                        "fill": "#ffeecc",
                    },
                    {
                        "id": f"{label}-group",
                        "type": "group",
                        "children": [
                            {
                                "id": f"{label}-text",
                                "type": "text",
                                "fontFamily": font,
                            }
                        ],
                    },
                ],
            }
        ],
    }


def test_builds_one_carousel_document_with_unique_page_prefixed_ids():
    document = build_carousel_document([page("same"), page("same", "Jost")])
    pages = document["canvas_json"]["pages"]
    ids = [node["id"] for page in pages for node in page["children"]]
    child_ids = [page["children"][0]["children"][0]["id"] for page in pages]

    assert document["kind"] == "carousel"
    assert "slot_bindings" not in document
    assert [page["id"] for page in pages] == ["p01", "p02"]
    assert all(page["background"] == "#ffeecc" for page in pages)
    assert ids == ["p01-same-group", "p02-same-group"]
    assert child_ids == ["p01-same-text", "p02-same-text"]
    assert document["fonts"] == [
        {"family": "Jost", "source": "local"},
        {"family": "Pretendard", "source": "local"},
    ]
