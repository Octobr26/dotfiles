local CORE_COLORS = {
  core = "#ebdbb2",
  glow = "#83a598",
  pulse = "#8ec07c",
}

local CORE_ART = {
  {
    text = { { "·     ░░▒▓████▓▒░░     ✦", hl = "CoreDashboardParticle" } },
    align = "center",
    padding = { 0, 1 },
  },
  { text = { { "░▒▓██▀▀      ▀▀██▓▒░", hl = "CoreDashboardGlow" } }, align = "center" },
  {
    text = { { "░▓██▀    ▄██████▄    ▀██▓░", hl = "CoreDashboardGlow" } },
    align = "center",
  },
  {
    text = { { "▒██▀    ▄██▀  ▀██▄    ▀██▒", hl = "CoreDashboardPulse" } },
    align = "center",
  },
  {
    text = { { "▓██     ██▀  ▄▄  ▀██     ██▓", hl = "CoreDashboardPulse" } },
    align = "center",
  },
  {
    text = {
      { "███     ██  ", hl = "CoreDashboardGlow" },
      { "████", hl = "CoreDashboardCore" },
      { "  ██     ███", hl = "CoreDashboardGlow" },
    },
    align = "center",
  },
  {
    text = { { "▓██     ██▄  ▀▀  ▄██     ██▓", hl = "CoreDashboardPulse" } },
    align = "center",
  },
  {
    text = { { "▒██▄    ▀██▄  ▄██▀    ▄██▒", hl = "CoreDashboardPulse" } },
    align = "center",
  },
  {
    text = { { "░▓██▄    ▀██████▀    ▄██▓░", hl = "CoreDashboardGlow" } },
    align = "center",
  },
  { text = { { "░▒▓██▄▄      ▄▄██▓▒░", hl = "CoreDashboardGlow" } }, align = "center" },
  {
    text = { { "✦     ░░▒▓████▓▒░░     ·", hl = "CoreDashboardParticle" } },
    align = "center",
  },
  {
    text = { { "W E L C O M E", hl = "CoreDashboardCore" } },
    align = "center",
    padding = { 2, 1 },
  },
}

local function set_core_highlights()
  vim.api.nvim_set_hl(0, "CoreDashboardCore", { fg = CORE_COLORS.core, bold = true })
  vim.api.nvim_set_hl(0, "CoreDashboardGlow", { fg = CORE_COLORS.glow })
  vim.api.nvim_set_hl(0, "CoreDashboardParticle", { fg = CORE_COLORS.glow, bold = true })
  vim.api.nvim_set_hl(0, "CoreDashboardPulse", { fg = CORE_COLORS.pulse, bold = true })
end

return {
  {
    "folke/snacks.nvim",
    init = function()
      local group = vim.api.nvim_create_augroup("core_dashboard_highlights", { clear = true })
      vim.api.nvim_create_autocmd("ColorScheme", { group = group, callback = set_core_highlights })
      set_core_highlights()
    end,
    opts = function(_, opts)
      opts.dashboard = opts.dashboard or {}
      opts.dashboard.sections = vim.deepcopy(CORE_ART)
      vim.list_extend(opts.dashboard.sections, {
        { section = "keys", gap = 1, padding = 1 },
        { section = "startup" },
      })
    end,
  },
}
