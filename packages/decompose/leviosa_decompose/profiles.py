from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    slice_by: str | None
    placeholder_class: str | None


DETAIL_PAGE = Profile(slice_by="data-screen-label", placeholder_class="ph")
CAROUSEL = Profile(slice_by=None, placeholder_class=None)
