import { expect, test } from "nsh/test";
import { discuzFontStyle, fixDiscuzMarkup } from "./parse";

test("a font's color and size, as the TextView shows them", () => {
  expect(discuzFontStyle({ color: "Red" })).toEqual({ color: "Red" });
  expect(discuzFontStyle({ color: "#999999", size: "2" })).toEqual({ color: "#999999", fontSize: 13 });
  expect(discuzFontStyle({ size: "9" })).toEqual({});
  expect(discuzFontStyle({ color: "red;background:url(x)" })).toEqual({});
});

test("[code] becomes a monospace block with each line kept and no blank lines", () => {
  const html =
    '<div class="blockcode"><div><em onclick="copycode(this)">复制代码</em></div><ol>' +
    "<li>\n-H &#39;Origin: https://www.4d4y.com&#39; \\\n</li>\n" +
    "<li>\n  &lt;tag&gt; &amp; x\n</li>\n" +
    "<li>\n</li>\n" +
    "</ol></div><p>after</p>";
  expect(fixDiscuzMarkup(html)).toBe("<pre><code>-H 'Origin: https://www.4d4y.com' \\\n  &lt;tag&gt; &amp; x\n</code></pre><p>after</p>");
});

test("a code block with unclosed items and a button label at its end", () => {
  const html = '<div class="blockcode"><ol><li>a<li>b</ol><em>复制代码</em></div>';
  expect(fixDiscuzMarkup(html)).toBe("<pre><code>a\nb</code></pre>");
});

test("a code block inside a quote keeps the quote's end", () => {
  const html = '<div class="quote"><blockquote><div class="blockcode"><ol><li>a</li></ol></div>tail</blockquote></div>';
  expect(fixDiscuzMarkup(html)).toBe('<div class="quote"><blockquote><pre><code>a</code></pre>tail</blockquote></div>');
});

test("links, pictures and fonts pass through", () => {
  const html = '<font color="Red">x</font><a href="https://x.test/">link</a><img src="https://x.test/a.jpg">';
  expect(fixDiscuzMarkup(html)).toBe(html);
});
