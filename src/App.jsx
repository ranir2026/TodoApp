import { useMemo, useRef, useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import StatsBar from "./StatsBar";
import AddTodoForm from "./AddTodoForm";
import TodoItem from "./TodoItem";
import CalendarView from "./CalendarView";
import CommandPalette from "./CommandPalette";
import KeybindSettings from "./KeybindSettings";
import EditItemModal from "./EditItemModal";
import { useGlobalKeybinds } from "./useGlobalKeybinds";
import { DEFAULT_KEYMAP, comboLabel } from "./keybinds";

const DEFAULT_COURSES = [{ id: "c1", name: "General" }];

export default function App() {
  const [courses, setCourses] = useLocalStorage("courses", DEFAULT_COURSES);
  const [todos, setTodos] = useLocalStorage("todos", []);
  const [keymap, setKeymap] = useLocalStorage("keymap", DEFAULT_KEYMAP);
  const [filter, setFilter] = useState("active"); // active | completed | all
  const [view, setView] = useState("list"); // list | calendar
  const [newCourseName, setNewCourseName] = useState("");
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editingCourseName, setEditingCourseName] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const addInputRef = useRef(null);

  function addTodo({ type, title, courseId, dueDate, startTime, endTime, priority, description, repeatWeekly }) {
    setTodos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: type ?? "task",
        title,
        courseId: courseId ?? courses[0]?.id ?? null,
        dueDate,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        priority: priority ?? "normal",
        description: description ?? null,
        repeatWeekly: repeatWeekly ?? false,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function updateTodo(id, patch) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function toggleTodo(id) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  function deleteTodo(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setEditingItem(null);
  }

  function addCourse(e) {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    setCourses((prev) => [...prev, { id: crypto.randomUUID(), name: newCourseName.trim() }]);
    setNewCourseName("");
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

  const visibleTodos = useMemo(() => {
    const list = todos.filter((t) => {
      if (filter === "active") return !t.completed;
      if (filter === "completed") return t.completed;
      return true;
    });
    return [...list].sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [todos, filter]);

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  function moveSelection(delta) {
    if (view !== "list" || visibleTodos.length === 0) return;
    const idx = visibleTodos.findIndex((t) => t.id === selectedId);
    const nextIdx = idx === -1 ? 0 : Math.min(Math.max(idx + delta, 0), visibleTodos.length - 1);
    setSelectedId(visibleTodos[nextIdx].id);
  }

  useGlobalKeybinds(
    keymap,
    {
      openPalette: () => setPaletteOpen((v) => !v),
      openSettings: () => setSettingsOpen(true),
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
        else if (editingItem) setEditingItem(null);
      },
    },
    !settingsOpen && !editingItem,
  );

  const commands = useMemo(
    () => [
      { id: "newTask", label: "New task", run: () => addInputRef.current?.focus() },
      { id: "toggleView", label: "Toggle list / calendar view", run: () => setView((v) => (v === "list" ? "calendar" : "list")) },
      { id: "filterActive", label: "Show active tasks", run: () => setFilter("active") },
      { id: "filterCompleted", label: "Show completed tasks", run: () => setFilter("completed") },
      { id: "filterAll", label: "Show all tasks", run: () => setFilter("all") },
      { id: "openSettings", label: "Open keybind settings", run: () => setSettingsOpen(true) },
    ],
    [],
  );

  return (
    <div className="mx-auto flex h-screen max-w-6xl gap-4 overflow-hidden px-4 py-3 sm:px-6">
      <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pb-2 pr-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Todo</h1>
          <p className="text-xs text-slate-400">Stay on top of your coursework.</p>
        </div>

        <StatsBar todos={todos} />

        <AddTodoForm ref={addInputRef} courses={courses} onAdd={addTodo} />

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

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-1.5 text-xs font-medium text-slate-500">Courses</p>
          <ul className="space-y-1">
            {courses.map((c) => (
              <li key={c.id} className="group flex items-center gap-1.5">
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
                  aria-label="Delete course"
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
              placeholder="New course..."
              className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-course-500"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-course-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-course-600">
              Add
            </button>
          </form>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setPaletteOpen(true)}
          title={`Open shortcuts (${comboLabel(keymap.openSettings)} to edit)`}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-400 hover:border-slate-300"
        >
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{comboLabel(keymap.openPalette)}</span> Commands
        </button>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {view === "list" ? (
          <ul className="space-y-2 pb-2">
            {visibleTodos.length === 0 && (
              <li className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                No tasks here.
              </li>
            )}
            {visibleTodos.map((todo) => (
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
        ) : (
          <CalendarView
            todos={todos}
            courseMap={courseMap}
            onEdit={setEditingItem}
            onQuickAdd={(title, dueDate) => addTodo({ type: "task", title, courseId: null, dueDate, priority: "normal" })}
          />
        )}
      </main>

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
        onClose={() => setEditingItem(null)}
      />
    </div>
  );
}
