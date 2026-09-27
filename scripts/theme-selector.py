#!/usr/bin/env python3
"""Shared terminal themes. Python 3.11+, fzf, and the existing app configs."""

import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import tomllib

REPO = Path(__file__).resolve().parent.parent
CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
ROOT = CONFIG / "terminal-theme"
GENERATED = ROOT / "generated"
STATE = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state")) / "terminal-theme"
CURRENT = ROOT / "current.json"
JOURNAL = STATE / "pending.json"
MANAGED_NAME = "terminal-theme"
STARSHIP_BASE = CONFIG / "starship.toml"
HERDR_CONFIG = Path(os.environ.get("HERDR_CONFIG_PATH", CONFIG / "herdr/config.toml"))
CODEX_CONFIG = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "config.toml"
CLAUDE_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
SPOTIFY_DIR = CONFIG / "spotify-player"


def read(path):
    return path.read_text() if path.exists() else ""


def current():
    return json.loads(read(CURRENT) or "{}")


def themes():
    return {p.stem: json.loads(p.read_text()) for p in sorted((REPO / "config/themes").glob("*.json"))}


def scalar(text, section, key, value):
    """Replace one simple TOML scalar, preserving all surrounding source text."""
    before = tomllib.loads(text)
    headers = list(re.finditer(r"(?m)^\s*\[([^\n]+)\]\s*(?:#.*)?$", text))
    start, end = 0, headers[0].start() if headers else len(text)
    if section:
        matches = [i for i, h in enumerate(headers) if h.group(1) == section]
        if not matches:
            result = text.rstrip() + f"\n\n[{section}]\n{key} = {json.dumps(value)}\n"
        else:
            i = matches[0]
            start = headers[i].end()
            end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
            result = None
    else:
        result = None
    if result is None:
        body = text[start:end]
        pattern = rf"(?m)^{re.escape(key)}\s*=.*$"
        line = f"{key} = {json.dumps(value)}"
        if re.search(pattern, body):
            body = re.sub(pattern, lambda _: line, body, count=1)
        else:
            body = body.rstrip() + "\n" + line + "\n\n"
        result = text[:start] + body + text[end:]
    expected = before
    table = expected
    for part in section.split(".") if section else []:
        table = table.setdefault(part, {})
    table[key] = value
    if tomllib.loads(result) != expected:
        raise ValueError(f"Cannot safely update [{section}] {key}")
    return result


def block(text, name, content):
    begin, end = f"# BEGIN {name}", f"# END {name}"
    replacement = begin + "\n" + content.rstrip() + "\n" + end
    if begin in text or end in text:
        pattern = re.compile(rf"(?ms)^{re.escape(begin)}\n.*?^{re.escape(end)}$")
        if len(pattern.findall(text)) != 1:
            raise ValueError(f"Ambiguous managed block: {name}")
        return pattern.sub(lambda _: replacement, text)
    return text.rstrip() + "\n\n" + replacement + "\n"


def starship(theme, base=None):
    text = scalar(read(STARSHIP_BASE) if base is None else base, "", "palette", "terminal_theme")
    c = theme["colors"]
    palette = {"dark": c["background"], "light": c["foreground"],
               **{k: c[k] for k in ("blue", "orange", "yellow", "aqua", "purple", "green", "red")}}
    for key, value in palette.items():
        text = scalar(text, "palettes.terminal_theme", key, value)
    if theme.get("mode", "dark") == "light":
        # Light palettes mix dark and bright accents; choose readable text per pill.
        def luminance(color):
            channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels]
            return sum(v * w for v, w in zip(linear, (0.2126, 0.7152, 0.0722)))

        for accent in ("blue", "orange", "aqua"):
            light = luminance(c[accent])
            foreground = "#000000" if (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) else "#ffffff"
            key = "on_" + accent
            text = scalar(text, "palettes.terminal_theme", key, foreground)
            text = text.replace(f"fg:dark bg:{accent}", f"fg:{key} bg:{accent}")
    return text


