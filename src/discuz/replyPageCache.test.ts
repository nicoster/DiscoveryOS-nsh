import { expect, test } from "nsh/test";
import { threadPageKeys } from "./forum";

test("a thread's keys are all of its pages", () => {
  expect(threadPageKeys(["111:1", "111:3", "111:2"], "111")).toEqual(["111:1", "111:3", "111:2"]);
});

test("pages of other threads are not the thread's", () => {
  expect(threadPageKeys(["111:1", "222:9"], "111")).toEqual(["111:1"]);
  expect(threadPageKeys(["222:9"], "111")).toEqual([]);
});

test("a thread id is matched whole, not as a prefix", () => {
  expect(threadPageKeys(["1110:1", "111:1"], "111")).toEqual(["111:1"]);
});
