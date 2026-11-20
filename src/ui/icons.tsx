// Thin line icons drawn with a Canvas, in the muted text color of the theme: a star
// (outline, or filled when saved) and a speech bubble (outline).
import { Canvas, cleanup, createMotion, effect, Image, Path2D, signal, View } from "nsh";
import { palette } from "./appearance";
import refreshSvg from "./refresh.svg";
import sidebarSvg from "./sidebar.svg";
import searchSvg from "./search.svg";
import pencilSvg from "./pencil.svg";
import themeSystemSvg from "./theme-system.svg";
import themeLightSvg from "./theme-light.svg";
import themeDarkSvg from "./theme-dark.svg";
import downloadSvg from "./download.svg";
import type { AppearanceMode } from "./appearance";

// The Chrome logo (Simple Icons, CC0) and the link chain, as the paths of the SVGs they were drawn
// from (24 units square). They are drawn here, not loaded from files, so a hot update needs no new file.
const CHROME_PATH =
  "M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z";
const LINK_PATHS = [
  "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
  "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
];

// Drawn in code, not from an .svg file: a hot update cannot add image files to the app (see
// `runner/main.rs`), so icons that ship later must not depend on one.
const LINE = 1.25;

/** The open-in-browser icon: the Chrome logo, filled in the muted theme color. */
export function BrowserIcon(props: { size: number }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const s = size.width;
        cx.save();
        cx.scale(s / 24, s / 24);
        cx.fillStyle = palette().muted;
        cx.fill(new Path2D(CHROME_PATH));
        cx.restore();
      }}
    />
  );
}

/** The copy-link icon: two linked chain links drawn as thin lines in the muted theme color. */
export function LinkIcon(props: { size: number }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const s = size.width;
        cx.save();
        cx.scale(s / 24, s / 24);
        cx.strokeStyle = palette().muted;
        cx.lineWidth = 2;
        cx.lineCap = "round";
        cx.lineJoin = "round";
        for (const d of LINK_PATHS) cx.stroke(new Path2D(d));
        cx.restore();
      }}
    />
  );
}

/** The update button's icon, in `download.svg`: a blue disc with a white down arrow. */
export function DownloadIcon(props: { size: number }) {
  return <Image src={downloadSvg} style={{ width: props.size, height: props.size }} />;
}

/** The search icon, in `search.svg`: the same thin line as the refresh arrow. */
export function SearchIcon(props: { size: number }) {
  return <Image src={searchSvg} style={{ width: props.size, height: props.size }} />;
}

/** The theme's current setting: a half circle (system), a sun (light) or a moon (dark). */
export function ThemeIcon(props: { size: number; mode: () => AppearanceMode }) {
  // Components run once, so the picture switches inside JSX, not by an early return.
  return (
    <>
      {props.mode() === "system" ? <Image src={themeSystemSvg} style={{ width: props.size, height: props.size }} /> : null}
      {props.mode() === "light" ? <Image src={themeLightSvg} style={{ width: props.size, height: props.size }} /> : null}
      {props.mode() === "dark" ? <Image src={themeDarkSvg} style={{ width: props.size, height: props.size }} /> : null}
    </>
  );
}

/** The new-thread pencil, in `pencil.svg`: the same thin line as the refresh arrow. */
export function PencilIcon(props: { size: number }) {
  return <Image src={pencilSvg} style={{ width: props.size, height: props.size }} />;
}

/** The sidebar toggle: a panel with its left column, in `sidebar.svg`. */
export function SidebarIcon(props: { size: number }) {
  return <Image src={sidebarSvg} style={{ width: props.size, height: props.size }} />;
}

/** The menu button's icon: three horizontal lines, drawn in code so no font has to carry the
 * `☰` glyph and a hot update needs no new image file. */
export function MenuIcon(props: { size: number }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const w = size.width;
        cx.strokeStyle = palette().muted;
        cx.lineWidth = 1.5;
        cx.lineCap = "round";
        for (const y of [0.2, 0.5, 0.8]) {
          cx.beginPath();
          cx.moveTo(w * 0.12, w * y);
          cx.lineTo(w * 0.88, w * y);
          cx.stroke();
        }
      }}
    />
  );
}

