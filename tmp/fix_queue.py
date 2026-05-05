#!/usr/bin/env python3
"""Script to fix the queue label issue in platform.ts"""

import re

# Read the file
with open("packages/platform-discord/src/platform.ts", "r") as f:
    content = f.read()

# Find and replace the enqueue call for user messages
# Original: .enqueue(msg.sessionId, "user", "user message", async () => {
# New: Create a label with the message content and use it

old_pattern = r'\.enqueue\(msg\.sessionId, "user", "user message", async \(\) => \{'
new_code = '''    // Create a label with truncated message content for display in queue
    const maxLabelLength = 100;
    const userMessageLabel = userContent.length > maxLabelLength
      ? userContent.slice(0, maxLabelLength) + "..."
      : userContent;
    
    void turnQueue
      .enqueue(msg.sessionId, "user", userMessageLabel, async () => {'''

# Replace the pattern
new_content = re.sub(old_pattern, new_code, content)

# Write back
with open("packages/platform-discord/src/platform.ts", "w") as f:
    f.write(new_content)

print("File updated successfully")
