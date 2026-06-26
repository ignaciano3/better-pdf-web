[done] How can we prevent that the user doesn't draw outside the paper? → clamp place/draw/drag to page bounds (clampToPage/clampBox), tests added.
[done] Polygon alpha doesn't do anything (or I don't see any change) → was preview-only; overlay now applies opacity (export already did).
[done] It allows adding links with no target so when I export I get an error → renderer already skips them; added amber overlay + pre-export warning banner.
[done] Polygon we need to tell the user how it works (at least for the first time) → hint banner while polygon tool active.
[done] How can i set the page size? → "+ Blank" size picker in Pages panel, sourced from better-pdf PageSizes.
