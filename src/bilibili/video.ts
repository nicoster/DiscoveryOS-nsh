// The shape of a Bilibili video, from its public info (no sign-in needed), so
// the player can take the video's own aspect ratio. Any failure falls back to 16:9.

import { fetchLogged } from "../net/traffic";
import type { BiliVideoId } from "./links";

export type VideoShape = { width: number; height: number };

const FALLBACK: VideoShape = { width: 16, height: 9 };

const shapes = new Map<string, Promise<VideoShape>>();

/** The shape of a video by its BV id or av number. Cached per id. */
export function videoShape(video: BiliVideoId): Promise<VideoShape> {
  const query = "bvid" in video ? `bvid=${video.bvid}` : `aid=${video.aid}`;
  let shape = shapes.get(query);
  if (!shape) {
    shape = load(query);
    shapes.set(query, shape);
  }
  return shape;
}

async function load(query: string): Promise<VideoShape> {
  try {
    const { bytes } = await fetchLogged(`https://api.bilibili.com/x/web-interface/view?${query}`);
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const dimension = body?.data?.dimension;
    const width = Number(dimension?.width);
    const height = Number(dimension?.height);
    if (!(width > 0 && height > 0)) return FALLBACK;
    // `rotate` 1 means the picture is stored turned a quarter turn.
    return dimension.rotate === 1 ? { width: height, height: width } : { width, height };
  } catch {
    return FALLBACK;
  }
}

/** Width over height, kept within a range so a very tall or very wide video cannot fill the column. */
export function playerRatio(shape: VideoShape): number {
  return Math.min(Math.max(shape.width / shape.height, 0.75), 2.4);
}
