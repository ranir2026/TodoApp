import { useMemo, useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import StatsBar from "./StatsBar";
import AddTodoForm from "./AddTodoForm";
import TodoItem from "./TodoItem";

const DEFAULT_COURSES = [
  { id: "c1", name: "General" },
];

export default function App() {
  const [courses, setCourses] = useLocalStorage("courses", DEFAULT_COURSES);
  const [todos, setTodos] = useLocalStorage("todos", []);
  const [filter, setFilter] = useState("active"); // active | completed | all
  const [newCourseName, setNewCourseName] = useState("");

  function addTodo({ title, courseId, dueDate, priority }) {
    setTodos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title,
        courseId,
        dueDate,
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
        <AddTodoForm courses={courses} onAdd={addTodo} />
      </section>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
      </section>

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
          />
        ))}
      </ul>
    </div>
  );
}
