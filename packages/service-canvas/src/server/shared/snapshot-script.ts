import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Script injected into canvas HTML to handle snapshot requests from the parent SPA.
 * Inlines dom-to-image-more so no CDN fetch is needed at runtime.
 * Listens for postMessage of type 'canvas-snapshot-request', captures the page,
 * and sends the result back via postMessage.
 */

// Use createRequire for proper node_modules resolution in ESM (handles hoisting).
const esmRequire = createRequire(fileURLToPath(import.meta.url));

// Read the minified dom-to-image-more library at module load time.
// This will throw if the dependency is not installed — that's intentional.
const domToImageMin = readFileSync(
  esmRequire.resolve("dom-to-image-more/dist/dom-to-image-more.min.js"),
  "utf-8",
);

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

export const SNAPSHOT_SCRIPT = `<script>${domToImageMin}</script><script>${SNAPSHOT_HANDLER}</script>`;

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

  if (html.includes("</body>")) {
    html = html.replace("</body>", SNAPSHOT_SCRIPT + "</body>");
  } else if (html.includes("</html>")) {
    html = html.replace("</html>", SNAPSHOT_SCRIPT + "</html>");
  } else {
    html += SNAPSHOT_SCRIPT;
  }

  if (isBase64) {
    return meta + "," + Buffer.from(html, "utf-8").toString("base64");
  } else {
    return meta + "," + encodeURIComponent(html);
  }
}
