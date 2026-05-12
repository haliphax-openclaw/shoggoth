# Creating A2UI Catalog Packages

A2UI (Agent-to-User Interface) catalogs define collections of UI components that agents can push to connected canvas clients. This guide explains how to create a new catalog package.

## Package Structure

```
packages/a2ui-catalog-mycatalog/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts          # Catalog definition and component exports
├── test/
│   └── catalog.test.ts   # Catalog registration tests
└── catalog.json          # Component metadata
```

## package.json

```json
{
  "name": "@shoggoth/a2ui-catalog-mycatalog",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@shoggoth/a2ui-sdk": "workspace:*"
  }
}
```

## catalog.json

Defines the components available in this catalog:

```json
{
  "name": "mycatalog",
  "version": "0.1.0",
  "components": [
    {
      "id": "my-widget",
      "name": "My Widget",
      "description": "A custom widget component",
      "category": "display"
    }
  ]
}
```

## Implementing Components

Each component is a function that receives A2UI payload data and returns rendered output for the canvas client:

```ts
import { defineComponent, type A2UIComponentDef } from "@shoggoth/a2ui-sdk";

export const myWidget: A2UIComponentDef = defineComponent({
  id: "my-widget",
  render(payload) {
    // Return HTML/JSON structure for the canvas SPA to render
    return {
      type: "html",
      content: `<div class="widget">${payload.title}</div>`,
    };
  },
});
```

## Registering the Catalog

Export a catalog registration function from `src/index.ts`:

```ts
import { defineCatalog } from "@shoggoth/a2ui-sdk";
import { myWidget } from "./components/my-widget";
import catalogMeta from "../catalog.json";

export default defineCatalog({
  ...catalogMeta,
  components: [myWidget],
});
```

## Using with the Canvas Plugin

Catalogs are automatically discovered when listed as dependencies of the canvas service or explicitly registered in config. Agents push data to components by name:

```json
{
  "session": "agent:dev:discord:channel:123",
  "payload": {
    "component": "my-widget",
    "data": { "title": "Hello from agent" }
  }
}
```

## Testing

```ts
import { describe, it, expect } from "vitest";
import catalog from "../src/index";

describe("mycatalog", () => {
  it("exports a valid catalog with components", () => {
    expect(catalog.name).toBe("mycatalog");
    expect(catalog.components.length).toBeGreaterThan(0);
  });

  it("each component has an id and render function", () => {
    for (const component of catalog.components) {
      expect(component.id).toBeDefined();
      expect(typeof component.render).toBe("function");
    }
  });
});
```

## Bundling All Catalogs

The `@shoggoth/a2ui-catalog-all` meta-package re-exports all official catalogs:

```ts
import basic from "@shoggoth/a2ui-catalog-basic";
import extended from "@shoggoth/a2ui-catalog-extended";

export default [basic, extended];
```

Add your catalog to this list to include it in the default bundle.
