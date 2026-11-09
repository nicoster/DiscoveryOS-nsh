// Whether a scroll view is near its end: `onLoadMore` fires then, in place of a
// "Load more" button.
export function nearEnd(e: { offset: { y: number }; size: { height: number }; contentSize: { height: number } }): boolean {
  return e.offset.y + e.size.height >= e.contentSize.height - 300;
}
