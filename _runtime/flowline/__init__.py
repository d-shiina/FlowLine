"""FLOWLINE Python node API.

This package is imported by every worker process. Node files in
``_runtime/nodes/**/*.py`` decorate their ``run`` function with
``@flowline.node(...)`` to register themselves with the worker's
registry. The worker then dispatches ``run_node`` requests coming
from the Electron engine to the matching registered function.

The public surface is intentionally tiny — it is the contract that
node authors (built-in + third-party) code against, so every addition
has to be thought through. Phase 2a ships the bare minimum needed
to prove the IPC round-trip end to end:

* ``@node(id=..., label=..., ...)`` — register a callable as a node
* ``NodeContext`` — log, cancellation flag, identifiers
* ``REGISTRY`` — internal dict the worker reads after imports finish

Things that *will* land here in subsequent phases (and are explicitly
left out for now to keep the surface small):

* ``params`` schema validation (Phase 2b)
* ``inputs`` / ``outputs`` declaration-driven variable plumbing
  (Phase 2b — the engine already tracks them in TS)
* version / category metadata exposed to a plugin manifest
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


# ──────────────────────────────────────────────────────────────────
# NodeContext
# ──────────────────────────────────────────────────────────────────


@dataclass
class NodeContext:
    """Per-invocation context handed to a node's ``run`` function.

    A fresh ``NodeContext`` is constructed by the worker for every
    ``run_node`` request. Nodes should not hold references to it
    beyond their own call — it becomes meaningless after ``run``
    returns.
    """

    block_id: str
    track_id: str
    timeout: Optional[float]
    _cancel_event: threading.Event
    _log_sink: Callable[[str, str], None]
    _logs: List[Dict[str, str]] = field(default_factory=list)

    @property
    def cancelled(self) -> bool:
        """True once the engine has requested cancellation for this run."""
        return self._cancel_event.is_set()

    def log(self, level: str, message: str) -> None:
        """Emit a log line tagged to this block.

        The worker forwards logs to the engine over stdout, but we
        also buffer them on the context so the final ``result`` frame
        can carry the full tail in a single envelope.
        """
        if level not in ("info", "warn", "error"):
            level = "info"
        entry = {"level": level, "message": str(message)}
        self._logs.append(entry)
        try:
            self._log_sink(level, str(message))
        except Exception:  # pragma: no cover — best-effort streaming
            pass


# ──────────────────────────────────────────────────────────────────
# Registry + decorator
# ──────────────────────────────────────────────────────────────────


@dataclass
class NodeSpec:
    id: str
    label: str
    category: str
    version: str
    run: Callable[..., Any]
    on_error: str
    params: Dict[str, Any]
    inputs: List[str]
    outputs: List[str]


REGISTRY: Dict[str, NodeSpec] = {}


def node(
    *,
    id: str,
    label: str,
    category: str = "custom",
    version: str = "0.1.0",
    on_error: str = "abort",
    params: Optional[Dict[str, Any]] = None,
    inputs: Optional[List[str]] = None,
    outputs: Optional[List[str]] = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator registering a callable as a FLOWLINE node.

    Usage::

        @flowline.node(id="debug/log", label="ログ出力", category="debug")
        def run(params, ctx):
            ctx.log("info", params.get("message", ""))
            return {}

    The body of ``run`` receives ``(params, ctx)`` where ``params``
    is the resolved parameter dict (decorator defaults overlaid by
    the JSON-scenario overrides) and ``ctx`` is a ``NodeContext``.
    Return value is a dict mapping scenario-variable names to new
    values; Phase 2a ignores this payload, Phase 2b will reflect
    the declared ``outputs`` back into the engine.
    """

    def wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
        spec = NodeSpec(
            id=id,
            label=label,
            category=category,
            version=version,
            run=fn,
            on_error=on_error,
            params=dict(params or {}),
            inputs=list(inputs or []),
            outputs=list(outputs or []),
        )
        if id in REGISTRY:
            # Last-import-wins, matching docs/03-nodes.md.
            REGISTRY[id] = spec
        else:
            REGISTRY[id] = spec
        return fn

    return wrap


__all__ = ["node", "NodeContext", "NodeSpec", "REGISTRY"]
