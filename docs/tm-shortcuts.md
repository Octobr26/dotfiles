# tm Shortcuts

`scripts/tm` is the public tmux launcher. It has two jobs:

- `tm <path>` opens a generic project session for any directory.
- `tm <shortcut>` can call private shortcuts from `scripts/tm.local`.

`scripts/tm.local` is ignored by git. Put machine-specific repo names, work paths, and private aliases there.

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
