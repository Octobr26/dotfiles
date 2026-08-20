# Agent Map

This repo is personal shell and terminal setup. Keep changes narrow and preserve the existing workflow shape unless the user asks for a redesign.

## Agent Entry Points

- Codex reads `AGENTS.md` directly.
- Claude reads `CLAUDE.md`, which points back to this shared map.
- Keep this file useful for both agents: exact source files, workflow shortcuts, editing boundaries, and verification commands.
- If a tool-specific instruction is needed, put only the pointer or exception in that tool's entry file and keep shared repo context here.

## Source of Truth

- Shell startup: `zsh_stuff`
- tmux config: `.tmux.conf`
- tmux project launcher: `scripts/tm`
- shared Codex/Claude tools: `scripts/sync-agent-tools`
- worktree frontend preview: `scripts/worktree-preview`
- tmux private shortcut example: `scripts/tm.local.example`
- tmux shortcut guide: `docs/tm-shortcuts.md`
- tmux AI status helper: `scripts/tmux-ai-window-status`
- Ghostty config: `config/ghostty/config.ghostty`
- Global agent instructions: `config/agents/AGENTS.md`
- Universal agent pipelines: `config/agents/pipelines/README.md`
- Claude pipeline subagents: `config/claude/agents/`
- Installer and symlink management: `install.sh`
- General entrypoint: `setup`
- Luis entrypoint: `setup-luis`
- Package lists: `os/`
- Repo overview: `README.md`

## Local Workflow

- `~/.zshrc` is not owned by this repo. `install.sh` adds a managed block that puts `scripts/` on `PATH` and sources `zsh_stuff`.
- `Ctrl-a` is the tmux prefix. Common bindings live in `.tmux.conf`.
- Generic `tm <path>` creates a project session from a directory path.
- Private `tm <shortcut>` entries live in ignored `scripts/tm.local`; keep real client names and private paths there.
- `./setup` is the general setup and prompts for optional tools.
- `./setup-luis` installs Luis' optional tools without prompting.

## Editing Rules

- Read `README.md` before changing install behavior or supported platforms.
- Inspect `git status -sb` before editing. Do not stage unrelated user changes.
- For terminal behavior questions, identify the layer first: Ghostty, zsh, tmux, or helper script.
- Prefer changing the actual source file in this repo over editing symlink targets elsewhere.
- Do not add secrets, shell history databases, Atuin keys, GitHub auth, lazygit state, or global `.gitconfig`.
- Keep private workflow shortcuts consistent with `scripts/tm.local.example` and document reusable patterns in `docs/tm-shortcuts.md`.

## Verification

- Always run `git diff --check` before finishing.
- When touching shell scripts, run `bash -n <script>`.
- When touching `scripts/tm` shortcut dispatch, run `bash tests/tm-local-shortcuts.sh`.
- When checking sync after push, use `git rev-list --left-right --count origin/main...main`.