def prepare(theme, sources=None):
    """Calculate outputs first; app configs retain unrelated fields."""
    c = theme["colors"]
    output = {}
    sources = {} if sources is None else sources

    def source(path):
        path = path.resolve()
        if path not in sources:
            sources[path] = read(path) if path.exists() else None
        return sources[path] or ""

    def add(path, text, app):
        output[path.resolve()] = (text, app)

    add(GENERATED / "ghostty.conf", f'theme = {theme["ghostty"]}\nwindow-theme = auto\n', "Ghostty")
    add(GENERATED / "starship.toml", starship(theme, source(STARSHIP_BASE)), "Starship")
    shell = "# Generated by theme; source from zsh_stuff.\n"
    for key, val in {"BAT_THEME": theme["bat"], "STARSHIP_CONFIG": str(GENERATED / "starship.toml"),
                     "ATUIN_THEME_DIR": str(GENERATED / "atuin")}.items():
        shell += f"export {key}={shlex.quote(val)}\n"
    add(GENERATED / "shell.zsh", shell, "Shell / bat")
    add(GENERATED / "nvim.json", json.dumps({"colorscheme": theme["nvim"], "background": theme.get("mode", "dark")}) + "\n", "Neovim")
    atuin = f'[theme]\nname = "{MANAGED_NAME}"\nparent = "default"\n\n[colors]\n'
    roles = {"Base": "foreground", "Muted": "muted", "Title": "accent", "Annotation": "aqua",
             "Guidance": "blue", "Important": "orange", "AlertInfo": "blue", "AlertWarn": "yellow", "AlertError": "red"}
    atuin += "".join(f'{key} = "{c[val]}"\n' for key, val in roles.items())
    add(GENERATED / "atuin/terminal-theme.toml", atuin, "Atuin")

    if HERDR_CONFIG.exists():
        text = scalar(source(HERDR_CONFIG), "theme", "name", theme["herdr"])
        text = scalar(text, "theme", "auto_switch", False)
        # Only recolor the explicit tab/workspace overrides; semantic state tokens stay bare.
        rows = re.search(r'(?ms)^\[ui\.sidebar\.agents\].*?(?=^\[|\Z)', text)
        if rows:
            part = rows.group(0)
            for token, color in (("tab", c["foreground"]), ("workspace", c["muted"])):
                part = re.sub(r'(\{[^{}]*token\s*=\s*"' + token + r'"[^{}]*fg\s*=\s*)"[^"]*"',
                              lambda m: m.group(1) + json.dumps(color), part)
            text = text[:rows.start()] + part + text[rows.end():]
        add(HERDR_CONFIG, text, "Herdr")

    if (SPOTIFY_DIR / "app.toml").exists():
        add(SPOTIFY_DIR / "app.toml", scalar(source(SPOTIFY_DIR / "app.toml"), "", "theme", MANAGED_NAME), "Spotify")
        palette_names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]
        palette_names += ["bright_" + n for n in palette_names]
        colors = {"background": c["background"], "foreground": c["foreground"], **dict(zip(palette_names, theme["ansi"]))}
        content = f'[[themes]]\nname = "{MANAGED_NAME}"\n[themes.palette]\n'
        content += "".join(f'{key} = "{val}"\n' for key, val in colors.items())
        add(SPOTIFY_DIR / "theme.toml", block(source(SPOTIFY_DIR / "theme.toml"), "terminal-theme", content), "Spotify")

    if CODEX_CONFIG.exists():
        add(CODEX_CONFIG, scalar(source(CODEX_CONFIG), "tui", "theme", theme["codex"]), "Codex")
    if (CLAUDE_DIR / "settings.json").exists():
        config = json.loads(source(CLAUDE_DIR / "settings.json"))
        config["theme"] = "custom:terminal-theme"
        add(CLAUDE_DIR / "settings.json", json.dumps(config, indent=2, ensure_ascii=False) + "\n", "Claude")
        custom = {"name": "Terminal Theme", "base": theme.get("mode", "dark"), "overrides": {
            "claude": c["accent"], "text": c["foreground"], "inverseText": c["background"],
            "inactive": c["muted"], "subtle": c["surface"], "suggestion": c["accent"],
            "success": c["green"], "error": c["red"], "warning": c["yellow"], "permission": c["accent"]}}
        add(CLAUDE_DIR / "themes/terminal-theme.json", json.dumps(custom, indent=2) + "\n", "Claude")
    return output


