#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$DOTFILES_DIR/scripts:$PATH"

update_dotfiles_repo() {
    if ! command -v git >/dev/null 2>&1; then
        printf 'warn: git not found; skipping dotfiles update\n'
        return
    fi

    if ! git -C "$DOTFILES_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        printf 'warn: %s is not a git checkout; skipping dotfiles update\n' "$DOTFILES_DIR"
        return
    fi

    printf 'update: git pull --ff-only\n'
    if ! git -C "$DOTFILES_DIR" pull --ff-only; then
        printf 'warn: dotfiles update failed; continuing with local checkout\n'
    fi
}

detect_os() {
    case "$(uname -s)" in
        Darwin)
            echo "macos"
            ;;
        Linux)
            if grep -qi microsoft /proc/version 2>/dev/null; then
                echo "wsl"
            else
                echo "linux"
            fi
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

tool_updates_enabled() {
    [ "${DOTFILES_UPDATE_TOOLS:-1}" != "0" ]
}

managed_tools_for_os() {
    case "$1" in
        macos)
            printf '%s\n' git zsh tmux lazygit starship zoxide atuin nvim node npm pnpm gh rg fd eza bat jq fzf
            ;;
        linux|wsl)
            printf '%s\n' git zsh tmux lazygit starship zoxide atuin nvim rustc cargo zig tree-sitter node npm pnpm gh rg fd eza bat jq fzf
            ;;
        windows)
            printf '%s\n' git node npm pnpm gh lazygit starship zoxide nvim rg fd eza bat jq fzf
            ;;
        *)
            printf '%s\n' git zsh node npm
            ;;
    esac

    if tool_status_should_include claude DOTFILES_INSTALL_CLAUDE; then
        printf '%s\n' claude
    fi

    if tool_status_should_include codex DOTFILES_INSTALL_CODEX; then
        printf '%s\n' codex
    fi

    if tool_status_should_include spotify_player DOTFILES_INSTALL_SPOTIFY_PLAYER; then
        printf '%s\n' spotify_player
    fi
}

env_flag_enabled() {
    local env_name=$1
    local value

    value=$(printenv "$env_name" 2>/dev/null || true)

    case "$value" in
        1|true|TRUE|yes|YES|y|Y)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

tool_status_should_include() {
    local tool=$1
    local env_name=$2

    command -v "$tool" >/dev/null 2>&1 || env_flag_enabled "$env_name"
}

tool_version() {
    local tool=$1
    local output=""

    case "$tool" in
        zsh)
            output=$(zsh --version 2>/dev/null || true)
            ;;
        tmux)
            output=$(tmux -V 2>/dev/null || true)
            ;;
        nvim)
            output=$(nvim --version 2>/dev/null || true)
            ;;
        zig)
            output=$(zig version 2>/dev/null || true)
            ;;
        eza)
            output=$(eza --version 2>/dev/null | sed -n '2p' || true)
            ;;
        *)
            output=$("$tool" --version 2>/dev/null || true)
            ;;
    esac

    printf '%s\n' "$output" | sed -n '1p'
}

print_tool_status() {
    local label=$1
    local os_name=$2
    local location
    local tool
    local version

    printf '%s tool check:\n' "$label"

    for tool in $(managed_tools_for_os "$os_name"); do
        if location=$(command -v "$tool" 2>/dev/null); then
            version=$(tool_version "$tool")
            if [ -n "$version" ]; then
                printf '  ok: %-9s %s (%s)\n' "$tool" "$version" "$location"
            else
                printf '  ok: %-9s installed (%s)\n' "$tool" "$location"
            fi
        else
            printf '  missing: %s\n' "$tool"
        fi
    done
}

print_limited_output() {
    local output=$1
    local limit=${2:-20}
    local total

    total=$(printf '%s\n' "$output" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
    printf '%s\n' "$output" | sed -n "1,${limit}p"

    if [ "$total" -gt "$limit" ]; then
        printf '  ... %s more\n' "$((total - limit))"
    fi
}

print_update_candidates() {
    local os_name=$1
    local output

    printf 'Update check:\n'

    case "$os_name" in
        macos)
            if command -v brew >/dev/null 2>&1; then
                output=$(brew outdated --formula --cask 2>/dev/null || true)
                if [ -n "$output" ]; then
                    printf '  Homebrew updates still available:\n'
                    print_limited_output "$output" 20
                else
                    printf '  ok: Homebrew packages current\n'
                fi
            else
                printf '  skip: Homebrew not installed\n'
            fi
            ;;
        linux|wsl)
            if command -v apt >/dev/null 2>&1; then
                output=$(apt list --upgradable 2>/dev/null | sed '1d' || true)
                if [ -n "$output" ]; then
                    printf '  apt packages still upgradable:\n'
                    print_limited_output "$output" 20
                else
                    printf '  ok: apt packages current\n'
                fi
            elif command -v dnf >/dev/null 2>&1; then
                output=$(dnf check-update git zsh tmux nodejs npm jq ripgrep fd-find fzf bat gh eza xz 2>/dev/null || true)
                if [ -n "$output" ]; then
                    printf '  dnf updates still available for managed packages:\n'
                    print_limited_output "$output" 20
                else
                    printf '  ok: dnf managed packages current\n'
                fi
            elif command -v yum >/dev/null 2>&1; then
                output=$(yum check-update git zsh tmux nodejs npm jq ripgrep fd-find fzf bat gh eza xz 2>/dev/null || true)
                if [ -n "$output" ]; then
                    printf '  yum updates still available for managed packages:\n'
                    print_limited_output "$output" 20
                else
                    printf '  ok: yum managed packages current\n'
                fi
            else
                printf '  skip: supported package manager not found\n'
            fi
            ;;
        *)
            printf '  skip: OS package update check unavailable for %s\n' "$os_name"
            ;;
    esac

    if command -v npm >/dev/null 2>&1; then
        output=$(npm outdated -g --depth=0 2>/dev/null || true)
        if [ -n "$output" ]; then
            printf '  npm global updates still available:\n'
            print_limited_output "$output" 20
        else
            printf '  ok: npm global packages current\n'
        fi
    else
        printf '  skip: npm not installed\n'
    fi
}

