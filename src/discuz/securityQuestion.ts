// Discuz 7.2's second login stage. An account with a security question answers the first
// POST with the `login_secques` page: the form that carries the hidden `loginauth` token
// (the page has other forms, e.g. password recovery) must be posted back with the question
// and its answer. A refused login explains itself in `div.alert_error` / `div.alert_info`.
import { htmlDecode } from "./parse";

/** The security questions of the forum's login form (the `questionid` select), as the forum shows them; 0 is "no question". */
export const QUESTIONS: [string, string][] = [
  ["0", "无安全提问"],
  ["1", "母亲的名字"],
  ["2", "爷爷的名字"],
  ["3", "父亲出生的城市"],
  ["4", "您其中一位老师的名字"],
  ["5", "您个人计算机的型号"],
  ["6", "您最喜欢的餐馆名称"],
  ["7", "驾驶执照的最后四位数字"],
];

/**
 * The hidden fields of the secques form — `[name, value]` pairs, values HTML-decoded — or
 * `undefined` when the page is not a secques page. Only the form holding `loginauth` counts:
 * taking the page's first form instead would post the wrong one back.
 */
export function parseSecquesForm(html: string): [string, string][] | undefined {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (!/name="loginauth"/.test(form[0])) continue;
    const fields: [string, string][] = [];
    for (const tag of form[0].matchAll(/<input\b[^>]*>/g)) {
      if (!/type="hidden"/.test(tag[0])) continue;
      const name = /name="([^"]*)"/.exec(tag[0])?.[1];
      if (!name) continue;
      fields.push([name, htmlDecode(/value="([^"]*)"/.exec(tag[0])?.[1] ?? "")]);
    }
    return fields;
  }
  return undefined;
}

/** The forum's own refusal message (its alert boxes), stripped of markup; `undefined` when the page has none. */
export function loginMessage(html: string): string | undefined {
  const box = /<div class="alert_(?:error|info)">([\s\S]*?)<\/div>/.exec(html)?.[1];
  if (!box) return undefined;
  return htmlDecode(box.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "")).trim() || undefined;
}
