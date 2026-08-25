local JARVIS_COLORS = {
  core = "#ebdbb2",
  glow = "#83a598",
  pulse = "#8ec07c",
}

local JARVIS_ORB = {
  {
    text = { { "·       ◦       ˚", hl = "JarvisDashboardParticle" } },
    align = "center",
    padding = { 0, 1 },
  },
  { text = { { "╭───────────╮", hl = "JarvisDashboardGlow" } }, align = "center" },
  { text = { { "╭───╯ ·       · ╰───╮", hl = "JarvisDashboardGlow" } }, align = "center" },
  { text = { { "╭──╯   ◦     ✦     ◦   ╰──╮", hl = "JarvisDashboardPulse" } }, align = "center" },
  {
    text = {
      { "│  ·      ", hl = "JarvisDashboardGlow" },
      { "J A R V I S", hl = "JarvisDashboardCore" },
      { "      ·  │", hl = "JarvisDashboardGlow" },
    },
    align = "center",
  },
  { text = { { "╰──╮   ◦     ✦     ◦   ╭──╯", hl = "JarvisDashboardPulse" } }, align = "center" },
  { text = { { "╰───╮ ·       · ╭───╯", hl = "JarvisDashboardGlow" } }, align = "center" },
  { text = { { "╰───────────╯", hl = "JarvisDashboardGlow" } }, align = "center" },
  {
    text = { { "˚       ·       ◦", hl = "JarvisDashboardParticle" } },
    align = "center",
    padding = 2,
  },
}

local function set_jarvis_highlights()
  vim.api.nvim_set_hl(0, "JarvisDashboardCore", { fg = JARVIS_COLORS.core, bold = true })
  vim.api.nvim_set_hl(0, "JarvisDashboardGlow", { fg = JARVIS_COLORS.glow })
  vim.api.nvim_set_hl(0, "JarvisDashboardParticle", { fg = JARVIS_COLORS.glow, bold = true })
  vim.api.nvim_set_hl(0, "JarvisDashboardPulse", { fg = JARVIS_COLORS.pulse, bold = true })
end

return {
  {
    "folke/snacks.nvim",
    init = function()
      local group = vim.api.nvim_create_augroup("jarvis_dashboard_highlights", { clear = true })
      vim.api.nvim_create_autocmd("ColorScheme", { group = group, callback = set_jarvis_highlights })
      set_jarvis_highlights()
    end,
    opts = function(_, opts)
      opts.dashboard = opts.dashboard or {}
      opts.dashboard.sections = vim.deepcopy(JARVIS_ORB)
      vim.list_extend(opts.dashboard.sections, {
        { section = "keys", gap = 1, padding = 1 },
        { section = "startup" },
      })
    end,
  },
}
