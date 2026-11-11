// One Escape binding for the whole app. Each screen or control that wants Escape registers a
// handler; the newest one runs first and returns true when it used the key. A binding per
// screen would not work: the keymap runs only the newest binding of a keystroke, whether or not
// its handler used the key.
import { keymap } from "nsh";

const handlers: (() => boolean)[] = [];

keymap.bind("escape", () => {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return;
  }
});

/** Registers an Escape handler, newest first. It returns true when it used the key. Returns the function that removes it. */
export function onEscape(handler: () => boolean): () => void {
  handlers.push(handler);
  return () => {
    const at = handlers.indexOf(handler);
    if (at >= 0) handlers.splice(at, 1);
  };
}
