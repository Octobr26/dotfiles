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

mkdir -p "$tmpdir/bin" "$tmpdir/home/learning/walnut"
export HOME="$tmpdir/home"
export TMUX_LOG="$tmpdir/tmux.log"

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

"$repo_dir/scripts/tm" walnut

assert_file_contains "$TMUX_LOG" "new-session -d -s walnut -n shell -c $HOME/learning/walnut" "walnut starts with shell window"
assert_file_contains "$TMUX_LOG" "send-keys -t walnut:shell clear C-m" "walnut shell pane clears prompt"
assert_file_contains "$TMUX_LOG" "new-window -t walnut -n git -c $HOME/learning/walnut" "walnut creates lazygit window"
assert_file_contains "$TMUX_LOG" "send-keys -t walnut:git lg C-m" "walnut starts lazygit"
assert_file_contains "$TMUX_LOG" "new-window -t walnut -n code -c $HOME/learning/walnut" "walnut creates neovim window"
assert_file_contains "$TMUX_LOG" "send-keys -t walnut:code nvim C-m" "walnut starts neovim"
assert_file_contains "$TMUX_LOG" "new-window -t walnut -n ai -c $HOME/learning/walnut" "walnut creates ai window"
assert_file_contains "$TMUX_LOG" "send-keys -t walnut:ai.0 claude C-m" "walnut starts claude in ai window"
assert_file_contains "$TMUX_LOG" "send-keys -t walnut:ai.1 codex C-m" "walnut starts codex in ai window"
assert_file_contains "$TMUX_LOG" "select-window -t walnut:shell" "walnut opens on shell window"
assert_file_contains "$TMUX_LOG" "attach-session -t =walnut" "walnut attaches session"

if grep -Fq -- "-n server" "$TMUX_LOG" || grep -Fq -- "pnpm dev" "$TMUX_LOG" || grep -Fq -- "npm start" "$TMUX_LOG"; then
    printf 'not ok: walnut should not create or start a server window\n' >&2
    cat "$TMUX_LOG" >&2
    exit 1
fi

printf 'ok: walnut tmux session\n'
