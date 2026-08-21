from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    slice_by: str | None
    placeholder_class: str | None
    split_svg_parts: bool


DETAIL_PAGE = Profile(
    slice_by="data-screen-label", placeholder_class="ph", split_svg_parts=True
)
CAROUSEL = Profile(slice_by=None, placeholder_class=None, split_svg_parts=False)
