import { expect, test } from "nsh/test";
import { attachedIds, isLoginRequired, parseAttachIds, parseFormHash, parsePageSize, parseReplyBox, replyOutcome } from "./client";

// Markup as the Discuz pages send it (`DiscuzAPI.swift` regexes).
const signedIn = '<div><a href="logging.php?action=logout&amp;formhash=abc123">退出</a></div>';
const signedOut = '<select name="loginfield" id="loginfield"><option>username</option></select>';

test("reads the form hash from the logout link", () => {
  expect(parseFormHash(signedIn)).toBe("abc123");
});

test("finds no form hash on a signed-out page", () => {
  expect(parseFormHash("<html>login failed</html>")).toBe(undefined);
});

test("detects a page that asks for login", () => {
  expect(isLoginRequired(signedOut)).toBe(true);
  expect(isLoginRequired(signedIn)).toBe(false);
});

test("reads the posts-per-page setting", () => {
  expect(parsePageSize('<input name="pppnew" value="30" checked="checked">')).toBe(30);
  expect(parsePageSize('<input name="pppnew" value="0" checked="checked">')).toBe(undefined);
  expect(parsePageSize("<html></html>")).toBe(undefined);
});

test("reads the reply box's upload form and post time", () => {
  const page =
    '<input type="hidden" name="posttime" id="posttime" value="1794145112" />' +
    '<form name="imgattachform" id="imgattachform" method="post" action="misc.php?action=swfupload&amp;operation=upload&amp;simple=1&amp;type=image">' +
    '<input type="hidden" name="uid" value="205208"><input type="hidden" name="hash" value="8d6ff0330a1dc6bb4166c6d5286e4337">' +
    '<input type="file" name="Filedata" /></form>';
  expect(parseReplyBox(page)).toEqual({ uid: "205208", hash: "8d6ff0330a1dc6bb4166c6d5286e4337", posttime: "1794145112" });
  expect(parseReplyBox("<html></html>")).toBe(undefined);
});

test("reads the unused image ids from the attachment list", () => {
  const list = `<td class="attachname_swf"><a href="javascript:;" onclick="insertAttachimgTag('6172795')">x.png</a>
    <a href="javascript:;" onclick="insertAttachimgTag('6172801')">y.png</a>`;
  expect(parseAttachIds(list)).toEqual(["6172795", "6172801"]);
  expect(parseAttachIds("<tbody></tbody>")).toEqual([]);
});

test("finds the ids of files too, as [attach] tags", () => {
  expect(attachedIds("[attach]6172810[/attach] and [attachimg]6172795[/attachimg]")).toEqual(["6172810", "6172795"]);
});

test("finds the attachimg ids a reply inserts, once each", () => {
  expect(attachedIds("有意思...[attachimg]6172795[/attachimg]\n[attachimg]6172795[/attachimg][attachimg]6172801[/attachimg]")).toEqual([
    "6172795",
    "6172801",
  ]);
  expect(attachedIds("plain text [img]x[/img]")).toEqual([]);
});

test("a confirmed reply is posted", () => {
  expect(replyOutcome("<script>非常感谢，您的回复已经发布，现在将转入主题页</script>")).toEqual({ posted: true });
});

test("the AJAX flood limit is a refusal with its message", () => {
  const html = "<root><![CDATA[对不起，您两次发表间隔少于 30 秒，请不要灌水！<script>if(typeof messagehandle_fastpost ==&#39;function&#39;) {messagehandle_fastpost('0', '对不起，您两次发表间隔少于 30 秒，请不要灌水！');}</script>]]></root>";
  expect(replyOutcome(html)).toEqual({ posted: false, reason: "对不起，您两次发表间隔少于 30 秒，请不要灌水！" });
});

test("a refused reply reports the page's own message", () => {
  const html = '<div class="postbox">您的回复过短</div>';
  expect(replyOutcome(html)).toEqual({ posted: false, reason: "您的回复过短" });
});

test("a refusal's box is shown as plain text, without its markup", () => {
  expect(replyOutcome('<div class="postbox"><b>您的回复过短</b><br/></div>')).toEqual({ posted: false, reason: "您的回复过短" });
});

test("a response that is neither a confirmation nor a refusal is unsure, not an error", () => {
  expect(replyOutcome("<root><![CDATA[]]></root>")).toEqual({ posted: "unsure" });
});
