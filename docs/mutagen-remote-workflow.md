# Mutagen Remote Workflow

The scripts in this repository map a local Git working tree to a repository with the same directory name under a fixed remote project root.
They default to the SSH host `dev` and the remote root `/home/ec2-user/dev/projects`.

Configure different values before sourcing `zsh_stuff` when needed:

```zsh
export REMOTE_RUN_SSH_HOST=dev
export REMOTE_RUN_PROJECTS_DIR=/home/ec2-user/dev/projects
```

The SSH host must exist in `~/.ssh/config` and work without an interactive password prompt.

## Create a synchronization session

Clone the same repository locally and remotely, then check out the same commit on both machines.
From anywhere inside the local repository, run:

```zsh
msync
```

`msync` resolves Alpha from the current Git repository root and derives Beta from the repository directory name.
It creates a one-way-safe session so local Alpha changes propagate to remote Beta, while remote changes cannot overwrite the local repository.
It refuses to create a session unless:

- the current directory belongs to a Git repository;
- the matching remote path is itself a Git repository root;
- neither working tree contains modified, untracked, or ignored files;
- both repositories are on the same commit;
- neither the generated session name nor the local repository already belongs to another Mutagen session.

## Run remote commands

Run a command after flushing local changes to the remote endpoint:

```zsh
rfr pnpm test
```

Skip the explicit flush when the command does not depend on the latest local files:

```zsh
rr git status
```

Both commands resolve the local Git root and require a Mutagen session whose Alpha matches that root.
When called from a repository subdirectory, they run the remote command from the corresponding subdirectory.

## macOS installation

The macOS Brewfile installs Mutagen from its stable Homebrew formula.
Run the dotfiles setup, configure the same SSH host alias, and clone the repositories on both endpoints before calling `msync`.
