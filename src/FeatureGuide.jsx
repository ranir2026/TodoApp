import InfoDialog, { Keys } from "./InfoDialog";
import { featureGuide } from "./features";

// "What you can do": everything the app does, a line each, with where it lives. Rows that can be
// opened from here have a button that goes there. `onShowChecklist`, when given, brings Getting
// started back for someone who closed it.
export default function FeatureGuide({ open, mobile = false, flags, keymap, onOpen, onClose, onShowChecklist }) {
  const groups = featureGuide({ ...flags, desktop: !mobile });
  const footer = onShowChecklist && (
    <button
      type="button"
      onClick={onShowChecklist}
      className={mobile ? "min-h-11 w-full rounded-full bg-slate-100 px-4 text-[15px] font-semibold text-slate-700" : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"}
    >
      Show Getting started
    </button>
  );
  return (
    <InfoDialog
      open={open}
      mobile={mobile}
      title="What you can do"
      subtitle="Everything in Todo, and where to find it."
      onClose={onClose}
      footer={footer}
      width="max-w-3xl"
    >
      <div className={mobile ? "space-y-6" : "space-y-7"}>
        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`guide-${group.title}`}>
            <h3 id={`guide-${group.title}`} className={`mb-1 font-semibold text-slate-500 ${mobile ? "text-[13px]" : "text-xs"}`}>{group.title}</h3>
            <ul className="divide-y divide-slate-100">
              {group.items.map((item) => (
                <li key={item.id} className={mobile ? "py-3" : "grid grid-cols-[minmax(0,1fr)_13rem] items-start gap-6 py-3"}>
                  <div className="min-w-0">
                    <p className={`font-medium text-slate-800 ${mobile ? "text-[15px]" : "text-sm"}`}>{item.title}</p>
                    <p className={`mt-0.5 leading-snug text-slate-500 ${mobile ? "text-[13px]" : "text-xs"}`}>{item.detail}</p>
                  </div>
                  <div className={mobile ? "mt-1.5 flex items-center justify-between gap-3" : "flex flex-col items-end gap-1.5 pt-0.5 text-right"}>
                    <p className={`text-slate-500 ${mobile ? "text-[13px]" : "text-xs"}`}>
                      <span className="sr-only">Where: </span>{item.where}
                    </p>
                    <div className="flex items-center gap-2">
                      {item.keys && <Keys combo={keymap[item.keys]} />}
                      {item.open && (
                        <button
                          type="button"
                          onClick={() => onOpen(item.open)}
                          className={mobile ? "min-h-8 shrink-0 rounded-full bg-course-500/10 px-3 text-[13px] font-semibold text-course-700" : "-mr-2 rounded-full px-2 py-0.5 text-xs font-medium text-course-600 hover:bg-course-50 hover:text-course-700"}
                          aria-label={`Open ${item.title}`}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {mobile && <p className="text-[13px] leading-snug text-slate-500">On a computer you also get the day planner, projects, the Today panel and keyboard shortcuts.</p>}
      </div>
    </InfoDialog>
  );
}
