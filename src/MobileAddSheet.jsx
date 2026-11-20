import { useState } from "react";
import AddTodoForm from "./AddTodoForm";
import BottomSheet from "./BottomSheet";
import QuickAddModal from "./QuickAddModal";
import SegmentedControl from "./SegmentedControl";

// `initialText` opens it on quick syntax with an example typed in (from Getting started)
export default function MobileAddSheet({ open, courses, onAdd, onClose, initialText = "", onType, tip = null }) {
  const [mode, setMode] = useState("quick");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && initialText) setMode("quick");
  }

  return (
    <BottomSheet open={open} onClose={onClose} label="Add task or event" title="Add to your day">
      {() => (
        <>
          <SegmentedControl
            label="Add mode"
            className="mb-3 grid w-full"
            segmentClassName="px-2 py-1.5 text-[13px] normal-case"
            options={[{ id: "quick", label: "Quick syntax" }, { id: "manual", label: "Manual fields" }]}
            value={mode}
            onChange={setMode}
          />
          {mode === "quick" ? <div className="mobile-quick-add"><QuickAddModal open embedded initialText={initialText} courses={courses} onType={onType} tip={tip} onAdd={(item) => { onAdd(item); onClose(); }} onClose={onClose} /></div> : <AddTodoForm courses={courses} onAdd={(item) => { onAdd(item); onClose(); }} />}
        </>
      )}
    </BottomSheet>
  );
}
