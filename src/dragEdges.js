// Edge auto-scroll while dragging: how far a point is into the zone along one edge of a scroller,
// from 0 (outside the zone) to 1 (at the very edge), signed toward that edge (-1 start, +1 end).
// Callers scroll by speed × depth², so it starts gently and speeds up the deeper you go.
export const EDGE_ZONE = 48;

export function edgeDepth(position, start, end, zone = EDGE_ZONE) {
  if (position < start + zone) return -Math.min((start + zone - position) / zone, 1);
  if (position > end - zone) return Math.min((position - (end - zone)) / zone, 1);
  return 0;
}
