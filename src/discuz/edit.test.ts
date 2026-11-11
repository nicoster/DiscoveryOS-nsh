import { expect, test } from "nsh/test";
import { parseEditForm } from "./client";

// Markup as the edit page sends it (`post.php?action=edit`): the subject input, the message textarea
// and the hidden post time.
const editPage =
  '<input type="hidden" name="posttime" id="posttime" value="1794388134" />' +
  '<input name="subject" id="subject" prompt="post_subject"  class="txt" value="从 client 发的帖子" tabindex="1" />' +
  '<textarea class="autosave" name="message" id="e_textarea" prompt="post_message"  tabindex="1" class="txt" style="height:300px">' +
  "这里是正文, 咋样?\r\n[attachimg]6173402[/attachimg]\r\n1 &lt; 2 &amp;&amp; 3";

test("reads the subject, post time and text of an edit form", () => {
  expect(parseEditForm(editPage + "</textarea>")).toEqual({
    subject: "从 client 发的帖子",
    message: "这里是正文, 咋样?\n[attachimg]6173402[/attachimg]\n1 < 2 && 3",
    posttime: "1794388134",
  });
});

test("reads the upload box of the edit form, for pictures added while editing", () => {
  const withUpload =
    editPage +
    "</textarea>" +
    '<form name="imgattachform" id="imgattachform" method="post" action="misc.php?action=swfupload&amp;operation=upload&amp;simple=1&amp;type=image">' +
    '<input type="hidden" name="uid" value="205208"><input type="hidden" name="hash" value="8d6ff0330a1dc6bb4166c6d5286e4337"></form>';
  expect(parseEditForm(withUpload)?.upload).toEqual({ uid: "205208", hash: "8d6ff0330a1dc6bb4166c6d5286e4337" });
  expect(parseEditForm(editPage + "</textarea>")?.upload).toBe(undefined);
});

test("finds no edit form on a page without one", () => {
  expect(parseEditForm("<html>no such post</html>")).toBe(undefined);
});
