import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useAccountState, useLocalStorage } from "./useLocalStorage";
import { accountDataKey } from "./deviceData";
import StatsBar from "./StatsBar";
import AddTodoForm from "./AddTodoForm";
import TodoItem, { MilestoneCard } from "./TodoItem";
import CalendarView from "./CalendarView";
import CommandPalette from "./CommandPalette";
import KeybindSettings from "./KeybindSettings";
import EditItemModal from "./EditItemModal";
import QuickAddModal from "./QuickAddModal";
import ActivityHeatmap from "./ActivityHeatmap";
import SegmentedControl from "./SegmentedControl";
import { useGlobalKeybinds } from "./useGlobalKeybinds";
import { DEFAULT_KEYMAP, comboLabel } from "./keybinds";
import { currentOccurrence, isDueSoon, isOccurrenceCompleted, isOverdue, isRepeating, parseDateKey, resolveTask, toggleOccurrence } from "./occurrences";
import { isSupabaseConfigured, supabase } from "./supabase";
import { useSyncedData } from "./useSyncedData";
import { useSignOut } from "./useSignOut";
import SignOutNotice from "./SignOutNotice";
import AuthScreen from "./AuthScreen";
import EmailConfirmedScreen from "./EmailConfirmedScreen";
import LoadingScreen from "./LoadingScreen";
import QuickLinkModal from "./QuickLinkModal";
import MobileAddSheet from "./MobileAddSheet";
import Collapsible, { Chevron } from "./Collapsible";
import PlannerModal from "./PlannerModal";
import TodayPanel from "./TodayPanel";
import { withMilestoneStatus } from "./milestones";
import { checkOffProject, doneProjectDates, isProjectDone, markProjectDone, openProjectTasks } from "./projects";
import { EMPTY_PLANNER, addDays, hasPhases, normalizePlanner, toDateKey } from "./planner";
import { COLOR_PALETTE } from "./courseColors";
import FilterMenu from "./FilterMenu";
import { DEFAULT_FILTERS, activeFilterCount } from "./filters";
import FlipScope from "./FlipScope";
import { hasCanvasData } from "./canvasSync";
import { settingsBeforeImport } from "./canvasImport";
import { applyCourseMatches } from "./canvasCourses";
import { LINK_BROKEN_CODES, disconnectFeed, reassignCategory, remapCanvasCourse, withoutDueMoved } from "./canvasManage";
import { CanvasCard, CanvasCoursesNotice, CanvasLinkNotice, CanvasMobilePanel } from "./CanvasUI";
import { CanvasActionsContext } from "./canvasStatus";
import { useCanvasSync } from "./useCanvasSync";
import GettingStarted from "./GettingStarted";
import FeatureGuide from "./FeatureGuide";
import ShortcutsSheet from "./ShortcutsSheet";
import PrivacyDialog from "./PrivacyDialog";
import WhatsNew from "./WhatsNew";
import Tip from "./Tip";
import NewPasswordScreen from "./NewPasswordScreen";
import { passwordResetEnabled } from "./authEmails";
import { DEFAULT_COURSES, startingExamplesOpen, withExamplePlannerItems, withExampleProject, withExampleTasks } from "./starterData";
import { EMPTY_PREFS, MANUAL_ADDS_FOR_TIP, checklistShown, checklistSteps, closeChecklist, countManualAdd, markPlannerItemsAdded, markStep, markTipSeen, markWhatsNewSeen, normalizePrefs, plannerItemsAdded, rememberSteps, reopenChecklist, skipStep, startPrefs, tipSeen, whatsNewShown } from "./prefs";

