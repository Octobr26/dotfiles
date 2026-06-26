bindkey -v
export KEYTIMEOUT=1
export PATH="$HOME/dev/dotfiles/scripts:$PATH"
alias lg='lazygit'

eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
eval "$(atuin init zsh)"

[[ "$TERM_PROGRAM" == "kiro" ]] && . "$(kiro --locate-shell-integration-path zsh)"
