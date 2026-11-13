import { Component } from "react";

const MOVE = { duration: 340, easing: "cubic-bezier(0.32, 0.72, 0, 1)" };
const MAX_ROWS = 200;

// Where each [data-flip-key] element is drawn right now, in the scroll container's content
// coordinates. getBoundingClientRect includes running transforms, so a row caught mid-glide is
// measured where it is on screen, and its next glide starts from there instead of jumping.
function measure(container) {
  const box = container.getBoundingClientRect();
  const positions = new Map();
  for (const el of container.querySelectorAll("[data-flip-key]")) {
    const rect = el.getBoundingClientRect();
    positions.set(el.dataset.flipKey, { top: rect.top - box.top + container.scrollTop, left: rect.left - box.left });
  }
  return positions;
}

function play(container, before) {
  const elements = [...container.querySelectorAll("[data-flip-key]")];
  if (elements.length > MAX_ROWS) return;
  // Drop any glide still running so the new layout is measured without it
  for (const el of elements) el.getAnimations().forEach((animation) => animation.id === "flip" && animation.cancel());
  const after = measure(container);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const viewTop = container.scrollTop - 120;
  const viewBottom = container.scrollTop + container.clientHeight + 120;
  const onScreen = (position) => position && position.top > viewTop && position.top < viewBottom;

  for (const el of elements) {
    const from = before.get(el.dataset.flipKey);
    const to = after.get(el.dataset.flipKey);
    if (!onScreen(to) && !onScreen(from)) continue;
    let animation;
    if (!from) {
      animation = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduceMotion ? 150 : 220, delay: reduceMotion ? 0 : 60, easing: "ease-out", fill: "backwards" });
    } else if (!reduceMotion) {
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      animation = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], MOVE);
    }
    if (animation) animation.id = "flip";
  }
}

// FLIP for list rearrangements. When `flipKey` changes (a new sort or filter), rows that stay glide
// from their old spot to their new one and rows that weren't there fade in; with reduced motion they
// only fade in. A class component because getSnapshotBeforeUpdate is React's one hook into the DOM
// as it was just before an update is applied.
export default class FlipScope extends Component {
  getSnapshotBeforeUpdate(prevProps) {
    const container = this.props.containerRef.current;
    return prevProps.flipKey !== this.props.flipKey && container ? measure(container) : null;
  }

  componentDidUpdate(_prevProps, _prevState, before) {
    const container = this.props.containerRef.current;
    if (before && container) play(container, before);
  }

  render() {
    return this.props.children;
  }
}
