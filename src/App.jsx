import { useMemo, useRef, useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import StatsBar from "./StatsBar";
import AddTodoForm from "./AddTodoForm";
import TodoItem from "./TodoItem";
import CalendarView from "./CalendarView";
import CommandPalette from "./CommandPalette";
import KeybindSettings from "./KeybindSettings";
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
  const [selectedId, setSelectedId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const addInputRef = useRef(null);

  function addTodo({ title, courseId, dueDate, startTime, endTime, priority }) {
    setTodos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title,
        courseId: courseId ?? courses[0]?.id ?? null,
        dueDate,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        priority,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function toggleTodo(id) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  function deleteTodo(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  function addCourse(e) {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    setCourses((prev) => [...prev, { id: crypto.randomUUID(), name: newCourseName.trim() }]);
    setNewCourseName("");
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
      },
    },
    !settingsOpen,
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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Todo</h1>
          <p className="text-sm text-slate-500">Stay on top of your coursework.</p>
        </div>
        <StatsBar todos={todos} />
      </header>

      <section className="mb-6">
        <AddTodoForm ref={addInputRef} courses={courses} onAdd={addTodo} />
      </section>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {["active", "completed", "all"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
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
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <form onSubmit={addCourse} className="flex items-center gap-2">
            <input
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="New course..."
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-course-500"
            />
            <button type="submit" className="rounded-lg bg-course-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-course-600">
              Add course
            </button>
          </form>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 hover:border-slate-300"
          >
            Commands <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{comboLabel(keymap.openPalette)}</span>
          </button>
        </div>
      </section>

      {view === "list" ? (
        <ul className="space-y-2">
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
              selected={todo.id === selectedId}
            />
          ))}
        </ul>
      ) : (
        <CalendarView
          todos={todos}
          courseMap={courseMap}
          onToggle={toggleTodo}
          onQuickAdd={(title, dueDate) => addTodo({ title, courseId: null, dueDate, priority: "normal" })}
        />
      )}

      <p className="mt-6 text-xs text-slate-400">
        Press <span className="font-mono">{comboLabel(keymap.openPalette)}</span> for commands ·{" "}
        <span className="font-mono">{comboLabel(keymap.openSettings)}</span> to edit shortcuts
      </p>

      <CommandPalette open={paletteOpen} commands={commands} keymap={keymap} onClose={() => setPaletteOpen(false)} />
      <KeybindSettings open={settingsOpen} keymap={keymap} setKeymap={setKeymap} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