optional_tool_enabled() {
    local env_name=$1
    local label=$2
    local prompt=$3
    local value
    local reply

    value=$(printenv "$env_name" 2>/dev/null || true)

    case "$value" in
        1|true|TRUE|yes|YES|y|Y)
            return 0
            ;;
        0|false|FALSE|no|NO|n|N)
            printf 'skip: %s disabled by %s=%s\n' "$label" "$env_name" "$value"
            return 1
            ;;
    esac

    if [ "${DOTFILES_INSTALL_OPTIONAL_TOOLS:-0}" = "1" ]; then
        return 0
    fi

    if [ "${DOTFILES_PROMPT_OPTIONAL_TOOLS:-0}" != "1" ]; then
        printf 'skip: %s optional install not selected\n' "$label"
        return 1
    fi

    if [ ! -t 0 ]; then
        printf 'skip: %s prompt unavailable; set %s=1 to install\n' "$label" "$env_name"
        return 1
    fi

    while true; do
        printf '%s [y/N] ' "$prompt"
        if ! read -r reply; then
            printf '\nskip: %s\n' "$label"
            return 1
        fi

        case "$reply" in
            y|Y|yes|YES)
                return 0
                ;;
            ""|n|N|no|NO)
                printf 'skip: %s\n' "$label"
                return 1
                ;;
            *)
                printf 'Please answer y or n.\n'
                ;;
        esac
    done
}

link_file() {
    local source=$1
    local target=$2

    if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
        printf 'ok: %s already linked\n' "$target"
        return
    fi

    mkdir -p "$(dirname "$target")"

    if [ -e "$target" ] || [ -L "$target" ]; then
        mkdir -p "$BACKUP_DIR"
        mv "$target" "$BACKUP_DIR/"
        printf 'backup: %s -> %s/\n' "$target" "$BACKUP_DIR"
    fi

    if ln -s "$source" "$target" 2>/dev/null; then
        printf 'link: %s -> %s\n' "$target" "$source"
    else
        if [ -d "$source" ]; then
            cp -R "$source" "$target"
        else
            cp "$source" "$target"
        fi
        printf 'copy: %s -> %s (symlink unavailable)\n' "$source" "$target"
    fi
}

link_common_configs() {
    link_file "$DOTFILES_DIR/config/nvim" "$HOME/.config/nvim"
    link_file "$DOTFILES_DIR/config/atuin" "$HOME/.config/atuin"
    link_file "$DOTFILES_DIR/config/git/ignore" "$HOME/.config/git/ignore"
}

link_macos_configs() {
    link_common_configs
    link_file "$DOTFILES_DIR/config/ghostty/config.ghostty" "$HOME/Library/Application Support/com.mitchellh.ghostty/config.ghostty"
    link_file "$DOTFILES_DIR/config/lazygit/config.yml" "$HOME/Library/Application Support/lazygit/config.yml"
}

link_linux_configs() {
    link_common_configs
    link_file "$DOTFILES_DIR/config/ghostty/config.ghostty" "$HOME/.config/ghostty/config"
    link_file "$DOTFILES_DIR/config/lazygit/config.yml" "$HOME/.config/lazygit/config.yml"
}

link_windows_configs() {
    local local_app_data="${LOCALAPPDATA:-$HOME/AppData/Local}"
    local roaming_app_data="${APPDATA:-$HOME/AppData/Roaming}"

    link_file "$DOTFILES_DIR/config/atuin" "$HOME/.config/atuin"
    link_file "$DOTFILES_DIR/config/git/ignore" "$HOME/.config/git/ignore"
    link_file "$DOTFILES_DIR/config/nvim" "$local_app_data/nvim"
    link_file "$DOTFILES_DIR/config/lazygit/config.yml" "$roaming_app_data/lazygit/config.yml"
}

link_agent_instructions() {
    local source="$DOTFILES_DIR/config/agents/AGENTS.md"
    local home_agents="$HOME/AGENTS.md"

    link_file "$source" "$home_agents"
    link_file "$home_agents" "$HOME/CLAUDE.md"
    link_file "$home_agents" "$HOME/.codex/AGENTS.md"
    link_file "$home_agents" "$HOME/.claude/CLAUDE.md"
}

print_missing() {
    local missing=()
    local tool

    for tool in "$@"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing+=("$tool")
        fi
    done

    if [ "${#missing[@]}" -gt 0 ]; then
        printf '\nMissing optional tools: %s\n' "${missing[*]}"
    fi
}