def validate(outputs, theme):
    if theme.get("mode", "dark") not in ("dark", "light"):
        raise ValueError("Invalid theme mode")
    if len(theme["ansi"]) != 16 or any(not re.fullmatch(r"#[0-9a-fA-F]{6}", c) for c in [*theme["ansi"], *theme["colors"].values()]):
        raise ValueError("Invalid theme palette")
    for path, (content, _) in outputs.items():
        if path.suffix == ".toml":
            tomllib.loads(content)
        elif path.suffix == ".json":
            json.loads(content)
    if shutil.which("bat"):
        available = subprocess.run(["bat", "--list-themes", "--color=never"], capture_output=True, text=True, check=True).stdout.splitlines()
        if theme["bat"] not in available:
            raise ValueError(f'bat theme is not installed: {theme["bat"]}')
    if HERDR_CONFIG.resolve() in outputs and shutil.which("herdr"):
        with tempfile.TemporaryDirectory(prefix="terminal-theme-") as staging:
            path = Path(staging) / "herdr.toml"
            path.write_text(outputs[HERDR_CONFIG.resolve()][0])
            result = subprocess.run(["herdr", "config", "check"], env={**os.environ, "HERDR_CONFIG_PATH": str(path)}, capture_output=True, text=True)
            if result.returncode:
                raise ValueError("Herdr config validation failed: " + result.stderr.strip())


