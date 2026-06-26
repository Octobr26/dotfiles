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

    if [ -e "$target" ] || [ -L "$target" ]; then
        mkdir -p "$BACKUP_DIR"
        mv "$target" "$BACKUP_DIR/"
        printf 'backup: %s -> %s/\n' "$target" "$BACKUP_DIR"
    fi

    if ln -s "$source" "$target" 2>/dev/null; then
        printf 'link: %s -> %s\n' "$target" "$source"
    else
        cp "$source" "$target"
        printf 'copy: %s -> %s (symlink unavailable)\n' "$source" "$target"
    fi
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

print_zsh_hint() {
    printf '\nManual zsh setup:\n'
    printf '  Add this line to ~/.zshrc:\n'
    printf '  source "$HOME/dev/dotfiles/zsh_stuff"\n'
}

main() {
    local os_name
    os_name=$(detect_os)

    printf 'dotfiles: %s\n' "$DOTFILES_DIR"
    printf 'detected: %s\n\n' "$os_name"

    case "$os_name" in
        macos|linux|wsl)
            link_file "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"
            print_missing zsh tmux lazygit starship zoxide atuin nvim pnpm gh rg
            ;;
        windows)
            print_missing git gh lazygit starship zoxide nvim
            ;;
        *)
            print_missing zsh git gh
            ;;
    esac

    print_zsh_hint
    print_package_hint "$os_name"
}

main "$@"
