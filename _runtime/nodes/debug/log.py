"""``debug/log`` — smallest possible node, used to verify the
end-to-end Python → engine → UI wiring. Emits the configured
message at the configured level and returns the message on the
``out`` port so scenarios can chain it through bindings.

Intentionally minimal: no third-party imports, no side effects
beyond logging, nothing that can fail under normal use. If this
node doesn't light up the ExecutionLogPanel, something is wrong
with the worker protocol, not the node.
"""

from __future__ import annotations

from flowline import node


@node(
    id="debug/log",
    label="ログ出力",
    labels={"ja": "ログ出力", "en": "Log"},
    category="debug",
    version="0.1.0",
    ports={
        "message": {"kind": "in", "type": "string", "required": False},
        "out": {"kind": "out", "type": "string"},
    },
    params={
        "message": {
            "type": "string",
            "default": "hello from flowline",
        },
        "level": {
            "type": "enum",
            "choices": ["info", "warn", "error"],
            "default": "info",
        },
    },
    on_error="ignore",
)
def run(ports, params, ctx):
    # Prefer the bound-in port value if one was supplied, otherwise
    # fall back to the static param default. This lets the same
    # block work as either "print a literal" or "print a variable".
    message = ports.get("message") or params.get("message", "")
    level = params.get("level", "info")
    ctx.log(level, str(message))
    return {"out": str(message)}
