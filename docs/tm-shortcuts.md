# tm Shortcuts

`scripts/tm` is the public tmux launcher. It has two jobs:

- `tm <path>` opens a generic project session for any directory.
- `tm <shortcut>` can call private shortcuts from `scripts/tm.local`.
- `tm agent list` inventories running Codex and Claude panes across tmux.
- `tm agent jump <selector>` moves to one of those panes.

`scripts/tm.local` is ignored by git. Put machine-specific repo names, work paths, and private aliases there.

## Popup Shortcuts

These bindings use `Ctrl-a` as the tmux prefix and open in the focused pane's current directory:

- `Ctrl-a y` opens lazygit.
- `Ctrl-a Ctrl-s` opens `spotify_player`.
- `Ctrl-a t` opens a login shell instead of tmux's default clock.

Lazygit and the terminal use 80% of the tmux client's width and height, while `spotify_player` uses 90%.
Each popup closes when its command exits.
Change the `-w` and `-h` values in `.tmux.conf` to resize them.

## Public Launcher Flow

`scripts/tm` defines shared helpers:

- `session_exists <name>` checks whether the tmux session already exists.
- `attach_or_switch <name>` switches inside tmux or attaches outside tmux.
- `safe_session_name_from_path <path>` turns a path basename into a tmux-safe session name.
- `create_ai_window <session> <dir>` adds an `ai` window split between `claude` and `codex`.
- `create_project_session <path>` creates the generic `git`, `code`, `shell`, and `ai` windows for any directory.

After defining those helpers, `scripts/tm` sources `scripts/tm.local` when it exists. Then it dispatches:

1. Empty target prints usage.
2. `tm_local_dispatch "$target"` handles private shortcuts when that function exists and returns success.
3. Any other target is treated as a directory path.

## Private Shortcut Contract

Copy the tracked example:

```sh
cp scripts/tm.local.example scripts/tm.local
```

Then edit `scripts/tm.local`.

Private shortcut files should define:

```bash
tm_local_usage() {
    echo "app|api"
}

tm_local_dispatch() {
    case "$1" in
        app)
            create_app_session
            ;;
        api)
            create_api_session
            ;;
        *)
            return 1
            ;;
    esac
}
```

Each shortcut function should:

1. Set `session_name`.
2. Set `project_dir`, preferably overrideable with an env var like `TM_APP_DIR`.
3. Check that required directories exist.
4. Create windows only when `session_exists "$session_name"` is false.
5. End with `attach_or_switch "$session_name"`.

## Prompt For AI Later

Use this prompt on another machine:

```text
In this dotfiles repo, read docs/tm-shortcuts.md, scripts/tm, and scripts/tm.local.example.
Create or update ignored scripts/tm.local with private tm shortcuts for these projects:

- shortcut: <name>
  path: <absolute-or-$HOME-relative-path>
  windows: <server/git/code/shell/ai/etc>
  startup commands: <commands per window>
  default window: <window name>

Keep scripts/tm generic and public. Do not commit scripts/tm.local.
Run bash -n scripts/tm scripts/tm.local and test with a fake tmux stub or a safe local session.
```

## Good Shortcut Shape

```bash
create_app_session() {
    local session_name="app"
    local project_dir="${TM_APP_DIR:-$HOME/work/example-app}"

    if [ ! -d "$project_dir" ]; then
        echo "Directory does not exist: $project_dir"
        echo "Create it, symlink it, or set TM_APP_DIR to the project path."
        exit 1
    fi

    if ! session_exists "$session_name"; then
        tmux new-session -d -s "$session_name" -n server -c "$project_dir"
        tmux send-keys -t "$session_name:server" 'pnpm dev' C-m

        tmux new-window -t "$session_name" -n git -c "$project_dir"
        tmux send-keys -t "$session_name:git" 'lg' C-m

        tmux new-window -t "$session_name" -n code -c "$project_dir"
        tmux send-keys -t "$session_name:code" 'nvim' C-m

        create_ai_window "$session_name" "$project_dir"

        tmux select-window -t "$session_name:git"
    fi

    attach_or_switch "$session_name"
}
```

Keep real client names, private paths, and one-off workflow commands in `scripts/tm.local`.

## Agent Navigator

The navigator uses the existing tmux server; it does not create another session runtime or store transcripts.
You normally do not need it: every pane border updates automatically with the pane number, tool, optional role, and pane-local AI state, while the focused project appears once in the top status bar.
The focused pane has a peach header and border, and `Ctrl-a R` sets or clears its optional role.
Codex supplies state through JSON lifecycle hooks, so `working`, `INPUT`, and `done` do not depend on matching its rendered text.
Claude and Codex sessions that were already running before the hooks loaded use the visible-pane fallback until restarted.

```sh
tm agent list
tm agent jump 1
tm agent jump app:4.1
tm agent jump %9
tm agent jump example-app
```

The list includes each pane's `session:window.pane` target, Codex or Claude kind, attention state, project, current working directory, and role/title.
Blocked agents sort first, then working agents, then done or idle agents.

Use the list number or exact target for deterministic jumps.
A text selector is also accepted when it matches exactly one agent; ambiguous matches print the candidates instead of guessing.
Jumping switches the current client when run inside tmux and attaches to the target session when run outside tmux.

New AI panes made by `create_ai_window` receive stable tmux metadata.
Existing or manually created panes are labeled from their running command and nearby project panes, so they do not need to be recreated.
`tm agent list` remains useful as a diagnostic or cross-session inventory.

## Worktree Frontend Preview

`worktree-preview` reuses one port across the existing Git worktrees of a repository.
It is installed from https://github.com/Octobr26/worktree-preview and lives at `~/.local/bin/worktree-preview`, with the short alias `wtp`.

It does not use tmux.
The dev server runs as a detached background process with its own log file, so no `server` window is needed.

Requirements:

- Create a Git worktree for each branch you want to preview.
- Have the project's package manager available.

In Lazygit's worktrees panel:

- `P` points the port at the selected worktree, replacing whatever this repository was previewing.
- `X` stops the preview.

The URL never changes, so switching worktrees is a browser reload.

First use in a worktree installs dependencies when needed.
Later switches reuse that worktree's dependencies until its package or lockfile changes.
If the main worktree has `.env`, missing worktree copies are symlinked from it.

A repository previews one worktree at a time.
Another repository's preview is never stopped, and neither is an unowned listener on the port.

Inspect state from the terminal:

```sh
wtp status
wtp list
wtp logs
```

Defaults handle common Vite, Next.js, and Create React App projects using pnpm, npm, Yarn, or Bun.
Override detection with repo-local Git config when needed:

```sh
git config worktreePreview.appDir frontend
git config worktreePreview.port 3000
git config worktreePreview.start 'pnpm run dev -- --port "$WORKTREE_PREVIEW_PORT" --strictPort'
git config --add worktreePreview.envFile .env.local
```

Inspect without starting a server:

```sh
wtp dry-run feature/example
```

Detection asks the package manager which framework is installed, so `dry-run` reports `start: unresolved` until dependencies exist in that worktree.
