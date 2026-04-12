"""``browser/get_text`` — 要素のテキストを取得する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/get_text",
    label="テキスト取得",
    labels={"ja": "テキスト取得", "en": "Get Text"},
    category="browser",
    version="0.1.0",
    ports={
        "selector": {"kind": "in", "type": "string", "required": True},
        "text": {"kind": "out", "type": "string"},
    },
    params={
        "selector": {
            "type": "string",
            "default": "",
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import get_page

    selector = ports.get("selector") or params.get("selector", "")
    if not selector:
        raise ValueError("selector が未指定です")

    page = get_page()
    text = page.inner_text(selector)

    ctx.log("info", f"取得: {selector} → '{text[:50]}'")
    return {"text": text}
