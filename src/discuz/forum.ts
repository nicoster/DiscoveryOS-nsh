// The forum pages: the channel list and a channel's thread list.
import { request } from "./client";
import { parseBookmarks, parseChannels, parsePosts, parseReplies, parseUser, type Author, type Channel, type Post, type Reply } from "./parse";
import { formEncodeGb } from "./encoding";

export async function loadChannels(): Promise<Channel[]> {
  return parseChannels(await request("GET", "index.php"));
}

export async function loadPosts(fid: string, page = 1): Promise<Post[]> {
  return parsePosts(await request("GET", "forumdisplay.php", { query: [["fid", fid], ["page", String(page)]] }));
}

export async function loadReplies(tid: string, page = 1): Promise<Reply[]> {
  return parseReplies(await request("GET", "viewthread.php", { query: [["tid", tid], ["page", String(page)]] }));
}

export async function loadBookmarks(page = 1): Promise<Post[]> {
  return parseBookmarks(await request("GET", "my.php", { query: [["item", "favorites"], ["type", "thread"], ["page", String(page)]] }));
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
