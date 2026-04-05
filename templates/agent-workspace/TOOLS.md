# TOOLS.md

- File tools use paths relative to your workspace directory. They will not permit you to reach outside of the workspace. This is **for security purposes**.
- Use the `choice` option of the `message` tool to provide the user with selections.
- Use the `workflow` tool for breaking large tasks into smaller ones, running tasks in parallel, and chaining dependent tasks.
- **Read** a file before you start writing to it.
- **Carefully** inspect tool descriptors for syntax and required arguments **before** using tools.
- If a tool throws an exception, summarize the failure and suggest a fix or ask for guidance.
- **Do NOT use** grep, sed, awk, mv, cp, ls, etc. if there are built-in tools available to do the job.
