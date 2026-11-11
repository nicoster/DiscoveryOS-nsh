// Quotes in the reply box, as mail shows them: each quoted line starts with `> `, and the
// attribution line above them carries the floor's ids. The post sent to Discuz gets the
// forum's own `[quote]` BBCode, whose meta line links back to the floor. The box and the
// BBCode convert both ways, so a saved draft with a quote (or a quote read back from a
// post) is shown as `>` lines again.
import { htmlToText, type Reply } from "./parse";

/** The floor a quote comes from: who wrote it, when, and the post and thread ids. */
export type QuoteSource = { author: string; at: string; pid: string; ptid: string };

// `> 作者 发表于 时间 [pid:… ptid:…]`, without the `> ` (the attribution line of a quote).
const ATTRIBUTION = /^(.+?) 发表于 (.+?) \[pid:(\d+) ptid:(\d+)\]$/;
// A quoted line in the box.
const QUOTED_LINE = /^>/;
// A forum quote's meta line: the grey author and time, and the arrow that links to the floor
// (`[url=…findpost…][img]back.gif[/img][/url]`).
const META = /\[size=2\]\[color=#999999\](.+?) 发表于 (.+?)\[\/color\]\s*\[url=([^\]]+)\]\[img\][^[]*\[\/img\]\[\/url\]\[\/size\]/;
// The innermost `[quote]…[/quote]`: its content holds no quote tags, so nested quotes are
// taken one level at a time.
const QUOTE = /\[quote\]((?:(?!\[\/?quote\])[\s\S])*)\[\/quote\]/i;

/** A quote of `source` with `body` (plain text, one line each), as box text: no trailing newline. */
export function quoteInDraft(source: QuoteSource, body: string): string {
  const attribution = `> ${source.author} 发表于 ${source.at} [pid:${source.pid} ptid:${source.ptid}]`;
  return [attribution, ...body.split("\n").map(quotedLine)].join("\n");
}

/** A reply quoted into the box: its text (HTML as plain text) under the reply's attribution. */
export function replyQuoteInDraft(reply: Reply, ptid: string): string {
  return quoteInDraft({ author: reply.author.name, at: reply.at, pid: reply.id, ptid }, htmlToText(reply.body));
}

/** The box's text as the Discuz post: every run of `>` lines becomes a `[quote]`. */
export function draftToPost(text: string, host: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!QUOTED_LINE.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const block: string[] = [];
    while (i < lines.length && QUOTED_LINE.test(lines[i])) {
      block.push(lines[i].replace(/^> ?/, ""));
      i += 1;
    }
    out.push(quoteToPost(block, host));
  }
  return out.join("\n");
}

/** The post's quotes, as the box shows them: each `[quote]` becomes its `>` lines. */
export function postToDraft(text: string): string {
  let out = text;
  let match = QUOTE.exec(out);
  while (match) {
    out = out.slice(0, match.index) + quoteToDraft(match[1]) + out.slice(match.index + match[0].length);
    match = QUOTE.exec(out);
  }
  return out;
}

function quotedLine(line: string): string {
  return line === "" ? ">" : `> ${line}`;
}

// The block's lines, with one `>` taken off each. Its body is converted again, so nested
// quotes come out nested.
function quoteToPost(block: string[], host: string): string {
  const head = ATTRIBUTION.exec(block[0] ?? "");
  const body = draftToPost(head ? block.slice(1).join("\n") : block.join("\n"), host).replace(/^\n+|\n+$/g, "");
  if (!head) return `[quote]${body}[/quote]`;
  const [, author, at, pid, ptid] = head;
  const meta =
    `[size=2][color=#999999]${author} 发表于 ${at}[/color] ` +
    `[url=${host}redirect.php?goto=findpost&pid=${pid}&ptid=${ptid}][img]${host}images/common/back.gif[/img][/url][/size]`;
  return `[quote] ${body}\n${meta}[/quote]`;
}

// One quote's content, from a `[quote]`: its meta line (when it has one) becomes the
// attribution, and the rest its quoted lines.
function quoteToDraft(content: string): string {
  const meta = META.exec(content);
  const body = (meta ? content.replace(meta[0], "") : content).trim();
  const lines = body === "" ? [] : body.split("\n").map(quotedLine);
  const pid = meta ? /[?&]pid=(\d+)/.exec(meta[3])?.[1] : undefined;
  const ptid = meta ? /[?&]ptid=(\d+)/.exec(meta[3])?.[1] : undefined;
  if (!meta || !pid || !ptid) return lines.join("\n");
  const attribution = `> ${meta[1]} 发表于 ${meta[2]} [pid:${pid} ptid:${ptid}]`;
  return [attribution, ...lines].join("\n");
}
