// The forum pages: the channel list and a channel's thread list.
import { currentFormHash, currentUser, request } from "./client";
import { parseBookmarks, parseChannels, parseMyReplies, parseMyThreads, parsePmConversation, parsePmUsers, parsePosts, parseReplies, parseSearchResults, parseThreadPageInfo, parseUser, type Author, type Channel, type PmMessage, type Post, type Reply } from "./parse";
import { formEncodeGb, htmlEntities } from "./encoding";
import { dbg } from "../debugConsole";

export async function loadChannels(): Promise<Channel[]> {
  return parseChannels(await request("GET", "index.php"));
}

export async function loadPosts(fid: string, page = 1): Promise<Post[]> {
  const html = await request("GET", "forumdisplay.php", { query: [["fid", fid], ["page", String(page)]] });
  const posts = parsePosts(html);
  dbg("threads response", { fid, page, bytes: html.length, count: posts.length, ids: posts.map((p) => p.id) });
  return posts;
}

/**
 * The threads whose titles contain `keyword`, in every channel (`search.php`,
 * newest reply first). The site answers signed-out searches with a notice, not
 * a list, so that is reported as a sign-in error. The site returns one page.
 */
export async function searchThreads(keyword: string): Promise<Post[]> {
  const html = await request("GET", "search.php", {
    query: [
      ["srchtype", "title"],
      ["srchtxt", keyword],
      ["searchsubmit", "true"],
      ["st", "on"],
      ["srchuname", ""],
      ["srchfilter", "all"],
      ["srchfrom", "0"],
      ["before", ""],
      ["orderby", "lastpost"],
      ["ascdesc", "desc"],
    ],
  });
  if (html.includes("您还未登录")) throw new Error(currentUser() ? "Search needs a fresh sign-in" : "Sign in to search");
  const posts = parseSearchResults(html);
  dbg("search response", { keyword, bytes: html.length, count: posts.length });
  return posts;
}

/** A thread page's replies, with the thread's title and forum when the page names them. */
export async function loadReplyPage(tid: string, page = 1): Promise<{ title?: string; fid?: string; replies: Reply[] }> {
  const html = await request("GET", "viewthread.php", { query: [["tid", tid], ["page", String(page)]] });
  return { ...parseThreadPageInfo(html), replies: parseReplies(html) };
}

export async function loadReplies(tid: string, page = 1): Promise<Reply[]> {
  return (await loadReplyPage(tid, page)).replies;
}

export async function loadBookmarks(page = 1): Promise<Post[]> {
  return parseBookmarks(await request("GET", "my.php", { query: [["item", "favorites"], ["type", "thread"], ["page", String(page)]] }));
}

/** The threads the signed-in user started, newest first (`my.php?item=threads`). */
export async function loadMyThreads(page = 1): Promise<Post[]> {
  return parseMyThreads(await request("GET", "my.php", { query: [["item", "threads"], ["page", String(page)]] }));
}

/** The threads the signed-in user replied to, newest reply first (`my.php?item=posts`). */
export async function loadMyReplies(page = 1): Promise<Post[]> {
  return parseMyReplies(await request("GET", "my.php", { query: [["item", "posts"], ["page", String(page)]] }));
}

/** The correspondents in the private messages, one row each (`pm.php?filter=privatepm`). */
export async function loadPmUsers(page = 1): Promise<Post[]> {
  return parsePmUsers(await request("GET", "pm.php", { query: [["filter", "privatepm"], ["page", String(page)]] }));
}

/** The messages with one correspondent, all of them (`pm.php?uid=N`). */
export async function loadPmConversation(uid: string): Promise<PmMessage[]> {
  return parsePmConversation(await request("GET", "pm.php", { query: [["uid", uid], ["filter", "privatepm"], ["daterange", "5"]] }));
}

/**
 * Sends a private message to `uid` (`pm.php?action=send`), as the conversation's reply box
 * does, then reads the conversation back. `lastDay` is the day of the latest message shown
 * (`2026-6-24`), which the page sends along. Rejects when the new message is not in the
 * conversation after sending.
 */
export async function sendPm(uid: string, lastDay: string, content: string): Promise<PmMessage[]> {
  const hash = currentFormHash();
  if (!hash) throw new Error("Not signed in");
  const message = htmlEntities(content.replace(/\n/g, "\r\n"));
  await request("POST", `pm.php?action=send&uid=${uid}&pmsubmit=yes&infloat=yes&inajax=1`, {
    form: [["formhash", hash], ["handlekey", "pmreply"], ["lastdaterange", lastDay], ["message", message]],
  });
  const list = await loadPmConversation(uid);
  const first = htmlEntities(content.split("\n")[0].trim()).slice(0, 12);
  if (first && !list.some((m) => m.body.includes(first))) throw new Error("The message was not sent");
  return list;
}

/** Adds a thread to the favorites (`DiscuzAPI.bookmarkPost`). */
export async function bookmarkPost(tid: string): Promise<boolean> {
  const text = await request("GET", "my.php", { query: [["item", "favorites"], ["tid", tid], ["inajax", "1"], ["ajaxtarget", "favorite_msg"]] });
  return text.includes("此主题已成功添加到收藏夹中");
}

/** Removes a thread from the favorites (the site's own "remove" request). */
export async function removeBookmark(tid: string): Promise<boolean> {
  const text = await request("GET", "my.php", {
    query: [["item", "favorites"], ["action", "remove"], ["tid", tid], ["inajax", "1"], ["ajaxtarget", "favorite_msg"]],
  });
  return text.includes("此主题已成功从您的收藏夹中移除");
}

/** The user's UID and avatar (`DiscuzAPI.loadUser`). */
export async function loadUser(name: string): Promise<Author | undefined> {
  const html = await request("GET", "space.php", { query: [["username", name]] });
  return parseUser(html, name);
}
