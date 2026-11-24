/**
 * What to do with the stack between the two print runs, from three facts:
 * which edge of the sheet you flip on, whether the pages are landscape, and
 * which way round the sheets land in the output tray.
 *
 * Printers feed A4 short edge first however the page is laid out, so the
 * "top" below is always the leading short edge: the one that goes into the
 * printer first.
 */
export type FlipEdge = 'long' | 'short'
/** Which way the leading (top) edge of a printed sheet points when it lands in the output tray. */
export type ExitTop = 'you' | 'printer'

export interface DuplexPlan {
  /** The back pages must be turned 180° so they read the right way up after the flip. */
  rotateBacks: boolean
  /** Which edge of the sheet goes into the rear holder first, relative to the first time. */
  feed: 'same-edge' | 'opposite-edge'
  /**
   * After turning the stack over sideways (left to right, which keeps near and far where they
   * are), lift it into the rear holder with the edge that is furthest from you at the top or the
   * bottom.
   */
  farEdge: 'up' | 'down'
}

export function duplexPlan(options: { edge: FlipEdge; landscape: boolean; exitTop: ExitTop }): DuplexPlan {
  const { edge, landscape, exitTop } = options
  // For landscape pages the sheet is turned 90° on the paper, so what "long edge" means for the
  // reader is the other way round: back pages need turning for long-edge, not short-edge.
  const rotateBacks = (edge === 'short') !== landscape
  // Long edge: the top edge goes in first, as it did the first time. Short edge: the bottom edge does.
  const feed = edge === 'long' ? 'same-edge' : 'opposite-edge'
  // The edge that goes in first ends up at the bottom of the holder. Lying flat in the tray, is it
  // the near edge or the far edge? The top of the page is near when sheets land top-first towards you.
  const topIsNear = exitTop === 'you'
  const leadingIsNear = feed === 'same-edge' ? topIsNear : !topIsNear
  // The leading edge goes down, so the far edge is up when the leading edge is the near one.
  const farEdge = leadingIsNear ? 'up' : 'down'
  return { rotateBacks, feed, farEdge }
}
