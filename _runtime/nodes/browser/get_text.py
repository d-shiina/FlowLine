"""``browser/get_text`` — 要素のテキストを取得する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/get_text",
    label="テキスト取得",
    labels={"ja": "テキスト取得", "en": "Get Text"},
    category="browser",
    version="0.2.0",
    ports={
        "browser": {"kind": "in", "type": "string", "required": True},
        "selector": {"kind": "in", "type": "string", "required": True},
        "text": {"kind": "out", "type": "string"},
    },
    params={
        "selector": {"type": "string", "default": ""},
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, get_page

    browser_name = ports["browser"]
    selector = ports.get("selector") or params.get("selector", "")
    if not selector:
        raise ValueError("selector が未指定です")

    def _do():
        return get_page(browser_name).inner_text(selector)

    text = run_on_browser(_do)
    ctx.log("info", f"[{browser_name}] 取得: {selector} → '{text[:50]}'")
    return {"text": text}
