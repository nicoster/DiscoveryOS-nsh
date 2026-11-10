import { expect, test } from "nsh/test";
import { applySetCookie, parseCookieText } from "./cookies";

test("parses a JSON object and a Cookie header", () => {
  expect([...parseCookieText('{"abc_auth":"xyz","abc_saltkey":"q1"}')]).toEqual([
    ["abc_auth", "xyz"],
    ["abc_saltkey", "q1"],
  ]);
  expect([...parseCookieText("abc_auth=xyz; abc_saltkey=q1")]).toEqual([
    ["abc_auth", "xyz"],
    ["abc_saltkey", "q1"],
  ]);
});

test("unusable text imports nothing", () => {
  expect(parseCookieText("{not json").size).toBe(0);
  expect(parseCookieText("just words").size).toBe(0);
  expect(parseCookieText("{\"a\":1}").size).toBe(0);
});

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

test("a pretty-printed JSON export, as the dialog receives it, imports every cookie", () => {
  const text = `{
  "cdb_visitedfid": "2D24D7D23",
  "cdb_oldtopics": "D3475952D3475778D3475961D3475565D3475178D3475921D3475357D3475782D3475871D3466883D3475902D3475813D3475578D3475966",
  "cdb_fid2": "1794314359",
  "cdb_sid": "Ru9g22"
}
`;
  expect(parseCookieText(text).size).toBe(4);
  expect(parseCookieText(text).get("cdb_sid")).toBe("Ru9g22");
});
