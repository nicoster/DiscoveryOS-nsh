import { Text } from "nsh";
import type { MarkdownExtension, TextViewCustomNode } from "nsh/base";
import { discuzFontStyle } from "../discuz/parse";

/** Discuz's `[color]` and `[size]` are `<font>` elements: each is read as a custom node of the TextView. */
export const DISCUZ_EXTENSIONS: MarkdownExtension[] = [{ name: "font", tag: "font" }];

/** Shows a `<font>` in its color and size; other nodes show their text. */
export function renderDiscuzNode(node: TextViewCustomNode) {
  return <Text style={node.name === "font" ? discuzFontStyle(node.attributes ?? {}) : undefined}>{node.text ?? ""}</Text>;
}
