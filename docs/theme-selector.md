# Shared terminal themes

Run `theme` for a searchable terminal picker with a color preview.
Use `j`/`k` or arrow keys to browse, and Enter to apply.
Press `/` to search (including names containing `j` or `k`); Escape clears the search and restores navigation.
Escape while browsing closes the picker without changing settings.
The current palette is marked with a check.
The catalog contains eight themes:

- Catppuccin Mocha and Latte
- Gruvbox Dark and Light
- Dracula
- Nord
- Solarized Dark and Light

Reopen Neovim once after installing the expanded catalog to load its additional theme plugins and dark/light refresh support.
Theme names and palettes are mapped to the installed Ghostty, Herdr, bat, and Neovim versions.
Light themes also select Claude's light base and readable Starship text on colored prompt segments.
Ghostty's window appearance follows the selected background, including when another config forces dark window chrome.

```sh
theme
theme apply catppuccin-mocha
theme apply gruvbox-dark --dry-run
theme status
theme doctor
theme undo
```

`undo` restores the previous shared theme, not the pre-install application settings.
The first apply retains its original file contents in the private local state directory for manual recovery.

## Herdr popup

The local Herdr configuration binds **Ctrl-a, then t** to this picker.
The scratch terminal is on **Ctrl-a, then u** so it cannot catch the theme shortcut.
It opens at 85% width and 75% height and returns to the existing pane when closed.
For another installation, add the following to Herdr's `config.toml`, using an unoccupied binding and a command resolvable in its PATH:

```toml
[[keys.command]]
key = "prefix+t"
type = "popup"
command = "exec theme"
description = "shared themes"
width = "85%"
height = "75%"
```

Validate with `herdr config check`, then use `herdr server reload-config` inside Herdr.
The picker also works directly in a terminal without Herdr.
It requires fzf and Python 3.11 or newer; the launcher handles macOS putting its older system Python first in PATH.

## First use and refresh

After setup, open a new shell, Neovim instance, and Claude session once so they load their integrations.
An existing zsh shell can instead source this repository's `zsh_stuff`.
Subsequent theme selections refresh at the following boundaries:

| App | Refresh behavior |
| --- | --- |
| Ghostty | Requests `reload_config` through Ghostty's AppleScript action API; Cmd+Shift+, is the fallback. |
| Herdr | The command requests config reload when run inside Herdr. |
| Neovim | Watches the generated theme file; focus and `:ThemeSync` provide fallback refresh. |
| Starship / bat | Read the selection at the next shell prompt. |
| Atuin | Uses the generated theme on the next search. |
| fzf / Lazygit | Use terminal palette colors after Ghostty reload; reopen a running UI if needed. |
| Spotify | Reopen the player popup; applying a theme does not restart the audio daemon. |
| Codex | Saves the syntax theme for new sessions. `/theme` updates syntax in a running session; full live theme reload is not supported. |
| Claude | Uses the `Terminal Theme` custom theme; after initial restart, custom-theme file changes are live. |

`status` and `doctor` report configuration readback, not proof that every running app has repainted.
macOS may request Automation access the first time the selector reloads Ghostty.
If access is denied or the action fails, the selector preserves the saved theme and prints the manual fallback.
Use `theme apply NAME --no-reload` to save configuration without calling either app's reload API.
Native app theme menus can create local overrides; reapplying the shared theme restores consistency.

Codex 0.154.0 caches terminal colors at process startup.
Changing the saved theme does not refresh the composer, shortcut labels, or other cached UI styling.
Full automatic synchronization remains unsupported in the standard CLI; the selector does not replace or wrap the `codex` command.
Restarting and resuming a conversation refreshes those colors, while `/theme` only updates syntax.
The implementation was checked against Herdr 0.8.2, Ghostty 1.3.1, Codex 0.154.0, and Claude Code 2.1.260.
The initial setup targets the existing local macOS configuration paths; it does not synchronize remote machines.

## Ownership and recovery

Theme definitions live in `config/themes/*.json`.
The controller maps native app themes and generates shared palettes, while keeping the current Starship prompt structure.
Ghostty has an optional generated include; Neovim and zsh have small reader hooks.
Atuin has a checked-in Gruvbox fallback for shells without the theme environment.
The selector preserves explicit Herdr tab/workspace styling and semantic agent-state tokens.

The selection and generated files live in `~/.config/terminal-theme/`.
Journals and initial backups live in `~/.local/state/terminal-theme/` with private file permissions.
These stay outside Git; existing application config symlinks are preserved.
The controller updates only theme fields in Herdr, Codex, Claude, and Spotify's local configs.
New Starship base-config edits are regenerated on the next shell prompt.
The Ghostty include uses the default `~/.config` location; adjust it if using a different `XDG_CONFIG_HOME`.

Before writing, the controller renders every output, parses TOML/JSON, checks the installed bat theme, and validates Herdr's staged config.
Writes are locked, journaled, and read back.
If interrupted, run `theme recover` before retrying.
Recovery restores original contents only when the file still matches this command's output; conflicting newer edits are preserved and reported.
Separate running apps cannot repaint atomically, so refresh failures are reported independently from saved configuration.

## References

- [Ghostty configuration](https://ghostty.org/docs/config)
- [Herdr configuration](https://herdr.dev/docs/configuration/)
- [Starship palettes](https://starship.rs/config/)
- [Atuin themes](https://docs.atuin.sh/main/configuration/config/)
- [Spotify themes](https://github.com/aome510/spotify-player/blob/master/docs/config.md)
- [Codex syntax theme configuration](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Codex 0.154.0 terminal-color cache](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/tui/src/terminal_palette.rs#L151-L193)
- [Resuming a Codex conversation](https://learn.chatgpt.com/docs/developer-commands#codex-resume)
- [Claude custom themes](https://code.claude.com/docs/en/terminal-config#match-the-color-theme)
- [Dracula for Neovim](https://github.com/Mofiqul/dracula.nvim)
- [Nord for Neovim](https://github.com/gbprod/nord.nvim)
- [Solarized for Neovim](https://github.com/maxmx03/solarized.nvim)
