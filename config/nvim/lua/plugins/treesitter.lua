return {
  {
    "nvim-treesitter/nvim-treesitter",
    init = function()
      if vim.fn.executable("zig") == 1 then
        vim.env.CC = "zig cc"
        vim.env.CXX = "zig c++"
        vim.env.AR = "zig ar"
      end
    end,
  },
}
