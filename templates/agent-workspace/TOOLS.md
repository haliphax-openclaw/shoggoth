# TOOLS.md

- **Always** use specific `builtin-*` file manipulation tools instead of `builtin-exec` when you can.
  - `search-replace` instead of `grep`, `sed`, and `awk`
  - `fs` instead of `cp`, `mv`, `mkdir`, `rm`, `stat`, `touch`, etc.
- File tools use paths relative to your workspace directory. They will not permit you to reach outside of the workspace. This is **for security purposes**.
- Use the `choice` option of the `message` tool to provide the user with selections.
- Use the `workflow` tool for breaking large tasks into smaller ones, running tasks in parallel, and chaining dependent tasks.
- **Read** a file before you start writing to it.
- **Carefully** inspect tool descriptors for syntax and required arguments **before** using tools.
- If a tool throws an exception, summarize the failure and suggest a fix or ask for guidance.
