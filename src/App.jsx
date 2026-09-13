import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import StatsBar from "./StatsBar";
import AddTodoForm from "./AddTodoForm";
import TodoItem from "./TodoItem";
import CalendarView from "./CalendarView";
import CommandPalette from "./CommandPalette";
import KeybindSettings from "./KeybindSettings";
import EditItemModal from "./EditItemModal";
import QuickAddModal from "./QuickAddModal";
import ActivityHeatmap from "./ActivityHeatmap";
import { useGlobalKeybinds } from "./useGlobalKeybinds";
import { DEFAULT_KEYMAP, comboLabel } from "./keybinds";
import { isSupabaseConfigured, supabase } from "./supabase";
import { useSyncedData } from "./useSyncedData";
import AuthScreen from "./AuthScreen";

const DEFAULT_COURSES = [{ id: "c1", name: "General", color: "#6366f1" }];
const COURSE_COLOR_PALETTE = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#0ea5e9", "#8b5cf6", "#f97316", "#14b8a6"];

export default function App() {
  const [courses, setCourses] = useLocalStorage("courses", DEFAULT_COURSES);
  const [todos, setTodos] = useLocalStorage("todos", []);
  const [keymap, setKeymap] = useLocalStorage("keymap", DEFAULT_KEYMAP);
  const [filter, setFilter] = useState("active"); // active | completed | all
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("task");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date"); // date | course
  const [view, setView] = useState("list"); // list | calendar
  const [newCourseName, setNewCourseName] = useState("");
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editingCourseName, setEditingCourseName] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [syncError, setSyncError] = useState("");
  const [undoAction, setUndoAction] = useState(null);
  const undoTimerRef = useRef(null);
  const addInputRef = useRef(null);
  const now = new Date();
  const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const monthDate = now.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSyncError = useCallback((message) => setSyncError(message), []);
  useSyncedData(session?.user, todos, setTodos, courses, setCourses, handleSyncError);

  function addTodo({ type, title, courseId, dueDate, endDate, startTime, endTime, priority, description, repeat, repeatUntil, repeatCount }) {
    setTodos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: type ?? "task",
        title,
        courseId: courseId ?? courses[0]?.id ?? null,
        dueDate,
        endDate: endDate ?? null,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        priority: priority ?? "normal",
        description: description ?? null,
        repeat: repeat ?? "none",
        repeatUntil: repeatUntil ?? null,
        repeatCount: repeatCount ? Number(repeatCount) : null,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function updateTodo(id, patch) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function skipOccurrence(id, occurrenceDate) {
    if (!occurrenceDate) return;
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, skipDates: [...new Set([...(t.skipDates ?? []), occurrenceDate])] } : t));
    setEditingItem(null);
  }

  function toggleTodo(id) {
    const previous = todos.find((t) => t.id === id);
    if (!previous) return;
    const next = { ...previous, completed: !previous.completed, completedAt: !previous.completed ? new Date().toISOString() : null };
    setTodos((prev) => prev.map((t) => (t.id === id ? next : t)));
    showUndo(() => setTodos((prev) => prev.map((t) => (t.id === id ? previous : t))));
  }

  function deleteTodo(id) {
    const index = todos.findIndex((t) => t.id === id);
    const deleted = todos[index];
    if (!deleted) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    showUndo(() => setTodos((prev) => [...prev.slice(0, index), deleted, ...prev.slice(index)]));
    setEditingItem(null);
  }

  function showUndo(undo) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(() => undo);
    undoTimerRef.current = setTimeout(() => setUndoAction(null), 5000);
  }

  function undoLastAction() {
    if (!undoAction) return;
    undoAction();
    setUndoAction(null);
    clearTimeout(undoTimerRef.current);
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

  function deleteCourse(id) {
    if (courses.length <= 1) return;
    if (!window.confirm("Delete this course? Its tasks will move to the first remaining course.")) return;
    setCourses((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      const fallbackId = remaining[0]?.id ?? null;
      setTodos((prevTodos) => prevTodos.map((t) => (t.courseId === id ? { ...t, courseId: fallbackId } : t)));
      return remaining;
    });
  }

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = todos.filter((t) => {
      if (filter === "active") return !t.completed;
      if (filter === "completed") return t.completed;
      return true;
    }).filter((t) => {
      const matchesSearch = !query || `${t.title} ${t.description ?? ""}`.toLowerCase().includes(query);
      const matchesCourse = courseFilter === "all" || t.courseId === courseFilter;
      const matchesType = typeFilter === "all" || (t.type ?? "task") === typeFilter;
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      return matchesSearch && matchesCourse && matchesType && matchesPriority;
    });
    return [...list].sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [todos, filter, search, courseFilter, typeFilter, priorityFilter]);

  const groupedTasks = useMemo(() => {
    if (sortBy !== "course") return null;
    return courses.map((c) => ({ course: c, tasks: visibleTasks.filter((t) => t.courseId === c.id) })).filter((g) => g.tasks.length > 0);
  }, [sortBy, courses, visibleTasks]);

  const orderedTasks = groupedTasks ? groupedTasks.flatMap((g) => g.tasks) : visibleTasks;

  function moveSelection(delta) {
    if (view !== "list" || orderedTasks.length === 0) return;
    const idx = orderedTasks.findIndex((t) => t.id === selectedId);
    const nextIdx = idx === -1 ? 0 : Math.min(Math.max(idx + delta, 0), orderedTasks.length - 1);
    setSelectedId(orderedTasks[nextIdx].id);
  }

  useGlobalKeybinds(
    keymap,
    {
      openPalette: () => setPaletteOpen((v) => !v),
      openSettings: () => setSettingsOpen(true),
      quickAdd: () => setQuickAddOpen(true),
      newTask: () => addInputRef.current?.focus(),
      toggleView: () => setView((v) => (v === "list" ? "calendar" : "list")),
      moveDown: () => moveSelection(1),
      moveUp: () => moveSelection(-1),
      toggleComplete: () => selectedId && toggleTodo(selectedId),
      deleteSelected: () => selectedId && deleteTodo(selectedId),
      filterActive: () => setFilter("active"),
      filterCompleted: () => setFilter("completed"),
      filterAll: () => setFilter("all"),
      escape: () => {
        if (paletteOpen) setPaletteOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (quickAddOpen) setQuickAddOpen(false);
        else if (editingItem) setEditingItem(null);
      },
    },
    !settingsOpen && !editingItem && !quickAddOpen,
  );

  const commands = useMemo(
    () => [
      { id: "quickAdd", label: "Quick add task/event", run: () => setQuickAddOpen(true) },
      { id: "newTask", label: "Focus new task form", run: () => addInputRef.current?.focus() },
      { id: "toggleView", label: "Toggle list / calendar view", run: () => setView((v) => (v === "list" ? "calendar" : "list")) },
      { id: "filterActive", label: "Show active tasks", run: () => setFilter("active") },
      { id: "filterCompleted", label: "Show completed tasks", run: () => setFilter("completed") },
      { id: "filterAll", label: "Show all tasks", run: () => setFilter("all") },
      { id: "openSettings", label: "Open keybind settings", run: () => setSettingsOpen(true) },
    ],
    [],
  );

  if (isSupabaseConfigured && authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading your account...</div>;
  }
  if (isSupabaseConfigured && !session) return <AuthScreen />;

  return (
    <div className="mx-auto flex h-screen max-w-7xl gap-4 overflow-hidden px-4 py-3 sm:px-6">
      <aside className="no-scrollbar flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pb-2 pr-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Todo</h1>
          <p className="text-xs text-slate-400">Stay on top of your coursework.</p>
        </div>

        <button
          onClick={() => setQuickAddOpen(true)}
          className="flex items-center justify-between rounded-xl border border-todo-200 bg-todo-50 px-3 py-2 text-sm font-medium text-todo-700 hover:border-todo-300"
        >
          Quick add
          <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs text-todo-600">{comboLabel(keymap.quickAdd)}</span>
        </button>

        <AddTodoForm ref={addInputRef} courses={courses} onAdd={addTodo} />

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-1.5 text-xs font-medium text-slate-500">Categories</p>
          <ul className="space-y-1">
            {courses.map((c) => (
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
                    className="min-w-0 flex-1 rounded border border-course-400 px-1.5 py-0.5 text-sm outline-none"
                  />
                ) : (
                  <button onClick={() => startRenameCourse(c)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-700 hover:text-course-600">
                    {c.name}
                  </button>
                )}
                <button
                  onClick={() => deleteCourse(c.id)}
                  disabled={courses.length <= 1}
                  className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 hover:text-danger-500 group-hover:opacity-100 disabled:opacity-0"
                  aria-label="Delete category"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addCourse} className="mt-2 flex items-center gap-1.5">
            <input
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="New category..."
              className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-course-500"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-course-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-course-600">
              Add
            </button>
          </form>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {view === "list" ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-todo-400" />
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="max-w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
                <option value="all">All categories</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
                <option value="task">Tasks</option>
                <option value="event">Events</option>
                <option value="all">Everything</option>
              </select>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
                <option value="all">All priority</option>
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
              </select>
              <span className="shrink-0 font-medium">Sort by</span>
              <div className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1">
                {[
                  { id: "date", label: "Date" },
                  { id: "course", label: "Category" },
                ].map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSortBy(o.id)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      sortBy === o.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {orderedTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                No tasks here.
              </div>
            ) : groupedTasks ? (
              <div className="space-y-4 pb-2">
                {groupedTasks.map((g) => (
                  <div key={g.course.id}>
                    <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.course.color }} />
                      <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{g.course.name}</h3>
                    </div>
                    <ul className="space-y-2">
                      {g.tasks.map((todo) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          course={courseMap[todo.courseId]}
                          onToggle={toggleTodo}
                          onDelete={deleteTodo}
                          onEdit={setEditingItem}
                          selected={todo.id === selectedId}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-2 pb-2">
                {visibleTasks.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    course={courseMap[todo.courseId]}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    onEdit={setEditingItem}
                    selected={todo.id === selectedId}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <CalendarView
            todos={todos}
            courseMap={courseMap}
            onEdit={setEditingItem}
            onQuickAdd={(title, dueDate) => addTodo({ type: "task", title, courseId: null, dueDate, priority: "normal" })}
          />
        )}
      </main>

      <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto pb-6 pl-1">
        {session && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500">
            <span className="max-w-32 truncate" title={session.user.email}>{session.user.email}</span>
            <button onClick={() => supabase.auth.signOut()} className="font-medium text-course-600 hover:text-course-700">Sign out</button>
          </div>
        )}
        <StatsBar todos={todos} />

        <ActivityHeatmap todos={todos} />

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {["active", "completed", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {["list", "calendar"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="mt-auto text-right leading-none">
          <p className="text-3xl font-extrabold tracking-tight text-slate-900">{dayName}</p>
          <p className="mt-1 text-base font-semibold text-slate-400">{monthDate}</p>
        </div>
      </aside>

      <button
        onClick={() => setPaletteOpen(true)}
        title={`Open shortcuts (${comboLabel(keymap.openSettings)} to edit)`}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-400 shadow-sm hover:border-slate-300"
      >
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{comboLabel(keymap.openPalette)}</span> Cmds
      </button>

      {undoAction && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
          <span>Action completed</span>
          <button onClick={undoLastAction} className="font-semibold text-todo-300 hover:text-todo-200">Undo</button>
        </div>
      )}

      {syncError && (
        <div className="fixed bottom-4 left-4 z-50 max-w-sm rounded-lg bg-danger-600 px-3 py-2 text-xs text-white shadow-lg">
          Sync error: {syncError}
          <button onClick={() => setSyncError("")} className="ml-2 font-semibold underline">Dismiss</button>
        </div>
      )}

      <CommandPalette open={paletteOpen} commands={commands} keymap={keymap} onClose={() => setPaletteOpen(false)} />
      <KeybindSettings open={settingsOpen} keymap={keymap} setKeymap={setKeymap} onClose={() => setSettingsOpen(false)} />
      <EditItemModal
        item={editingItem}
        courses={courses}
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
        courses={courses}
        onAdd={(item) => addTodo(item)}
        onClose={() => setQuickAddOpen(false)}
      />
    </div>
  );
}
