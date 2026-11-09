import { expect, test } from "nsh/test";
import { canSendReply } from "./replyGate";

test("a reply needs more than five characters once trimmed", () => {
  expect(canSendReply("abcde")).toBe(false);
  expect(canSendReply("abcdef")).toBe(true);
  expect(canSendReply("   abcde   ")).toBe(false);
  expect(canSendReply("   abcdef   ")).toBe(true);
});

test("characters are counted, not bytes, and an emoji is one", () => {
  expect(canSendReply("一二三四五")).toBe(false);
  expect(canSendReply("一二三四五六")).toBe(true);
  expect(canSendReply("😀😀😀😀😀")).toBe(false);
  expect(canSendReply("😀😀😀😀😀😀")).toBe(true);
});

test("a blank or empty reply is never sent", () => {
  expect(canSendReply("")).toBe(false);
  expect(canSendReply("      ")).toBe(false);
});
