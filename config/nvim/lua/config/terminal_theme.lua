local M = {}
local root = (vim.env.XDG_CONFIG_HOME or (vim.env.HOME .. "/.config")) .. "/terminal-theme/generated"
local watcher
local start_watcher

function M.selected()
  local ok, lines = pcall(vim.fn.readfile, root .. "/nvim.json")
  if ok then
    local decoded, state = pcall(vim.json.decode, table.concat(lines, "\n"))
    if decoded and type(state) == "table" and type(state.colorscheme) == "string"
      and state.colorscheme:match("^[%w_-]+$") then
      return state.colorscheme, state.background == "light" and "light" or "dark"
    end
  end
  return "gruvbox", "dark"
end

local function refresh()
  start_watcher()
  local name, background = M.selected()
  if vim.g.colors_name ~= name or vim.o.background ~= background then
    local ok, err = pcall(function()
      vim.o.background = background
      vim.cmd.colorscheme(name)
    end)
    if not ok then
      vim.notify("Shared theme: " .. tostring(err), vim.log.levels.WARN)
    end
  end
end

start_watcher = function()
  if watcher then
    return
  end
  watcher = vim.uv.new_fs_event()
  -- Watch the directory because the selector replaces files atomically.
  local ok = watcher:start(root, {}, vim.schedule_wrap(function(err, filename)
    if not err and filename == "nvim.json" then
      refresh()
    end
  end))
  if not ok then
    watcher:close()
    watcher = nil
  end
end

function M.setup()
  local group = vim.api.nvim_create_augroup("SharedTerminalTheme", { clear = true })
  vim.api.nvim_create_autocmd({ "FocusGained", "VimResume" }, { group = group, callback = refresh })
  vim.api.nvim_create_user_command("ThemeSync", refresh, { desc = "Apply the shared terminal theme", force = true })
  start_watcher()
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = group,
    callback = function()
      if watcher then
        watcher:stop()
        watcher:close()
        watcher = nil
      end
    end,
  })
end

return M
