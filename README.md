# dotfiles

Personal shell and terminal setup.

## Includes

- `.zshrc`
- `.zprofile`
- `.tmux.conf`
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

- macOS/Linux/WSL: links `.zshrc`, `.zprofile`, `.tmux.conf`
- Windows: links shell files when possible, skips tmux because native Windows does not match tmux/zsh behavior well
- Existing files are moved to `~/.dotfiles-backup/<timestamp>/`
- If symlinks are unavailable, the installer copies files instead

## Current local links

```sh
~/.zshrc -> ~/dev/dotfiles/.zshrc
~/.zprofile -> ~/dev/dotfiles/.zprofile
~/.tmux.conf -> ~/dev/dotfiles/.tmux.conf
```

## Packages

macOS:

```sh
brew bundle --file ~/dev/dotfiles/os/macos/Brewfile
```

Linux/WSL:

```sh
cat ~/dev/dotfiles/os/linux/apt-packages.txt
```

Windows:

```powershell
Get-Content ~/dev/dotfiles/os/windows/winget-packages.txt
```

For the closest Windows setup, install WSL and run `install.sh` inside WSL.
