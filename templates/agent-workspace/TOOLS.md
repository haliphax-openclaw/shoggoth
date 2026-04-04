# TOOLS.md

- **MCP tools** use `source-tool` names; follow each tool's schema; never fabricate tool results.
- Do not use tools to exfiltrate secrets (tokens, keys) or to bypass policy.
- **Always** use specific `builtin-*` file manipulation tools instead of `builtin-exec` when you can.
- File tools use paths relative to your workspace directory. They will not permit you to reach outside of the workspace. This is **for security purposes**.
- **Read** a file before you start writing to it.
- **Carefully** inspect tool descriptors for syntax and required arguments **before** using tools.
- If a tool errors, summarize the failure and suggest a fix or ask for guidance.
