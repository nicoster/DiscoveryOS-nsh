// Discuz pages are GB18030 and form bodies go back as GB18030 (`DiscuzAPI.swift`
// `urlencode(using: .gb_18030_2000)`). The codec is Rust (`src/codec.rs`).
import { Gb18030 } from "discoveryos/native";
import { fetchLogged } from "../net/traffic";

// The browser-like User-Agent the Swift app sends (`DiscuzAPI.dorequest`).
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15";

/** A GB18030 page as text, the `Set-Cookie` values it came with, and the URL it finally came from (after any redirect). */
export async function fetchGbRequest(
  method: "GET" | "POST",
  url: string,
  body?: string,
  cookie?: string,
): Promise<{ html: string; setCookies: string[]; url: string }> {
  const { response, bytes } = await fetchLogged(
    url,
    {
      method,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    },
    (b) => Gb18030.decode(b),
  );
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const html = Gb18030.decode(bytes);
  return { html, setCookies: response.headers.getSetCookie(), url: response.url };
}

/**
 * A GB18030 form POST that does not follow its redirect, so the answer's own status and `Location`
 * are read. A saved edit answers with a redirect to the thread. `opaque` is true when the runtime
 * hides the redirect (then the status and location are unknown).
 */
export async function postGbNoRedirect(
  url: string,
  body: string,
  cookie?: string,
): Promise<{ status: number; location: string | null; opaque: boolean; html: string; setCookies: string[] }> {
  const { response, bytes } = await fetchLogged(
    url,
    {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    },
    (b) => Gb18030.decode(b),
  );
  // The runtime's typings omit "opaqueredirect" from `Response.type`, so it is compared as a string.
  const opaque = (response.type as string) === "opaqueredirect";
  const html = opaque ? "" : Gb18030.decode(bytes);
  return { status: response.status, location: response.headers.get("location"), opaque, html, setCookies: response.headers.getSetCookie() };
}

/** A multipart POST (an attachment upload). Its reply is GB18030 text; the
 * `Content-Type` with the boundary is the platform's to set. */
export async function postFormGb(
  url: string,
  form: FormData,
  cookie?: string,
): Promise<{ text: string; setCookies: string[] }> {
  const { response, bytes } = await fetchLogged(
    url,
    {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, ...(cookie ? { Cookie: cookie } : {}) },
      body: form,
    },
    (b) => Gb18030.decode(b),
  );
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const text = Gb18030.decode(bytes);
  return { text, setCookies: response.headers.getSetCookie() };
}

/** A form value as `application/x-www-form-urlencoded` bytes in GB18030. */
export function formEncodeGb(value: string): string {
  let out = "";
  for (const byte of Gb18030.encode(value)) {
    const c = String.fromCharCode(byte);
    out += /[A-Za-z0-9*\-._]/.test(c) ? c : "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/** `DiscuzAPI.htmlEntities`: characters outside the CJK range become numeric
 * references, so the form body is plain ASCII where GB18030 would be ambiguous. */
export function htmlEntities(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += (code > 127 && code < 0x3000) || code > 0x9fff ? `&#${code};` : ch;
  }
  return out;
}

/** The text of a page's `<title>`. */
export function pageTitle(html: string): string | undefined {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
}