def atomic(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".theme-", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


@contextlib.contextmanager
def locked():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def restore(journal):
    conflicts = []
    for item in reversed(journal["files"]):
        path = Path(item["path"])
        actual = read(path) if path.exists() else None
        if actual == item["before"]:
            continue
        if actual != item["after"]:
            conflicts.append(str(path))
            continue
        if item["before"] is None:
            path.unlink()
        else:
            atomic(path, item["before"], item["mode"])
    if conflicts:
        raise ValueError("Recovery stopped to preserve newer edits: " + ", ".join(conflicts))
    JOURNAL.unlink(missing_ok=True)


def reload_ghostty():
    if sys.platform != "darwin":
        return "Ghostty: saved; reload its configuration."
    try:
        result = subprocess.run(
            ["/usr/bin/osascript", str(REPO / "scripts/theme-reload-ghostty.applescript")],
            capture_output=True, text=True, timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return "Ghostty: reload unavailable; press Cmd+Shift+, as a fallback."
    if result.returncode == 0 and result.stdout.strip() == "reloaded":
        return "Ghostty: reload acknowledged."
    if result.returncode == 0 and result.stdout.strip() in ("not-running", "no-terminal"):
        return "Ghostty: saved for the next terminal window."
    if "-1743" in result.stderr:
        return "Ghostty: macOS denied automation; allow it in System Settings > Privacy & Security > Automation, or press Cmd+Shift+,."
    return "Ghostty: reload was not acknowledged; press Cmd+Shift+, as a fallback."


def apply(theme_id, dry_run=False, reload_apps=True):
    catalog = themes()
    if theme_id not in catalog:
        raise ValueError(f"Unknown theme: {theme_id}")
    theme = catalog[theme_id]
    with locked():
        if JOURNAL.exists():
            raise ValueError("An interrupted change needs recovery. Run: theme recover")
        old = current()
        sources = {}
        outputs = prepare(theme, sources)
        validate(outputs, theme)
        if dry_run:
            print(f'Validated {theme["name"]}: {len(outputs)} files; no settings changed.')
            return
        for path, original in sources.items():
            if (read(path) if path.exists() else None) != original:
                raise ValueError(f"Config changed while preparing theme: {path}")
        selection = {"id": theme_id, "name": theme["name"],
                     "previous": old.get("id") if old.get("id") != theme_id else old.get("previous")}
        outputs[CURRENT.resolve()] = (json.dumps(selection, indent=2) + "\n", "Selection")
        journal = {"files": []}
        for path, (content, _) in outputs.items():
            previous = sources[path] if path in sources else (read(path) if path.exists() else None)
            if previous != content:
                journal["files"].append({"path": str(path), "before": previous, "after": content,
                                         "mode": (path.stat().st_mode & 0o777) if path.exists() else 0o600})
        atomic(JOURNAL, json.dumps(journal))
        try:
            for item in journal["files"]:
                path = Path(item["path"])
                if (read(path) if path.exists() else None) != item["before"]:
                    raise ValueError(f"Config changed during apply: {path}")
                atomic(path, item["after"], item["mode"])
            for path, (content, _) in outputs.items():
                if read(path) != content:
                    raise ValueError(f"Readback failed: {path}")
        except BaseException:
            restore(journal)
            raise
        atomic(STATE / "last-change.json", json.dumps(journal))
        if not (STATE / "initial-change.json").exists():
            atomic(STATE / "initial-change.json", json.dumps(journal))
        JOURNAL.unlink()
    print(f'Saved {theme["name"]}.')
    if reload_apps and shutil.which("herdr") and os.environ.get("HERDR_ENV") == "1":
        try:
            result = subprocess.run(["herdr", "server", "reload-config"], capture_output=True, text=True, timeout=10)
            response = json.loads(result.stdout).get("result", {})
            ok = result.returncode == 0 and response.get("status") == "applied" and not response.get("diagnostics")
        except (ValueError, subprocess.SubprocessError):
            ok = False
        print("Herdr: reload acknowledged." if ok else "Herdr: saved; use Reload config in the menu.")
    if reload_apps:
        print(reload_ghostty())
    else:
        print("App reloads skipped (--no-reload).")
    print("Shell / Starship / bat / Atuin: next prompt; open a new shell once after setup.")
    print("Neovim: automatic refresh after reopening once after setup.")
    print("Spotify: reopen the popup; audio stays running.")
    print("Codex: theme saved for new sessions; full live reload is not supported.")
    print("Claude: reopen once after setup; later custom-theme updates are live.")


def status(check=False):
    selection = current()
    if not selection:
        print("No shared theme selected. Run: theme apply gruvbox-dark")
        return 1
    theme = themes()[selection["id"]]
    print(f'Current: {selection["name"]}')
    outputs = prepare(theme)
    if check:
        validate(outputs, theme)
    grouped = {}
    for path, (content, app) in outputs.items():
        grouped.setdefault(app, []).append(read(path) == content)
    for app, values in grouped.items():
        print(f'{app:18} {"configured" if all(values) else "needs sync"}')
    print("fzf / Lazygit      terminal palette (after Ghostty reload)")
    print("Config readback only; running-app refresh is not implied.")
    if JOURNAL.exists():
        print("Interrupted change: run theme recover")
    return int(JOURNAL.exists() or not all(all(v) for v in grouped.values()))


def preview(theme_id):
    t = themes()[theme_id]
    c = t["colors"]
    width = max(20, min(int(os.environ.get("FZF_PREVIEW_COLUMNS", "55")) - 2, 72))

    def paint(line, foreground="foreground", background="background"):
        def rgb(key):
            value = c[key].lstrip("#")
            return ";".join(str(int(value[i:i+2], 16)) for i in (0, 2, 4))
        print(f'\033[48;2;{rgb(background)}m\033[38;2;{rgb(foreground)}m {line[:width-2]:<{width-2}} \033[0m')

    paint("")
    paint(t["name"], "accent")
    paint("")
    paint("~/projects/app  main", "blue")
    paint("❯ npm run build", "foreground")
    paint("✓ Build completed", "green")
    paint("")
    paint('const greeting = "hello";', "aqua")
    paint("+ added line", "green", "surface")
    paint("- removed line", "red", "surface")
    paint("")
    paint("● working   ✓ done   ! input", "yellow")
    paint("Comments and secondary text", "muted")
    paint("")
    print("\nPreview only · Enter applies to your apps")
    print("Codex: saves selection; full live reload is not supported.")


def picker():
    if not sys.stdin.isatty():
        raise ValueError("Open theme in a terminal, or use theme apply NAME")
    if not shutil.which("fzf"):
        raise ValueError("fzf is required for the picker")
    selected = current().get("id")
    catalog = themes()
    ordered = sorted(catalog, key=lambda key: (key != selected, catalog[key]["name"]))
    rows = "".join(f'{key}\t{catalog[key]["name"]}{" ✓" if key == selected else ""}\n' for key in ordered)
    env = {**os.environ, "FZF_DEFAULT_OPTS": "", "FZF_DEFAULT_OPTS_FILE": ""}
    browse_header = "j/k or ↑↓ choose · / search\nEnter apply · Esc cancel"
    search_header = "Type to search · ↑↓ choose\nEnter apply · Esc back"
    search_binding = ("/:unbind(j,k,/)+change-prompt(Search › )"
                      f"+change-header({search_header})")
    # Rebinding restores j/k after search, where both must remain ordinary letters.
    browse_actions = ("clear-query+rebind(j,k,/)+change-prompt(Choose › )"
                      f"+change-header({browse_header})")
    escape_binding = ("esc:transform:if [ \"$FZF_PROMPT\" = 'Search › ' ]; then "
                      f"printf '%s' {shlex.quote(browse_actions)}; else printf abort; fi")
    cmd = ["fzf", "--ansi", "--no-multi", "--layout=reverse", "--height=100%", "--border=rounded", "--padding=1",
           "--delimiter=\t", "--with-nth=2", "--prompt=Choose › ", "--border-label= Themes ", "--color=base16",
           "--bind=j:down,k:up", "--bind=" + search_binding, "--bind=" + escape_binding,
           "--header=" + browse_header, "--preview-window=right,60%,wrap",
           "--preview", shlex.quote(sys.executable) + " " + shlex.quote(str(Path(__file__).resolve())) + " preview {1}"]
    result = subprocess.run(cmd, input=rows, stdout=subprocess.PIPE, text=True, env=env)
    if result.returncode in (1, 130):
        return
    if result.returncode:
        raise ValueError("Theme picker failed")
    apply(result.stdout.split("\t")[0])
    input("\nPress Enter to close…")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command")
    for command in ("status", "doctor", "undo", "recover", "refresh-shell"):
        commands.add_parser(command)
    for command in ("apply", "preview"):
        sub = commands.add_parser(command)
        sub.add_argument("name", choices=themes())
        if command == "apply":
            sub.add_argument("--dry-run", action="store_true")
            sub.add_argument("--no-reload", action="store_true", help="Save configuration without requesting Herdr or Ghostty reloads")
    args = parser.parse_args()
    if args.command == "apply":
        apply(args.name, args.dry_run, not args.no_reload)
    elif args.command == "preview":
        preview(args.name)
    elif args.command in ("status", "doctor"):
        return status(args.command == "doctor")
    elif args.command == "undo":
        previous = current().get("previous")
        if not previous:
            raise ValueError("No previous shared theme to restore")
        apply(previous)
    elif args.command == "recover":
        with locked():
            if JOURNAL.exists():
                restore(json.loads(read(JOURNAL)))
                print("Restored files from the interrupted change. Reload affected apps.")
            else:
                print("No interrupted change.")
    elif args.command == "refresh-shell":
        with locked():
            if JOURNAL.exists():
                raise ValueError("Run theme recover before refreshing")
            if current():
                atomic(GENERATED / "starship.toml", starship(themes()[current()["id"]]))
    else:
        picker()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"theme: {error}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
