// `nsh test` runs this in a headless runner: its network answers nothing, so a
// sign-in there must fail with a message rather than sign in.
import { expect, open, test } from "nsh/test";

test("the forum shows without signing in, with no Favorites", async () => {
  const app = await open("./App.tsx");
  expect(app.texts()).toContain("Channels");
  expect(app.texts()).toContain("Threads");
  expect(app.texts()).not.toContain("Favorites");
});

test("the blank avatar opens the sign-in dialog, and Cancel closes it", async () => {
  const app = await open("./App.tsx");
  await app.press("label:Sign in");
  expect(app.texts()).toContain("Account");
  await app.press("text:Cancel");
  expect(app.texts()).not.toContain("Account");
});

test("a failed sign-in shows an error", async () => {
  const app = await open("./App.tsx");
  await app.press("label:Sign in");
  await app.type("Username", "someone");
  await app.type("Password", "secret");
  await app.press("text:Sign in");
  expect(app.texts().some((t) => t.startsWith("Sign-in failed"))).toBe(true);
});
