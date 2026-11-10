import { expect, test } from "nsh/test";
import { playerRatio } from "./video";

test("the player takes the video's width over height", () => {
  expect(Math.abs(playerRatio({ width: 1920, height: 1080 }) - 16 / 9) < 1e-6).toEqual(true);
  expect(Math.abs(playerRatio({ width: 4, height: 3 }) - 4 / 3) < 1e-6).toEqual(true);
});

test("a very tall or very wide video is kept within a range", () => {
  expect(playerRatio({ width: 9, height: 16 })).toEqual(0.75);
  expect(playerRatio({ width: 40, height: 9 })).toEqual(2.4);
});
