#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
export PATH="$HOME/.local/bin:$DOTFILES_DIR/scripts:$PATH"

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
        macos|linux|wsl)
            printf '%s\n' git zsh tmux lazygit starship zoxide atuin nvim node npm pnpm gh rg eza bat jq fzf codex claude
            ;;
        windows)
            printf '%s\n' git node npm pnpm gh lazygit starship zoxide nvim rg eza bat jq fzf codex claude
            ;;
        *)
            printf '%s\n' git zsh node npm codex claude
            ;;
    esac
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
                output=$(dnf check-update git zsh tmux nodejs npm jq ripgrep fzf bat gh eza 2>/dev/null || true)
                if [ -n "$output" ]; then
                    printf '  dnf updates still available for managed packages:\n'
                    print_limited_output "$output" 20
                else
                    printf '  ok: dnf managed packages current\n'
                fi
            elif command -v yum >/dev/null 2>&1; then
                output=$(yum check-update git zsh tmux nodejs npm jq ripgrep fzf bat gh eza 2>/dev/null || true)
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
        install_packages_one_by_one apt-get git zsh tmux curl ca-certificates unzip tar gzip build-essential nodejs npm jq ripgrep fzf bat gh eza
    elif command -v dnf >/dev/null 2>&1; then
        install_packages_one_by_one dnf git zsh tmux curl ca-certificates unzip tar gzip gcc gcc-c++ make nodejs npm jq ripgrep fzf bat gh eza
    elif command -v yum >/dev/null 2>&1; then
        install_packages_one_by_one yum git zsh tmux curl ca-certificates unzip tar gzip gcc gcc-c++ make nodejs npm jq ripgrep fzf bat gh eza
    else
        printf 'warn: supported package manager not found; skipping OS package install\n'
    fi

    ensure_bat_command
    install_neovim_linux
    install_lazygit_linux
    install_shell_tool_scripts_linux
}

install_node_clis() {
    if ! command -v npm >/dev/null 2>&1; then
        printf 'warn: npm not found; skipping Codex and Claude CLI install\n'
        return
    fi

    mkdir -p "$HOME/.local"
    npm config set prefix "$HOME/.local" >/dev/null 2>&1 || printf 'warn: failed to set npm prefix\n'
    npm install -g pnpm@latest @openai/codex@latest @anthropic-ai/claude-code@latest || printf 'warn: failed to install pnpm/Codex/Claude CLIs\n'
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
            ;;
        linux|wsl)
            install_linux_packages
            install_node_clis
            ;;
        windows)
            install_node_clis
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
            ensure_zsh_setup
            link_file "$DOTFILES_DIR/.ignore" "$HOME/.ignore"
            link_file "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"
            if [ "$os_name" = "macos" ]; then
                link_macos_configs
            else
                link_linux_configs
            fi
            print_missing zsh tmux lazygit starship zoxide atuin nvim pnpm gh rg eza bat jq fzf
            ;;
        windows)
            ensure_zsh_setup
            link_file "$DOTFILES_DIR/.ignore" "$HOME/.ignore"
            link_windows_configs
            print_missing git gh lazygit starship zoxide nvim rg eza bat jq fzf
            ;;
        *)
            ensure_zsh_setup
            link_file "$DOTFILES_DIR/.ignore" "$HOME/.ignore"
            print_missing zsh git gh
            ;;
    esac

    print_package_hint "$os_name"
}

main "$@"
