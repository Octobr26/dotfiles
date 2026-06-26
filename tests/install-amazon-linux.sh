#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

assert_contains() {
    local haystack=$1
    local needle=$2
    local label=$3

    if ! printf '%s\n' "$haystack" | grep -Fq -- "$needle"; then
        printf 'not ok: %s\nmissing: %s\n' "$label" "$needle" >&2
        exit 1
    fi
}

assert_file_contains() {
    local file=$1
    local needle=$2
    local label=$3

    if ! grep -Fq -- "$needle" "$file"; then
        printf 'not ok: %s\nmissing: %s in %s\n' "$label" "$needle" "$file" >&2
        exit 1
    fi
}

export HOME="$tmpdir/home"
export DOTFILES_OS_RELEASE_FILE="$tmpdir/os-release"
export DOTFILES_TREE_SITTER_CLI_VERSIONS="9.9.9 0.20.10"
export DOTFILES_ZIG_VERSION="0.13.0"
mkdir -p "$HOME" "$tmpdir/bin"

cat > "$DOTFILES_OS_RELEASE_FILE" <<'EOF'
ID="amzn"
VERSION_ID="2023"
EOF

cat > "$tmpdir/bin/cargo" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CARGO_LOG"
case "$*" in
  *"9.9.9"*) exit 1 ;;
  *"0.20.10"*)
    mkdir -p "$HOME/.local/bin"
    cat > "$HOME/.local/bin/tree-sitter" <<'BIN'
#!/usr/bin/env bash
echo "tree-sitter 0.20.10"
BIN
    chmod +x "$HOME/.local/bin/tree-sitter"
    exit 0
    ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$tmpdir/bin/cargo"
export CARGO_LOG="$tmpdir/cargo.log"

cat > "$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output)
      shift
      output=$1
      ;;
  esac
  shift || true
done
if [ -n "$output" ]; then
  printf 'fake zig archive\n' > "$output"
fi
EOF
chmod +x "$tmpdir/bin/curl"
export CURL_LOG="$tmpdir/curl.log"

cat > "$tmpdir/bin/tar" <<'EOF'
#!/usr/bin/env bash
dest=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -C)
      shift
      dest=$1
      ;;
  esac
  shift || true
done
[ -n "$dest" ] || exit 2
for asset in zig-aarch64-linux-0.13.0 zig-x86_64-linux-0.13.0; do
  mkdir -p "$dest/$asset"
  cat > "$dest/$asset/zig" <<'BIN'
#!/usr/bin/env bash
echo "0.13.0"
BIN
  chmod +x "$dest/$asset/zig"
done
EOF
chmod +x "$tmpdir/bin/tar"

export PATH="$tmpdir/bin:$PATH"

source "$repo_dir/install.sh"

if ! is_amazon_linux; then
    printf 'not ok: detects Amazon Linux from os-release\n' >&2
    exit 1
fi

managed_linux_tools=$(managed_tools_for_os linux)
assert_contains "$managed_linux_tools" "tree-sitter" "linux managed tools include tree-sitter"
assert_contains "$managed_linux_tools" "zig" "linux managed tools include zig"

ensure_bash_setup
assert_file_contains "$HOME/.bashrc" '# >>> dotfiles amazon linux bash >>>' "bashrc block marker"
assert_file_contains "$HOME/.bashrc" 'export PATH="$HOME/.local/bin:' "bashrc exposes local bin"

ensure_readline_setup
assert_file_contains "$HOME/.inputrc" '"\e[A": previous-history' "inputrc binds up history"
assert_file_contains "$HOME/.inputrc" '"\C-?": backward-delete-char' "inputrc binds delete/backspace"

install_zig_linux
assert_file_contains "$CURL_LOG" 'https://ziglang.org/download/0.13.0/zig-' "zig installer downloads pinned release"
if [ ! -x "$HOME/.local/bin/zig" ]; then
    printf 'not ok: zig installed into local bin\n' >&2
    exit 1
fi

install_tree_sitter_cli_linux
assert_file_contains "$CARGO_LOG" '--version 9.9.9' "tree-sitter installer tries first version"
assert_file_contains "$CARGO_LOG" '--version 0.20.10' "tree-sitter installer falls back"

assert_file_contains "$repo_dir/config/nvim/lua/plugins/treesitter.lua" 'vim.env.CC = "zig cc"' "Neovim Treesitter uses Zig C compiler"
assert_file_contains "$repo_dir/config/nvim/lua/plugins/treesitter.lua" 'vim.env.CXX = "zig c++"' "Neovim Treesitter uses Zig C++ compiler"

mkdir -p "$HOME/.local/share/nvim/mason/bin"
printf 'broken prebuilt\n' > "$HOME/.local/share/nvim/mason/bin/tree-sitter"
ensure_mason_tree_sitter_uses_local_cli

if [ ! -L "$HOME/.local/share/nvim/mason/bin/tree-sitter" ]; then
    printf 'not ok: Mason tree-sitter shim is a symlink\n' >&2
    exit 1
fi

if [ "$(readlink "$HOME/.local/share/nvim/mason/bin/tree-sitter")" != "$HOME/.local/bin/tree-sitter" ]; then
    printf 'not ok: Mason tree-sitter shim points at local CLI\n' >&2
    exit 1
fi

printf 'ok: amazon linux installer edge cases\n'
