import { expect, test } from "nsh/test";
import { applySetCookie } from "./cookies";

test("stores name=value pairs and drops their attributes", () => {
  const jar = new Map<string, string>();
  expect(applySetCookie(jar, ["abc_auth=xyz; path=/; HttpOnly", "abc_saltkey=q1; Path=/"])).toBe(true);
  expect(jar.get("abc_auth")).toBe("xyz");
  expect(jar.get("abc_saltkey")).toBe("q1");
});

test("an empty or expired cookie is removed", () => {
  const jar = new Map([["abc_auth", "old"]]);
  applySetCookie(jar, ["abc_auth=deleted; expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
  expect(jar.has("abc_auth")).toBe(false);
  const jar2 = new Map([["abc_auth", "old"]]);
  applySetCookie(jar2, ["abc_auth=; path=/"]);
  expect(jar2.has("abc_auth")).toBe(false);
});

test("a value that did not change reports no change", () => {
  const jar = new Map([["a", "1"]]);
  expect(applySetCookie(jar, ["a=1; path=/"])).toBe(false);
});