const MOBILE_TABS = [
  { id: "tasks", label: "Tasks", icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle className="tab-fill" cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg> },
  { id: "calendar", label: "Calendar", icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect className="tab-fill" x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg> },
  { id: "profile", label: "Profile", icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle className="tab-fill" cx="12" cy="8.5" r="3.8" /><path className="tab-fill" d="M4.5 20c.9-3.6 3.9-5.8 7.5-5.8s6.6 2.2 7.5 5.8z" /></svg> },
];
const VIEW_OPTIONS = [
  { id: "list", title: "List", label: <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.75" cy="4" r=".6" fill="currentColor" /><circle cx="2.75" cy="8" r=".6" fill="currentColor" /><circle cx="2.75" cy="12" r=".6" fill="currentColor" /></svg> },
  { id: "calendar", title: "Calendar", label: <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" /></svg> },
];
const STATUS_OPTIONS = [{ id: "active", label: "Active" }, { id: "completed", label: "Done" }, { id: "all", label: "All" }];
const SORT_OPTIONS = [{ id: "date", label: "Date", title: "Sort by date" }, { id: "course", label: "Category", title: "Sort by category" }];
const TYPE_NOUNS = { task: "tasks", event: "events", milestone: "milestones", all: "items" };
const COURSE_COLOR_PALETTE = COLOR_PALETTE;
const DEFAULT_QUICK_LINKS = [];
const QUICK_ADD_TIP = "Words like fri, 3pm, urgent and @Category become the chips above. End with tk for a task or ev for an event.";
// Only the admin page offers Canvas import, so everyone else never downloads it
const CanvasConnectModal = lazy(() => import("./CanvasConnectModal"));
const CanvasSettingsModal = lazy(() => import("./CanvasSettingsModal"));

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

// Typed into quick add by Getting started, so the words turn into chips before anything is pressed
const EXAMPLE_TASK = "Essay draft fri urgent tk";
// Everything kept on this device for one account (see deviceData.js), removed when it's deleted
const ACCOUNT_KEYS = ["todos", "courses", "quickLinks", "planner", "prefs"];

function hashParams() {
  return new URLSearchParams(window.location.hash.slice(1));
}

function clearHash() {
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

// An email link that didn't work (expired, or already used) comes back with the reason in the hash
function linkErrorNotice() {
  const params = hashParams();
  if (!params.get("error") && !params.get("error_code")) return null;
  return passwordResetEnabled()
    ? "That link has expired or was already used. Sign in, or use Forgot password? to get a new one."
    : "That link has expired or was already used. Sign in to continue.";
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3 6v6.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6M6.5 9h3" />
    </svg>
  );
}

// An empty list says why it's empty and offers the way out
function EmptyList({ title, detail, action, onAction }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500">{detail}</p>}
      {action && (
        <button type="button" onClick={onAction} className="mt-3 rounded-full border border-course-100 bg-course-50 px-3 py-1 text-xs font-medium text-course-700 transition-colors hover:border-course-300">
          {action}
        </button>
      )}
    </div>
  );
}

function dateGroupLabel(dateKey, today) {
  if (dateKey === "undated") return "No date";
  const date = parseDateKey(dateKey);
  const daysAway = Math.round((date - today) / 86400000);
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  if (daysAway === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function App() {
  const [session, setSession] = useState(null);
  // Tasks and the rest belong to the account signed in: each account has its own copy on this device,
  // and switching accounts starts from that account's copy, never the last one's
  const accountId = session?.user?.id ?? null;
  const dataKey = (name) => accountDataKey(name, { accountsEnabled: isSupabaseConfigured, accountId });
  const [courses, setCourses] = useLocalStorage(dataKey("courses"), DEFAULT_COURSES);
  const [todos, setTodos] = useLocalStorage(dataKey("todos"), []);
  const [keymap, setKeymap] = useLocalStorage("keymap", DEFAULT_KEYMAP);
  const [quickLinks, setQuickLinks] = useLocalStorage(dataKey("quickLinks"), DEFAULT_QUICK_LINKS);
  const [storedPlanner, setPlanner] = useLocalStorage(dataKey("planner"), EMPTY_PLANNER);
  const planner = useMemo(() => normalizePlanner(storedPlanner), [storedPlanner]);
  const updatePlanner = useCallback((change) => setPlanner((current) => change(normalizePlanner(current))), [setPlanner]);
  // Projects no longer have phases: any still saved here or arriving from another device are dropped
  useEffect(() => {
    if (hasPhases(storedPlanner)) setPlanner((current) => normalizePlanner(current));
  }, [storedPlanner, setPlanner]);
  // The checklist, tips seen and the last What's new, synced with the account (see prefs.js).
  // `change` returns the next prefs, or null to leave them alone.
  const [storedPrefs, setPrefs] = useLocalStorage(dataKey("prefs"), EMPTY_PREFS);
  const prefs = useMemo(() => normalizePrefs(storedPrefs), [storedPrefs]);
  const updatePrefs = useCallback((change) => setPrefs((current) => change(normalizePrefs(current)) ?? current), [setPrefs]);
  // Canvas settings hold the feed link, a secret, so they stay out of localStorage and live only in
  // the user's own synced row. {} until that row loads (or if Canvas was never connected), and again
  // whenever the account changes.
  const [canvas, setCanvas] = useAccountState(accountId, {});
  const [addFormCollapsed, setAddFormCollapsed] = useLocalStorage("addFormCollapsed", false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [filter, setFilter] = useState("active"); // active | completed | all
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("task");
  const [priorityFilter, setPriorityFilter] = useState("all");
  // null, or "soon" / "overdue": the stats card's counts open the list filtered to them
  const [dueFilter, setDueFilter] = useState(null);
  const [sortBy, setSortBy] = useState("course"); // date | course
  const [view, setView] = useState("list"); // list | calendar
  // The list and calendar each lead their toolbar with their own copy of the view switch, so the copy
  // that appears on a switch starts with its pill on the view just left and slides it across
  const [shownView, setShownView] = useState(view);
  const [previousView, setPreviousView] = useState(null);
  if (view !== shownView) {
    setPreviousView(shownView);
    setShownView(view);
  }
  const [calendarMode, setCalendarMode] = useState("day");
  const [newCourseName, setNewCourseName] = useState("");
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editingCourseName, setEditingCourseName] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickLinkOpen, setQuickLinkOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  // Help pages: null, or where they were opened ("desktop" or "mobile"), which decides how they're drawn
  const [guideOpen, setGuideOpen] = useState(null);
  const [privacyOpen, setPrivacyOpen] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // What quick add opens with: the example from Getting started, otherwise nothing
  const [quickAddText, setQuickAddText] = useState("");
  const [mobileAddText, setMobileAddText] = useState("");
  // The one-time tip on screen, if any (only ever one; see offerTip)
  const [activeTip, setActiveTip] = useState(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const closeCanvas = useCallback(() => setCanvasOpen(false), []);
  // Set when setup opens at matching, for courses that showed up after connecting: { domain, keys }
  const [canvasMatch, setCanvasMatch] = useState(null);
  // Set when setup opens to replace a connected school's link: its domain
  const [canvasReplace, setCanvasReplace] = useState(null);
  const [canvasSettingsOpen, setCanvasSettingsOpen] = useState(false);
  const closeCanvasSettings = useCallback(() => setCanvasSettingsOpen(false), []);
  // Course keys whose "match them" notice was hidden this session, and the check failure last dismissed
  const [hiddenCourseKeys, setHiddenCourseKeys] = useState([]);
  const [seenCanvasError, setSeenCanvasError] = useState(null);
  // Asks the planner to open on a particular tab: { tab }, a new object each time
  const [plannerTabRequest, setPlannerTabRequest] = useState(null);
  const [todayOpen, setTodayOpen] = useLocalStorage("todayPanelOpen", false);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [emailConfirmed, setEmailConfirmed] = useState(() => hashParams().get("type") === "signup");
  // Opened from a password reset email: choose the new password before anything else
  const [recovering, setRecovering] = useState(() => hashParams().get("type") === "recovery");
  // A line for the sign-in screen: a link that didn't work, or the account just deleted
  const [authNotice, setAuthNotice] = useState(linkErrorNotice);
  const [syncError, setSyncError] = useState("");
  const [mobileTab, setMobileTab] = useState("tasks");
  const [mobileTabShift, setMobileTabShift] = useState(0);
  const [leavingTab, setLeavingTab] = useState(null);
  const [leaveOffset, setLeaveOffset] = useState(0);
  const leaveTimerRef = useRef(null);
  const tabScrollRef = useRef({});
  const tabScrollReadyRef = useRef(false);
  const [mobileScrolled, setMobileScrolled] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [mobileSelectedDate, setMobileSelectedDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [mobileCalendarMode, setMobileCalendarMode] = useState("month");
  // { id, message, undo }; it stays mounted while `toastLeaving` plays its exit
  const [toast, setToast] = useState(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const undoTimerRef = useRef(null);
  const toastLeaveTimerRef = useRef(null);
  const listScrollRef = useRef(null);
  const addInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const mobileCategoryInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);
  const taskListRef = useRef(null);
  const calendarRef = useRef(null);
  const now = new Date();
  const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const monthDate = now.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const resolvedKeymap = useMemo(() => ({ ...DEFAULT_KEYMAP, ...keymap }), [keymap]);
  // Archived categories keep their tasks but are hidden from everywhere new items are created
  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses]);
  const archivedCourses = useMemo(() => courses.filter((c) => c.archived), [courses]);

  useEffect(() => {
    if (keymap.moveUp === "k") setKeymap((current) => ({ ...current, moveUp: DEFAULT_KEYMAP.moveUp }));
  }, [keymap.moveUp, setKeymap]);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // A reset link that didn't sign anyone in has nothing to choose a password for
      if (!data.session) setRecovering(false);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_IN") setAuthNotice(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // The reason a link didn't work is now on the sign-in screen; it shouldn't stay in the address
  useEffect(() => {
    const params = hashParams();
    if (params.get("error") || params.get("error_code")) clearHash();
  }, []);

  useEffect(() => {
    const onScroll = () => setMobileScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSyncError = useCallback((message) => setSyncError(message), []);
  const { lastSyncedAt, pulledAt, saveNow } = useSyncedData(session?.user, todos, setTodos, courses, setCourses, quickLinks, setQuickLinks, storedPlanner, setPlanner, canvas, setCanvas, handleSyncError, storedPrefs, setPrefs);
  const signOutFlow = useSignOut(saveNow);
  const syncStatus = !session
    ? "Saved on this device only"
    : syncError
    ? "Not synced, retrying"
    : lastSyncedAt
    ? `Synced at ${lastSyncedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "Connecting…";
  // Canvas import needs the server, and the saved settings loaded first so an import can't
  // replace settings this device hasn't seen yet
  const canvasAvailable = isSupabaseConfigured && Boolean(session);
  const canvasReady = canvasAvailable && Boolean(lastSyncedAt);
  const canvasSync = useCanvasSync({ enabled: canvasReady, userId: session?.user?.id ?? null, pulledAt, todos, courses, canvas, setTodos, setCourses, setCanvas });
  const canvasNoticeCourses = canvasSync.unmapped.filter((course) => !hiddenCourseKeys.includes(course.key));
  // A check that failed on its own (not one the user asked for) gets only a quiet note in the sync pill
  const canvasQuietError = canvasSync.error && !canvasSync.error.manual && !LINK_BROKEN_CODES.has(canvasSync.error.code) ? canvasSync.error : null;
  const showCanvasPill = !syncError && Boolean(canvasQuietError) && canvasQuietError !== seenCanvasError;

  const dismissDueMoved = useCallback((id) => setTodos((prev) => prev.map((todo) => (todo.id === id ? withoutDueMoved(todo) : todo))), [setTodos]);
  const canvasActions = useMemo(() => ({ enabled: true, dismissDueMoved }), [dismissDueMoved]);

  // New or existing is decided once, when the account's saved data has arrived (or straight away
  // without accounts), so a returning account on a new device isn't mistaken for a new one
  const prefsReady = !isSupabaseConfigured || (Boolean(session) && pulledAt > 0);
  useEffect(() => {
    if (!prefsReady) return;
    const next = startPrefs(prefs, { todos });
    if (!next) return;
    setPrefs(next);
    // A new account starts with examples: two tasks for the checklist to point at, and a project
    // on the timeline
    if (!checklistShown(next)) return;
    setTodos((current) => withExampleTasks(current, courses));
    setPlanner((current) => withExampleProject(normalizePlanner(current), courses));
  }, [prefsReady, prefs, todos, courses, setPrefs, setTodos, setPlanner]);

  const showChecklist = prefsReady && checklistShown(prefs);
  const desktopSteps = useMemo(() => checklistSteps(prefs, { todos, canvas, planner, canvasAvailable, desktop: true, quickAddKey: resolvedKeymap.quickAdd }), [prefs, todos, canvas, planner, canvasAvailable, resolvedKeymap.quickAdd]);
  const mobileSteps = useMemo(() => checklistSteps(prefs, { todos, canvas, planner, canvasAvailable, desktop: false }), [prefs, todos, canvas, planner, canvasAvailable]);
  // A step stays ticked once done, even if what did it is later deleted
  useEffect(() => {
    if (!showChecklist) return;
    const next = rememberSteps(prefs, desktopSteps);
    if (next) setPrefs(next);
  }, [showChecklist, prefs, desktopSteps, setPrefs]);

  // Planning the day with both starting examples already checked off would leave nothing due to
  // plan, so opening Today or the planner puts two things just for today in the tray (once a day)
  const planDayPending = showChecklist && desktopSteps.some((step) => step.id === "planDay" && !step.done);
  const plannerItemsDue = planDayPending && (todayOpen || plannerOpen) && !startingExamplesOpen(todos) && !plannerItemsAdded(prefs, toDateKey(new Date()));
  useEffect(() => {
    if (!plannerItemsDue) return;
    const dateKey = toDateKey(new Date());
    updatePrefs((current) => markPlannerItemsAdded(current, dateKey));
    updatePlanner((current) => withExamplePlannerItems(current, dateKey));
  }, [plannerItemsDue, updatePrefs, updatePlanner]);

  // What's new shows once: it's marked seen as it appears, and stays until closed or the next visit
  const [whatsNewOpen, setWhatsNewOpen] = useAccountState(accountId, false);
  const whatsNewDue = prefsReady && whatsNewShown(prefs);
  useEffect(() => {
    if (!whatsNewDue) return;
    setWhatsNewOpen(true);
    setPrefs((current) => markWhatsNewSeen(normalizePrefs(current)));
  }, [whatsNewDue, setWhatsNewOpen, setPrefs]);

  // One tip at a time, each once per account: it's marked seen as soon as it shows, and goes when
  // the place it's about closes, however that happens
  const tipPlaceOpen = { quickAdd: quickAddOpen || mobileAddOpen, repeatEdit: Boolean(editingItem), pressN: true };
  if (activeTip && !tipPlaceOpen[activeTip]) setActiveTip(null);

  function offerTip(id) {
    if (!prefsReady || activeTip || tipSeen(prefs, id)) return;
    setActiveTip(id);
    updatePrefs((current) => markTipSeen(current, id));
  }

  function dismissTip(id) {
    setActiveTip((current) => (current === id ? null : current));
  }

  const tipProps = (id, text) => (activeTip === id ? { text, onDismiss: () => dismissTip(id) } : null);

  function closeQuickAdd() {
    setQuickAddOpen(false);
    setQuickAddText("");
  }

  function closeMobileAdd() {
    setMobileAddOpen(false);
    setMobileAddText("");
  }

  function openQuickAdd() {
    dismissTip("pressN");
    setQuickAddOpen(true);
  }

  // Tasks added with the form, one at a time: after a few, a tip that quick add is a key away
  function addFromForm(item) {
    addTodo(item);
    if (tipSeen(prefs, "pressN")) return;
    updatePrefs(countManualAdd);
    if ((prefs.manualAdds ?? 0) + 1 >= MANUAL_ADDS_FOR_TIP) offerTip("pressN");
  }

  function openShortcuts() {
    setShortcutsOpen(true);
    updatePrefs((current) => (checklistShown(current) ? markStep(current, "shortcuts") : null));
  }

  // The field for a new category, on whichever layout asked
  function focusCategoryField(mobile) {
    if (mobile) {
      switchMobileTab("profile");
      requestAnimationFrame(() => {
        mobileCategoryInputRef.current?.scrollIntoView({ block: "center" });
        mobileCategoryInputRef.current?.focus({ preventScroll: true });
      });
      return;
    }
    requestAnimationFrame(() => categoryInputRef.current?.focus());
  }

  // Each Getting started step's button does the thing itself. Quick add's step only has one on a
  // computer with its key unset.
  function runStep(id) {
    if (id === "firstTask") {
      setQuickAddText(EXAMPLE_TASK);
      openQuickAdd();
    } else if (id === "canvas") openCanvasConnect();
    else if (id === "planDay") setTodayOpen(true);
    else if (id === "shortcuts") openShortcuts();
  }

  function hideChecklist(done) {
    updatePrefs((current) => closeChecklist(current, done ? "done" : "dismissed"));
    if (!done) showUndo(() => updatePrefs(reopenChecklist), "Getting started hidden. It's in What you can do.");
  }

  function showChecklistAgain() {
    updatePrefs(reopenChecklist);
    setGuideOpen(null);
  }

  // The help page's buttons go to the feature; the page closes first so focus can land there
  function openFromGuide(target) {
    const mobile = guideOpen === "mobile";
    setGuideOpen(null);
    if (target === "quickAdd") {
      if (mobile) setMobileAddOpen(true);
      else openQuickAdd();
    } else if (target === "category") focusCategoryField(mobile);
    else if (target === "today") setTodayOpen(true);
    else if (target === "planner") { setPlannerTabRequest({ tab: "today" }); setPlannerOpen(true); }
    else if (target === "projects") { setPlannerTabRequest({ tab: "timeline" }); setPlannerOpen(true); }
    else if (target === "calendar") {
      if (mobile) switchMobileTab("calendar");
      else setView("calendar");
    } else if (target === "canvas") {
      if (canvas.feeds?.length) setCanvasSettingsOpen(true);
      else openCanvasConnect();
    } else if (target === "palette") setPaletteOpen(true);
    else if (target === "shortcuts") openShortcuts();
    else if (target === "keybinds") setSettingsOpen(true);
  }

  // Deletes the account and everything in it (the delete_my_account function in
  // supabase-schema.sql), then this device's copy, then signs out. Resolves to an error message, or
  // null once it's gone.
  async function deleteAccount() {
    if (!supabase || !accountId) return "Sign in to delete your account.";
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
      return missing ? "Deleting accounts isn't switched on yet. Try again later." : "Couldn't delete your account. Check your connection and try again.";
    }
    try {
      for (const name of ACCOUNT_KEYS) localStorage.removeItem(`${name}:${accountId}`);
      localStorage.removeItem(`outage-recovered-2026-10-11-v2:${accountId}`);
    } catch {
      // Storage unavailable: nothing was kept here
    }
    setPrivacyOpen(null);
    await supabase.auth.signOut({ scope: "local" });
    setAuthNotice("Your account and everything in it was deleted.");
    return null;
  }

  function openCanvasConnect() {
    setCanvasMatch(null);
    setCanvasReplace(null);
    setCanvasSettingsOpen(false);
    setCanvasOpen(true);
  }

  // A new link for a school that's connected (its old link stopped working, say)
  function openCanvasReplace(domain) {
    setCanvasMatch(null);
    setCanvasReplace(domain);
    setCanvasSettingsOpen(false);
    setCanvasOpen(true);
  }

  function openCanvasMatch() {
    const domain = canvasNoticeCourses[0]?.domain;
    if (!domain) return;
    setCanvasReplace(null);
    setCanvasMatch({ domain, keys: canvasNoticeCourses.filter((course) => course.domain === domain).map((course) => course.key) });
    setCanvasOpen(true);
  }

  // Points a Canvas course at another category (from settings). Undo puts the mapping, the moved
  // tasks and anything it added back as they were.
  function changeCanvasMapping(domain, row, choice) {
    const courseMap = canvas.courseMap ?? {};
    const previousTarget = Object.hasOwn(courseMap, row.key) ? courseMap[row.key] : undefined;
    const applied = applyCourseMatches({ domain, matches: [{ key: row.key, courseId: row.courseId, choice }], courses, canvasState: canvas });
    const target = applied.canvasState.courseMap[row.key];
    if (target === previousTarget) return;
    const remapped = remapCanvasCourse({ todos, domain, courseId: row.courseId, categoryId: target });
    const movedFrom = new Map(todos.filter((todo, index) => remapped.todos[index] !== todo).map((todo) => [todo.id, todo.courseId]));
    const { addedIds } = canvasSync.commit({ todos: remapped.todos, courses: applied.courses, canvas: applied.canvasState });
    const created = new Set(applied.createdCategoryIds);
    const name = applied.courses.find((course) => course.id === target)?.name;
    const message = target === null
      ? `${row.name} won't be imported`
      : remapped.moved ? `Moved ${plural(remapped.moved, "task")} to ${name}` : `${row.name} now goes to ${name}`;
    showUndo(() => {
      const added = new Set(addedIds);
      setTodos((prev) => prev.filter((todo) => !added.has(todo.id)).map((todo) => {
        if (!movedFrom.has(todo.id) || todo.courseId !== target) return todo;
        const from = movedFrom.get(todo.id);
        return { ...todo, courseId: from, canvas: { ...todo.canvas, synced: { ...todo.canvas.synced, courseId: from } } };
      }));
      setCourses((prev) => prev.filter((course) => !created.has(course.id)));
      setCanvas((prev) => {
        const next = { ...(prev.courseMap ?? {}) };
        if (previousTarget === undefined) delete next[row.key];
        else next[row.key] = previousTarget;
        return { ...prev, courseMap: next };
      });
    }, message);
  }

  function changeCanvasOption(key, value) {
    const { addedIds } = canvasSync.commit({ todos, courses, canvas: { ...canvas, [key]: value } });
    if (!addedIds.length) return;
    showUndo(() => {
      const added = new Set(addedIds);
      setTodos((prev) => prev.filter((todo) => !added.has(todo.id)));
      setCanvas((prev) => ({ ...prev, [key]: !value }));
    }, `Added ${addedIds.length} from Canvas`);
  }

  // Disconnects one school, keeping or removing its imported tasks. Undo reconnects it and puts
  // back anything removed.
  function disconnectCanvas(domain, removeTasks) {
    const result = disconnectFeed({ canvas, todos, courses, domain, removeTasks });
    setCanvas(result.canvas);
    if (removeTasks) {
      setTodos(result.todos);
      setCourses(result.courses);
    }
    if (!result.canvas.feeds.length) setCanvasSettingsOpen(false);
    showUndo(() => {
      setCanvas((prev) => ({ ...prev, feeds: [...(prev.feeds ?? []).filter((feed) => feed.domain !== domain), result.feed] }));
      if (!removeTasks) return;
      setTodos((prev) => {
        const ids = new Set(prev.map((todo) => todo.id));
        return [...prev, ...result.removedTodos.filter((todo) => !ids.has(todo.id))];
      });
      setCourses((prev) => {
        const ids = new Set(prev.map((course) => course.id));
        return [...prev, ...result.removedCourses.filter((course) => !ids.has(course.id))];
      });
    }, removeTasks && result.removedTodos.length ? `Disconnected Canvas and removed ${plural(result.removedTodos.length, "task")}` : "Disconnected Canvas");
  }

  // Commits a Connect Canvas plan. Undo takes back the tasks and categories it added and the
  // connection itself.
  function importCanvas(plan) {
    const previousCanvas = settingsBeforeImport(canvas);
    const addedIds = new Set(plan.addedIds);
    const createdIds = new Set(plan.createdCategoryIds);
    const fallbackId = (activeCourses[0] ?? courses[0])?.id ?? null;
    const domain = plan.canvas.feeds?.at(-1)?.domain;
    const relinked = Boolean(domain) && (canvas.feeds ?? []).some((feed) => feed.domain === domain);
    setTodos(plan.todos);
    setCourses(plan.courses);
    setCanvas(plan.canvas);
    showUndo(() => {
      setTodos((prev) => prev.filter((todo) => !addedIds.has(todo.id)).map((todo) => (createdIds.has(todo.courseId) ? { ...todo, courseId: fallbackId } : todo)));
      setCourses((prev) => prev.filter((course) => !createdIds.has(course.id)));
      setCanvas(previousCanvas);
    }, plan.addedIds.length ? `Added ${plan.addedIds.length} from Canvas` : relinked ? "Canvas link updated" : "Connected Canvas");
  }

  function addTodo({ type, title, courseId, dueDate, dueDates, endDate, startTime, endTime, priority, description, repeat, repeatUntil, repeatCount, repeatDays, projectId, milestoneId }) {
    const independentDates = type === "event" && repeat === "none" && dueDates?.length > 1 ? dueDates : [dueDate];
    setTodos((prev) => [
      ...prev,
      ...independentDates.map((eventDate) => ({
        id: crypto.randomUUID(),
        type: type ?? "task",
        title,
        courseId: courseId ?? activeCourses[0]?.id ?? courses[0]?.id ?? null,
        dueDate: eventDate,
        endDate: independentDates.length > 1 ? null : endDate ?? null,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        priority: priority ?? "normal",
        description: description ?? null,
        repeat: independentDates.length > 1 ? "none" : repeat ?? "none",
        repeatDays: independentDates.length > 1 ? null : repeatDays?.length ? repeatDays : null,
        repeatUntil: independentDates.length > 1 ? null : repeatUntil ?? null,
        repeatCount: independentDates.length > 1 ? null : repeatCount ? Number(repeatCount) : null,
        ...(projectId ? { projectId } : {}),
        ...(milestoneId ? { milestoneId } : {}),
        completed: false,
        createdAt: new Date().toISOString(),
      })),
    ]);
  }

  function updateTodo(id, patch) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  // Removes one date from a repeating item; undo puts just that date back
  function skipOccurrence(id, occurrenceDate) {
    const skipped = todos.find((t) => t.id === id);
    if (!occurrenceDate || !skipped) return;
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, skipDates: [...new Set([...(t.skipDates ?? []), occurrenceDate])] } : t));
    setEditingItem(null);
    if (skipped.skipDates?.includes(occurrenceDate)) return;
    const day = parseDateKey(occurrenceDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    showUndo(
      () => setTodos((prev) => prev.map((t) => t.id === id ? { ...t, skipDates: (t.skipDates ?? []).filter((date) => date !== occurrenceDate) } : t)),
      `Removed “${skipped.title}” on ${day}`,
    );
  }

  function toggleTodo(id, occurrenceDate) {
    const previous = todos.find((t) => t.id === id);
    // Milestones complete on their own when their tasks do
    if (!previous || previous.type === "milestone") return;
    const next = isRepeating(previous)
      ? toggleOccurrence(previous, occurrenceDate)
      : { ...previous, completed: !previous.completed, completedAt: !previous.completed ? new Date().toISOString() : null };
    setTodos((prev) => prev.map((t) => (t.id === id ? next : t)));
    const nowDone = isRepeating(previous) ? isOccurrenceCompleted(next, occurrenceDate ?? currentOccurrence(previous)) : next.completed;
    showUndo(() => setTodos((prev) => prev.map((t) => (t.id === id ? previous : t))), nowDone ? `Completed “${previous.title}”` : `Marked “${previous.title}” not done`);
  }

  // The stats card's counts: open the list on just those tasks, with nothing else narrowing it, so the
  // list matches the number that was clicked. Clicking the same count again puts the list back.
  function showDue(kind) {
    if (dueFilter === kind) { setDueFilter(null); return; }
    setDueFilter(kind);
    setView("list");
    setFilter("active");
    setCourseFilter("all");
    setTypeFilter("task");
    setPriorityFilter("all");
  }

  function changeFilters(patch) {
    if ("courseFilter" in patch) setCourseFilter(patch.courseFilter);
    if ("typeFilter" in patch) setTypeFilter(patch.typeFilter);
    if ("priorityFilter" in patch) setPriorityFilter(patch.priorityFilter);
    if ("dueFilter" in patch) setDueFilter(patch.dueFilter);
  }

  function resetFilters() {
    changeFilters(DEFAULT_FILTERS);
  }

  function openPlannerToday() {
    setPlannerTabRequest({ tab: "today" });
    setPlannerOpen(true);
  }

  // Whether checking off this list row removes it from the current filter (vs. a repeating
  // task that just moves on to its next occurrence)
  function leavesListOnComplete(task) {
    if (filter !== "active") return false;
    const stored = todos.find((t) => t.id === task.id);
    return !stored || !isRepeating(stored) || resolveTask(toggleOccurrence(stored, task.occurrenceDate)).completed;
  }

  // List rows show a repeating task's current occurrence; edit the stored series instead.
  function editItem(item) {
    const stored = todos.find((t) => t.id === item.id);
    setEditingItem(stored ? { ...stored, occurrenceDate: item.occurrenceDate } : item);
    // Only where Delete… offers just this date
    if (stored && isRepeating(stored) && item.occurrenceDate) offerTip("repeatEdit");
  }

  function deleteTodo(id) {
    const index = todos.findIndex((t) => t.id === id);
    const deleted = todos[index];
    if (!deleted) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    // A deleted Canvas import is remembered so a later sync doesn't bring it back
    const tombstone = Boolean(deleted.canvas) && hasCanvasData(canvas);
    if (tombstone) setCanvas((current) => ({ ...current, dismissedIds: [...new Set([...(current.dismissedIds ?? []), id])] }));
    showUndo(() => {
      setTodos((prev) => [...prev.slice(0, index), deleted, ...prev.slice(index)]);
      if (tombstone) setCanvas((current) => ({ ...current, dismissedIds: (current.dismissedIds ?? []).filter((dismissed) => dismissed !== id) }));
    }, `Deleted “${deleted.title}”`);
    setEditingItem(null);
  }

  // A project takes its milestones and tasks with it; undo puts all of them back
  function deleteProject(id) {
    const index = planner.projects.findIndex((project) => project.id === id);
    const project = planner.projects[index];
    if (!project) return;
    const removedTodos = todos.filter((todo) => todo.projectId === id);
    updatePlanner((current) => ({ ...current, projects: current.projects.filter((item) => item.id !== id) }));
    setTodos((prev) => prev.filter((todo) => todo.projectId !== id));
    showUndo(() => {
      updatePlanner((current) => ({ ...current, projects: [...current.projects.slice(0, index), project, ...current.projects.slice(index)] }));
      setTodos((prev) => [...prev, ...removedTodos]);
    }, `Deleted project “${project.name}”`);
  }

  // Marking a project done checks off what's still open in it; undo puts the project and the tasks back
  function completeProject(id) {
    const project = planner.projects.find((item) => item.id === id);
    if (!project || isProjectDone(project)) return;
    const open = new Map(openProjectTasks(todos, id).map((todo) => [todo.id, todo]));
    updatePlanner((current) => markProjectDone(current, id));
    if (open.size) setTodos((prev) => checkOffProject(prev, id));
    showUndo(() => {
      updatePlanner((current) => ({ ...current, projects: current.projects.map((item) => (item.id === id ? project : item)) }));
      if (open.size) setTodos((prev) => prev.map((todo) => open.get(todo.id) ?? todo));
    }, `Marked “${project.name}” done${open.size ? ` and checked off ${open.size} task${open.size === 1 ? "" : "s"}` : ""}`);
  }

  // The toast names what just happened, so Undo says exactly what it will put back
  function showUndo(undo, message) {
    clearTimeout(undoTimerRef.current);
    clearTimeout(toastLeaveTimerRef.current);
    setToastLeaving(false);
    setToast({ id: crypto.randomUUID(), message, undo });
    undoTimerRef.current = setTimeout(dismissToast, 5000);
  }

  function dismissToast() {
    clearTimeout(undoTimerRef.current);
    setToastLeaving(true);
    clearTimeout(toastLeaveTimerRef.current);
    toastLeaveTimerRef.current = setTimeout(() => { setToast(null); setToastLeaving(false); }, 160);
  }

  // Tabs stay mounted (so state and scroll survive); the window is shared, so each tab's scroll is saved and restored here
  useLayoutEffect(() => {
    if (!tabScrollReadyRef.current) { tabScrollReadyRef.current = true; return; }
    window.scrollTo(0, tabScrollRef.current[mobileTab] ?? 0);
  }, [mobileTab]);

  const tabPanelHidden = (id) => mobileTab !== id && leavingTab !== id;
  const tabPanelClass = (id) => `mobile-tab-panel ${mobileTab !== id && leavingTab === id ? "is-leaving" : ""}`;

  // The search field stays mounted so it can animate out as well as in. Opening commits
  // synchronously so the field is no longer inert when it's focused inside the tap, which is
  // what lets iOS raise the keyboard.
  function toggleMobileSearch() {
    if (mobileSearchOpen) {
      mobileSearchInputRef.current?.blur();
      setMobileSearchOpen(false);
      return;
    }
    flushSync(() => setMobileSearchOpen(true));
    mobileSearchInputRef.current?.focus({ preventScroll: true });
  }

  function switchMobileTab(id) {
    if (id === mobileTab) return;
    tabScrollRef.current[mobileTab] = window.scrollY;
    const ids = MOBILE_TABS.map((tab) => tab.id);
    setMobileTabShift(Math.sign(ids.indexOf(id) - ids.indexOf(mobileTab)) * 32);
    // The page we leave stays on screen where it was while it slides away, even though the window scroll jumps to the next tab's
    setLeaveOffset((tabScrollRef.current[id] ?? 0) - window.scrollY);
    setLeavingTab(mobileTab);
    clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => setLeavingTab(null), 180);
    setMobileTab(id);
  }

  function undoLastAction() {
    if (!toast || toastLeaving) return;
    toast.undo();
    dismissToast();
  }

  function addCourse(e) {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    setCourses((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: newCourseName.trim(), color: COURSE_COLOR_PALETTE[prev.length % COURSE_COLOR_PALETTE.length] },
    ]);
    setNewCourseName("");
  }

  function addQuickLink(label, rawUrl) {
    if (!label.trim() || !rawUrl.trim()) return;
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setQuickLinks((prev) => [...prev, { id: crypto.randomUUID(), label: label.trim(), url }]);
  }

  function updateCourseColor(id, color) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
  }

  function startRenameCourse(course) {
    setEditingCourseId(course.id);
    setEditingCourseName(course.name);
  }

  function submitRenameCourse() {
    if (editingCourseName.trim()) {
      setCourses((prev) => prev.map((c) => (c.id === editingCourseId ? { ...c, name: editingCourseName.trim() } : c)));
    }
    setEditingCourseId(null);
  }

  // At least one active category must remain so new items always have somewhere to go
  function isLastActiveCourse(course) {
    return !course.archived && activeCourses.length <= 1;
  }

  function setCourseArchived(id, archived) {
    const course = courses.find((c) => c.id === id);
    if (!course || (archived && isLastActiveCourse(course))) return;
    if (editingCourseId === id) setEditingCourseId(null);
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, archived } : c)));
    showUndo(() => setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, archived: course.archived } : c))), `${archived ? "Archived" : "Restored"} “${course.name}”`);
  }

  function deleteCourse(id) {
    const course = courses.find((c) => c.id === id);
    if (!course || courses.length <= 1 || isLastActiveCourse(course)) return;
    const previousCourses = courses;
    const movedTaskIds = new Set(todos.filter((todo) => todo.courseId === id).map((todo) => todo.id));
    const remaining = courses.filter((course) => course.id !== id);
    const fallbackId = (remaining.find((c) => !c.archived) ?? remaining[0])?.id ?? null;
    setCourses(remaining);
    // Canvas tasks keep following their course: once it's matched to a new category, they move there
    setTodos((prevTodos) => prevTodos.map((todo) => reassignCategory(todo, id, fallbackId)));
    showUndo(() => {
      setCourses(previousCourses);
      setTodos((prevTodos) => prevTodos.map((todo) => (movedTaskIds.has(todo.id) ? reassignCategory(todo, fallbackId, id) : todo)));
    }, `Deleted category “${course.name}”`);
  }

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const projectMap = useMemo(() => Object.fromEntries(planner.projects.map((p) => [p.id, p])), [planner.projects]);

  // Milestones get their completion from their tasks (or their project being done); everything that displays todos reads this
  const doneProjects = useMemo(() => doneProjectDates(planner.projects), [planner.projects]);
  const todosView = useMemo(() => withMilestoneStatus(todos, doneProjects), [todos, doneProjects]);
  const resolvedTodos = useMemo(() => todosView.map(resolveTask), [todosView]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = resolvedTodos.filter((t) => {
      if (filter === "active") return !t.completed;
      if (filter === "completed") return t.completed;
      return true;
    }).filter((t) => {
      const matchesSearch = !query || `${t.title} ${t.description ?? ""}`.toLowerCase().includes(query);
      const matchesCourse = courseFilter === "all" || t.courseId === courseFilter;
      const type = t.type ?? "task";
      // Milestones are deadlines for tasks, so they sit alongside them
      const matchesType = typeFilter === "all" || type === typeFilter || (typeFilter === "task" && type === "milestone");
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      const matchesDue = !dueFilter || (dueFilter === "soon" ? isDueSoon(t) : isOverdue(t));
      return matchesSearch && matchesCourse && matchesType && matchesPriority && matchesDue;
    });
    return [...list].sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [resolvedTodos, filter, search, courseFilter, typeFilter, priorityFilter, dueFilter]);

  // Category view only: tasks stay out of the list until they're coming up (due within the next
  // week, or already overdue) unless they have no date. A milestone's tasks share one card, headed
  // by the milestone, so a project reads as a single block rather than a run of separate cards.
  const todayKey = toDateKey(new Date());
  const groupedTasks = useMemo(() => {
    if (sortBy !== "course") return null;
    const horizon = addDays(todayKey, 7);
    const milestones = Object.fromEntries(todosView.filter((todo) => todo.type === "milestone").map((todo) => [todo.id, todo]));
    const shown = visibleTasks.filter((task) => !task.dueDate || task.dueDate <= horizon);
    return courses.map((course) => {
      const tasks = shown.filter((task) => task.courseId === course.id);
      const isMilestoneTask = (task) => task.type !== "milestone" && milestones[task.milestoneId];
      const headed = new Set(tasks.filter(isMilestoneTask).map((task) => task.milestoneId));
      const blocks = [];
      const byMilestone = new Map();
      for (const task of tasks) {
        // A listed milestone with listed tasks becomes its card's header instead of a card of its own
        if (task.type === "milestone" && headed.has(task.id)) continue;
        if (!isMilestoneTask(task)) {
          blocks.push({ key: task.id, task });
          continue;
        }
        let block = byMilestone.get(task.milestoneId);
        if (!block) {
          block = { key: `milestone:${task.milestoneId}`, milestone: milestones[task.milestoneId], tasks: [] };
          byMilestone.set(task.milestoneId, block);
          blocks.push(block);
        }
        block.tasks.push(task);
      }
      return { course, tasks, blocks };
    }).filter((g) => g.tasks.length > 0);
  }, [sortBy, courses, visibleTasks, todosView, todayKey]);

  const groupedDates = useMemo(() => {
    if (sortBy !== "date") return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups = new Map();
    for (const task of visibleTasks) {
      const key = task.dueDate ?? "undated";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
    return [...groups.entries()].map(([key, tasks]) => ({ key, label: dateGroupLabel(key, today), tasks }));
  }, [sortBy, visibleTasks]);

  // Keyboard selection walks the rows in the order they're drawn
  const orderedTasks = groupedTasks ? groupedTasks.flatMap((g) => g.blocks.flatMap((block) => block.task ? [block.task] : block.tasks)) : visibleTasks;

  const mobileAgenda = useMemo(() => {
    return todos.filter((todo) => todo.dueDate === mobileSelectedDate).sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
  }, [todos, mobileSelectedDate]);

  useEffect(() => {
    if (!selectedId || view !== "list") return;
    document.querySelector(`[data-task-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, view, orderedTasks]);

  // The form's fields are inert while collapsed, so open it (a no-op if already open) before focusing
  function focusNewTask() {
    flushSync(() => setAddFormCollapsed(false));
    addInputRef.current?.focus();
  }

  function moveSelection(delta) {
    if (view !== "list") return;
    if (orderedTasks.length === 0) return;
    const index = orderedTasks.findIndex((task) => task.id === selectedId);
    const nextIndex = index === -1
      ? delta > 0 ? 0 : orderedTasks.length - 1
      : Math.min(Math.max(index + delta, 0), orderedTasks.length - 1);
    setSelectedId(orderedTasks[nextIndex].id);
  }

  useGlobalKeybinds(
    resolvedKeymap,
    {
      openPalette: () => setPaletteOpen((v) => !v),
      openSettings: () => setSettingsOpen(true),
      quickAdd: openQuickAdd,
      newTask: focusNewTask,
      toggleView: () => setView((v) => (v === "list" ? "calendar" : "list")),
      moveDown: () => moveSelection(1),
      moveUp: () => moveSelection(-1),
      toggleComplete: () => selectedId && toggleTodo(selectedId),
      deleteSelected: () => selectedId && deleteTodo(selectedId),
      filterActive: () => setFilter("active"),
      filterCompleted: () => setFilter("completed"),
      filterAll: () => setFilter("all"),
      calendarMonth: () => { setView("calendar"); setCalendarMode("month"); },
      calendarWeek: () => { setView("calendar"); setCalendarMode("week"); },
      calendarDay: () => { setView("calendar"); setCalendarMode("day"); },
      calendarPrevious: () => view === "calendar" && calendarRef.current?.shift(-1),
      calendarNext: () => view === "calendar" && calendarRef.current?.shift(1),
      focusSearch: () => searchInputRef.current?.focus(),
      toggleSort: () => setSortBy((current) => current === "course" ? "date" : "course"),
      quickLink: () => setQuickLinkOpen(true),
      openPlanner: () => setPlannerOpen(true),
      toggleToday: () => setTodayOpen((v) => !v),
      showShortcuts: openShortcuts,
      escape: () => {
        if (paletteOpen) setPaletteOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (quickAddOpen) setQuickAddOpen(false);
        else if (editingItem) setEditingItem(null);
      },
    },
    !settingsOpen && !editingItem && !quickAddOpen && !plannerOpen && !canvasOpen && !canvasSettingsOpen && !shortcutsOpen && !guideOpen && !privacyOpen,
  );

  const commands = useMemo(
    () => [
      { id: "quickAdd", label: "Quick add task/event", run: () => openQuickAdd() },
      { id: "newTask", label: "Focus new task form", run: () => focusNewTask() },
      { id: "toggleView", label: "Toggle list / calendar view", run: () => setView((v) => (v === "list" ? "calendar" : "list")) },
      { id: "filterActive", label: "Show active tasks", run: () => setFilter("active") },
      { id: "filterCompleted", label: "Show completed tasks", run: () => setFilter("completed") },
      { id: "filterAll", label: "Show all tasks", run: () => setFilter("all") },
      { id: "calendarMonth", label: "Show month calendar", run: () => { setView("calendar"); setCalendarMode("month"); } },
      { id: "calendarWeek", label: "Show week calendar", run: () => { setView("calendar"); setCalendarMode("week"); } },
      { id: "calendarDay", label: "Show day calendar", run: () => { setView("calendar"); setCalendarMode("day"); } },
      { id: "calendarPrevious", label: "Previous calendar period", run: () => view === "calendar" && calendarRef.current?.shift(-1) },
      { id: "calendarNext", label: "Next calendar period", run: () => view === "calendar" && calendarRef.current?.shift(1) },
      { id: "focusSearch", label: "Focus task search", run: () => searchInputRef.current?.focus() },
      { id: "toggleSort", label: "Toggle date/category sort", run: () => setSortBy((current) => current === "course" ? "date" : "course") },
      { id: "quickLink", label: "Add quick link", run: () => setQuickLinkOpen(true) },
      { id: "openPlanner", label: "Open planner", run: () => setPlannerOpen(true) },
      { id: "toggleToday", label: "Show or hide today's plan", run: () => setTodayOpen((v) => !v) },
      { id: "openSettings", label: "Open keybind settings", run: () => setSettingsOpen(true) },
      { id: "showShortcuts", label: "Show keyboard shortcuts", run: () => openShortcuts() },
      { id: "openGuide", label: "What you can do", run: () => setGuideOpen("desktop") },
      { id: "openPrivacy", label: "Privacy and your data", run: () => setPrivacyOpen("desktop") },
    ],
    [view],
  );

  const viewSwitch = <SegmentedControl label="View" className="inline-grid shrink-0" segmentClassName="px-2" options={VIEW_OPTIONS} value={view} fromValue={previousView} onChange={setView} />;

  function emptyListState() {
    // Category view holds back tasks that are more than a week out
    if (visibleTasks.length > 0) {
      return { title: "Nothing due this week", detail: "Tasks due later stay out of the category view until they're a week away.", action: "Sort by date", onAction: () => setSortBy("date") };
    }
    const query = search.trim();
    if (query || activeFilterCount({ courseFilter, typeFilter, priorityFilter, dueFilter }) > 0) {
      const words = [
        filter === "completed" && "completed",
        dueFilter === "overdue" && "overdue",
        priorityFilter === "urgent" && "urgent",
        priorityFilter === "normal" && "normal-priority",
        TYPE_NOUNS[typeFilter],
        dueFilter === "soon" && "due soon",
        courseFilter !== "all" && `in ${courseMap[courseFilter]?.name ?? "this category"}`,
        query && `matching “${query}”`,
      ].filter(Boolean);
      return { title: `No ${words.join(" ")}`, action: "Clear filters", onAction: () => { resetFilters(); setSearch(""); } };
    }
    if (filter === "active" && resolvedTodos.some((todo) => todo.completed)) {
      return { title: "All caught up", detail: "Everything on your list is done.", action: "Show completed", onAction: () => setFilter("completed") };
    }
    if (filter === "completed") return { title: "Nothing completed yet", action: "Show active", onAction: () => setFilter("active") };
    return { fresh: true, title: "Nothing here yet", detail: "Add a task and it'll show up here.", action: "Add a task", onAction: () => openQuickAdd() };
  }

  useEffect(() => () => { clearTimeout(undoTimerRef.current); clearTimeout(toastLeaveTimerRef.current); }, []);

  if (isSupabaseConfigured && authLoading) {
    return <LoadingScreen />;
  }
  if (isSupabaseConfigured && emailConfirmed) {
    return (
      <EmailConfirmedScreen
        onContinue={() => {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          setEmailConfirmed(false);
        }}
      />
    );
  }
  if (isSupabaseConfigured && recovering && session) {
    return (
      <NewPasswordScreen
        email={session.user.email}
        onDone={() => {
          clearHash();
          setRecovering(false);
        }}
      />
    );
  }
  if (isSupabaseConfigured && !session) return <AuthScreen notice={authNotice} />;

  const emptyState = orderedTasks.length === 0 ? emptyListState() : null;
  // A brand-new list shows Getting started instead of saying it's empty
  const listIntro = (mobile) => (
    <>
      {whatsNewOpen && <WhatsNew mobile={mobile} onOpenGuide={() => setGuideOpen(mobile ? "mobile" : "desktop")} onClose={() => setWhatsNewOpen(false)} />}
      {showChecklist && (
        <GettingStarted
          mobile={mobile}
          steps={mobile ? mobileSteps : desktopSteps}
          onAction={runStep}
          onSkip={(id) => updatePrefs((current) => skipStep(current, id))}
          onClose={(done) => hideChecklist(done)}
          onShowGuide={() => setGuideOpen(mobile ? "mobile" : "desktop")}
        />
      )}
    </>
  );
  const showEmpty = emptyState && !(showChecklist && emptyState.fresh);

  return (
    <CanvasActionsContext.Provider value={canvasActions}>
      <div className="mobile-app md:hidden">
        <header className={`mobile-header ${mobileScrolled ? "is-scrolled" : ""} ${mobileTab === "calendar" ? "mobile-calendar-header" : ""} ${mobileSearchOpen ? "is-searching" : ""}`}>
          {mobileTab !== "calendar" && <div className="mobile-title"><h1>{MOBILE_TABS.find((tab) => tab.id === mobileTab)?.label}</h1><p className="mobile-date">{now.toLocaleDateString(undefined, { month: "short", day: "numeric" })} <span>•</span> {now.toLocaleDateString(undefined, { weekday: "long" })}</p></div>}
          <button type="button" onClick={toggleMobileSearch} className="mobile-icon-button mobile-hit" aria-label="Toggle search" aria-expanded={mobileSearchOpen}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg></button>
          <div className={`mobile-search-inline ${mobileSearchOpen ? "is-open" : ""}`} inert={!mobileSearchOpen}><input ref={mobileSearchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks and notes..." enterKeyHint="search" /></div>
        </header>
        <main style={{ position: "relative", overflowX: "clip", "--tab-shift": `${mobileTabShift}px`, "--leave-offset": `${leaveOffset}px` }}>
          <div hidden={tabPanelHidden("tasks")} className={`mobile-content ${tabPanelClass("tasks")}`}><section><div className="mobile-pill-row"><button type="button" onClick={() => setCourseFilter("all")} className={`mobile-pill ${courseFilter === "all" ? "mobile-pill-active" : ""}`}>All</button>{courses.map((course) => <button type="button" key={course.id} onClick={() => setCourseFilter(course.id)} className={`mobile-pill ${courseFilter === course.id ? "mobile-pill-active" : ""}`}><span style={{ backgroundColor: course.color }} />{course.name}</button>)}</div>{listIntro(true)}{canvasAvailable && <CanvasLinkNotice variant="mobile" canvas={canvas} onFix={openCanvasReplace} />}{canvasAvailable && <CanvasCoursesNotice variant="mobile" courses={canvasNoticeCourses} onMatch={openCanvasMatch} onDismiss={() => setHiddenCourseKeys((keys) => [...keys, ...canvasNoticeCourses.map((course) => course.key)])} />}{orderedTasks.length === 0 ? (showEmpty ? <div className="mobile-empty">No tasks here.</div> : null) : <div className="space-y-5">{(groupedTasks || [{ course: null, tasks: visibleTasks }]).map((group) => <div key={group.course?.id || "all"}>{group.course && <div className="mobile-group-label"><span style={{ backgroundColor: group.course.color }} />{group.course.name}</div>}<ul className="space-y-2">{group.tasks.map((todo) => <TodoItem key={todo.id} mobile leavesOnComplete={leavesListOnComplete(todo)} todo={todo} course={courseMap[todo.courseId]} project={projectMap[todo.projectId]} onToggle={toggleTodo} onDelete={deleteTodo} onEdit={editItem} selected={todo.id === selectedId} />)}</ul></div>)}</div>}{resolvedTodos.some((todo) => todo.completed) && <button type="button" onClick={() => setFilter(filter === "active" ? "all" : "active")} className="mobile-show-completed mobile-hit">{filter === "active" ? "Show completed" : "Hide completed"}</button>}</section></div>
          <div hidden={tabPanelHidden("calendar")} className={`mobile-content mobile-calendar-content ${tabPanelClass("calendar")}`}><section className="mobile-calendar-section"><CalendarView ref={calendarRef} todos={todosView} courseMap={courseMap} mode={mobileCalendarMode} compact onModeChange={setMobileCalendarMode} onEdit={editItem} onSelectDate={(date) => { setMobileSelectedDate(date); setMobileCalendarMode("day"); }} onQuickAdd={(title, dueDate) => addTodo({ type: "task", title, courseId: null, dueDate, priority: "normal" })} /></section></div>
          <div hidden={tabPanelHidden("profile")} className={`mobile-content ${tabPanelClass("profile")}`}><section className="mobile-profile space-y-3"><div className="mobile-section-heading mobile-account"><div className="min-w-0"><p className="mobile-email-heading">{session?.user?.email || "Local account"}</p><p className="mobile-account-status">{syncStatus}</p></div>{session && <button type="button" onClick={signOutFlow.signOut} aria-disabled={signOutFlow.status === "saving"} className="mobile-filter-button mobile-hit aria-disabled:opacity-60">{signOutFlow.status === "saving" ? "Signing out…" : "Sign out"}</button>}</div>{signOutFlow.status === "unsaved" && <SignOutNotice className="text-[13px]" onRetry={signOutFlow.signOut} onSignOutAnyway={signOutFlow.signOutAnyway} />}<h3 className="mobile-group-title">Overview</h3><StatsBar todos={todosView} /><ActivityHeatmap todos={todos} /><h3 className="mobile-group-title">Manage</h3>{canvasAvailable && <CanvasMobilePanel ready={canvasReady} canvas={canvas} sync={canvasSync} onConnect={openCanvasConnect} onManage={() => setCanvasSettingsOpen(true)} onFix={openCanvasReplace} />}<section className="mobile-panel"><div className="mobile-panel-heading"><h3>Quick links</h3><span>{quickLinks.length}</span></div>{quickLinks.length ? <ul className="space-y-1">{quickLinks.map((link) => <li key={link.id} className="flex items-center justify-between"><a href={link.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-course-600">{link.label}</a><button type="button" onClick={() => setQuickLinks((prev) => prev.filter((item) => item.id !== link.id))} className="mobile-hit px-2 text-lg leading-none text-slate-300" aria-label={`Delete ${link.label}`}>×</button></li>)}</ul> : <p className="mobile-muted">Add the links you use most.</p>}<button type="button" onClick={() => setQuickLinkOpen(true)} className="mobile-panel-action"><span aria-hidden="true">+</span>Add link</button></section><section className="mobile-panel"><div className="mobile-panel-heading"><h3>Categories</h3><span>{courses.length}</span></div><ul className="space-y-2">{courses.map((course) => <li key={course.id} className="flex items-center gap-2"><label className="mobile-color-dot mobile-hit" style={{ backgroundColor: course.color }}><input type="color" value={course.color} onChange={(event) => updateCourseColor(course.id, event.target.value)} aria-label={`${course.name} color`} /></label><button type="button" onClick={() => startRenameCourse(course)} className={`min-w-0 flex-1 truncate text-left text-sm ${course.archived ? "text-slate-400" : "text-slate-700"}`}>{course.name}{course.archived && <span className="ml-1.5 text-[11px] font-medium text-slate-400">Archived</span>}</button><span className="text-xs text-slate-400">{resolvedTodos.filter((todo) => todo.courseId === course.id && !todo.completed).length}</span></li>)}</ul><form onSubmit={addCourse} className="mt-3 flex gap-2"><input ref={mobileCategoryInputRef} value={newCourseName} onChange={(event) => setNewCourseName(event.target.value)} placeholder="New category" aria-label="New category" className="mobile-field" /><button type="submit" className="mobile-add-button">Add</button></form></section><section className="mobile-panel"><div className="mobile-panel-heading"><h3>Help</h3></div><ul className="mobile-help-list"><li><button type="button" onClick={() => setGuideOpen("mobile")} className="mobile-help-row">What you can do<span aria-hidden="true">›</span></button></li>{session && <li><button type="button" onClick={() => setPrivacyOpen("mobile")} className="mobile-help-row">Privacy and your data<span aria-hidden="true">›</span></button></li>}</ul></section></section></div>
        </main>
        <div className="mobile-dock"><button type="button" onClick={() => setMobileAddOpen(true)} className="mobile-add-fab" aria-label="Add task or event"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button><nav className="mobile-bottom-nav" aria-label="Primary navigation"><span aria-hidden="true" className="mobile-nav-indicator" style={{ transform: `translateX(${MOBILE_TABS.findIndex((tab) => tab.id === mobileTab) * 100}%)` }} />{MOBILE_TABS.map((item) => <button type="button" key={item.id} onPointerDown={(event) => event.isPrimary && event.button === 0 && switchMobileTab(item.id)} onClick={() => switchMobileTab(item.id)} aria-current={mobileTab === item.id ? "page" : undefined} className={mobileTab === item.id ? "mobile-nav-active" : ""}>{item.icon}{item.label}</button>)}</nav></div>
        <MobileAddSheet open={mobileAddOpen} courses={activeCourses} onAdd={addTodo} onClose={closeMobileAdd} initialText={mobileAddText} onType={() => offerTip("quickAdd")} tip={tipProps("quickAdd", QUICK_ADD_TIP)} />
      </div>

      <div className="hidden h-screen overflow-hidden md:flex">
      <div className="mx-auto flex h-full min-w-0 max-w-7xl flex-1 gap-4 overflow-hidden px-4 py-3 sm:px-6">
      <aside className="no-scrollbar flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pb-2 pr-1">
        {/* The one place the date is said: it answers "where am I" for the whole dashboard */}
        <header className="pt-1 leading-none">
          <h1 className="sr-only">Todo</h1>
          <p className="text-3xl font-medium tracking-tight text-slate-900">{dayName}</p>
          <p className="mt-1.5 text-base font-semibold text-slate-500">{monthDate}</p>
        </header>

        <button
          onClick={openQuickAdd}
          className="flex items-center justify-between rounded-xl border border-todo-200 bg-todo-50 px-3 py-2 text-sm font-medium text-todo-700 hover:border-todo-300"
        >
          Quick add
          <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs text-todo-600">{comboLabel(resolvedKeymap.quickAdd)}</span>
        </button>

        <button
          onClick={() => setPlannerOpen(true)}
          className="flex items-center justify-between rounded-xl border border-course-100 bg-course-50 px-3 py-2 text-sm font-medium text-course-700 hover:border-course-300"
        >
          Planner
          <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs text-course-600">{comboLabel(resolvedKeymap.openPlanner)}</span>
        </button>

        <AddTodoForm
          ref={addInputRef}
          courses={activeCourses}
          onAdd={addFromForm}
          collapsed={addFormCollapsed}
          onToggleCollapsed={() => setAddFormCollapsed((v) => !v)}
        />
        {activeTip === "pressN" && (
          <Tip onDismiss={() => dismissTip("pressN")}>
            Press <kbd className="rounded border border-course-300 bg-white px-1 font-sans font-semibold text-course-700">{comboLabel(resolvedKeymap.quickAdd)}</kbd> to open quick add from anywhere, then type the whole task in one line.
          </Tip>
        )}

        <div className="rounded-card border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Categories</p>
          <ul className="space-y-1">
            {activeCourses.map((c) => (
              <li key={c.id} className="group flex items-center gap-1.5">
                <label className="relative h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: c.color || "#94a3b8" }}>
                  <input
                    type="color"
                    value={c.color || "#94a3b8"}
                    onChange={(e) => updateCourseColor(c.id, e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={`${c.name} color`}
                  />
                </label>
                {editingCourseId === c.id ? (
                  <input
                    autoFocus
                    value={editingCourseName}
                    onChange={(e) => setEditingCourseName(e.target.value)}
                    onBlur={submitRenameCourse}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRenameCourse();
                      if (e.key === "Escape") setEditingCourseId(null);
                    }}
                    className="field-tint min-w-0 flex-1 rounded border border-course-300 px-1.5 py-0.5 text-sm outline-none"
                  />
                ) : (
                  <button onClick={() => startRenameCourse(c)} className="press-tint min-w-0 flex-1 truncate rounded text-left text-sm text-slate-700 hover:text-course-600">
                    {c.name}
                  </button>
                )}
                <button
                  onClick={() => setCourseArchived(c.id, true)}
                  disabled={isLastActiveCourse(c)}
                  title="Archive category"
                  className="row-action shrink-0 rounded-full p-0.5 text-slate-300 hover:text-slate-600"
                  aria-label={`Archive ${c.name}`}
                >
                  <ArchiveIcon />
                </button>
                <button
                  onClick={() => deleteCourse(c.id)}
                  disabled={isLastActiveCourse(c)}
                  className="row-action shrink-0 rounded-full p-0.5 text-slate-300 hover:text-danger-500"
                  aria-label="Delete category"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addCourse} className="mt-2 flex items-center gap-1.5">
            <input
              ref={categoryInputRef}
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="New category"
              aria-label="New category"
              className="field-tint w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-course-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-course-600">
              Add
            </button>
          </form>
        </div>

        {archivedCourses.length > 0 && (
          <div className="rounded-card border border-slate-200 bg-white p-3 shadow-sm">
            <button
              type="button"
              onClick={() => setArchivedOpen((v) => !v)}
              aria-expanded={archivedOpen}
              aria-controls="archived-categories"
              className="press-tint -m-1 flex w-[calc(100%+0.5rem)] items-center gap-1 rounded-lg p-1 text-left text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              <Chevron open={archivedOpen} />
              Archived categories
              <span className="ml-auto text-caption font-normal text-slate-400 tabular-nums">{archivedCourses.length}</span>
            </button>
            <Collapsible open={archivedOpen} id="archived-categories">
              <ul className="space-y-1 pt-2">
                {archivedCourses.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1.5">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full opacity-50 ring-1 ring-inset ring-black/10" style={{ backgroundColor: c.color || "#94a3b8" }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-400">{c.name}</span>
                    <button
                      onClick={() => setCourseArchived(c.id, false)}
                      className="shrink-0 rounded px-1 text-caption font-medium text-course-600 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                      aria-label={`Restore ${c.name}`}
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => deleteCourse(c.id)}
                      className="row-action shrink-0 rounded-full p-0.5 text-slate-300 hover:text-danger-500"
                      aria-label={`Delete ${c.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </Collapsible>
          </div>
        )}

        {/* Help and commands live with the rest of the app's chrome rather than floating over content */}
        <div className="mt-auto shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setGuideOpen("desktop")}
              className="press-tint flex-1 rounded-lg px-2 py-1.5 text-left text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              What you can do
            </button>
            <button
              onClick={openShortcuts}
              className="press-tint flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              Shortcuts
              <span className="rounded bg-slate-900/5 px-1.5 py-0.5 font-mono">{comboLabel(resolvedKeymap.showShortcuts)}</span>
            </button>
          </div>
          <button
            onClick={() => setPaletteOpen(true)}
            title={`Open commands (${comboLabel(resolvedKeymap.openSettings)} to edit shortcuts)`}
            className="press-tint flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Commands
            <span className="rounded bg-slate-900/5 px-1.5 py-0.5 font-mono">{comboLabel(resolvedKeymap.openPalette)}</span>
          </button>
        </div>
      </aside>

      <main ref={taskListRef} className="@container flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* The list/calendar switch leads each view's own toolbar, so neither view has a strip of chrome to itself */}
        <div className="relative min-h-0 flex-1">
          {view === "list" && (
            <div key="list" className="absolute inset-0 flex flex-col">
            {/* One toolbar for the list, beside what it changes. It wraps onto a second line when the Today panel
                makes the column narrow, rather than cutting controls off. */}
            <div className="relative z-20 mb-2 flex shrink-0 flex-wrap items-center gap-2">
              {viewSwitch}
              <div className="flex min-w-48 flex-1 items-center gap-2">
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  aria-label="Search tasks and notes"
                  className="field-tint min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none"
                />
                <FilterMenu courses={courses} filters={{ courseFilter, typeFilter, priorityFilter, dueFilter }} onChange={changeFilters} onReset={resetFilters} />
              </div>
              {/* Right-aligned when it shares the line; when the column is narrow enough to wrap, it starts a line of its own at the left */}
              <div className="ml-auto flex shrink-0 items-center gap-2 @max-[40rem]:ml-0">
                <SegmentedControl label="Show" className="inline-grid shrink-0" options={STATUS_OPTIONS} value={filter} onChange={setFilter} />
                <span className="text-caption font-medium text-slate-500" aria-hidden="true">Sort</span>
                <SegmentedControl label="Sort by" className="inline-grid shrink-0" options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
              </div>
            </div>
            <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
              {listIntro(false)}
              {canvasAvailable && <CanvasLinkNotice canvas={canvas} onFix={openCanvasReplace} />}{canvasAvailable && <CanvasCoursesNotice courses={canvasNoticeCourses} onMatch={openCanvasMatch} onDismiss={() => setHiddenCourseKeys((keys) => [...keys, ...canvasNoticeCourses.map((course) => course.key)])} />}
              {/* Rows glide to their new places when the sort or a filter changes (not while typing a search) */}
              <FlipScope containerRef={listScrollRef} flipKey={[sortBy, filter, courseFilter, typeFilter, priorityFilter, dueFilter].join("|")}>
              {emptyState ? (
                showEmpty && <EmptyList {...emptyState} />
              ) : groupedTasks ? (
                <div className="space-y-4 pb-2">
                  {groupedTasks.map((g) => (
                    <div key={g.course.id}>
                      <div data-flip-key={`group:${g.course.id}`} className="mb-1.5 flex items-center gap-1.5 px-0.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.course.color }} />
                        <h3 className="text-xs font-medium text-slate-500">{g.course.name}</h3>
                      </div>
                      <ul className="space-y-2">
                        {g.blocks.map((block) => block.task ? (
                          <TodoItem
                            key={block.key}
                            todo={block.task}
                            course={courseMap[block.task.courseId]}
                            project={projectMap[block.task.projectId]}
                            onToggle={toggleTodo}
                            onDelete={deleteTodo}
                            onEdit={editItem}
                            selected={block.task.id === selectedId}
                            hideCourse
                          />
                        ) : (
                          <MilestoneCard
                            key={block.key}
                            milestone={block.milestone}
                            tasks={block.tasks}
                            course={courseMap[g.course.id]}
                            project={projectMap[block.milestone.projectId]}
                            onToggle={toggleTodo}
                            onDelete={deleteTodo}
                            onEdit={editItem}
                            selectedId={selectedId}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 pb-2">
                  {groupedDates.map((group) => (
                    <div key={group.key}>
                      <h3 data-flip-key={`date:${group.key}`} className="mb-1.5 px-0.5 text-xs font-medium text-slate-500">{group.label}</h3>
                      <ul className="space-y-2">
                        {group.tasks.map((todo) => (
                          <TodoItem
                            key={todo.id}
                            todo={todo}
                            course={courseMap[todo.courseId]}
                            project={projectMap[todo.projectId]}
                            onToggle={toggleTodo}
                            onDelete={deleteTodo}
                            onEdit={editItem}
                            selected={todo.id === selectedId}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              </FlipScope>
            </div>
            </div>
          )}
          {view === "calendar" && (
            <div key="calendar" className="absolute inset-0">
              <CalendarView
                ref={calendarRef}
                todos={todosView}
                courseMap={courseMap}
                mode={calendarMode}
                onModeChange={setCalendarMode}
                onEdit={editItem}
                onQuickAdd={(title, dueDate) => addTodo({ type: "task", title, courseId: null, dueDate, priority: "normal" })}
                toolbarStart={viewSwitch}
              />
            </div>
          )}
        </div>
      </main>

      <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto pb-2 pl-1">
        <StatsBar todos={todosView} dueFilter={dueFilter} onShowDue={showDue} />

        <ActivityHeatmap todos={todos} />

        <section className="rounded-card border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Quick links</p>
            <span className="text-caption text-slate-400 tabular-nums">{quickLinks.length}</span>
          </div>
          {quickLinks.length > 0 && (
            <ul className="mb-2 space-y-1">
              {quickLinks.map((link) => (
                <li key={link.id} className="group flex min-w-0 items-center gap-1">
                  <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-lg px-1 py-1 text-xs font-medium text-course-600 hover:bg-course-50 hover:text-course-700" title={link.url}>
                    {link.label}
                  </a>
                  <button onClick={() => setQuickLinks((prev) => prev.filter((item) => item.id !== link.id))} className="row-action shrink-0 rounded-full px-1 text-xs text-slate-300 hover:text-danger-500" aria-label={`Delete ${link.label}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setQuickLinkOpen(true)} className="w-full rounded-lg border border-dashed border-course-300 px-2 py-1.5 text-xs font-medium text-course-600 hover:bg-course-50">Add quick link</button>
        </section>

        {/* Canvas sits with the other ways out to school sites: set up once, then a quiet status line */}
        {canvasAvailable && <CanvasCard ready={canvasReady} canvas={canvas} sync={canvasSync} onConnect={openCanvasConnect} onManage={() => setCanvasSettingsOpen(true)} onFix={openCanvasReplace} />}

        {/* Account details matter least day to day, so they settle at the bottom */}
        {session && (
          <div className="mt-auto shrink-0 space-y-2">
            {signOutFlow.status === "unsaved" && <SignOutNotice className="text-xs" onRetry={signOutFlow.signOut} onSignOutAnyway={signOutFlow.signOutAnyway} />}
            <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0"><span className="block truncate" title={session.user.email}>{session.user.email}</span><span className="block text-caption text-slate-400">{syncStatus}</span></span>
                <button type="button" onClick={signOutFlow.signOut} aria-disabled={signOutFlow.status === "saving"} className="shrink-0 font-medium text-course-600 hover:text-course-700 aria-disabled:opacity-60">{signOutFlow.status === "saving" ? "Signing out…" : "Sign out"}</button>
              </div>
              <button type="button" onClick={() => setPrivacyOpen("desktop")} className="mt-1.5 border-t border-slate-100 pt-1.5 w-full text-left text-caption text-slate-400 hover:text-slate-600">Privacy and your data</button>
            </div>
          </div>
        )}
      </aside>
      </div>

      <TodayPanel
        open={todayOpen}
        onToggle={() => setTodayOpen((v) => !v)}
        shortcut={resolvedKeymap.toggleToday}
        todos={todosView}
        courseMap={courseMap}
        planner={planner}
        updatePlanner={updatePlanner}
        onToggleTodo={toggleTodo}
        onOpenPlanner={openPlannerToday}
      />
      </div>
      {toast && (
        <div key={toast.id} role="status" className={`undo-toast toast-layer glass-dark fixed bottom-4 left-1/2 z-50 flex max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-xs text-white ${toastLeaving ? "is-leaving" : ""}`}>
          <span className="min-w-0 truncate">{toast.message}</span>
          <button onClick={undoLastAction} className="shrink-0 font-semibold text-todo-300 hover:text-todo-200">Undo</button>
        </div>
      )}

      {syncError && (
        <div role="status" title={syncError} className="sync-status toast-layer glass-light fixed bottom-4 left-4 z-50 flex max-w-xs items-center gap-2 rounded-full px-4 py-2 text-xs text-slate-600">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger-500" />
          <span className="min-w-0 flex-1 truncate">{navigator.onLine === false ? "Offline. Changes will sync when you reconnect." : "Couldn't sync. Retrying automatically."}</span>
          <button onClick={() => setSyncError("")} className="shrink-0 font-medium text-slate-400 hover:text-slate-600" aria-label="Dismiss sync error">×</button>
        </div>
      )}
      {showCanvasPill && (
        <div role="status" className="sync-status toast-layer glass-light fixed bottom-4 left-4 z-50 flex max-w-xs items-center gap-2 rounded-full px-4 py-2 text-xs text-slate-600">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <span className="min-w-0 flex-1 truncate">Couldn't check Canvas. It'll try again later.</span>
          <button onClick={() => setSeenCanvasError(canvasQuietError)} className="shrink-0 font-medium text-slate-400 hover:text-slate-600" aria-label="Dismiss Canvas status">×</button>
        </div>
      )}
      <CommandPalette open={paletteOpen} commands={commands} keymap={resolvedKeymap} onClose={() => setPaletteOpen(false)} />
      <KeybindSettings open={settingsOpen} keymap={resolvedKeymap} setKeymap={setKeymap} onClose={() => setSettingsOpen(false)} />
      <PlannerModal
        open={plannerOpen}
        tabRequest={plannerTabRequest}
        suspended={Boolean(editingItem)}
        onClose={() => setPlannerOpen(false)}
        keymap={resolvedKeymap}
        todos={todosView}
        courses={activeCourses}
        courseMap={courseMap}
        planner={planner}
        updatePlanner={updatePlanner}
        onToggleTodo={toggleTodo}
        onAddTodo={addTodo}
        onUpdateTodo={updateTodo}
        onEdit={editItem}
        onDeleteTodo={deleteTodo}
        onDeleteProject={deleteProject}
        onCompleteProject={completeProject}
      />
      <EditItemModal
        item={editingItem}
        tip={tipProps("repeatEdit", "To remove just this date and keep the rest, use Delete… and choose only this one.")}
        courses={courses.filter((c) => !c.archived || c.id === editingItem?.courseId)}
        // A project marked done isn't offered for new tasks, apart from the one this is already in
        projects={planner.projects.filter((project) => !isProjectDone(project) || project.id === editingItem?.projectId)}
        milestones={todos.filter((todo) => todo.type === "milestone")}
        onSave={(id, patch) => {
          updateTodo(id, patch);
          setEditingItem(null);
        }}
        onDelete={deleteTodo}
        onSkipOccurrence={skipOccurrence}
        onClose={() => setEditingItem(null)}
      />
      <QuickAddModal
        open={quickAddOpen}
        initialText={quickAddText}
        courses={activeCourses}
        onAdd={(item) => addTodo(item)}
        onClose={closeQuickAdd}
        onType={() => offerTip("quickAdd")}
        tip={tipProps("quickAdd", QUICK_ADD_TIP)}
      />
      <ShortcutsSheet open={shortcutsOpen} keymap={resolvedKeymap} onClose={() => setShortcutsOpen(false)} onEdit={() => { setShortcutsOpen(false); setSettingsOpen(true); }} />
      <FeatureGuide
        open={Boolean(guideOpen)}
        mobile={guideOpen === "mobile"}
        flags={{ canvas: canvasAvailable }}
        keymap={resolvedKeymap}
        onOpen={openFromGuide}
        onClose={() => setGuideOpen(null)}
        onShowChecklist={prefsReady && !checklistShown(prefs) ? showChecklistAgain : undefined}
      />
      <PrivacyDialog
        open={Boolean(privacyOpen)}
        mobile={privacyOpen === "mobile"}
        email={session?.user?.email}
        canDelete={isSupabaseConfigured && Boolean(session)}
        onDeleteAccount={deleteAccount}
        onClose={() => setPrivacyOpen(null)}
      />
      <QuickLinkModal open={quickLinkOpen} onAdd={addQuickLink} onClose={() => setQuickLinkOpen(false)} />
      {canvasAvailable && (
        <Suspense fallback={null}>
          <CanvasConnectModal
            open={canvasOpen}
            onClose={closeCanvas}
            onImport={importCanvas}
            canvas={canvas}
            courses={courses}
            todos={todos}
            quickLinks={quickLinks}
            matchRequest={canvasMatch && { ...canvasMatch, items: canvasSync.feedItems(canvasMatch.domain) }}
            replaceDomain={canvasReplace}
          />
          <CanvasSettingsModal
            open={canvasSettingsOpen}
            onClose={closeCanvasSettings}
            canvas={canvas}
            courses={courses}
            todos={todos}
            sync={canvasSync}
            onReplaceLink={openCanvasReplace}
            onConnectAnother={openCanvasConnect}
            onChangeMapping={changeCanvasMapping}
            onChangeOption={changeCanvasOption}
            onDisconnect={disconnectCanvas}
          />
        </Suspense>
      )}
    </CanvasActionsContext.Provider>
  );
}
