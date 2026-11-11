// Opens a link in the system browser: the fallback for every link the app shows that
// it does not open itself (a 4d4y thread opens in the column, an attachment downloads).
import { openUrl } from "nsh";
import { notify } from "./toast";

/** Opens `url` in the system browser. The app may only open https links, so http is upgraded. */
export async function openLink(url: string): Promise<void> {
  const target = url.replace(/^http:\/\//i, "https://");
  const opened = await openUrl(target).catch(() => false);
  if (!opened) notify("open-link", "No app opened the link.");
}
