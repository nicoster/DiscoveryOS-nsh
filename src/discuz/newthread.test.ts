import { expect, test } from "nsh/test";
import { parseNewThreadPostTime, threadIdFromUrl } from "./client";

test("reads the new-thread form's post time", () => {
  const page = '<input type="hidden" name="posttime" id="posttime" value="1794286395" />';
  expect(parseNewThreadPostTime(page)).toBe("1794286395");
  expect(parseNewThreadPostTime("<html></html>")).toBe(undefined);
});

test("reads the thread id from the page a post lands on", () => {
  expect(threadIdFromUrl("https://www.4d4y.com/forum/viewthread.php?tid=3475909&extra=")).toBe("3475909");
  expect(threadIdFromUrl("https://www.4d4y.com/forum/post.php?action=newthread&fid=23")).toBe(undefined);
});
