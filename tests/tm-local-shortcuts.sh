#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

assert_file_contains() {
    local file=$1
    local needle=$2
    local label=$3

    if ! grep -Fq -- "$needle" "$file"; then
        printf 'not ok: %s\nmissing: %s in %s\n' "$label" "$needle" "$file" >&2
        printf '%s\n' '--- tmux log ---' >&2
        cat "$file" >&2
        exit 1
    fi
}

mkdir -p "$tmpdir/bin" "$tmpdir/home/work/example-app"
export HOME="$tmpdir/home"
export TMUX_LOG="$tmpdir/tmux.log"
export TM_LOCAL_CONFIG="$tmpdir/tm.local"

cat > "$tmpdir/bin/tmux" <<'TMUX'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TMUX_LOG"

case "${1:-}" in
    has-session)
        exit 1
        ;;
    attach-session|switch-client|new-session|new-window|split-window|send-keys|select-pane|select-window)
        exit 0
        ;;
esac

exit 0
TMUX
chmod +x "$tmpdir/bin/tmux"
export PATH="$tmpdir/bin:$PATH"
unset TMUX

cat > "$TM_LOCAL_CONFIG" <<'LOCAL'
tm_local_usage() {
    echo "app"
}

tm_local_dispatch() {
    case "$1" in
        app)
            create_app_session
            ;;
        *)
            return 1
            ;;
    esac
}

create_app_session() {
    local session_name="app"
    local project_dir="${TM_APP_DIR:-$HOME/work/example-app}"

    if [ ! -d "$project_dir" ]; then
        echo "Directory does not exist: $project_dir"
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
LOCAL

"$repo_dir/scripts/tm" app

assert_file_contains "$TMUX_LOG" "new-session -d -s app -n server -c $HOME/work/example-app" "local shortcut starts server window"
assert_file_contains "$TMUX_LOG" "send-keys -t app:server pnpm dev C-m" "local shortcut starts dev server"
assert_file_contains "$TMUX_LOG" "new-window -t app -n git -c $HOME/work/example-app" "local shortcut creates lazygit window"
assert_file_contains "$TMUX_LOG" "send-keys -t app:git lg C-m" "local shortcut starts lazygit"
assert_file_contains "$TMUX_LOG" "new-window -t app -n code -c $HOME/work/example-app" "local shortcut creates neovim window"
assert_file_contains "$TMUX_LOG" "send-keys -t app:code nvim C-m" "local shortcut starts neovim"
assert_file_contains "$TMUX_LOG" "new-window -t app -n ai -c $HOME/work/example-app" "local shortcut creates ai window"
assert_file_contains "$TMUX_LOG" "send-keys -t app:ai.0 claude C-m" "local shortcut starts claude in ai window"
assert_file_contains "$TMUX_LOG" "send-keys -t app:ai.1 codex C-m" "local shortcut starts codex in ai window"
assert_file_contains "$TMUX_LOG" "select-window -t app:git" "local shortcut opens on git window"
assert_file_contains "$TMUX_LOG" "attach-session -t =app" "local shortcut attaches session"

printf 'ok: local tmux shortcut hook\n'
