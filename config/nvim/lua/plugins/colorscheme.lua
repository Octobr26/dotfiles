return {
  {
    "ellisonleao/gruvbox.nvim",
    priority = 1000,
    opts = {
      contrast = "",
      terminal_colors = true,
    },
  },
  {
    "catppuccin/nvim",
    name = "catppuccin",
    priority = 1000,
  },
  {
    "Mofiqul/dracula.nvim",
    priority = 1000,
  },
  {
    "gbprod/nord.nvim",
    priority = 1000,
  },
  {
    "maxmx03/solarized.nvim",
    priority = 1000,
    opts = {},
  },
  {
    "LazyVim/LazyVim",
    opts = function(_, opts)
      local theme = require("config.terminal_theme")
      local name, background = theme.selected()
      vim.o.background = background
      opts.colorscheme = name
      theme.setup()
    end,
  },
}
