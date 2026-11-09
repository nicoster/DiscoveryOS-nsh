// The "loading more" indicator at the end of a list: the refresh arrow, turning while a page
// loads, the same glyph and spin as the refresh buttons. Mounted only while loading, so the
// turn stops at once when the page is in (unlike the refresh arrow, it does not finish its
// turn). Still when the user asked for less motion.
import { cleanup, createMotion, Image, View } from "nsh";
import refreshSvg from "./refresh.svg";

const SIZE = 16;

export function LoadingBar() {
  const motion = createMotion();
  void motion.play("spin", { duration: 900, iterations: "infinite", easing: "linear" });
  cleanup(() => motion.stop());
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: 16 }}>
      <View accessibilityLabel="Loading" style={{ width: SIZE, height: SIZE, ...motion.style }}>
        <Image src={refreshSvg} style={{ width: SIZE, height: SIZE }} />
      </View>
    </View>
  );
}