print_package_hint() {
    local os_name=$1

    printf '\nPackage hints for %s:\n' "$os_name"

    case "$os_name" in
        macos)
            printf '  brew bundle --file "%s/os/macos/Brewfile"\n' "$DOTFILES_DIR"
            ;;
        linux|wsl)
            printf '  See %s/os/linux/apt-packages.txt and %s/os/linux/dnf-packages.txt\n' "$DOTFILES_DIR" "$DOTFILES_DIR"
            ;;
        windows)
            printf '  See %s/os/windows/winget-packages.txt\n' "$DOTFILES_DIR"
            printf '  For tmux/zsh parity, use WSL and run this installer inside WSL.\n'
            ;;
        *)
            printf '  No package list for this OS yet.\n'
            ;;
    esac
}

run_as_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        printf 'warn: sudo not found; cannot run: %s\n' "$*"
        return 1
    fi
}

os_release_value() {
    local key=$1
    local file="${DOTFILES_OS_RELEASE_FILE:-/etc/os-release}"

    if [ ! -r "$file" ]; then
        return 1
    fi

    awk -F= -v key="$key" '
        $1 == key {
            value = $2
            gsub(/^"/, "", value)
            gsub(/"$/, "", value)
            print value
            exit
        }
    ' "$file"
}

is_amazon_linux() {
    local id
    local id_like

    id=$(os_release_value ID || true)
    id_like=$(os_release_value ID_LIKE || true)

    [ "$id" = "amzn" ] || printf ' %s ' "$id_like" | grep -q ' amzn '
}

version_at_least() {
    local current=$1
    local minimum=$2

    awk -v current="$current" -v minimum="$minimum" '
        BEGIN {
            split(current, c, ".")
            split(minimum, m, ".")
            for (i = 1; i <= 3; i++) {
                c[i] += 0
                m[i] += 0
                if (c[i] > m[i]) {
                    exit 0
                }
                if (c[i] < m[i]) {
                    exit 1
                }
            }
            exit 0
        }
    '
}

path_free_kb() {
    df -Pk "$1" 2>/dev/null | awk 'NR == 2 { print $4 }'
}

path_inode_used_percent() {
    df -Pi "$1" 2>/dev/null | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }'
}

amazon_linux_storage_is_low() {
    local path=${1:-$HOME}
    local min_free_kb=${DOTFILES_AMAZON_MIN_FREE_KB:-524288}
    local max_inode_used_percent=${DOTFILES_AMAZON_MAX_INODE_USED_PERCENT:-95}
    local free_kb
    local inode_used_percent

    free_kb=$(path_free_kb "$path")
    inode_used_percent=$(path_inode_used_percent "$path")

    if [ -n "$free_kb" ] && [ "$free_kb" -lt "$min_free_kb" ]; then
        return 0
    fi

    if [ -n "$inode_used_percent" ] && [ "$inode_used_percent" -ge "$max_inode_used_percent" ]; then
        return 0
    fi

    return 1
}

clean_amazon_linux_package_caches() {
    printf 'amazon-linux: cleaning package caches and old journal entries\n'

    if command -v dnf >/dev/null 2>&1; then
        run_as_root dnf clean all || printf 'warn: dnf cache clean failed\n'
    elif command -v yum >/dev/null 2>&1; then
        run_as_root yum clean all || printf 'warn: yum cache clean failed\n'
    fi

    if command -v journalctl >/dev/null 2>&1; then
        run_as_root journalctl --vacuum-time=7d || printf 'warn: journal cleanup failed\n'
    fi
}

prepare_amazon_linux_ec2() {
    if ! is_amazon_linux; then
        return
    fi

    printf 'amazon-linux: EC2 compatibility checks enabled\n'

    if amazon_linux_storage_is_low "$HOME"; then
        clean_amazon_linux_package_caches
    fi

    if amazon_linux_storage_is_low "$HOME"; then
        printf 'warn: low disk space or inode headroom remains; Cargo/Neovim installs may fail\n'
        df -h "$HOME" 2>/dev/null || true
        df -ih "$HOME" 2>/dev/null || true
    fi
}

install_packages_one_by_one() {
    local manager=$1
    shift

    local package
    for package in "$@"; do
        if ! run_as_root "$manager" install -y "$package"; then
            printf 'warn: failed to install package: %s\n' "$package"
        fi
    done
}

write_managed_block() {
    local target=$1
    local begin_marker=$2
    local end_marker=$3
    local block=$4
    local tmp

    mkdir -p "$(dirname "$target")"

    if [ -L "$target" ] && [ ! -e "$target" ]; then
        mkdir -p "$BACKUP_DIR"
        mv "$target" "$BACKUP_DIR/"
        printf 'backup: broken %s symlink -> %s/\n' "$target" "$BACKUP_DIR"
    fi

    if [ ! -e "$target" ]; then
        printf '%s\n' "$block" > "$target"
        printf 'create: %s\n' "$target"
        return
    fi

    tmp=$(mktemp)

    if grep -Fq "$begin_marker" "$target"; then
        awk -v begin="$begin_marker" -v end="$end_marker" '
            $0 == begin {
                in_block = 1
                next
            }
            $0 == end {
                in_block = 0
                next
            }
            !in_block {
                print
            }
        ' "$target" > "$tmp"
        {
            printf '\n'
            printf '%s\n' "$block"
        } >> "$tmp"
        mv "$tmp" "$target"
        printf 'ok: refreshed managed block in %s\n' "$target"
        return
    fi

    {
        cat "$target"
        printf '\n'
        printf '%s\n' "$block"
    } > "$tmp"
    mv "$tmp" "$target"
    printf 'update: added managed block to %s\n' "$target"
}

ensure_bash_setup() {
    local bashrc="$HOME/.bashrc"
    local begin_marker="# >>> dotfiles amazon linux bash >>>"
    local end_marker="# <<< dotfiles amazon linux bash <<<"
    local path_line="export PATH=\"\$HOME/.cargo/bin:\$HOME/.local/bin:$DOTFILES_DIR/scripts:\$PATH\""
    local block

    block=$(printf '%s\n%s\n%s\n' "$begin_marker" "$path_line" "$end_marker")
    write_managed_block "$bashrc" "$begin_marker" "$end_marker" "$block"
}

ensure_readline_setup() {
    local inputrc="$HOME/.inputrc"
    local begin_marker="# >>> dotfiles amazon linux readline >>>"
    local end_marker="# <<< dotfiles amazon linux readline <<<"
    local block

    block=$(cat <<'EOF'
# >>> dotfiles amazon linux readline >>>
set editing-mode emacs
"\e[A": previous-history
"\e[B": next-history
"\e[3~": delete-char
"\C-?": backward-delete-char
# <<< dotfiles amazon linux readline <<<
EOF
)

    write_managed_block "$inputrc" "$begin_marker" "$end_marker" "$block"
}

ensure_bat_command() {
    if command -v bat >/dev/null 2>&1; then
        return
    fi

    if command -v batcat >/dev/null 2>&1; then
        mkdir -p "$HOME/.local/bin"
        ln -sf "$(command -v batcat)" "$HOME/.local/bin/bat"
        printf 'link: %s -> %s\n' "$HOME/.local/bin/bat" "$(command -v batcat)"
    fi
}

ensure_fd_command() {
    if command -v fd >/dev/null 2>&1; then
        return
    fi

    if command -v fdfind >/dev/null 2>&1; then
        mkdir -p "$HOME/.local/bin"
        ln -sf "$(command -v fdfind)" "$HOME/.local/bin/fd"
        printf 'link: %s -> %s\n' "$HOME/.local/bin/fd" "$(command -v fdfind)"
    fi
}

linux_release_target() {
    local tool=$1

    case "$(uname -m)" in
        x86_64|amd64)
            case "$tool" in
                ripgrep)
                    echo "x86_64-unknown-linux-musl"
                    ;;
                *)
                    echo "x86_64-unknown-linux-gnu"
                    ;;
            esac
            ;;
        aarch64|arm64)
            echo "aarch64-unknown-linux-gnu"
            ;;
        *)
            return 1
            ;;
    esac
}

