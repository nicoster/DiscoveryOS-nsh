// The forum pages: the channel list and a channel's thread list.
import { currentUser, request } from "./client";
import { parseBookmarks, parseChannels, parseMyReplies, parseMyThreads, parsePosts, parseReplies, parseSearchResults, parseUser, type Author, type Channel, type Post, type Reply } from "./parse";
import { formEncodeGb } from "./encoding";
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

export async function loadReplies(tid: string, page = 1): Promise<Reply[]> {
  return parseReplies(await request("GET", "viewthread.php", { query: [["tid", tid], ["page", String(page)]] }));
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
