import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AddTodoForm from "./AddTodoForm";
import QuickAddModal from "./QuickAddModal";
import SegmentedControl from "./SegmentedControl";
import { animateSpring, projectMomentum, rubberband } from "./spring";

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MobileAddSheet({ open, courses, onAdd, onClose }) {
  const [mode, setMode] = useState("quick");
  const [mounted, setMounted] = useState(open);
  const sheetRef = useRef(null);
  const backdropRef = useRef(null);
  const yRef = useRef(0);
  const cancelRef = useRef(null);
  const dragRef = useRef(null);

  if (open && !mounted) setMounted(true);

  function setY(y) {
    yRef.current = y;
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transform = `translateY(${y}px)`;
    const progress = 1 - Math.min(Math.max(y, 0) / (sheet.offsetHeight || 1), 1);
    if (backdropRef.current) backdropRef.current.style.opacity = String(progress);
  }

  function springTo(target, velocity = 0, onComplete) {
    cancelRef.current?.();
    if (prefersReducedMotion()) {
      setY(target);
      onComplete?.();
      return;
    }
    // Bounce only when a flick carried momentum into the release
    const damping = Math.abs(velocity) > 300 && target === 0 ? 0.85 : 1;
    cancelRef.current = animateSpring({ from: yRef.current, to: target, velocity, damping, response: 0.35, onUpdate: setY, onComplete });
  }

  function dismiss(velocity = 0, after = onClose) {
    springTo(sheetRef.current?.offsetHeight ?? 600, velocity, () => {
      setMounted(false);
      after();
    });
  }

  // Enter: rise from below the screen
  useLayoutEffect(() => {
    if (!mounted || !sheetRef.current) return;
    setY(sheetRef.current.offsetHeight);
    springTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Closed from outside (e.g. after adding): animate out too
  useEffect(() => {
    if (!open && mounted) dismiss(0, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => cancelRef.current?.(), []);

  function onPointerDown(event) {
    if (event.target.closest("button, input, textarea, select")) return;
    cancelRef.current?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startPointer: event.clientY, startY: yRef.current, samples: [{ y: event.clientY, t: event.timeStamp }] };
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const raw = drag.startY + event.clientY - drag.startPointer;
    setY(raw < 0 ? rubberband(raw, sheetRef.current.offsetHeight) : raw);
    drag.samples = [...drag.samples, { y: event.clientY, t: event.timeStamp }].slice(-5);
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const first = drag.samples[0];
    const lastSample = drag.samples[drag.samples.length - 1];
    const elapsed = (lastSample.t - first.t) / 1000;
    const velocity = elapsed > 0 ? (lastSample.y - first.y) / elapsed : 0;
    const projected = yRef.current + projectMomentum(velocity);
    if (projected > sheetRef.current.offsetHeight * 0.5) dismiss(velocity);
    else springTo(0, velocity);
  }

  if (!mounted) return null;

  return (
    <>
      <div ref={backdropRef} className="mobile-sheet-backdrop" style={{ opacity: 0 }} onClick={() => dismiss()} />
      <section ref={sheetRef} className="mobile-add-sheet" aria-label="Add task or event" style={{ transform: "translateY(100%)" }}>
        <div className="mobile-sheet-grab" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="mobile-sheet-handle" />
          <div className="mb-4 flex items-center justify-between">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-todo-600">New item</p><h2 className="mt-1 text-lg font-bold text-slate-900">Add to your day</h2></div>
            <button type="button" onClick={() => dismiss()} className="mobile-icon-button mobile-hit" aria-label="Close add sheet">×</button>
          </div>
        </div>
        <SegmentedControl
          label="Add mode"
          className="mb-3 grid w-full"
          segmentClassName="px-2 py-1.5 text-[13px] normal-case"
          options={[{ id: "quick", label: "Quick syntax" }, { id: "manual", label: "Manual fields" }]}
          value={mode}
          onChange={setMode}
        />
        {mode === "quick" ? <div className="mobile-quick-add"><QuickAddModal open embedded courses={courses} onAdd={(item) => { onAdd(item); onClose(); }} onClose={onClose} /></div> : <AddTodoForm courses={courses} onAdd={(item) => { onAdd(item); onClose(); }} />}
      </section>
    </>
  );
}
