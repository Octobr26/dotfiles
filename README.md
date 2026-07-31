# dotfiles

Personal shell and terminal setup.

## Includes

- `zsh_stuff`
- `AGENTS.md`
- `CLAUDE.md`
- `config/agents/AGENTS.md`
- `.ignore`
- `.tmux.conf`
- `config/nvim`
- `config/atuin`
- `config/git/ignore`
- `config/ghostty/config.ghostty`
- `config/lazygit/config.yml`
- `scripts/tm`
- `scripts/worktree-preview`
- `scripts/tm.local.example`
- `install.sh`
- `setup`
- `setup-luis`
- `docs/tm-shortcuts.md`
- OS package hints under `os/`

## AI Agent Notes

Repo `AGENTS.md` is the shared map for agents working inside this dotfiles checkout. `CLAUDE.md` exists only as Claude's repo entry point and points back to `AGENTS.md`, so repo guidance stays in one place.

`config/agents/AGENTS.md` is the global high-level agent instruction source for Luis' computer. The installer links it to `~/AGENTS.md`, then links `~/CLAUDE.md`, `~/.codex/AGENTS.md`, and `~/.claude/CLAUDE.md` back to `~/AGENTS.md`.

## Install

```sh
git clone https://github.com/Octobr26/dotfiles.git ~/dev/dotfiles
cd ~/dev/dotfiles
./setup
```

Use `./setup` for general/shared machines. Use `./setup-luis` for Luis' personal setup.

The installer detects `macos`, `linux`, `wsl`, or `windows`.

- first, it runs `git pull --ff-only` in the dotfiles repo so setup uses the latest checkout when possible
- prints a before/after tool check with installed paths and versions
- installs packages automatically unless `DOTFILES_SKIP_PACKAGES=1` is set
- `./setup` prompts before installing optional tools: Codex, Claude, and `spotify_player`
- `./setup-luis` installs those optional tools without prompting
- updates existing supported tools by default; set `DOTFILES_UPDATE_TOOLS=0` to only install missing Linux release/script tools
- macOS uses `brew bundle`
- Linux/WSL uses `apt-get`, `dnf`, or `yum`; this covers Amazon Linux on EC2 through `dnf`/`yum`
- Linux installs or updates Neovim from the official release archive under `~/.local/opt`, avoiding older distro packages
- Amazon Linux enables an EC2 compatibility path: it checks for low disk or inode headroom, cleans package caches and old journal entries when needed, installs current Rust/Cargo through `rustup`, installs a pinned Zig release into `~/.local/bin`, builds `tree-sitter-cli` locally into `~/.local/bin`, and points Mason's `tree-sitter` shim at that local binary to avoid glibc-mismatched prebuilt releases
- Amazon Linux also writes managed `~/.bashrc` and `~/.inputrc` blocks so default EC2 bash sessions see `~/.local/bin`, Up/Down history, Mac Delete/backspace, and forward-delete escape sequences
- Neovim config prefers Zig for Treesitter parser builds by setting `CC="zig cc"` and `CXX="zig c++"` when `zig` is available
- Linux installs or updates ripgrep (`rg`) and fd from official release archives when distro packages are missing or stale
- Linux also installs or updates lazygit, starship, zoxide, and Atuin through upstream install scripts/releases when packages are not available
- Mutagen installs through Homebrew on macOS or from its official release archive on Linux/WSL
- pnpm installs/updates through npm into `$HOME/.local`
- Codex and Claude CLIs install/update through npm into `$HOME/.local` only when selected
- `spotify_player` installs through Homebrew on macOS when available, or through Cargo on Linux/WSL
- pnpm defaults to `pnpm@10` to avoid `pnpm@11` requiring Node `>=22.13`; override with `DOTFILES_PNPM_SPEC=pnpm@latest`
- Rust installs through `rustup` on Linux so Amazon Linux does not use its older repo `rustc`; the default minimum is `1.74.1`, override with `DOTFILES_RUST_MIN_VERSION`
- `tree-sitter-cli` defaults to `0.22.6`; override with `DOTFILES_TREE_SITTER_CLI_VERSION` or `DOTFILES_TREE_SITTER_CLI_VERSIONS`
- Zig defaults to `0.13.0` for Amazon Linux compatibility; override with `DOTFILES_ZIG_VERSION`
- after package work, it reports any remaining Homebrew, Linux package-manager, or npm global updates it can see
- links `.ignore` to `~/.ignore`
- links global agent instructions through `~/AGENTS.md` for Codex and Claude entrypoints
- macOS/Linux/WSL: links `.tmux.conf`
- macOS: links Ghostty and lazygit from their `~/Library/Application Support/...` locations
- Linux/WSL: links Ghostty and lazygit under `~/.config/...`
- Windows: skips tmux because native Windows does not match tmux/zsh behavior well
- zsh setup is automatic: `install.sh` adds a managed block to `~/.zshrc`
- that block adds this repo's `scripts/` folder to PATH and sources `zsh_stuff`
- Existing files are moved to `~/.dotfiles-backup/<timestamp>/`
- If symlinks are unavailable, the installer copies files instead

## zsh

This repo does not own `~/.zshrc`. The installer adds this managed block:

```zsh
export PATH="/path/to/dotfiles/scripts:$PATH"
source "/path/to/dotfiles/zsh_stuff"
```

`zsh_stuff` also keeps `scripts/` and `$HOME/.local/bin` in PATH when sourced directly.

## tm Shortcuts

`scripts/tm` is public and generic. It supports `tm <path>` for any project directory, and it loads ignored private shortcuts from `scripts/tm.local` when that file exists.

To add machine-specific shortcuts without publishing repo names or paths:

```sh
cp scripts/tm.local.example scripts/tm.local
```

Then edit `scripts/tm.local`. See `docs/tm-shortcuts.md` for the shortcut contract and an AI prompt you can reuse on another machine.

## Current local links

```sh
~/.tmux.conf -> ~/dev/dotfiles/.tmux.conf
~/.ignore -> ~/dev/dotfiles/.ignore
~/AGENTS.md -> ~/dev/dotfiles/config/agents/AGENTS.md
~/CLAUDE.md -> ~/AGENTS.md
~/.codex/AGENTS.md -> ~/AGENTS.md
~/.claude/CLAUDE.md -> ~/AGENTS.md
~/.config/nvim -> ~/dev/dotfiles/config/nvim
~/.config/atuin -> ~/dev/dotfiles/config/atuin
~/.config/git/ignore -> ~/dev/dotfiles/config/git/ignore
~/Library/Application Support/com.mitchellh.ghostty/config.ghostty -> ~/dev/dotfiles/config/ghostty/config.ghostty
~/Library/Application Support/lazygit/config.yml -> ~/dev/dotfiles/config/lazygit/config.yml
```

## Not Synced

- lazygit `state.yml`, because it stores recent repos, PRs, and command history
- Atuin history database, keys, and session files
- spotify-player cache, logs, and auth credentials
- GitHub auth and global `.gitconfig`
- private tmux shortcuts in `scripts/tm.local`

## Packages

macOS:

```sh
brew bundle --file ~/dev/dotfiles/os/macos/Brewfile
```

Linux/WSL:

```sh
cat ~/dev/dotfiles/os/linux/apt-packages.txt
cat ~/dev/dotfiles/os/linux/dnf-packages.txt
```

Windows:

```powershell
Get-Content ~/dev/dotfiles/os/windows/winget-packages.txt
```

For the closest Windows setup, install WSL and run `install.sh` inside WSL.
