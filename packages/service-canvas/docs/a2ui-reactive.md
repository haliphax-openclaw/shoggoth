# A2UI Reactive System

The A2UI (Agent-to-User Interface) reactive system enables agents to push live, updating UI components to connected canvas clients. Components re-render automatically when new data arrives.

## How It Works

1. Agent calls `canvas.a2ui.push` with a session and payload
2. The Gateway broadcasts the payload to all WebSocket clients subscribed to that session
3. The canvas SPA matches the payload's `component` field to a registered catalog component
4. The component renders with the provided data
5. Subsequent pushes to the same component update it in place

## Push Flow

```
Agent Tool Call                WebSocket Gateway              Canvas SPA
     │                              │                            │
     │  canvas.a2ui.push            │                            │
     │  { session, payload }        │                            │
     │─────────────────────────────>│                            │
     │                              │  a2ui.push message         │
     │                              │───────────────────────────>│
     │                              │                            │  render component
     │                              │                            │
```

## Payload Format

```json
{
  "component": "chart",
  "data": {
    "type": "bar",
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "values": [100, 150, 120, 180]
  }
}
```

The `component` field identifies which catalog component handles rendering. The `data` field is passed directly to the component's render function.

## Session Scoping

A2UI state is scoped per session. Each session maintains its own component state independently. The composite key is `surfaceId + sessionUrn`.

## Reset

Calling `canvas.a2ui.reset` clears all accumulated A2UI state for a session, removing all rendered components from the client.

## JSONL Mode

`canvas.a2ui.pushJSONL` is functionally identical to `canvas.a2ui.push`. It exists as a semantic alias for workflows that produce JSONL-formatted output streams.
