import { expect, test } from "nsh/test";
import { attachmentLinks, fixImages, isAttachmentUrl } from "./parse";
import { safeFileName, splitFileName } from "./attachments";

test("finds a post's file links by their text, and not a picture's link", () => {
  const html =
    '<div class="postmessage">这是一个文件<br>' +
    '<dl class="t_attachlist"><dt><img src="images/attachicons/zip.gif" alt="" />' +
    '<a href="attachment.php?aid=MTIz&amp;k=1" target="_blank">newton.md</a> (16.06 KB)</dt></dl>' +
    '<a href="attachment.php?aid=MTI0"><img src="attachments/d/a.jpg.thumb.jpg"></a></div>';
  expect(attachmentLinks(html)).toEqual([{ url: "attachment.php?aid=MTIz&k=1", name: "newton.md" }]);
});

test("reads Discuz X's attachment links too", () => {
  expect(attachmentLinks('<a href="forum.php?mod=attachment&amp;aid=9">report.pdf</a>')).toEqual([
    { url: "forum.php?mod=attachment&aid=9", name: "report.pdf" },
  ]);
});

test("accepts only the forum's own attachment downloads", () => {
  expect(isAttachmentUrl("https://www.4d4y.com/forum/attachment.php?aid=1")).toBe(true);
  expect(isAttachmentUrl("https://img02.4d4y.com/forum/forum.php?mod=attachment&aid=1")).toBe(true);
  expect(isAttachmentUrl("https://www.4d4y.com/forum/attachment.php?aid=1")).toBe(true);
  expect(isAttachmentUrl("attachment.php?aid=1")).toBe(true);
  expect(isAttachmentUrl("https://evil.example/attachment.php?aid=1")).toBe(false);
  expect(isAttachmentUrl("https://4d4y.com.evil.example/attachment.php?aid=1")).toBe(false);
  expect(isAttachmentUrl("javascript:attachment.php")).toBe(false);
  expect(isAttachmentUrl("https://www.4d4y.com/forum/viewthread.php?tid=1")).toBe(false);
});

test("keeps a hidden attachment menu out of the text, but a block with a file link", () => {
  const menu = '<div class="t_attach" style="display: none">\n<a href="x">下载</a>\n</div>\n</div>';
  expect(fixImages(`a${menu}b`)).toBe("ab");
  const visible = '<div class="t_attach"><a href="attachment.php?aid=1">newton.md</a></div></div>';
  expect(fixImages(`a${visible}`)).toBe(`a${visible}`);
});

test("names a saved file safely", () => {
  expect(safeFileName("newton.md")).toBe("newton.md");
  expect(safeFileName("../../.bashrc")).toBe("bashrc");
  expect(safeFileName("a/b\\c.zip")).toBe("c.zip");
  expect(safeFileName("bad:name?.txt")).toBe("badname.txt");
  expect(safeFileName("   ")).toBe("download");
  expect(safeFileName("x".repeat(300) + ".md").length).toBeLessThanOrEqual(180);
});

test("splits a name at its last dot", () => {
  expect(splitFileName("a.tar.gz")).toEqual({ stem: "a.tar", ext: ".gz" });
  expect(splitFileName("README")).toEqual({ stem: "README", ext: "" });
  expect(splitFileName(".gitignore")).toEqual({ stem: ".gitignore", ext: "" });
});
