# dotfiles

Personal shell and terminal setup.

## Includes

- `zsh_stuff`
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

- macOS/Linux/WSL: links `.tmux.conf`
- Windows: skips tmux because native Windows does not match tmux/zsh behavior well
- zsh setup is automatic: `install.sh` adds a `zsh_stuff` source line to `~/.zshrc`
- `zsh_stuff` adds this repo's `scripts/` folder to PATH
- Existing files are moved to `~/.dotfiles-backup/<timestamp>/`
- If symlinks are unavailable, the installer copies files instead

## zsh

This repo does not own `~/.zshrc`. The installer adds this source line:

```zsh
source "/path/to/dotfiles/zsh_stuff"
```

`zsh_stuff` then adds:

```zsh
/path/to/dotfiles/scripts
```

to PATH.

## Current local links

```sh
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
