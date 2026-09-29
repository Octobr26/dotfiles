# Agent Map

This repo is personal shell and terminal setup. Keep changes narrow and preserve the existing workflow shape unless the user asks for a redesign.

## Agent Entry Points

- Codex reads `AGENTS.md` directly.
- Claude reads `CLAUDE.md`, which points back to this shared map.
- Keep this file useful for both agents: exact source files, workflow shortcuts, editing boundaries, and verification commands.
- If a tool-specific instruction is needed, put only the pointer or exception in that tool's entry file and keep shared repo context here.

## Source of Truth

- Shell startup: `zsh_stuff`
- worktree frontend preview: `worktree-preview` (installed from the Octobr26/worktree-preview repo)
- Herdr config: `config/herdr/config.toml`
- Ghostty config: `config/ghostty/config.ghostty`
- Global agent instructions: `config/agents/AGENTS.md`
- Universal agent workflows: `config/agents/workflows/README.md`
- Claude workflow subagents: `config/claude/agents/`
- Adapted cross-agent skills: `config/skills/README.md`
- Installer and symlink management: `install.sh`
- General entrypoint: `setup`
- Luis entrypoint: `setup-luis`
- Package lists: `os/`
- Repo overview: `README.md`

## Local Workflow

- `~/.zshrc` is not owned by this repo. `install.sh` adds a managed block that puts `scripts/` on `PATH` and sources `zsh_stuff`.
- `./setup` is the general setup and prompts for optional tools.
- `./setup-luis` installs Luis' optional tools without prompting.

## Editing Rules

- Read `README.md` before changing install behavior or supported platforms.
- Inspect `git status -sb` before editing. Do not stage unrelated user changes.
- For terminal behavior questions, identify the layer first: Ghostty, zsh, Herdr, or helper script.
- Prefer changing the actual source file in this repo over editing symlink targets elsewhere.
- For workflow, skill, or agent-instruction edits, read `config/agents/workflows/instruction-writing.md`.
- Do not add secrets, shell history databases, Atuin keys, GitHub auth, lazygit state, or global `.gitconfig`.

## Verification

- Always run `git diff --check` before finishing.
- When touching shell scripts, run `bash -n <script>`.
- When checking sync after push, use `git rev-list --left-right --count origin/main...main`.
