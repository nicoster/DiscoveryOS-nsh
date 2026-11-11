import { expect, test } from "nsh/test";
import { draftToPost, postToDraft, quoteInDraft, replyQuoteInDraft } from "./quote";

const HOST = "https://www.4d4y.com/forum/";

test("a reply quoted into the box is `>` lines under an attribution with the floor's ids", () => {
  const reply = {
    id: "555",
    author: { id: "7", name: "Alice", avatar: "" },
    at: "2026-11-02 10:00",
    seq: 3,
    body: '<div class="postmessage">hi<br>there <b>you</b></div>',
  };
  expect(replyQuoteInDraft(reply, "9")).toBe("> Alice 发表于 2026-11-02 10:00 [pid:555 ptid:9]\n> hi\n> there you");
});

test("a quoted block is sent as the forum's quote, its arrow linking to the floor", () => {
  const draft = quoteInDraft({ author: "Alice", at: "2026-11-02 10:00", pid: "555", ptid: "9" }, "hi\nthere you") + "\n\nmy reply";
  expect(draftToPost(draft, HOST)).toBe(
    "[quote] hi\nthere you\n" +
      "[size=2][color=#999999]Alice 发表于 2026-11-02 10:00[/color] " +
      "[url=https://www.4d4y.com/forum/redirect.php?goto=findpost&pid=555&ptid=9][img]https://www.4d4y.com/forum/images/common/back.gif[/img][/url][/size][/quote]\n\n" +
      "my reply",
  );
});

test("a forum quote read back into the box is `>` lines again", () => {
  const post =
    "[quote] 其实就是一个测试.\n" +
    "[size=2][color=#999999]nicoster 发表于 2022-11-13 10:13[/color] " +
    "[url=https://www.4d4y.com/forum/redirect.php?goto=findpost&pid=65983916&ptid=3111528][img]https://www.4d4y.com/forum/images/common/back.gif[/img][/url][/size][/quote]\n" +
    "reply";
  expect(postToDraft(post)).toBe("> nicoster 发表于 2022-11-13 10:13 [pid:65983916 ptid:3111528]\n> 其实就是一个测试.\nreply");
});

test("a plain `>` block is a quote without an attribution, and reads back the same", () => {
  expect(draftToPost("> just a line\nreply", HOST)).toBe("[quote]just a line[/quote]\nreply");
  expect(postToDraft("[quote]just a line[/quote]\nreply")).toBe("> just a line\nreply");
});

test("nested quotes keep their levels both ways", () => {
  const draft = "> Bob 发表于 t [pid:2 ptid:9]\n> > Alice 发表于 t0 [pid:1 ptid:9]\n> > hi\n> reply-to-bob";
  expect(postToDraft(draftToPost(draft, HOST))).toBe(draft);
});
