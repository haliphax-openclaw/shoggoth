# builtin-show

Surface content blocks (images) to the user. Provide a source via `path`, `url`, or `base64`.

## Parameters

| Param       | Type   | Required | Notes                                                                                    |
| ----------- | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `type`      | string | yes      | Block type — currently only `"image"`                                                    |
| `path`      | string | no¹      | Workspace-relative file path                                                             |
| `url`       | string | no¹      | URL to fetch                                                                             |
| `base64`    | string | no¹      | Base64-encoded image data                                                                |
| `mediaType` | string | no²      | MIME type (e.g. `image/png`). Auto-detected from bytes when possible                     |
| `filename`  | string | no       | Display name for the image                                                               |
| `items`     | array  | no       | Array of `{ path?, url?, base64?, mediaType?, filename? }` objects for multi-image calls |

¹ At least one of `path`, `url`, or `base64` is required.
² Required when using `base64` input.

## Limits

- 10 MB total across all images in a single call.

## Examples

**Show a workspace image by path:**

```json
{ "type": "image", "path": "assets/diagram.png" }
```

**Show an image from a URL:**

```json
{ "type": "image", "url": "https://example.com/photo.jpg" }
```

**Show a base64-encoded image:**

```json
{ "type": "image", "base64": "iVBORw0KGgo...", "mediaType": "image/png" }
```

**Show multiple images at once:**

```json
{
  "type": "image",
  "items": [{ "path": "screenshots/before.png" }, { "path": "screenshots/after.png" }]
}
```