/** A five-pointed star; `filled` paints it solid, otherwise it is an outline. */
export function StarIcon(props: { size: number; filled?: boolean }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const s = size.width;
        const mid = s / 2;
        const outer = s * 0.48;
        const inner = s * 0.2;
        cx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outer : inner;
          const angle = -Math.PI / 2 + (i * Math.PI) / 5;
          const x = mid + r * Math.cos(angle);
          const y = mid + r * Math.sin(angle);
          if (i === 0) cx.moveTo(x, y);
          else cx.lineTo(x, y);
        }
        cx.closePath();
        const color = palette().muted;
        if (props.filled) {
          cx.fillStyle = color;
          cx.fill();
        } else {
          cx.strokeStyle = color;
          cx.lineWidth = LINE;
          cx.lineJoin = "round";
          cx.stroke();
        }
      }}
    />
  );
}

/** A clockwise refresh arrow, drawn in `refresh.svg`; dimmed when `enabled` is false.
 * `spinning` turns it round and round while work is under way. When `spinning` ends, the
 * arrow finishes the turn it is in, then stops. Components run once, so the switch happens
 * inside JSX, not by an early return. */
export function RefreshIcon(props: { size: number; enabled?: boolean; spinning?: boolean }) {
  // Whether the arrow is still turning: set by `spinning`, cleared once a turn ends with it off.
  const turning = signal(!!props.spinning);
  effect(() => {
    if (props.spinning) turning.set(true);
  });
  return (
    <>
      {turning() ? (
        <SpinningRefresh size={props.size} spinning={() => !!props.spinning} onIdle={() => turning.set(false)} />
      ) : (
        <Image
          src={refreshSvg}
          style={{ width: props.size, height: props.size, opacity: props.enabled === false ? 0.4 : 1 }}
        />
      )}
    </>
  );
}

// The same glyph turning on its own, as Spotish's spinner does (a linear spin, 900 ms a turn).
// It plays one whole turn at a time, so stopping lands on a full turn: after each turn it
// checks `spinning` again, and calls `onIdle` once that is off. Still when the user asked
// for less motion (the motion then lands where it ends).
function SpinningRefresh(props: { size: number; spinning: () => boolean; onIdle: () => void }) {
  const motion = createMotion();
  let disposed = false;
  cleanup(() => {
    disposed = true;
    motion.stop();
  });
  (async () => {
    do {
      await motion.play("spin", { duration: 900, iterations: 1, easing: "linear" });
    } while (!disposed && props.spinning());
    if (!disposed) props.onIdle();
  })().catch(() => {
    if (!disposed) props.onIdle();
  });
  return (
    <View style={{ width: props.size, height: props.size, ...motion.style }}>
      <Image src={refreshSvg} style={{ width: props.size, height: props.size }} />
    </View>
  );
}

/** A speech bubble with a tail at its lower left, as an outline. */
/** A bin, drawn in the same thin line as the bubble: its lid with a handle, and its body. */
export function TrashIcon(props: { size: number }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const s = size.width;
        cx.beginPath();
        cx.moveTo(s * 0.16, s * 0.28);
        cx.lineTo(s * 0.84, s * 0.28);
        cx.moveTo(s * 0.4, s * 0.28);
        cx.lineTo(s * 0.4, s * 0.14);
        cx.lineTo(s * 0.6, s * 0.14);
        cx.lineTo(s * 0.6, s * 0.28);
        cx.moveTo(s * 0.26, s * 0.28);
        cx.lineTo(s * 0.3, s * 0.86);
        cx.lineTo(s * 0.7, s * 0.86);
        cx.lineTo(s * 0.74, s * 0.28);
        cx.strokeStyle = palette().muted;
        cx.lineWidth = LINE;
        cx.lineJoin = "round";
        cx.stroke();
      }}
    />
  );
}

