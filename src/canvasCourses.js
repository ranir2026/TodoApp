// Course matching for the Connect Canvas flow: which Canvas courses a feed has, a suggested
// category for each, and applying the user's confirmed choices without duplicate categories.
import { COLOR_PALETTE } from "./courseColors";
import { NO_COURSE, canvasCategoryId, canvasCourseKey, isAssignmentKind, isPastDue } from "./canvasSync";

export const NO_COURSE_LABEL = "Canvas, no course";

// Department codes whose subject isn't a prefix of the usual category name (and common ones that are)
const DEPARTMENTS = {
  PHYS: ["physics"],
  MATH: ["math", "maths", "mathematics", "calculus", "algebra"],
  MTH: ["math", "mathematics"],
  CS: ["computer science", "comp sci", "programming", "coding"],
  CSCI: ["computer science", "comp sci", "programming"],
  COMP: ["computer science", "computing"],
  CHEM: ["chemistry", "chem"],
  BIOL: ["biology", "bio"],
  BIO: ["biology", "bio"],
  ENGL: ["english", "writing", "literature"],
  ENGW: ["english", "writing"],
  WRIT: ["writing", "english"],
  WRT: ["writing", "english"],
  HIST: ["history"],
  PSY: ["psychology", "psych"],
  PSYC: ["psychology", "psych"],
  ECON: ["economics", "econ"],
  STAT: ["statistics", "stats"],
  PHIL: ["philosophy"],
  POLS: ["political science", "politics", "government"],
  SOC: ["sociology"],
  SPAN: ["spanish"],
  FREN: ["french"],
  ARTH: ["art history"],
  MUS: ["music"],
  ECE: ["electrical", "computer engineering"],
  EECE: ["electrical", "computer engineering"],
  ME: ["mechanical"],
  GE: ["engineering"],
  ENGR: ["engineering"],
  BUS: ["business"],
  ACCT: ["accounting"],
  FINA: ["finance"],
  COMM: ["communication", "communications"],
  HONR: ["honors"],
};

const words = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const compact = (text) => words(text).replace(/ /g, "");

// "PHYS1156.30002.202710" -> "PHYS 1156"; "HIST-205-02" -> "HIST 205";
// "Peer.Mentoring.Community.26.27" -> "Peer Mentoring Community"
export function cleanCourseLabel(label) {
  const raw = (label ?? "").trim();
  if (!raw) return "Canvas";
  const code = raw.match(/^([A-Za-z]{2,6})[\s._-]?(\d{2,5}[A-Za-z]?)(?=$|[\s._-])/);
  if (code) return `${code[1].toUpperCase()} ${code[2].toUpperCase()}`;
  const parts = raw.split(/[\s._]+/).filter(Boolean);
  while (parts.length > 1 && /^(\d+|fall|spring|summer|winter|autumn|merged|sec\w*)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

function subjectOf(cleaned) {
  return cleaned.match(/^([A-Z]{2,6}) \d/)?.[1] ?? null;
}

// The best existing category for a Canvas course, or a new one named after it.
// Order: exact or substring match, subject prefix ("PHYS" -> Physics), department table.
export function suggestCategory(label, categories) {
  const cleaned = label ? cleanCourseLabel(label) : NO_COURSE_LABEL;
  const candidates = categories.filter((category) => !category.archived && category.name?.trim());
  if (label) {
    const target = compact(cleaned);
    const exact = candidates.find((category) => compact(category.name) === target);
    if (exact) return { type: "existing", categoryId: exact.id };
    const substring = candidates.find((category) => {
      const name = compact(category.name);
      return name.length >= 3 && (name.includes(target) || target.includes(name));
    });
    if (substring) return { type: "existing", categoryId: substring.id };

    const subject = subjectOf(cleaned);
    if (subject && subject.length >= 3) {
      const prefix = candidates.find((category) => words(category.name).split(" ").some((word) => word.startsWith(subject.toLowerCase())));
      if (prefix) return { type: "existing", categoryId: prefix.id };
    }
    const keywords = subject ? DEPARTMENTS[subject] : null;
    if (keywords) {
      const department = candidates.find((category) => {
        const name = ` ${words(category.name)} `;
        return keywords.some((keyword) => name.includes(` ${keyword} `) || name.startsWith(` ${keyword}`));
      });
      if (department) return { type: "existing", categoryId: department.id };
    }
  }
  return { type: "new", name: label ? cleaned : "Canvas" };
}

// One row per Canvas course in the feed (plus "no course" if any item lacks one), with counts
// of what an import would bring in by default.
export function listFeedCourses(items, domain, now, timeZone) {
  const byKey = new Map();
  for (const item of items) {
    const key = canvasCourseKey(domain, item.courseId);
    const row = byKey.get(key) ?? { key, courseId: item.courseId ?? null, label: null, assignments: 0, upcoming: 0, events: 0 };
    if (!row.label && item.courseLabel) row.label = item.courseLabel;
    if (isAssignmentKind(item)) {
      row.assignments += 1;
      if (!isPastDue(item, now, timeZone)) row.upcoming += 1;
    } else {
      row.events += 1;
    }
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .map((row) => ({ ...row, name: row.courseId ? cleanCourseLabel(row.label ?? `Course ${row.courseId}`) : NO_COURSE_LABEL }))
    .sort((a, b) => (a.courseId === null) - (b.courseId === null) || a.name.localeCompare(b.name));
}

/**
 * Applies confirmed matches: `matches` is [{ key, courseId, choice }], where choice is
 * { type: "existing", categoryId } | { type: "new", name } | { type: "skip" }.
 * New categories with the same name (two sections of one course) become one category, and a
 * new name equal to an existing category's reuses it. Returns the next courses and canvas
 * settings plus the ids of the categories it created.
 */
export function applyCourseMatches({ domain, matches, courses, canvasState = {} }) {
  const nextCourses = [...courses];
  const created = [];
  const byName = new Map(nextCourses.filter((course) => !course.archived).map((course) => [words(course.name), course.id]));
  const courseMap = { ...(canvasState.courseMap ?? {}) };

  for (const { key, courseId, choice } of matches) {
    if (choice.type === "skip") {
      courseMap[key] = null;
    } else if (choice.type === "existing") {
      courseMap[key] = choice.categoryId;
    } else {
      const name = choice.name.trim() || "Canvas";
      let id = byName.get(words(name));
      if (!id) {
        id = canvasCategoryId(domain, courseId ?? NO_COURSE);
        // A category from an earlier connection keeps its id; reuse it rather than clash
        if (!nextCourses.some((course) => course.id === id)) {
          nextCourses.push({ id, name, color: COLOR_PALETTE[nextCourses.length % COLOR_PALETTE.length] });
          created.push(id);
        }
        byName.set(words(name), id);
      }
      courseMap[key] = id;
    }
  }
  return { courses: nextCourses, canvasState: { ...canvasState, courseMap }, createdCategoryIds: created };
}