install_ripgrep_linux() {
    if command -v rg >/dev/null 2>&1 && ! tool_updates_enabled; then
        return
    fi

    if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
        printf 'warn: curl/tar missing; cannot install ripgrep release archive\n'
        return
    fi

    local target
    if ! target=$(linux_release_target ripgrep); then
        printf 'warn: unsupported architecture for ripgrep install: %s\n' "$(uname -m)"
        return
    fi

    local version
    version=$( (curl -fsSL https://api.github.com/repos/BurntSushi/ripgrep/releases/latest || true) | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)

    if [ -z "$version" ]; then
        printf 'warn: could not determine latest ripgrep version\n'
        return
    fi

    local installed_version
    installed_version=$( (rg --version 2>/dev/null || true) | sed -n 's/^ripgrep \([^[:space:]]*\).*/\1/p' | head -n 1)

    if [ "$installed_version" = "$version" ]; then
        printf 'ok: ripgrep %s current\n' "$version"
        return
    fi

    local asset="ripgrep-${version}-${target}"
    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$HOME/.local/bin"

    if curl -fsSL "https://github.com/BurntSushi/ripgrep/releases/download/${version}/${asset}.tar.gz" -o "$tmpdir/rg.tar.gz" &&
        tar -xzf "$tmpdir/rg.tar.gz" -C "$tmpdir"; then
        install -m 0755 "$tmpdir/$asset/rg" "$HOME/.local/bin/rg"
        printf 'install: ripgrep %s -> %s\n' "$version" "$HOME/.local/bin/rg"
    else
        printf 'warn: failed to install ripgrep release archive\n'
    fi

    rm -rf "$tmpdir"
}

install_fd_linux() {
    ensure_fd_command

    if command -v fd >/dev/null 2>&1 && ! tool_updates_enabled; then
        return
    fi

    if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
        printf 'warn: curl/tar missing; cannot install fd release archive\n'
        return
    fi

    local target
    if ! target=$(linux_release_target fd); then
        printf 'warn: unsupported architecture for fd install: %s\n' "$(uname -m)"
        return
    fi

    local version
    version=$( (curl -fsSL https://api.github.com/repos/sharkdp/fd/releases/latest || true) | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1)

    if [ -z "$version" ]; then
        printf 'warn: could not determine latest fd version\n'
        return
    fi

    local installed_version
    installed_version=$( (fd --version 2>/dev/null || true) | sed -n 's/^fd \([^[:space:]]*\).*/\1/p' | head -n 1)

    if [ "$installed_version" = "$version" ]; then
        printf 'ok: fd %s current\n' "$version"
        return
    fi

    local asset="fd-v${version}-${target}"
    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$HOME/.local/bin"

    if curl -fsSL "https://github.com/sharkdp/fd/releases/download/v${version}/${asset}.tar.gz" -o "$tmpdir/fd.tar.gz" &&
        tar -xzf "$tmpdir/fd.tar.gz" -C "$tmpdir"; then
        install -m 0755 "$tmpdir/$asset/fd" "$HOME/.local/bin/fd"
        printf 'install: fd %s -> %s\n' "$version" "$HOME/.local/bin/fd"
    else
        printf 'warn: failed to install fd release archive\n'
    fi

    rm -rf "$tmpdir"
}

install_lazygit_linux() {
    if command -v lazygit >/dev/null 2>&1 && ! tool_updates_enabled; then
        return
    fi

    if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
        printf 'warn: curl/tar missing; cannot install lazygit release\n'
        return
    fi

    local arch
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x86_64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        *)
            printf 'warn: unsupported architecture for lazygit install: %s\n' "$(uname -m)"
            return
            ;;
    esac

    local version
    version=$( (curl -fsSL https://api.github.com/repos/jesseduffield/lazygit/releases/latest || true) | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1)

    if [ -z "$version" ]; then
        printf 'warn: could not determine latest lazygit version\n'
        return
    fi

    local installed_version
    installed_version=$( (lazygit --version 2>/dev/null || true) | sed -n 's/.*version=\([^,]*\).*/\1/p' | head -n 1)

    if [ "$installed_version" = "$version" ]; then
        printf 'ok: lazygit %s current\n' "$version"
        return
    fi

    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$HOME/.local/bin"

    if curl -fsSL "https://github.com/jesseduffield/lazygit/releases/download/v${version}/lazygit_${version}_Linux_${arch}.tar.gz" -o "$tmpdir/lazygit.tar.gz" &&
        tar -xzf "$tmpdir/lazygit.tar.gz" -C "$tmpdir" lazygit; then
        install -m 0755 "$tmpdir/lazygit" "$HOME/.local/bin/lazygit"
        printf 'install: lazygit %s -> %s\n' "$version" "$HOME/.local/bin/lazygit"
    else
        printf 'warn: failed to install lazygit release\n'
    fi

    rm -rf "$tmpdir"
}

install_neovim_linux() {
    if command -v nvim >/dev/null 2>&1 && ! tool_updates_enabled; then
        return
    fi

    if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
        printf 'warn: curl/tar missing; cannot install Neovim release archive\n'
        return
    fi

    local arch
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x86_64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        *)
            printf 'warn: unsupported architecture for Neovim install: %s\n' "$(uname -m)"
            return
            ;;
    esac

    local version
    version=$( (curl -fsSL https://api.github.com/repos/neovim/neovim/releases/latest || true) | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1)

    if [ -z "$version" ]; then
        printf 'warn: could not determine latest Neovim version\n'
        return
    fi

    local installed_version
    installed_version=$( (nvim --version 2>/dev/null || true) | sed -n 's/^NVIM v\([^[:space:]]*\).*/\1/p' | head -n 1)

    if [ "$installed_version" = "$version" ]; then
        printf 'ok: Neovim %s current\n' "$version"
        return
    fi

    local asset="nvim-linux-${arch}"
    local install_dir="$HOME/.local/opt/$asset"
    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$HOME/.local/bin" "$HOME/.local/opt"

    if curl -fsSL "https://github.com/neovim/neovim/releases/latest/download/${asset}.tar.gz" -o "$tmpdir/nvim.tar.gz" &&
        tar -xzf "$tmpdir/nvim.tar.gz" -C "$tmpdir"; then
        rm -rf "$install_dir"
        mv "$tmpdir/$asset" "$install_dir"
        rm -f "$HOME/.local/bin/nvim"
        ln -s "$install_dir/bin/nvim" "$HOME/.local/bin/nvim"
        printf 'install: Neovim %s -> %s\n' "$version" "$HOME/.local/bin/nvim"
    else
        printf 'warn: failed to install Neovim release archive\n'
    fi

    rm -rf "$tmpdir"
}

install_zig_linux() {
    local version="${DOTFILES_ZIG_VERSION:-0.13.0}"
    local installed_version
    installed_version=$( (zig version 2>/dev/null || true) | sed -n '1p')

    if [ "$installed_version" = "$version" ]; then
        printf 'ok: Zig %s current\n' "$version"
        return
    fi

    if [ -n "$installed_version" ] && ! tool_updates_enabled; then
        printf 'ok: Zig %s installed\n' "$installed_version"
        return
    fi

    if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
        printf 'warn: curl/tar missing; cannot install Zig release archive\n'
        return
    fi

    local arch
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x86_64-linux"
            ;;
        aarch64|arm64)
            arch="aarch64-linux"
            ;;
        *)
            printf 'warn: unsupported architecture for Zig install: %s\n' "$(uname -m)"
            return
            ;;
    esac

    local asset="zig-${arch}-${version}"
    local install_dir="$HOME/.local/opt/$asset"
    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$HOME/.local/bin" "$HOME/.local/opt"

    if curl -fsSL "https://ziglang.org/download/${version}/${asset}.tar.xz" -o "$tmpdir/zig.tar.xz" &&
        tar -xJf "$tmpdir/zig.tar.xz" -C "$tmpdir"; then
        rm -rf "$install_dir"
        mv "$tmpdir/$asset" "$install_dir"
        rm -f "$HOME/.local/bin/zig"
        ln -s "$install_dir/zig" "$HOME/.local/bin/zig"
        printf 'install: Zig %s -> %s\n' "$version" "$HOME/.local/bin/zig"
    else
        printf 'warn: failed to install Zig %s release archive\n' "$version"
    fi

    rm -rf "$tmpdir"
}

install_rust_toolchain_linux() {
    local min_version="${DOTFILES_RUST_MIN_VERSION:-1.74.1}"
    local current_version

    current_version=$( (rustc --version 2>/dev/null || true) | awk '{ print $2 }' | sed -n '1p')

    if [ -n "$current_version" ] && version_at_least "$current_version" "$min_version"; then
        if ! tool_updates_enabled; then
            printf 'ok: rustc %s installed\n' "$current_version"
            return
        fi
    fi

    if command -v rustup >/dev/null 2>&1; then
        rustup toolchain install stable --profile minimal || printf 'warn: failed to install Rust stable toolchain\n'
        rustup default stable || printf 'warn: failed to set Rust stable as default\n'
    else
        if ! command -v curl >/dev/null 2>&1; then
            printf 'warn: curl missing; cannot install Rust with rustup\n'
            return
        fi

        local tmpdir
        tmpdir=$(mktemp -d)

        if curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$tmpdir/rustup-init.sh"; then
            sh "$tmpdir/rustup-init.sh" -y --default-toolchain stable --profile minimal || printf 'warn: rustup install failed\n'
        else
            printf 'warn: failed to download rustup installer\n'
        fi

        rm -rf "$tmpdir"
    fi

    if [ -f "$HOME/.cargo/env" ]; then
        # shellcheck disable=SC1091
        . "$HOME/.cargo/env"
    fi

    export PATH="$HOME/.cargo/bin:$PATH"
    hash -r 2>/dev/null || true

    current_version=$( (rustc --version 2>/dev/null || true) | awk '{ print $2 }' | sed -n '1p')
    if [ -n "$current_version" ] && version_at_least "$current_version" "$min_version"; then
        printf 'ok: rustc %s meets minimum %s\n' "$current_version" "$min_version"
    else
        printf 'warn: rustc %s is below required %s; tree-sitter-cli may fail\n' "${current_version:-missing}" "$min_version"
    fi
}

install_tree_sitter_cli_linux() {
    local versions
    local version
    local installed_version
    local installed_ok=0

    if [ -n "${DOTFILES_TREE_SITTER_CLI_VERSIONS:-}" ]; then
        versions="$DOTFILES_TREE_SITTER_CLI_VERSIONS"
    elif [ -n "${DOTFILES_TREE_SITTER_CLI_VERSION:-}" ]; then
        versions="$DOTFILES_TREE_SITTER_CLI_VERSION"
    else
        versions="0.22.6"
    fi

    installed_version=$( (tree-sitter --version 2>/dev/null || true) | sed -n 's/^tree-sitter \([^[:space:]]*\).*/\1/p' | head -n 1)

    if [ -n "$installed_version" ] && ! tool_updates_enabled; then
        printf 'ok: tree-sitter-cli %s installed\n' "$installed_version"
        return
    fi

    if ! command -v cargo >/dev/null 2>&1; then
        printf 'warn: cargo missing; cannot install tree-sitter-cli\n'
        return
    fi

    mkdir -p "$HOME/.local"

    for version in $versions; do
        if [ "$installed_version" = "$version" ]; then
            printf 'ok: tree-sitter-cli %s current\n' "$version"
            installed_ok=1
            break
        fi

        if cargo install tree-sitter-cli --version "$version" --locked --root "$HOME/.local" --force; then
            printf 'install: tree-sitter-cli %s -> %s\n' "$version" "$HOME/.local/bin/tree-sitter"
            installed_ok=1
            break
        fi

        printf 'warn: failed to install tree-sitter-cli %s with cargo\n' "$version"
    done

    if [ "$installed_ok" -eq 0 ]; then
        printf 'warn: failed to install any compatible tree-sitter-cli version\n'
        return
    fi

    hash -r 2>/dev/null || true
}

ensure_mason_tree_sitter_uses_local_cli() {
    local cli="$HOME/.local/bin/tree-sitter"
    local mason_bin="$HOME/.local/share/nvim/mason/bin/tree-sitter"
    local backup

    if [ ! -x "$cli" ]; then
        return
    fi

    mkdir -p "$(dirname "$mason_bin")"

    if [ -L "$mason_bin" ] && [ "$(readlink "$mason_bin")" = "$cli" ]; then
        printf 'ok: Mason tree-sitter already uses %s\n' "$cli"
        return
    fi

    if [ -e "$mason_bin" ] || [ -L "$mason_bin" ]; then
        backup="$mason_bin.prebuilt-amazon-backup"
        mv "$mason_bin" "$backup"
        printf 'backup: %s -> %s\n' "$mason_bin" "$backup"
    fi

    ln -s "$cli" "$mason_bin"
    printf 'link: %s -> %s\n' "$mason_bin" "$cli"
}

install_shell_tool_scripts_linux() {
    mkdir -p "$HOME/.local/bin"

    if command -v curl >/dev/null 2>&1 && { ! command -v starship >/dev/null 2>&1 || tool_updates_enabled; }; then
        curl -fsSL https://starship.rs/install.sh | sh -s -- -y -b "$HOME/.local/bin" || printf 'warn: failed to install starship\n'
    fi

    if command -v curl >/dev/null 2>&1 && { ! command -v zoxide >/dev/null 2>&1 || tool_updates_enabled; }; then
        curl -fsSL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh || printf 'warn: failed to install zoxide\n'
    fi

    if command -v curl >/dev/null 2>&1 && { ! command -v atuin >/dev/null 2>&1 || tool_updates_enabled; }; then
        curl --proto '=https' --tlsv1.2 -fsSL https://setup.atuin.sh | sh || printf 'warn: failed to install atuin\n'
    fi
}

install_macos_packages() {
    if ! command -v brew >/dev/null 2>&1; then
        printf 'warn: Homebrew not found; skipping brew bundle\n'
        return
    fi

    brew update || printf 'warn: brew update failed; continuing\n'
    brew bundle --file "$DOTFILES_DIR/os/macos/Brewfile" || printf 'warn: brew bundle failed; continuing\n'
}

install_linux_packages() {
    if command -v apt-get >/dev/null 2>&1; then
        run_as_root apt-get update || printf 'warn: apt update failed; continuing\n'
        install_packages_one_by_one apt-get git zsh tmux curl ca-certificates unzip tar gzip xz-utils build-essential nodejs npm jq ripgrep fd-find fzf bat gh eza
    elif command -v dnf >/dev/null 2>&1; then
        install_packages_one_by_one dnf git zsh tmux curl ca-certificates unzip tar gzip xz gcc gcc-c++ make nodejs npm jq ripgrep fd-find fzf bat gh eza
    elif command -v yum >/dev/null 2>&1; then
        install_packages_one_by_one yum git zsh tmux curl ca-certificates unzip tar gzip xz gcc gcc-c++ make nodejs npm jq ripgrep fd-find fzf bat gh eza
    else
        printf 'warn: supported package manager not found; skipping OS package install\n'
    fi

    ensure_bat_command
    install_ripgrep_linux
    install_fd_linux
    install_neovim_linux
    install_zig_linux
    install_rust_toolchain_linux
    install_tree_sitter_cli_linux
    if is_amazon_linux; then
        ensure_mason_tree_sitter_uses_local_cli
    fi
    install_lazygit_linux
    install_shell_tool_scripts_linux
}

setup_npm_prefix() {
    if ! command -v npm >/dev/null 2>&1; then
        printf 'warn: npm not found; skipping npm global installs\n'
        return 1
    fi

    mkdir -p "$HOME/.local"
    npm config set prefix "$HOME/.local" >/dev/null 2>&1 || printf 'warn: failed to set npm prefix\n'
}

install_pnpm_cli() {
    local pnpm_spec="${DOTFILES_PNPM_SPEC:-pnpm@10}"

    setup_npm_prefix || return
    npm install -g "$pnpm_spec" || printf 'warn: failed to install pnpm CLI\n'
}

install_codex_cli() {
    setup_npm_prefix || return
    npm install -g @openai/codex@latest || printf 'warn: failed to install Codex CLI\n'
}

install_claude_cli() {
    setup_npm_prefix || return
    npm install -g @anthropic-ai/claude-code@latest || printf 'warn: failed to install Claude CLI\n'
}

install_node_clis() {
    install_pnpm_cli

    if optional_tool_enabled DOTFILES_INSTALL_CLAUDE "Claude CLI" "Install Claude CLI?"; then
        install_claude_cli
    fi

    if optional_tool_enabled DOTFILES_INSTALL_CODEX "Codex CLI" "Install Codex CLI?"; then
        install_codex_cli
    fi
}

install_spotify_player_with_cargo() {
    if ! command -v cargo >/dev/null 2>&1; then
        printf 'warn: cargo not found; cannot install spotify_player\n'
        return
    fi

    mkdir -p "$HOME/.local"
    cargo install spotify_player --locked --root "$HOME/.local" --force || printf 'warn: failed to install spotify_player with cargo\n'
}

install_spotify_player() {
    local os_name=$1

    case "$os_name" in
        macos)
            if command -v brew >/dev/null 2>&1; then
                if brew list spotify_player >/dev/null 2>&1; then
                    brew upgrade spotify_player || printf 'ok: spotify_player already current or upgrade unavailable\n'
                else
                    brew install spotify_player || printf 'warn: failed to install spotify_player with Homebrew\n'
                fi
            else
                install_spotify_player_with_cargo
            fi
            ;;
        linux|wsl)
            if ! command -v cargo >/dev/null 2>&1; then
                install_rust_toolchain_linux
            fi
            install_spotify_player_with_cargo
            ;;
        windows)
            if command -v cargo >/dev/null 2>&1; then
                install_spotify_player_with_cargo
            else
                printf 'warn: native Windows spotify_player install needs Cargo or Scoop; WSL is recommended for tmux parity\n'
            fi
            ;;
        *)
            install_spotify_player_with_cargo
            ;;
    esac
}

