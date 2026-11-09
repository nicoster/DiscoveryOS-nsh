// The rule for sending a thread reply: its text, trimmed of leading and trailing spaces,
// must be longer than five characters. Pictures do not count toward it, so a reply of
// pictures alone is not sent. Characters are code points, so an emoji counts as one.
export const MIN_REPLY_CHARS = 5;

export function canSendReply(text: string): boolean {
  return [...text.trim()].length > MIN_REPLY_CHARS;
}
