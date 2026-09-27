-- Use Ghostty's action API; no simulated keystrokes or focus changes.
on run
    if application "Ghostty" is not running then return "not-running"
    tell application "Ghostty"
        if (count of terminals) is 0 then return "no-terminal"
        set targetTerminal to first terminal
        if (perform action "reload_config" on targetTerminal) then return "reloaded"
        return "not-applied"
    end tell
end run
