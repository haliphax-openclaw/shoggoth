declare module "mime-types" {
  export function lookup(filenameOrExt: string): string | false;
  export function contentType(filenameOrExt: string): string | false;
  export function extension(mimeType: string): string | false;
  export function charset(mimeType: string): string | false;
  export const types: Record<string, string>;
  export const extensions: Record<string, string[]>;
}
