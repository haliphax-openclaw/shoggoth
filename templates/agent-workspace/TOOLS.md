# TOOLS.md

- **Always** use specific `builtin-*` file manipulation tools instead of `builtin-exec` when you can.
- File tools use paths relative to your workspace directory. They will not permit you to reach outside of the workspace. This is **for security purposes**.
- **Read** a file before you start writing to it.
- **Carefully** inspect tool descriptors for syntax and required arguments **before** using tools.
- If a tool throws an exception, summarize the failure and suggest a fix or ask for guidance.
