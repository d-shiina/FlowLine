"""``browser/select`` — ドロップダウン (select 要素) の値を選択する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/select",
    label="ドロップダウン選択",
    labels={"ja": "ドロップダウン選択", "en": "Select Option"},
    category="browser",
    version="0.2.0",
    ports={
        "browser": {"kind": "in", "type": "string", "required": True},
        "selector": {"kind": "in", "type": "string", "required": True},
        "value": {"kind": "in", "type": "string", "required": True},
        "selected": {"kind": "out", "type": "string"},
    },
    params={
        "selector": {"type": "string", "default": ""},
        "value": {"type": "string", "default": ""},
        "by": {
            "type": "enum",
            "choices": ["value", "label", "index"],
            "default": "value",
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, get_page

    browser_name = ports["browser"]
    selector = ports.get("selector") or params.get("selector", "")
    value = ports.get("value") or params.get("value", "")
    by = params.get("by", "value")
    if not selector:
        raise ValueError("selector が未指定です")

    def _do():
        page = get_page(browser_name)
        if by == "label":
            return page.select_option(selector, label=value)
        elif by == "index":
            return page.select_option(selector, index=int(value))
        return page.select_option(selector, value=value)

    ctx.log("info", f"[{browser_name}] 選択: {selector}")
    result = run_on_browser(_do)
    selected = result[0] if result else ""
    ctx.log("info", f"選択結果: '{selected}'")
    return {"selected": selected}
