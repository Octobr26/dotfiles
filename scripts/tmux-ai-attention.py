#!/usr/bin/env python3
"""Keep semantic tmux pane headers and aggregate AI attention state current."""

from __future__ import annotations

import fcntl
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set

SEP = "\x1f"
PANE_FORMAT = SEP.join((
    "#{session_name}", "#{window_id}", "#{pane_id}", "#{pane_pid}",
    "#{pane_current_command}", "#{pane_start_command}",
    "#{pane_current_path}", "#{pane_title}", "#{@agent_kind}",
    "#{@agent_project}", "#{@pane_tool}", "#{@pane_project}",
    "#{@pane_state}", "#{@pane_state_source}",
))
AGENTS = {"codex", "claude"}
SHELLS = {"bash", "fish", "sh", "zsh"}
TOOL_NAMES = {"lazygit": "LAZYGIT", "nvim": "NVIM", "vim": "VIM"}
BLOCKED = re.compile(
    r"would you like to run|do you want to allow|press enter to confirm|"
    r"permission|approval|allow this|requires your input", re.IGNORECASE,
)
WORKING = re.compile(
    r"thinking|working|generating|esc to interrupt|ctrl-c to interrupt|"
    r"running (?:command|tool)|in progress", re.IGNORECASE,
)
PROMPT = re.compile(r"^\s*(?:[›❯▸]\s|\$\s|%\s)")
COMPLETED = re.compile(r"^\s*[•✓]\s+Done[.!]?", re.IGNORECASE | re.MULTILINE)
SPINNERS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
MAX_PROJECT_LENGTH = 24
HOOK_COMMAND = "tmux-ai-attention hook"


def tmux(*args: str, check: bool = False) -> str:
    result = subprocess.run(["tmux", *args], text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or "tmux command failed")
    return result.stdout


def command_name(command: str) -> str:
    if not command.strip():
        return ""
    return os.path.basename(command.strip().split(maxsplit=1)[0]).lower()


def agent_kind(
    metadata: str,
    command: str,
    start: str,
    descendant: Optional[str],
    title: str,
    text: str,
) -> Optional[str]:
    if metadata.lower() in AGENTS:
        return metadata.lower()
    for candidate in (command_name(command), command_name(start)):
        if candidate in AGENTS:
            return candidate
    if descendant in AGENTS:
        return descendant
    haystack = f"{title}\n{text}".lower()
    if "openai codex" in haystack:
        return "codex"
    if "claude code" in haystack:
        return "claude"
    return None


def process_children() -> Dict[str, List[tuple[str, str]]]:
    """Read the process table once and index children by parent PID."""
    result = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,comm="],
        text=True,
        capture_output=True,
    )
    children: Dict[str, List[tuple[str, str]]] = defaultdict(list)
    if result.returncode:
        return children
    for row in result.stdout.splitlines():
        parts = row.split(maxsplit=2)
        if len(parts) != 3:
            continue
        pid, parent, command = parts
        children[parent].append((pid, command_name(command)))
    return children


def descendant_agent(
    pane_pid: str,
    children: Dict[str, List[tuple[str, str]]],
) -> Optional[str]:
    """Return the nearest Claude or Codex process below a pane shell."""
    pending = deque(children.get(pane_pid, ()))
    seen = set()
    while pending:
        pid, command = pending.popleft()
        if pid in seen:
            continue
        seen.add(pid)
        if command in AGENTS:
            return command
        pending.extend(children.get(pid, ()))
    return None


def tool_name(kind: Optional[str], command: str, start: str) -> str:
    if kind:
        return kind.upper()
    current = command_name(command) or command_name(start) or "pane"
    if current in SHELLS:
        return "SHELL"
    return TOOL_NAMES.get(current, current.upper())


def classify(title: str, text: str) -> str:
    recent = "\n".join(text.splitlines()[-24:])
    tail = [line for line in recent.splitlines() if line.strip()][-8:]
    tail_text = "\n".join(tail)
    if any(PROMPT.match(line) for line in tail):
        return "done" if COMPLETED.search(recent) else "idle"
    if BLOCKED.search(tail_text):
        return "blocked"
    if (title and title[:1] in SPINNERS) or WORKING.search(tail_text):
        return "working"
    return "working"


