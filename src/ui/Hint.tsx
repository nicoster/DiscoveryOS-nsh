// The hover hint of an icon button: its function, and its shortcut when it has one, e.g. "搜索帖子 (/)".
import { Text } from "nsh";
import { Tooltip } from "nsh/base";
import { palette } from "./appearance";

/** The tooltip element for a button's `tooltip` prop. The bubble is inverted against the theme's text color. */
export function hint(text: string) {
  return (
    <Tooltip style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: palette().text }}>
      <Text style={{ fontSize: 12, color: palette().surface }}>{text}</Text>
    </Tooltip>
  );
}
