import { expect, test } from "nsh/test";
import { MAX_XHS_PER_POST, xiaohongshuNoteLinks } from "./links";

const NOTE = "https://www.xiaohongshu.com/discovery/item/6aeac0a7000000001b01f89d?source=webshare&amp;xhsshare=pc_web&amp;xsec_token=AB_5cgp6Xmfq93aVYAPNG0_3MUSq_ax9GxvlhnHTq8Es4=&amp;xsec_source=pc_share";

test("finds note links and decodes the &amp; in them", () => {
  const html = `<a href="${NOTE}">note</a>`;
  expect(xiaohongshuNoteLinks(html)).toEqual([NOTE.replace(/&amp;/g, "&")]);
});

test("accepts the explore form and drops repeats", () => {
  const link = "https://www.xiaohongshu.com/explore/6aeac0a7000000001b01f89d";
  expect(xiaohongshuNoteLinks(`${link} and ${link}`)).toEqual([link]);
});

test("ignores other xiaohongshu pages and other sites", () => {
  expect(xiaohongshuNoteLinks('<a href="https://www.xiaohongshu.com/user/profile/abc">u</a>')).toEqual([]);
  expect(xiaohongshuNoteLinks("https://example.com/discovery/item/6aeac0a7000000001b01f89d")).toEqual([]);
});

test("shows at most a few cards per post", () => {
  const html = Array.from({ length: MAX_XHS_PER_POST + 2 }, (_, i) => `https://www.xiaohongshu.com/explore/6aeac0a70000000${String(i).padStart(9, "0")}`).join(" ");
  expect(xiaohongshuNoteLinks(html).length).toEqual(MAX_XHS_PER_POST);
});