def hook_state(payload: Dict[str, object]) -> Optional[str]:
    """Translate supported lifecycle events into the pane's semantic state."""
    event = payload.get("hook_event_name", "")
    if event == "Notification":
        notification_type = payload.get("notification_type", "")
        if notification_type in {"permission_prompt", "agent_needs_input"}:
            return "blocked"
        return None
    return {
        "SessionStart": "idle",
        "UserPromptSubmit": "working",
        "PermissionRequest": "blocked",
        "PostToolUse": "working",
        "SubagentStart": "working",
        "SubagentStop": "done",
        "Stop": "done",
        "SessionEnd": "idle",
    }.get(str(event))


def short_name(value: str) -> str:
    name = os.path.basename(os.path.normpath(value)) if value else ""
    return name if len(name) <= MAX_PROJECT_LENGTH else f"{name[:23]}…"


def git_root(path: str, cache: Dict[str, str]) -> str:
    if not path:
        return ""
    if path not in cache:
        result = subprocess.run(
            ["git", "-C", path, "rev-parse", "--show-toplevel"],
            text=True, capture_output=True,
        )
        cache[path] = result.stdout.strip() if result.returncode == 0 else ""
    return cache[path]


def play(kind: str) -> None:
    if sys.platform == "darwin" and shutil.which("afplay"):
        bundled = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "tmux-ai-attention-sounds", f"{kind}.m4a",
        )
        sound = bundled if os.path.isfile(bundled) else (
            "/System/Library/Sounds/Glass.aiff"
            if kind == "done" else "/System/Library/Sounds/Funk.aiff"
        )
        subprocess.Popen(
            ["afplay", sound], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    elif shutil.which("paplay"):
        subprocess.Popen(
            ["paplay", "/usr/share/sounds/freedesktop/stereo/complete.oga"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )


@dataclass
class Pane:
    session: str
    window: str
    pane: str
    pid: str
    command: str
    start: str
    path: str
    title: str
    metadata_kind: str
    metadata_project: str
    old_tool: str
    old_project: str
    old_state: str
    old_source: str
    kind: Optional[str] = None
    project: str = ""
    state: str = ""


@dataclass
class Watcher:
    raw: Dict[str, str]
    displayed: Dict[str, str]
    windows: Dict[str, str]
    initialized: Set[str]

    def list_panes(self) -> List[Pane]:
        panes = []
        for row in tmux("list-panes", "-a", "-F", PANE_FORMAT).splitlines():
            parts = row.split(SEP)
            if len(parts) == 14:
                panes.append(Pane(*parts))
        return panes

    def assign_projects(self, panes: List[Pane]) -> None:
        cache: Dict[str, str] = {}
        by_window: Dict[str, List[str]] = defaultdict(list)
        by_session: Dict[str, List[str]] = defaultdict(list)
        for pane in panes:
            root = git_root(pane.path, cache)
            if root:
                by_window[pane.window].append(root)
                by_session[pane.session].append(root)
        for pane in panes:
            candidates = []
            if pane.metadata_project:
                candidates.append(pane.metadata_project)
            candidates.extend((git_root(pane.path, cache), *by_window[pane.window], *by_session[pane.session]))
            project_path = next((candidate for candidate in candidates if candidate), "")
            pane.project = short_name(project_path) or short_name(pane.session) or "project"

    @staticmethod
    def set_pane_option(pane: str, name: str, value: str, old: str, dry_run: bool) -> bool:
        if value == old:
            return False
        if not dry_run:
            if value:
                tmux("set-option", "-p", "-t", pane, name, value)
            else:
                tmux("set-option", "-up", "-t", pane, name)
        return True

    def poll(self, dry_run: bool = False) -> None:
        panes = self.list_panes()
        self.assign_projects(panes)
        focused = tmux("display-message", "-p", "#{pane_id}").strip()
        changed = False
        window_states: Dict[str, List[str]] = defaultdict(list)
        children = process_children()

        for pane in panes:
            text = tmux("capture-pane", "-p", "-t", pane.pane, "-S", "-80")
            pane.kind = agent_kind(
                pane.metadata_kind,
                pane.command,
                pane.start,
                descendant_agent(pane.pid, children),
                pane.title,
                text,
            )
            if pane.kind:
                if pane.old_source in {"claude-hook", "codex-hook"}:
                    pane.state = pane.old_state or "idle"
                    self.raw.pop(pane.pane, None)
                    self.displayed[pane.pane] = pane.state
                else:
                    raw = classify(pane.title, text)
                    previous_raw = self.raw.get(pane.pane, "")
                    previous_displayed = self.displayed.get(pane.pane, "")
                    if raw == "idle" and pane.pane != focused and (
                        previous_raw == "working" or previous_displayed == "done"
                    ):
                        pane.state = "done"
                    else:
                        pane.state = raw
                    if pane.pane not in self.initialized:
                        self.initialized.add(pane.pane)
                    elif pane.pane != focused and raw == "idle" and previous_raw == "working":
                        play("done")
                    elif pane.pane != focused and raw == "blocked" and previous_raw != "blocked":
                        play("request")
                    self.raw[pane.pane] = raw
                    self.displayed[pane.pane] = pane.state
                window_states[pane.window].append(pane.state)
            else:
                self.raw.pop(pane.pane, None)
                self.displayed.pop(pane.pane, None)

            changed |= self.set_pane_option(
                pane.pane, "@pane_tool", tool_name(pane.kind, pane.command, pane.start),
                pane.old_tool, dry_run,
            )
            changed |= self.set_pane_option(
                pane.pane, "@pane_project", pane.project, pane.old_project, dry_run,
            )
            changed |= self.set_pane_option(
                pane.pane, "@pane_state", pane.state, pane.old_state, dry_run,
            )
            source = pane.old_source if pane.old_source in {"claude-hook", "codex-hook"} else (
                "screen" if pane.kind else ""
            )
            changed |= self.set_pane_option(
                pane.pane, "@pane_state_source", source, pane.old_source, dry_run,
            )

        live_panes = {pane.pane for pane in panes}
        for pane in set(self.raw) - live_panes:
            self.raw.pop(pane, None)
            self.displayed.pop(pane, None)
            self.initialized.discard(pane)

        live_windows = {pane.window for pane in panes}
        for window in live_windows | set(self.windows):
            states = window_states.get(window, [])
            state = next((s for s in ("blocked", "working", "done", "idle") if s in states), "")
            if state != self.windows.get(window, ""):
                if not dry_run:
                    if state:
                        tmux("set-option", "-w", "-t", window, "@ai_state", state)
                    else:
                        tmux("set-option", "-uw", "-t", window, "@ai_state")
                print(f"{window}: {self.windows.get(window) or 'none'} -> {state or 'none'}")
                self.windows[window] = state
        for window in set(self.windows) - live_windows:
            self.windows.pop(window, None)

        if changed and not dry_run:
            tmux("refresh-client")


def lock() -> object:
    handle = open(os.path.join(tempfile.gettempdir(), "tmux-ai-attention.lock"), "w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit(0)
    return handle


def update_window_state(pane: str) -> None:
    window = tmux("display-message", "-p", "-t", pane, "#{window_id}").strip()
    if not window:
        return
    states = tmux("list-panes", "-t", window, "-F", "#{@pane_state}").splitlines()
    state = next((candidate for candidate in ("blocked", "working", "done", "idle")
                  if candidate in states), "")
    if state:
        tmux("set-option", "-w", "-t", window, "@ai_state", state)
    else:
        tmux("set-option", "-uw", "-t", window, "@ai_state")


def handle_hook(kind: str) -> int:
    """Translate stable agent hook JSON into pane-local tmux state."""
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        print("{}")
        return 0

    pane = os.environ.get("TMUX_PANE", "")
    state = hook_state(payload)
    if not pane or not state:
        print("{}")
        return 0

    focused = tmux("display-message", "-p", "#{pane_id}").strip()
    old_state = tmux("show-options", "-pv", "-t", pane, "@pane_state").strip()
    tmux("set-option", "-p", "-t", pane, "@agent_kind", kind)
    tmux("set-option", "-p", "-t", pane, "@pane_tool", kind.upper())
    tmux("set-option", "-p", "-t", pane, "@pane_state", state)
    tmux("set-option", "-p", "-t", pane, "@pane_state_source", f"{kind}-hook")

    session_id = str(payload.get("session_id", ""))
    turn_id = str(payload.get("turn_id", ""))
    if session_id:
        tmux("set-option", "-p", "-t", pane, "@agent_session_id", session_id)
    if turn_id:
        tmux("set-option", "-p", "-t", pane, "@agent_turn_id", turn_id)

    update_window_state(pane)
    tmux("refresh-client")
    if pane != focused and state == "blocked" and old_state != "blocked":
        play("request")
    elif pane != focused and state == "done" and old_state == "working":
        play("done")

    print("{}")
    return 0


def install_hooks(kind: str) -> int:
    """Merge tracked tmux hooks into an agent's existing user hooks."""
    repo = Path(__file__).resolve().parent.parent
    source = repo / "config" / kind / "tmux-hooks.json"
    target_name = "hooks.json" if kind == "codex" else "settings.json"
    target = Path.home() / f".{kind}" / target_name
    try:
        managed = json.loads(source.read_text())
        current = json.loads(target.read_text()) if target.exists() else {"hooks": {}}
    except (json.JSONDecodeError, OSError) as error:
        print(f"unable to load {kind} hooks: {error}", file=sys.stderr)
        return 1

    hook_command = (
        f"{shlex.quote(str(Path(__file__).resolve().with_suffix('')))} hook {kind}"
    )
    managed_commands = {HOOK_COMMAND, f"{HOOK_COMMAND} {kind}"}
    hooks = current.setdefault("hooks", {})
    for event, groups in list(hooks.items()):
        cleaned = []
        for group in groups:
            group = dict(group)
            group["hooks"] = [
                hook for hook in group.get("hooks", [])
                if not (
                    hook.get("command") in managed_commands
                    or hook.get("command", "").endswith(f"/tmux-ai-attention hook {kind}")
                    or kind == "codex" and hook.get("command", "").endswith(
                        "/tmux-ai-attention hook"
                    )
                )
            ]
            if group["hooks"]:
                cleaned.append(group)
        hooks[event] = cleaned

    for event, groups in managed.get("hooks", {}).items():
        installed_groups = []
        for group in groups:
            group = dict(group)
            group["hooks"] = [
                {**hook, "command": hook_command}
                if hook.get("command") in managed_commands else hook
                for hook in group.get("hooks", [])
            ]
            installed_groups.append(group)
        hooks.setdefault(event, []).extend(installed_groups)

    target.parent.mkdir(parents=True, exist_ok=True)
    backup_dir = os.environ.get("TMUX_HOOKS_BACKUP_DIR", "")
    if target.exists() and backup_dir:
        Path(backup_dir).mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, Path(backup_dir) / f"{kind}-hooks.json")

    mode = target.stat().st_mode & 0o777 if target.exists() else 0o600
    with tempfile.NamedTemporaryFile("w", dir=target.parent, delete=False) as handle:
        json.dump(current, handle, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)
    temp_path.chmod(mode)
    temp_path.replace(target)
    print(f"update: merged tmux lifecycle hooks into {target}")
    return 0


def main(argv: Iterable[str]) -> int:
    args = list(argv)
    command = args[0] if args else "watch"
    if command not in {"watch", "once", "test", "hook", "install-hooks"}:
        print(
            "usage: tmux-ai-attention [watch|once|test|hook [codex|claude]|"
            "install-hooks [codex|claude]]",
            file=sys.stderr,
        )
        return 64
    if command == "hook":
        kind = args[1] if len(args) > 1 else "codex"
        if kind not in AGENTS:
            print(f"unsupported agent: {kind}", file=sys.stderr)
            return 64
        return handle_hook(kind)
    if command == "install-hooks":
        kind = args[1] if len(args) > 1 else "codex"
        if kind not in AGENTS:
            print(f"unsupported agent: {kind}", file=sys.stderr)
            return 64
        return install_hooks(kind)
    if command == "test":
        play("request")
        time.sleep(0.25)
        play("done")
        return 0

    _lock = lock()
    watcher = Watcher({}, {}, {}, set())
    if command == "once":
        watcher.poll(dry_run=True)
        return 0
    while True:
        watcher.poll()
        time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
