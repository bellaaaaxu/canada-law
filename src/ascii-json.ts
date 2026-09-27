/**
 * JSON with every non-ASCII character \u-escaped. Windows consoles on legacy code pages (437 English, 936 Chinese)
 * garble raw UTF-8 when an agent captures a command's output; pure ASCII survives any code page (tested 2026-09-24).
 */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
