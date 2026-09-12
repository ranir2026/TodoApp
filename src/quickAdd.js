const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const SUGGESTION_KEYWORDS = [
  { insert: "today", hint: "due today" },
  { insert: "tomorrow", hint: "due tomorrow" },
  { insert: "tmrw", hint: "due tomorrow" },
  { insert: "monday", hint: "due next Monday" },
  { insert: "tuesday", hint: "due next Tuesday" },
  { insert: "wednesday", hint: "due next Wednesday" },
  { insert: "thursday", hint: "due next Thursday" },
  { insert: "friday", hint: "due next Friday" },
  { insert: "saturday", hint: "due next Saturday" },
  { insert: "sunday", hint: "due next Sunday" },
  { insert: "daily", hint: "repeats every day" },
  { insert: "weekly", hint: "repeats every week" },
  { insert: "monthly", hint: "repeats every month" },
  { insert: "urgent", hint: "marks it urgent" },
  { insert: "tk", hint: "marks it a task" },
  { insert: "ev", hint: "marks it an event" },
];

function toDateKey(d) {
  return d.toLocaleDateString("en-CA");
}

function combineTime(hStr, minStr, mer) {
  let h = parseInt(hStr, 10);
  const min = minStr ? parseInt(minStr, 10) : 0;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function stripMatch(text, match) {
  return text.slice(0, match.index) + " " + text.slice(match.index + match[0].length);
}

function extractDate(text) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let m = text.match(/\btoday\b/i);
  if (m) return { dueDate: toDateKey(today), text: stripMatch(text, m) };

  m = text.match(/\b(tomorrow|tmrw)\b/i);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { dueDate: toDateKey(d), text: stripMatch(text, m) };
  }

  m = text.match(/\bin\s+(\d+)\s+days?\b/i);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(m[1], 10));
    return { dueDate: toDateKey(d), text: stripMatch(text, m) };
  }

  m = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)(day|\.|)\b/i);
  if (m) {
    const target = DOW.indexOf(m[1].toLowerCase());
    const d = new Date(today);
    const diff = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return { dueDate: toDateKey(d), text: stripMatch(text, m) };
  }

  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return { dueDate: toDateKey(d), text: stripMatch(text, m) };
  }

  m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
    return { dueDate: toDateKey(d), text: stripMatch(text, m) };
  }

  return { dueDate: null, text };
}

function extractTime(text) {
  let m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (m) {
    let [, sh, smin, smer, eh, emin, emer] = m;
    smer = (smer || emer || "").toLowerCase() || undefined;
    emer = (emer || smer || "").toLowerCase() || undefined;
    const startTime = combineTime(sh, smin, smer);
    const endTime = combineTime(eh, emin, emer);
    if (startTime) return { startTime, endTime, text: stripMatch(text, m) };
  }

  m = text.match(/\b(\d{1,2}):([0-5]\d)\b/) || text.match(/\b(\d{1,2})(:([0-5]\d))?\s*(am|pm)\b/i);
  if (m) {
    const startTime = combineTime(m[1], m[2]?.length === 2 ? m[2] : m[3], m[4]);
    if (startTime) return { startTime, endTime: null, text: stripMatch(text, m) };
  }

  return { startTime: null, endTime: null, text };
}

export function parseQuickAdd(rawText, courses) {
  let text = rawText;
  let type = "task";
  let typeExplicit = false;
  let priority = "normal";
  let repeat = "none";
  let courseId = null;
  let courseName = null;

  let m = text.match(/^\s*(event|evt)\s*:\s*/i);
  if (m) {
    type = "event";
    typeExplicit = true;
    text = text.slice(m[0].length);
  }

  m = text.match(/\b(tk|ev)\b/i);
  if (m) {
    type = m[1].toLowerCase() === "ev" ? "event" : "task";
    typeExplicit = true;
    text = stripMatch(text, m);
  }

  if (/!/.test(text)) {
    priority = "urgent";
    text = text.replace(/!/g, " ");
  }
  if (/\burgent\b/i.test(text)) {
    priority = "urgent";
    text = text.replace(/\burgent\b/i, " ");
  }

  m = text.match(/\b(daily|weekly|monthly)\b/i);
  if (m) {
    repeat = m[1].toLowerCase();
    text = stripMatch(text, m);
  } else {
    m = text.match(/\bevery\s+(day|week|month)\b/i);
    if (m) {
      repeat = m[1].toLowerCase() === "day" ? "daily" : m[1].toLowerCase() === "week" ? "weekly" : "monthly";
      text = stripMatch(text, m);
    }
  }

  m = text.match(/@([A-Za-z0-9][\w-]*)/);
  if (m && courses.length) {
    const q = m[1].toLowerCase();
    const found = courses.find((c) => c.name.toLowerCase().startsWith(q)) || courses.find((c) => c.name.toLowerCase().includes(q));
    if (found) {
      courseId = found.id;
      courseName = found.name;
    }
    text = stripMatch(text, m);
  }

  const timeResult = extractTime(text);
  text = timeResult.text;

  const dateResult = extractDate(text);
  text = dateResult.text;

  const title = text.replace(/\s+/g, " ").trim();

  return {
    type,
    typeExplicit,
    title,
    priority,
    repeat,
    courseId,
    courseName,
    dueDate: dateResult.dueDate,
    startTime: timeResult.startTime,
    endTime: timeResult.endTime,
  };
}
