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
    version="0.2.0",
    ports={
        "browser": {"kind": "in", "type": "string", "required": True},
        "path": {"kind": "out", "type": "string"},
    },
    params={
        "save_dir": {"type": "string", "default": ""},
        "filename": {"type": "string", "default": ""},
        "selector": {"type": "string", "default": ""},
        "full_page": {"type": "boolean", "default": False},
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, get_page

    browser_name = ports["browser"]
    save_dir = params.get("save_dir", "") or os.path.expanduser("~/Desktop")
    filename = params.get("filename", "") or f"flowline_{int(time.time())}.png"
    selector = params.get("selector", "")
    full_page = params.get("full_page", False)

    if not filename.endswith(".png"):
        filename += ".png"
    filepath = os.path.join(save_dir, filename)
    os.makedirs(save_dir, exist_ok=True)

    def _do():
        page = get_page(browser_name)
        if selector:
            element = page.query_selector(selector)
            if not element:
                raise ValueError(f"要素が見つかりません: {selector}")
            element.screenshot(path=filepath)
        else:
            page.screenshot(path=filepath, full_page=full_page)

    ctx.log("info", f"[{browser_name}] スクリーンショット撮影中")
    run_on_browser(_do)
    ctx.log("info", f"保存: {filepath}")
    return {"path": filepath}
