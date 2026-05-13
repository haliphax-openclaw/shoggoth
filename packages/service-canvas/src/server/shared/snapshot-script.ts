import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Script injected into canvas HTML to handle snapshot requests from the parent SPA.
 * Inlines dom-to-image-more so no CDN fetch is needed at runtime.
 * Listens for postMessage of type 'canvas-snapshot-request', captures the page,
 * and sends the result back via postMessage.
 */

let domToImageMin: string | undefined;

function getDomToImageMin(): string {
  if (domToImageMin !== undefined) return domToImageMin;
  try {
    // Try resolving from node_modules via require.resolve
    const modPath = require.resolve("dom-to-image-more/dist/dom-to-image-more.min.js");
    domToImageMin = readFileSync(modPath, "utf-8");
  } catch {
    // Fallback: resolve relative to this file
    const dir =
      typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
    domToImageMin = readFileSync(
      resolve(dir, "../../../node_modules/dom-to-image-more/dist/dom-to-image-more.min.js"),
      "utf-8",
    );
  }
  return domToImageMin;
}

const SNAPSHOT_HANDLER = `(function(){
window.addEventListener('message',function(e){
if(!e.data||e.data.type!=='canvas-snapshot-request')return;
var id=e.data.id||'';
function send(r){r.type='canvas-snapshot-result';r.id=id;window.parent.postMessage(r,'*')}
domtoimage.toPng(document.body)
.then(function(img){send({image:img})})
.catch(function(err){send({error:String(err)})});
});
})()`;

export function getSnapshotScript(): string {
  return `<script>${getDomToImageMin()}</script><script>${SNAPSHOT_HANDLER}</script>`;
}

/** @deprecated Use getSnapshotScript() for lazy loading */
export const SNAPSHOT_SCRIPT = new Proxy({} as { toString(): string }, {
  get(_target, prop) {
    if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
      return () => getSnapshotScript();
    }
    return (getSnapshotScript() as any)[prop];
  },
}) as unknown as string;

/**
 * Inject the snapshot script into a data:text/html URL.
 * Returns the original URL unchanged if it's not a data:text/html URL.
 */
export function injectSnapshotIntoDataUrl(url: string): string {
  if (!url.startsWith("data:text/html")) return url;

  const commaIdx = url.indexOf(",");
  if (commaIdx < 0) return url;

  const meta = url.slice(0, commaIdx);
  const isBase64 = meta.toLowerCase().includes(";base64");
  const encoded = url.slice(commaIdx + 1);

  let html: string;
  if (isBase64) {
    html = Buffer.from(encoded, "base64").toString("utf-8");
  } else {
    html = decodeURIComponent(encoded);
  }

  const script = getSnapshotScript();
  if (html.includes("</body>")) {
    html = html.replace("</body>", script + "</body>");
  } else if (html.includes("</html>")) {
    html = html.replace("</html>", script + "</html>");
  } else {
    html += script;
  }

  if (isBase64) {
    return meta + "," + Buffer.from(html, "utf-8").toString("base64");
  } else {
    return meta + "," + encodeURIComponent(html);
  }
}
