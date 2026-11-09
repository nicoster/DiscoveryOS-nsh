// The icon at the start of a channel's row, hardcoded by the channel's title as
// the forum shows it. A channel not in the map gets the fallback icon.
const ICONS = new Map<string, string>([
  ["Buy & Sell 交易服务区", "🏷️"],
  ["Geek Talks · 奇客怪谈", "🤓"],
  ["Smartphone", "📱"],
  ["iPhone, iPod Touch，iPad", "🍎"],
  ["Android, Chrome, & Google", "🤖"],
  ["PalmOS ，Treo", "🖐️"],
  ["麦客爱苹果", "🍏"],
  ["Windows Mobile，PocketPC，HPC", "🪟"],
  ["DC,NB,MP3,Gadgets...", "🎧"],
  ["Discovery", "🔭"],
  ["意欲蔓延", "💭"],
  ["随笔与个人文集", "✏️"],
  ["吃喝玩乐", "🍜"],
  ["La Femme", "💄"],
]);

const FALLBACK = "💬";

/** The icon of a channel, by its title. */
export function channelIcon(title: string): string {
  return ICONS.get(title) ?? FALLBACK;
}