install_optional_tools() {
    local os_name=$1

    if optional_tool_enabled DOTFILES_INSTALL_SPOTIFY_PLAYER "spotify_player" "Install spotify_player?"; then
        install_spotify_player "$os_name"
    fi
}

install_packages_for_os() {
    local os_name=$1

    if [ "${DOTFILES_SKIP_PACKAGES:-0}" = "1" ]; then
        printf 'skip: package install disabled by DOTFILES_SKIP_PACKAGES=1\n'
        return
    fi

    case "$os_name" in
        macos)
            install_macos_packages
            install_node_clis
            install_optional_tools "$os_name"
            ;;
        linux|wsl)
            install_linux_packages
            install_node_clis
            install_optional_tools "$os_name"
            ;;
        windows)
            install_node_clis
            install_optional_tools "$os_name"
            ;;
        *)
            printf 'warn: unknown OS; skipping package install\n'
            ;;
    esac
}

ensure_zsh_setup() {
    local zshrc="$HOME/.zshrc"
    local begin_marker="# >>> dotfiles >>>"
    local end_marker="# <<< dotfiles <<<"
    local path_line="export PATH=\"$DOTFILES_DIR/scripts:\$PATH\""
    local source_line="source \"$DOTFILES_DIR/zsh_stuff\""
    local block
    local tmp

    block=$(printf '%s\n%s\n%s\n%s\n' "$begin_marker" "$path_line" "$source_line" "$end_marker")

    if [ -L "$zshrc" ] && [ ! -e "$zshrc" ]; then
        mkdir -p "$BACKUP_DIR"
        mv "$zshrc" "$BACKUP_DIR/"
        printf 'backup: broken %s symlink -> %s/\n' "$zshrc" "$BACKUP_DIR"
    fi

    if [ ! -e "$zshrc" ]; then
        printf '%s\n' "$block" > "$zshrc"
        printf 'create: %s with dotfiles PATH/source block\n' "$zshrc"
        return
    fi

    tmp=$(mktemp)

    if grep -Fq "$begin_marker" "$zshrc"; then
        awk -v begin="$begin_marker" -v end="$end_marker" '
            $0 == begin {
                in_block = 1
                next
            }
            $0 == end {
                in_block = 0
                next
            }
            !in_block {
                print
            }
        ' "$zshrc" > "$tmp"
        {
            printf '\n'
            printf '%s\n' "$block"
        } >> "$tmp"
        mv "$tmp" "$zshrc"
        printf 'ok: refreshed dotfiles PATH/source block in %s\n' "$zshrc"
        return
    fi

    {
        grep -Fv 'zsh_stuff' "$zshrc" || true
        printf '\n# >>> dotfiles >>>\n'
        printf '%s\n' "$path_line"
        printf '%s\n' "$source_line"
        printf '# <<< dotfiles <<<\n'
    } > "$tmp"
    mv "$tmp" "$zshrc"
    printf 'update: added dotfiles PATH/source block to %s\n' "$zshrc"
}

