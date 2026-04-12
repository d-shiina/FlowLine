"""``browser/screenshot`` — ページまたは要素のスクリーンショットを保存する。"""

from __future__ import annotations

import os
import time

from flowline import node


@node(
    id="browser/screenshot",
    label="スクリーンショット",
    labels={"ja": "スクリーンショット", "en": "Screenshot"},
    category="browser",
    version="0.1.0",
    ports={
        "path": {"kind": "out", "type": "string"},
    },
    params={
        "save_dir": {
            "type": "string",
            "default": "",
        },
        "filename": {
            "type": "string",
            "default": "",
        },
        "selector": {
            "type": "string",
            "default": "",
        },
        "full_page": {
            "type": "boolean",
            "default": False,
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import get_page

    save_dir = params.get("save_dir", "") or os.path.expanduser("~/Desktop")
    filename = params.get("filename", "") or f"flowline_{int(time.time())}.png"
    selector = params.get("selector", "")
    full_page = params.get("full_page", False)

    if not filename.endswith(".png"):
        filename += ".png"

    filepath = os.path.join(save_dir, filename)
    os.makedirs(save_dir, exist_ok=True)

    page = get_page()

    if selector:
        ctx.log("info", f"要素のスクリーンショット: {selector}")
        element = page.query_selector(selector)
        if element:
            element.screenshot(path=filepath)
        else:
            raise ValueError(f"要素が見つかりません: {selector}")
    else:
        ctx.log("info", f"ページ全体のスクリーンショット")
        page.screenshot(path=filepath, full_page=full_page)

    ctx.log("info", f"保存: {filepath}")
    return {"path": filepath}
