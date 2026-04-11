"""FLOWLINE Python node API.

This package is imported by every worker process. Node files in
``_runtime/nodes/**/*.py`` decorate their ``run`` function with
``@flowline.node(...)`` to register themselves with the worker's
registry. The worker then dispatches ``run_node`` requests coming
from the Electron engine to the matching registered function.

The public surface is intentionally tiny — it is the contract that
node authors (built-in + third-party) code against, so every addition
has to be thought through. See docs/03-nodes.md (rev2) for the full
design rationale.

Public surface
==============

* ``@node(id=..., label=..., ports=..., ...)`` — decorator that
  registers a callable as a node.
* ``NodeContext`` — log sink, cancellation flag, identifiers.
* ``NodeSpec`` — the registration record kept in ``REGISTRY``.
* ``REGISTRY`` — dict consumed by the worker after imports finish.
* ``NodeIdCollisionError`` — raised at import time when two nodes
  register the same ``id`` without ``overrides=True``.
* ``logging_bridge`` — context manager the worker wraps ``run()``
  in so that stdlib ``logging`` output is forwarded to ``ctx.log``.
"""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterator, List, Optional


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

        The worker forwards logs to the engine over stdout; we also
        buffer them on the context in case downstream tooling wants
        a per-invocation transcript.
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


class NodeIdCollisionError(RuntimeError):
    """Raised when two nodes register the same id without ``overrides``.

    Last-import-wins was rejected in rev2 of the node design doc:
    silent load-order-dependent behaviour is a nightmare to debug,
    especially once users start dropping third-party ``.fln`` bundles
    into ``_runtime/nodes/custom/``. The only supported way to replace
    an existing node is to set ``@node(..., overrides=True)`` on the
    replacement, which makes the intent explicit and auditable.
    """


@dataclass
class NodeSpec:
    """Registration record for a single node.

    Attributes mirror the decorator kwargs. ``ports`` and ``params``
    are kept as plain dicts so the worker can serialise them into the
    ``ready`` manifest without extra marshalling.
    """

    id: str
    label: str
    labels: Dict[str, str]
    category: str
    version: str
    run: Callable[..., Any]
    on_error: str
    params: Dict[str, Any]
    ports: Dict[str, Dict[str, Any]]
    overrides: bool


REGISTRY: Dict[str, NodeSpec] = {}


def node(
    *,
    id: str,
    label: str,
    labels: Optional[Dict[str, str]] = None,
    category: str = "custom",
    version: str = "0.1.0",
    on_error: str = "abort",
    params: Optional[Dict[str, Any]] = None,
    ports: Optional[Dict[str, Dict[str, Any]]] = None,
    overrides: bool = False,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator registering a callable as a FLOWLINE node.

    Usage::

        @flowline.node(
            id="debug/log",
            label="ログ出力",
            labels={"ja": "ログ出力", "en": "Log"},
            category="debug",
            ports={
                "message": {"kind": "in", "type": "string"},
            },
        )
        def run(ports, params, ctx):
            ctx.log("info", ports["message"])
            return {}

    ``run`` receives three positional arguments:

    * ``ports`` — dict of the in-port values the engine pre-resolved
      from the scenario's bindings.
    * ``params`` — dict of parameters with decorator defaults overlaid
      by the JSON scenario's overrides.
    * ``ctx`` — a ``NodeContext``.

    Return value must be a ``dict`` mapping out-port names to their
    new values. Keys that aren't declared as out-ports are dropped
    with a warning logged by the worker.
    """

    def wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
        spec = NodeSpec(
            id=id,
            label=label,
            labels=dict(labels or {}),
            category=category,
            version=version,
            run=fn,
            on_error=on_error,
            params=dict(params or {}),
            ports=dict(ports or {}),
            overrides=overrides,
        )
        existing = REGISTRY.get(id)
        if existing is not None and not overrides:
            raise NodeIdCollisionError(
                f"duplicate node id {id!r}: already registered by "
                f"{existing.run.__module__}.{existing.run.__qualname__}. "
                f"Set @node(overrides=True) on the replacement to make "
                f"the override explicit."
            )
        REGISTRY[id] = spec
        return fn

    return wrap


# ──────────────────────────────────────────────────────────────────
# stdlib logging bridge
# ──────────────────────────────────────────────────────────────────


_LEVEL_MAP = {
    logging.DEBUG: "info",
    logging.INFO: "info",
    logging.WARNING: "warn",
    logging.ERROR: "error",
    logging.CRITICAL: "error",
}


class _CtxHandler(logging.Handler):
    """Routes stdlib ``logging`` records to a ``NodeContext.log``.

    Installed for the duration of a node's ``run()`` call by
    ``logging_bridge``. Uses the root logger so third-party libraries
    that call ``logging.getLogger(__name__).info(...)`` just work
    without the node author touching anything.
    """

    def __init__(self, ctx: NodeContext) -> None:
        super().__init__(level=logging.DEBUG)
        self._ctx = ctx

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover
        try:
            level = _LEVEL_MAP.get(record.levelno, "info")
            msg = self.format(record)
            self._ctx.log(level, f"[{record.name}] {msg}")
        except Exception:
            # Never let a logging failure bubble into node code.
            pass


@contextmanager
def logging_bridge(ctx: NodeContext) -> Iterator[None]:
    """Install a stdlib ``logging`` bridge for the duration of a run.

    The worker wraps each ``spec.run(...)`` call in ``with
    logging_bridge(ctx):`` so any library the node happens to import
    (requests, openpyxl, etc.) has its log output mirrored into the
    engine's ExecutionLogPanel via ``ctx.log``. Removed cleanly when
    the block returns so other workers / other runs aren't polluted.
    """
    handler = _CtxHandler(ctx)
    root = logging.getLogger()
    previous_level = root.level
    # DEBUG so we don't silently drop noisy library output. The engine
    # can choose to hide debug chatter in the UI; that's a rendering
    # concern, not a transport concern.
    root.setLevel(logging.DEBUG)
    root.addHandler(handler)
    try:
        yield
    finally:
        root.removeHandler(handler)
        root.setLevel(previous_level)


__all__ = [
    "node",
    "NodeContext",
    "NodeSpec",
    "NodeIdCollisionError",
    "REGISTRY",
    "logging_bridge",
]