main() {
    local os_name
    os_name=$(detect_os)

    printf 'dotfiles: %s\n' "$DOTFILES_DIR"
    printf 'detected: %s\n\n' "$os_name"

    prepare_amazon_linux_ec2
    printf '\n'

    update_dotfiles_repo
    printf '\n'

    print_tool_status "Before install/update" "$os_name"
    printf '\n'

    install_packages_for_os "$os_name"
    printf '\n'

    if [ "${DOTFILES_SKIP_PACKAGES:-0}" = "1" ]; then
        printf 'skip: package update check disabled by DOTFILES_SKIP_PACKAGES=1\n'
    else
        print_update_candidates "$os_name"
    fi
    printf '\n'

    print_tool_status "After install/update" "$os_name"
    printf '\n'

    case "$os_name" in
        macos|linux|wsl)
            if is_amazon_linux; then
                ensure_bash_setup
                ensure_readline_setup
            fi
            ensure_zsh_setup
            link_agent_instructions
            link_file "$DOTFILES_DIR/.ignore" "$HOME/.ignore"
            link_file "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"
            if [ "$os_name" = "macos" ]; then
                link_macos_configs
                print_missing zsh tmux lazygit starship zoxide atuin nvim pnpm gh rg fd eza bat jq fzf
            else
                link_linux_configs
                print_missing zsh tmux lazygit starship zoxide atuin nvim rustc cargo zig tree-sitter pnpm gh rg fd eza bat jq fzf
            fi
            ;;
        windows)
            ensure_zsh_setup
            link_agent_instructions
            link_file "$DOTFILES_DIR/.ignore" "$HOME/.ignore"
            link_windows_configs
            print_missing git gh lazygit starship zoxide nvim rg fd eza bat jq fzf
            ;;
        *)
            ensure_zsh_setup
            link_agent_instructions
            link_file "$DOTFILES_DIR/.ignore" "$HOME/.ignore"
            print_missing zsh git gh
            ;;
    esac

    print_package_hint "$os_name"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
