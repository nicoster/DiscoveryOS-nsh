// The secques page as Discuz 7.2 sends it: the form with `loginauth` is not the page's
// first form (password recovery comes ahead of it), and hidden values carry HTML entities.
import { expect, test } from "nsh/test";
import { loginMessage, parseSecquesForm } from "./securityQuestion";

const secques =
  '<div class="alert_info">您需要回答安全提问才能继续登录</div>' +
  '<form method="post" name="lostpasswd" action="member.php?action=lostpasswd">' +
  '<input type="hidden" name="formhash" value="decoy" /></form>' +
  '<form method="post" name="login" action="logging.php?action=login&amp;loginsubmit=yes">' +
  '<input type="hidden" name="formhash" value="abc123" />' +
  '<input type="hidden" name="loginauth" value="dXNlciZuYW1l&amp;ceA==" />' +
  '<input type="hidden" name="cookietime" value="2592000" />' +
  '<select name="questionid"><option value="1">母亲的名字</option></select>' +
  '<input type="text" name="answer" size="25" />' +
  '<button type="submit" name="loginsubmit" value="true">登录</button></form>';

test("the secques form is the one holding loginauth, not the page's first form", () => {
  expect(parseSecquesForm(secques)).toEqual([
    ["formhash", "abc123"],
    ["loginauth", "dXNlciZuYW1l&ceA=="],
    ["cookietime", "2592000"],
  ]);
});

test("a page without a loginauth form is not a secques page", () => {
  expect(parseSecquesForm("<html><form><input type=\"hidden\" name=\"formhash\" value=\"x\" /></form></html>")).toBe(undefined);
  expect(parseSecquesForm("<html></html>")).toBe(undefined);
});

test("only hidden inputs are taken; visible fields and inputs without a name are not", () => {
  const html =
    '<form><input type="hidden" name="loginauth" value="a" />' +
    '<input type="text" name="answer" value="b" /><input type="hidden" value="no-name" /></form>';
  expect(parseSecquesForm(html)).toEqual([["loginauth", "a"]]);
});

test("the forum's refusal is the alert box's text, without markup or scripts", () => {
  expect(loginMessage('<div class="alert_error">登录失败，您还可以尝试 4 次<script>redirect()</script></div>')).toBe(
    "登录失败，您还可以尝试 4 次",
  );
  expect(loginMessage('<div class="alert_info">请<b>稍后</b>再试&amp;重试</div>')).toBe("请稍后再试&重试");
});

test("a page without an alert box has no message", () => {
  expect(loginMessage("<html>nothing</html>")).toBe(undefined);
});
