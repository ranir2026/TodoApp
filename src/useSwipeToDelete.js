import { useRef, useState } from "react";
import { animateSpring, projectMomentum, rubberband } from "./spring";

const ACTION_WIDTH = 88;
const INTENT_THRESHOLD = 10;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// iOS-style swipe-left-to-delete for a list row. The surface tracks the finger 1:1 once a
// horizontal intent is clear (vertical drags are left to the page scroll), then springs to
// closed, open (revealing the Delete action), or all the way off on a long or fast swipe.
export function useSwipeToDelete(rowRef, onDelete) {
  const surfaceRef = useRef(null);
  const xRef = useRef(0);
  const cancelRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [open, setOpen] = useState(false);

  function setX(x) {
    xRef.current = x;
    if (surfaceRef.current) surfaceRef.current.style.transform = x ? `translateX(${x}px)` : "";
  }

  function springTo(target, velocity = 0, onComplete) {
    cancelRef.current?.();
    setOpen(target === -ACTION_WIDTH);
    if (prefersReducedMotion()) {
      setX(target);
      onComplete?.();
      return;
    }
    cancelRef.current = animateSpring({ from: xRef.current, to: target, velocity, damping: 1, response: 0.3, onUpdate: setX, onComplete });
  }

  function remove() {
    const width = rowRef.current?.offsetWidth ?? 400;
    springTo(-width, 0, onDelete);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelRef.current?.();
    suppressClickRef.current = false;
    dragRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, startOffset: xRef.current, tracking: false, samples: [] };
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.tracking) {
      if (Math.abs(dy) > INTENT_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      if (Math.abs(dx) < INTENT_THRESHOLD) return;
      drag.tracking = true;
      drag.startX = event.clientX;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const width = rowRef.current?.offsetWidth ?? 400;
    const raw = drag.startOffset + event.clientX - drag.startX;
    setX(raw > 0 ? rubberband(raw, width) : raw);
    drag.samples = [...drag.samples, { x: event.clientX, t: event.timeStamp }].slice(-5);
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.tracking) {
      // A tap on an open row closes it instead of opening the task
      if (drag && xRef.current !== 0) {
        suppressClickRef.current = true;
        springTo(0);
      }
      return;
    }
    const first = drag.samples[0];
    const last = drag.samples[drag.samples.length - 1];
    const elapsed = first && last ? (last.t - first.t) / 1000 : 0;
    const velocity = elapsed > 0 ? (last.x - first.x) / elapsed : 0;
    const width = rowRef.current?.offsetWidth ?? 400;
    const projected = xRef.current + projectMomentum(velocity, 0.99);
    if (projected < -width * 0.6) springTo(-width, velocity, onDelete);
    else if (projected < -ACTION_WIDTH / 2) springTo(-ACTION_WIDTH, velocity);
    else springTo(0, velocity);
  }

  function onClickCapture(event) {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    surfaceRef,
    open,
    remove,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture },
  };
}
