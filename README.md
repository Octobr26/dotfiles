# dotfiles

Personal shell and terminal setup.

## Includes

- `zsh_stuff`
- `.ignore`
- `.tmux.conf`
- `config/nvim`
- `config/atuin`
- `config/git/ignore`
- `config/ghostty/config.ghostty`
- `config/lazygit/config.yml`
- `scripts/tm`
- `install.sh`
- OS package hints under `os/`

## Install

```sh
git clone https://github.com/Octobr26/dotfiles.git ~/dev/dotfiles
cd ~/dev/dotfiles
./install.sh
```

The installer detects `macos`, `linux`, `wsl`, or `windows`.

- first, it runs `git pull --ff-only` in the dotfiles repo so setup uses the latest checkout when possible
- prints a before/after tool check with installed paths and versions
- installs packages automatically unless `DOTFILES_SKIP_PACKAGES=1` is set
- updates existing supported tools by default; set `DOTFILES_UPDATE_TOOLS=0` to only install missing Linux release/script tools
- macOS uses `brew bundle`
- Linux/WSL uses `apt-get`, `dnf`, or `yum`; this covers Amazon Linux on EC2 through `dnf`/`yum`
- Linux installs or updates Neovim from the official release archive under `~/.local/opt`, avoiding older distro packages
- Linux also installs or updates lazygit, starship, zoxide, and Atuin through upstream install scripts/releases when packages are not available
- pnpm, Codex, and Claude CLIs install/update through npm into `$HOME/.local`
- after package work, it reports any remaining Homebrew, Linux package-manager, or npm global updates it can see
- links `.ignore` to `~/.ignore`
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

## Current local links

```sh
~/.tmux.conf -> ~/dev/dotfiles/.tmux.conf
~/.ignore -> ~/dev/dotfiles/.ignore
~/.config/nvim -> ~/dev/dotfiles/config/nvim
~/.config/atuin -> ~/dev/dotfiles/config/atuin
~/.config/git/ignore -> ~/dev/dotfiles/config/git/ignore
~/Library/Application Support/com.mitchellh.ghostty/config.ghostty -> ~/dev/dotfiles/config/ghostty/config.ghostty
~/Library/Application Support/lazygit/config.yml -> ~/dev/dotfiles/config/lazygit/config.yml
```

## Not Synced

- lazygit `state.yml`, because it stores recent repos, PRs, and command history
- Atuin history database, keys, and session files
- GitHub auth and global `.gitconfig`

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
