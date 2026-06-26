#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"

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
            printf '  See %s/os/linux/apt-packages.txt\n' "$DOTFILES_DIR"
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

ensure_zsh_source() {
    local zshrc="$HOME/.zshrc"
    local source_line="source \"$DOTFILES_DIR/zsh_stuff\""

    if [ -L "$zshrc" ] && [ ! -e "$zshrc" ]; then
        mkdir -p "$BACKUP_DIR"
        mv "$zshrc" "$BACKUP_DIR/"
        printf 'backup: broken %s symlink -> %s/\n' "$zshrc" "$BACKUP_DIR"
    fi

    if [ -f "$zshrc" ] && grep -Fq 'zsh_stuff' "$zshrc"; then
        printf 'ok: %s already sources zsh_stuff\n' "$zshrc"
        return
    fi

    if [ ! -e "$zshrc" ]; then
        printf '%s\n' "$source_line" > "$zshrc"
        printf 'create: %s with zsh_stuff source\n' "$zshrc"
        return
    fi

    {
        printf '\n# >>> dotfiles >>>\n'
        printf '%s\n' "$source_line"
        printf '# <<< dotfiles <<<\n'
    } >> "$zshrc"
    printf 'update: added zsh_stuff source to %s\n' "$zshrc"
}

main() {
    local os_name
    os_name=$(detect_os)

    printf 'dotfiles: %s\n' "$DOTFILES_DIR"
    printf 'detected: %s\n\n' "$os_name"

    case "$os_name" in
        macos|linux|wsl)
            ensure_zsh_source
            link_file "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"
            if [ "$os_name" = "macos" ]; then
                link_macos_configs
            else
                link_linux_configs
            fi
            print_missing zsh tmux lazygit starship zoxide atuin nvim pnpm gh rg eza bat jq fzf
            ;;
        windows)
            ensure_zsh_source
            link_windows_configs
            print_missing git gh lazygit starship zoxide nvim rg eza bat jq fzf
            ;;
        *)
            ensure_zsh_source
            print_missing zsh git gh
            ;;
    esac

    print_package_hint "$os_name"
}

main "$@"
