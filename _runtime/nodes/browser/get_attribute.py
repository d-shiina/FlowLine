"""``browser/get_attribute`` — 要素の属性値を取得する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/get_attribute",
    label="属性取得",
    labels={"ja": "属性取得", "en": "Get Attribute"},
    category="browser",
    version="0.1.0",
    ports={
        "selector": {"kind": "in", "type": "string", "required": True},
        "value": {"kind": "out", "type": "string"},
    },
    params={
        "selector": {
            "type": "string",
            "default": "",
        },
        "attribute": {
            "type": "string",
            "default": "href",
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import get_page

    selector = ports.get("selector") or params.get("selector", "")
    attr = params.get("attribute", "href")
    if not selector:
        raise ValueError("selector が未指定です")

    page = get_page()
    value = page.get_attribute(selector, attr) or ""

    ctx.log("info", f"取得: {selector}[{attr}] → '{value[:50]}'")
    return {"value": value}
