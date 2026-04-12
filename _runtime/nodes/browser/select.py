"""``browser/select`` — ドロップダウン (select 要素) の値を選択する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/select",
    label="ドロップダウン選択",
    labels={"ja": "ドロップダウン選択", "en": "Select Option"},
    category="browser",
    version="0.1.0",
    ports={
        "selector": {"kind": "in", "type": "string", "required": True},
        "value": {"kind": "in", "type": "string", "required": True},
        "selected": {"kind": "out", "type": "string"},
    },
    params={
        "selector": {
            "type": "string",
            "default": "",
        },
        "value": {
            "type": "string",
            "default": "",
        },
        "by": {
            "type": "enum",
            "choices": ["value", "label", "index"],
            "default": "value",
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import get_page

    selector = ports.get("selector") or params.get("selector", "")
    value = ports.get("value") or params.get("value", "")
    by = params.get("by", "value")

    if not selector:
        raise ValueError("selector が未指定です")

    page = get_page()

    if by == "label":
        result = page.select_option(selector, label=value)
    elif by == "index":
        result = page.select_option(selector, index=int(value))
    else:
        result = page.select_option(selector, value=value)

    selected = result[0] if result else ""
    ctx.log("info", f"選択: {selector} → '{selected}'")
    return {"selected": selected}
