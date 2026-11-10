// Port of `DiscuzAPI.swift`'s session handling: login, the form hash, the
// page size, and the re-login when a page asks for it. Pages are GB18030.
import { formEncodeGb, fetchGbRequest, htmlEntities, postFormGb } from "./encoding";
import { absorbSetCookie, clearCookies, cookieHeader } from "./cookies";

export const HOST = "https://www.4d4y.com/forum/";

// `DiscuzAPI.loginRequired`: a page that shows the login form.
const LOGIN_REQUIRED = '<select name="loginfield" id="loginfield">';
// The logout link, which carries the form hash, is only there when signed in.
const LOGOUT_LINK = /<a href="logging\.php\?action=logout&amp;formhash=([^"]+)">退出<\/a>/;
// Discuz's confirmation, and the box it shows when it refuses a post.
const REPLY_OK = "非常感谢，您的回复已经发布，现在将转入主题页";
const POSTBOX = /<div class="postbox">([\s\S]*?)<\/div>/;
// The AJAX refusal: `messagehandle_fastpost('<code>', '<message>')`; the message is the second argument.
const AJAX_REFUSAL = /messagehandle_fastpost\('[^']*', '([^']*)'\)/;
const PAGE_SIZE = /name="pppnew" value="(\d+)" checked="checked"/;

export type Session = { name: string; pass: string };

let session: Session | null = null;
let formHash: string | null = null;
export let pageSize = 50;

/** The form hash in a page, if it shows the logged-in header. */
export function parseFormHash(html: string): string | undefined {
  return LOGOUT_LINK.exec(html)?.[1];
}

/** The posts-per-page setting in the profile page, if present and positive. */
export function parsePageSize(html: string): number | undefined {
  const n = Number(PAGE_SIZE.exec(html)?.[1]);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function isLoginRequired(html: string): boolean {
  return html.includes(LOGIN_REQUIRED);
}

/** A GB18030 request. Re-logs in once if the page asks for it (`retry`). */
export async function request(
  method: "GET" | "POST",
  path: string,
  options: { query?: [string, string][]; form?: [string, string][]; retry?: boolean; cookie?: string } = {},
): Promise<string> {
  const { query, form, retry = true, cookie } = options;
  const qs = query?.map(([k, v]) => `${formEncodeGb(k)}=${formEncodeGb(v)}`).join("&");
  const url = HOST + path + (qs ? (path.includes("?") ? "&" : "?") + qs : "");
  const body = method === "POST" && form ? form.map(([k, v]) => `${formEncodeGb(k)}=${formEncodeGb(v)}`).join("&") : undefined;
  const headerCookie = [cookieHeader(), cookie].filter(Boolean).join("; ") || undefined;
  const { html, setCookies } = await fetchGbRequest(method, url, body, headerCookie);
  absorbSetCookie(setCookies);
  if (retry && isLoginRequired(html) && session) {
    const relogged = await reLogin(session.name, session.pass);
    if (relogged) return request(method, path, { query, form, retry: false, cookie });
  }
  return html;
}

async function dologin(name: string, pass: string): Promise<string | undefined> {
  const html = await request("POST", "logging.php?action=login&loginsubmit=yes", {
    form: [["username", name], ["password", pass], ["loginsubmit", "true"]],
    retry: false,
  });
  return parseFormHash(html);
}

// The login in progress, if any. Requests that find the login page while one runs
// share its answer, so a burst of loads logs in once rather than once each.
let loginInFlight: Promise<string | undefined> | null = null;

function reLogin(name: string, pass: string): Promise<string | undefined> {
  loginInFlight ??= dologin(name, pass).finally(() => {
    loginInFlight = null;
  });
  return loginInFlight;
}

async function loadConfig(): Promise<void> {
  const html = await request("GET", "memcp.php?action=profile&typeid=5");
  const n = parsePageSize(html);
  if (n) pageSize = n;
}

/** Logs in; on success keeps the credentials for re-login and loads the config. */
export async function login(name: string, pass: string): Promise<boolean> {
  const hash = await dologin(name, pass);
  if (!hash) {
    session = null;
    formHash = null;
    return false;
  }
  session = { name, pass };
  formHash = hash;
  await loadConfig();
  return true;
}

/** Logs out and forgets the session. (Cookies are the platform's; see the notes.) */
export async function logout(): Promise<void> {
  try {
    if (formHash) {
      await request("GET", `logging.php?action=logout&formhash=${formHash}`, { retry: false });
    }
  } finally {
    session = null;
    formHash = null;
    clearCookies();
  }
}

/**
 * Resumes a saved session at launch. With saved cookies, the index page's
 * logout link says whether they still work; otherwise (or when they expired)
 * the saved password signs in again. A network failure keeps everything saved:
 * only a refused password clears it.
 */
export async function restoreSession(saved: { name: string; pass: string } | null): Promise<"signed-in" | "signed-out" | "offline"> {
  try {
    const html = await request("GET", "index.php", { retry: false });
    const hash = parseFormHash(html);
    if (hash) {
      formHash = hash;
      session = saved;
      return "signed-in";
    }
  } catch {
    return "offline";
  }
  if (!saved) return "signed-out";
  try {
    return (await login(saved.name, saved.pass)) ? "signed-in" : "signed-out";
  } catch {
    return "offline";
  }
}

/** The upload form and post time of a reply page (`post.php?action=reply`). */
export type ReplyBox = { uid: string; hash: string; posttime: string };

/** Reads the reply box's upload form and post time; `undefined` when the page has none. */
export function parseReplyBox(html: string): ReplyBox | undefined {
  const form = /<form name="imgattachform"[\s\S]*?<\/form>/.exec(html)?.[0];
  if (!form) return undefined;
  const uid = /name="uid" value="(\d+)"/.exec(form)?.[1];
  const hash = /name="hash" value="([0-9a-f]+)"/.exec(form)?.[1];
  const posttime = /name="posttime" id="posttime" value="(\d+)"/.exec(html)?.[1];
  return uid && hash && posttime ? { uid, hash, posttime } : undefined;
}

/** The image attachments the reply box lists as unused: `insertAttachimgTag('id')` in its list. */
export function parseAttachIds(html: string): string[] {
  return [...html.matchAll(/insertAttachimgTag\('(\d+)'\)/g)].map((m) => m[1]);
}

/** The attachment ids a reply's text inserts (`[attachimg]id[/attachimg]` for a picture, `[attach]id[/attach]` for a file), once each. */
export function attachedIds(content: string): string[] {
  return [...new Set([...content.matchAll(/\[attach(?:img)?\](\d+)\[\/attach(?:img)?\]/g)].map((m) => m[1]))];
}

// `STATUSMSG` of Discuz's `post.js`: the upload's failure codes, in English.
const UPLOAD_ERRORS: Record<string, string> = {
  "-1": "server error",
  "1": "file type not allowed",
  "2": "file is empty",
  "3": "file is too large",
  "4": "file type not allowed",
  "5": "file is too large",
  "6": "attachments are too large in total",
  "7": "not a valid image",
  "8": "file could not be saved",
  "9": "no valid file was uploaded",
  "10": "not allowed",
};

// The post time of the reply box an upload started on, per thread. The reply
// sends it with the attachments so Discuz links them to the post.
const postTimes = new Map<string, string>();

// The post time of a new thread's box, per channel; a thread not yet posted has no thread id.
const newThreadKey = (fid: string) => `new:${fid}`;

// The reply box of a thread, or the new-thread box of a channel when there is no thread yet.
async function replyBox(fid: string, tid?: string): Promise<ReplyBox> {
  const url = tid ? `post.php?action=reply&fid=${fid}&tid=${tid}` : `post.php?action=newthread&fid=${fid}`;
  const box = parseReplyBox(await request("GET", url));
  if (!box) throw new Error("The reply box has no image upload");
  return box;
}

/** The unused image attachments of a post time, as the reply box lists them. */
async function unusedImages(posttime: string): Promise<string[]> {
  const html = await request("GET", "ajax.php?action=attachlist", {
    query: [["posttime", posttime], ["inajax", "1"], ["ajaxtarget", "attachlist"]],
  });
  return parseAttachIds(html);
}

/**
 * Uploads a picked image as the reply box's own upload does
 * (`misc.php?action=swfupload`), and resolves with its attachment id: the new
 * entry in the reply box's list. The reply then names it in `[attachimg]`.
 */
export async function uploadAttachment(fid: string, tid: string | undefined, file: File, kind: "image" | "file"): Promise<string> {
  if (!formHash) throw new Error("Not signed in");
  const box = await replyBox(fid, tid);
  postTimes.set(tid ?? newThreadKey(fid), box.posttime);
  const before = await unusedImages(box.posttime);
  const form = new FormData();
  form.append("uid", box.uid);
  form.append("hash", box.hash);
  form.append("Filedata", file, file.name);
  const { text, setCookies } = await postFormGb(
    HOST + `misc.php?action=swfupload&operation=upload&simple=1&type=${kind}`,
    form,
    cookieHeader(),
  );
  absorbSetCookie(setCookies);
  const [marker, code, aid] = text.split("|");
  if (marker !== "DISCUZUPLOAD" || code !== "0") {
    const reason = marker === "DISCUZUPLOAD" ? UPLOAD_ERRORS[code] ?? `code ${code}` : text.slice(0, 80);
    throw new Error(`Upload failed: ${reason}`);
  }
  // The upload's own reply names the attachment when it does; else the list shows it.
  if (aid && /^\d+$/.test(aid)) return aid;
  const after = await unusedImages(box.posttime);
  const added = after.filter((id) => !before.includes(id));
  if (added.length === 0) {
    throw new Error(`The uploaded image is not in the reply box (upload reply: ${text.slice(0, 60)}; list: ${after.length} ids)`);
  }
  // Ids grow with each upload, so the newest is the largest.
  return added.reduce((a, b) => (Number(b) > Number(a) ? b : a));
}

/** A reply the forum refused; its message is the forum's own words, shown to the user. */
export class ReplyRefused extends Error {}

/** Posts a reply to a thread (`DiscuzAPI.postReply`). Resolves on success;
 * rejects with the page's own message when Discuz refuses it. The image
 * attachments the text inserts (`[attachimg]`) go with it. */
export async function postReply(fid: string, tid: string, content: string): Promise<void> {
  if (!formHash) throw new Error("Not signed in");
  // The Swift app sends `\n` as CRLF and escapes characters outside the
  // CJK range as numeric references, then percent-encodes the GB18030 bytes.
  const message = htmlEntities(content.replace(/\n/g, "\r\n"));
  const ids = attachedIds(content);
  const extra: [string, string][] = [];
  if (ids.length > 0) {
    const posttime = postTimes.get(tid) ?? (await replyBox(fid, tid)).posttime;
    extra.push(["posttime", posttime]);
    for (const id of ids) extra.push([`attachnew[${id}][description]`, ""]);
  }
  const html = await request(
    "POST",
    `post.php?action=reply&fid=${fid}&tid=${tid}&extra=page%3D1&replysubmit=yes&infloat=yes&handlekey=fastpost&inajax=1`,
    {
      form: [["formhash", formHash], ["subject", ""], ["usesig", "0"], ["message", message], ...extra],
      cookie: "discuz_fastpostrefresh=0",
    },
  );
  const outcome = replyOutcome(html);
  if (outcome.posted === false) throw new ReplyRefused(outcome.reason);
}

/**
 * Reads the answer to a reply POST. Discuz confirms a post with `REPLY_OK`. It refuses one
 * either with its `postbox` box (the full page) or with the AJAX call
 * `messagehandle_fastpost('<code>', '<message>')`, e.g. the 30-second flood limit. A response
 * with neither is not a refusal, so the post is treated as made and the thread is refreshed
 * to show what the server holds.
 */
export function replyOutcome(html: string): { posted: true | "unsure" } | { posted: false; reason: string } {
  if (html.includes(REPLY_OK)) return { posted: true };
  const ajax = AJAX_REFUSAL.exec(html)?.[1];
  if (ajax) return { posted: false, reason: ajax };
  const refusal = POSTBOX.exec(html)?.[1];
  if (refusal) return { posted: false, reason: refusal.replace(/<[^>]*>/g, "").trim() };
  return { posted: "unsure" };
}

/** A new thread whose answer does not show it was posted. It is not retried, since it may be there already. */
export class ThreadUnconfirmed extends Error {}

/** The post time of the new-thread form (`post.php?action=newthread`), if the page has one. */
export function parseNewThreadPostTime(html: string): string | undefined {
  return /name="posttime" id="posttime" value="(\d+)"/.exec(html)?.[1];
}

/** The thread a URL names (`viewthread.php?tid=N`): where the forum sends the user once a new thread is posted. */
export function threadIdFromUrl(url: string): string | undefined {
  return /viewthread\.php\?tid=(\d+)/.exec(url)?.[1];
}

/**
 * Posts a new thread in `fid` (`post.php?action=newthread`), with the same form the site sends
 * from a browser. Resolves with the new thread's id, or `undefined` when the forum confirmed the
 * post without showing the thread. Rejects with `ReplyRefused` when the forum refuses it, and
 * with `ThreadUnconfirmed` when the answer shows neither.
 */
export async function postThread(fid: string, subject: string, content: string): Promise<string | undefined> {
  if (!formHash) throw new Error("Not signed in");
  if (!subject.trim()) throw new ReplyRefused("请填写标题。");
  // The form's post time is read first, as the reply box's is; the site checks it with the post.
  const formPage = await request("GET", `post.php?action=newthread&fid=${fid}`);
  if (isLoginRequired(formPage)) throw new ReplyRefused("请重新登录后再发帖。");
  const posttime = parseNewThreadPostTime(formPage);
  if (!posttime) throw new ReplyRefused("无法读取这个版块的发帖表单。");
  const fields: [string, string][] = [
    ["formhash", formHash],
    ["posttime", posttime],
    ["wysiwyg", "1"],
    ["iconid", ""],
    ["subject", htmlEntities(subject.trim())],
    ["message", htmlEntities(content.replace(/\n/g, "\r\n"))],
    ["tags", ""],
    ["usesig", "1"],
  ];
  // The pictures and files the text inserts go with the thread, linked by the post time their box
  // uploaded them under; the form's own post time is then that one.
  const ids = attachedIds(content);
  if (ids.length > 0) {
    const stamp = postTimes.get(newThreadKey(fid)) ?? posttime;
    fields.find(([k]) => k === "posttime")![1] = stamp;
    for (const id of ids) fields.push([`attachnew[${id}][description]`, ""]);
  }
  const body = fields.map(([k, v]) => `${formEncodeGb(k)}=${formEncodeGb(v)}`).join("&");
  const { html, setCookies, url } = await fetchGbRequest(
    "POST",
    `${HOST}post.php?action=newthread&fid=${fid}&extra=&topicsubmit=yes`,
    body,
    cookieHeader() || undefined,
  );
  absorbSetCookie(setCookies);
  // A successful post redirects to the new thread; the final URL (after the redirect) names it.
  const tid = threadIdFromUrl(url);
  if (tid) {
    postTimes.delete(newThreadKey(fid));
    return tid;
  }
  if (isLoginRequired(html)) throw new ReplyRefused("请重新登录后再发帖。");
  const outcome = replyOutcome(html);
  if (outcome.posted === false) throw new ReplyRefused(outcome.reason);
  if (outcome.posted === true) {
    postTimes.delete(newThreadKey(fid));
    return undefined;
  }
  throw new ThreadUnconfirmed("The forum did not confirm the new thread.");
}

export function currentUser(): string | null {
  return session?.name ?? null;
}

/** The form hash a POST needs (`DiscuzAPI.sharedFormHash`). */
export function currentFormHash(): string | null {
  return formHash;
}
