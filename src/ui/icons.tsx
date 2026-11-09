// Thin line icons drawn with a Canvas, in the muted text color of the theme: a star
// (outline, or filled when saved) and a speech bubble (outline).
import { Canvas, Image } from "nsh";
import { palette } from "./appearance";
import refreshSvg from "./refresh.svg";

const LINE = 1.25;

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

/** A clockwise refresh arrow, drawn in `refresh.svg`; dimmed when `enabled` is false. */
export function RefreshIcon(props: { size: number; enabled?: boolean }) {
  return (
    <Image
      src={refreshSvg}
      style={{ width: props.size, height: props.size, opacity: props.enabled === false ? 0.4 : 1 }}
    />
  );
}

/** A speech bubble with a tail at its lower left, as an outline. */
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

/** A paper plane as a thin outline; `enabled` reads true for the text color, false for the muted one. */
export function PlaneIcon(props: { size: number; enabled: () => boolean }) {
  return (
    <Canvas
      style={{ width: props.size, height: props.size }}
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
        cx.strokeStyle = props.enabled() ? palette().text : palette().muted;
        cx.lineWidth = LINE;
        cx.lineJoin = "round";
        cx.stroke();
      }}
    />
  );
}
