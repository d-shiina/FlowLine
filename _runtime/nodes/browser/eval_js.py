"""``browser/eval_js`` — ページ上で JavaScript を実行する。"""

from __future__ import annotations

import json

from flowline import node


@node(
    id="browser/eval_js",
    label="JavaScript実行",
    labels={"ja": "JavaScript実行", "en": "Evaluate JS"},
    category="browser",
    version="0.1.0",
    ports={
        "result": {"kind": "out", "type": "string"},
    },
    params={
        "expression": {
            "type": "string",
            "default": "document.title",
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import get_page

    expression = params.get("expression", "document.title")
    ctx.log("info", f"JS実行: {expression[:60]}")

    page = get_page()
    result = page.evaluate(expression)

    result_str = json.dumps(result, ensure_ascii=False) if not isinstance(result, str) else result
    ctx.log("info", f"結果: {result_str[:80]}")
    return {"result": result_str}