export function BubbleIcon(props: { size: number }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const s = size.width;
        const left = s * 0.12;
        const right = s * 0.88;
        const top = s * 0.14;
        const bottom = s * 0.7;
        const r = s * 0.16;
        cx.beginPath();
        cx.moveTo(left + r, top);
        cx.lineTo(right - r, top);
        cx.quadraticCurveTo(right, top, right, top + r);
        cx.lineTo(right, bottom - r);
        cx.quadraticCurveTo(right, bottom, right - r, bottom);
        cx.lineTo(s * 0.42, bottom);
        cx.lineTo(s * 0.26, s * 0.88);
        cx.lineTo(s * 0.28, bottom);
        cx.lineTo(left + r, bottom);
        cx.quadraticCurveTo(left, bottom, left, bottom - r);
        cx.lineTo(left, top + r);
        cx.quadraticCurveTo(left, top, left + r, top);
        cx.closePath();
        cx.strokeStyle = palette().muted;
        cx.lineWidth = LINE;
        cx.lineJoin = "round";
        cx.stroke();
      }}
    />
  );
}

/** A smiling face as a thin outline: the ring, two eyes and a smile. */
export function SmileIcon(props: { size: number }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const s = size.width;
        cx.beginPath();
        cx.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
        cx.strokeStyle = palette().muted;
        cx.lineWidth = LINE;
        cx.stroke();
        cx.beginPath();
        cx.arc(s * 0.36, s * 0.42, s * 0.04, 0, Math.PI * 2);
        cx.arc(s * 0.64, s * 0.42, s * 0.04, 0, Math.PI * 2);
        cx.fillStyle = palette().muted;
        cx.fill();
        cx.beginPath();
        cx.arc(s / 2, s * 0.48, s * 0.2, Math.PI * 0.15, Math.PI * 0.85);
        cx.stroke();
      }}
    />
  );
}

// The closing quotation marks ("99") from the Svg Repo icon `quote-close-editor.svg`, a 64-unit
// glyph: its path, drawn filled in the muted theme color.
const QUOTE_PATH =
  "M36.806,51.968l0,-8.026c2.537,-0.14 4.458,-0.604 5.761,-1.391c1.304,-0.786 2.22,-2.063 2.749,-3.829c0.528,-1.766 0.793,-4.293 0.793,-7.581l-9.303,0l0,-19.147l19.081,0l0,18.203c0,7.519 -1.612,13.028 -4.836,16.525c-3.225,3.497 -7.973,5.246 -14.245,5.246Zm-28.806,0l0,-8.026c2.537,-0.14 4.457,-0.586 5.761,-1.338c1.304,-0.752 2.247,-2.029 2.828,-3.83c0.581,-1.801 0.872,-4.345 0.872,-7.633l-9.461,0l0,-19.147l19.186,0l0,18.203c0,7.519 -1.603,13.028 -4.809,16.525c-3.207,3.497 -7.999,5.246 -14.377,5.246Z";

/** The quote icon: two closing quotation marks, in the muted theme color. */
export function QuoteIcon(props: { size: number }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const s = size.width;
        cx.save();
        cx.scale(s / 64, s / 64);
        cx.fillStyle = palette().muted;
        cx.fill(new Path2D(QUOTE_PATH));
        cx.restore();
      }}
    />
  );
}

/** A paper plane as a thin outline; `enabled` reads true for the link blue, false for the muted one. */
export function PlaneIcon(props: { size: number; enabled: () => boolean }) {
  return (
    <Canvas
      // Disabled, the plane is faded further than its muted color alone.
      style={{ width: props.size, height: props.size, opacity: props.enabled() ? 1 : 0.4 }}
      draw={(cx, size) => {
        const s = size.width;
        cx.beginPath();
        cx.moveTo(s * 0.9, s * 0.1);
        cx.lineTo(s * 0.08, s * 0.46);
        cx.lineTo(s * 0.4, s * 0.6);
        cx.lineTo(s * 0.6, s * 0.92);
        cx.closePath();
        cx.moveTo(s * 0.4, s * 0.6);
        cx.lineTo(s * 0.9, s * 0.1);
        cx.strokeStyle = props.enabled() ? palette().link : palette().muted;
        cx.lineWidth = LINE;
        cx.lineJoin = "round";
        cx.stroke();
      }}
    />
  );
}
