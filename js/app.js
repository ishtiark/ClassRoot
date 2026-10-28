import {
  deleteAnnouncement,
  deleteAssignment,
  deleteResource,
  deleteSchedule,
  approveEnrollmentRequest,
  getAnnouncements,
  getAssignments,
  getAttendance,
  getEnrollmentRequests,
  getMyAttendance,
  getResources,
  getRoster,
  getSchedules,
  getShowcase,
  getSignedFileUrl,
  getSubmissions,
  reviewShowcase,
  reviewSubmission,
  rejectEnrollmentRequest,
  removeAssignmentAttachment,
  saveAnnouncement,
  saveAssignment,
  saveAttendance,
  saveResource,
  saveSchedule,
  saveShowcase,
  saveSubmission,
  setStudentAccess,
  updateStudentProfile,
  uploadAssignmentAttachment,
} from "./classroom-api.js";
import { getCurrentSession, registerStudent, signInWithPassword, signOut } from "./supabase.js";

const pageTitles = {
  home: "Classroom overview",
  schedule: "Class schedule",
  assignments: "Assignments",
  resources: "Learning resources",
  announcements: "Announcements",
  showcase: "Student showcase",
  attendance: "Attendance",
  teacher: "Teacher dashboard",
};
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const statuses = ["present", "absent", "late", "excused"];
let activeSession = null;
let toastTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function prettyDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function prettyTime(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return escapeHtml(value);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function setTheme(theme, persist = false) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#0b1120" : "#f8fafc";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.querySelector(".theme-toggle-label").textContent = isDark ? "Light mode" : "Dark mode";
  });
  if (persist) {
    try {
      localStorage.setItem("classroot-theme", isDark ? "dark" : "light");
    } catch {
      // The selected theme remains active for this page even if storage is unavailable.
    }
  }
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  const loginPanel = document.querySelector("#login-panel");
  const signupPanel = document.querySelector("#signup-panel");
  const activePanel = isSignup ? signupPanel : loginPanel;
  loginPanel.classList.toggle("hidden", isSignup);
  signupPanel.classList.toggle("hidden", !isSignup);
  activePanel.classList.remove("auth-panel-enter");
  void activePanel.offsetWidth;
  activePanel.classList.add("auth-panel-enter");
  document.querySelector("#login-mode-button").setAttribute("aria-pressed", String(!isSignup));
  document.querySelector("#signup-mode-button").setAttribute("aria-pressed", String(isSignup));
  document.querySelector("#auth-eyebrow").textContent = isSignup ? "NEW STUDENT" : "WELCOME BACK";
  document.querySelector("#login-title").textContent = isSignup ? "Request classroom access" : "Sign in to your classroom";
  document.querySelector("#auth-description").textContent = isSignup
    ? "Create your student request. Your teacher will review it before your account is activated."
    : "Use your classroom email and password to continue.";
  document.querySelector("#login-message").classList.add("hidden");
  document.querySelector("#signup-message").classList.add("hidden");
  document.querySelector(".login-card").scrollTop = 0;
  document.querySelector(isSignup ? "#signup-name" : "#login-email").focus({ preventScroll: true });
}

function showLogin(message = "", isError = true) {
  activeSession = null;
  document.querySelector("#app-shell").classList.add("hidden");
  document.querySelector("#login-screen").classList.remove("hidden");
  setAuthMode("login");
  const element = document.querySelector("#login-message");
  element.textContent = message;
  element.classList.toggle("hidden", !message);
  element.classList.toggle("error", isError);
  document.querySelector("#login-email").focus({ preventScroll: true });
}

function showApp(session) {
  activeSession = session;
  const profile = session.profile;
  const name = profile.full_name || session.user.email || "Classroom user";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  document.querySelector("#profile-name").textContent = name;
  document.querySelector("#profile-role").textContent = `${profile.role} account`;
  document.querySelector("#profile-avatar").textContent = initials;
  document.querySelector("#header-avatar").textContent = initials;
  document.querySelectorAll(".teacher-only").forEach((link) => link.classList.toggle("hidden", profile.role !== "teacher"));
  document.querySelector("#login-screen").classList.add("hidden");
  document.querySelector("#app-shell").classList.remove("hidden");
  const requested = location.hash.slice(1);
  navigate(pageTitles[requested] && (requested !== "teacher" || profile.role === "teacher") ? requested : "home", false);
}

function navigate(page, updateHash = true) {
  const role = activeSession?.profile.role;
  const allowed = pageTitles[page] && (page === "teacher" ? role === "teacher" : true);
  const selected = allowed ? page : "home";
  if (updateHash) history.pushState({ page: selected }, "", `#${selected}`);
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.page === selected;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelector("#page-heading").textContent = pageTitles[selected];
  document.title = `${pageTitles[selected]} · AI 2nd Batch`;
  closeMenu();
  loadPage(selected);
}

function closeMenu() {
  document.querySelector("#sidebar").classList.add("-translate-x-full");
  document.querySelector("#sidebar-backdrop").classList.add("hidden");
}

function openMenu() {
  document.querySelector("#sidebar").classList.remove("-translate-x-full");
  document.querySelector("#sidebar-backdrop").classList.remove("hidden");
  document.querySelector("#close-menu").focus();
}

function loadingPage() {
  document.querySelector("#page-content").innerHTML = '<div class="panel-card p-6 text-sm text-slate-500" role="status">Loading classroom information…</div>';
}

function errorPage(error) {
  const message = error instanceof Error ? error.message : "Something went wrong while loading this page.";
  document.querySelector("#page-content").innerHTML = `<section class="panel-card border-rose-100" role="alert"><p class="font-bold text-rose-800">Could not load this page</p><p class="mt-2 text-sm leading-6 text-rose-700">${escapeHtml(message)}</p><button class="secondary-button mt-4" type="button" data-action="refresh-page">Try again</button></section>`;
}

async function loadPage(page) {
  loadingPage();
  try {
    const loaders = {
      home: renderHome,
      schedule: renderSchedulePage,
      assignments: renderAssignmentsPage,
      resources: renderResourcesPage,
      announcements: renderAnnouncementsPage,
      showcase: renderShowcasePage,
      attendance: renderAttendancePage,
      teacher: renderTeacherPage,
    };
    await loaders[page]();
  } catch (error) {
    errorPage(error);
  }
}

function emptyState(message) {
  return `<div class="panel-card text-sm text-slate-500">${escapeHtml(message)}</div>`;
}

function pageIntro(eyebrow, title, description, action = "") {
  return `<header class="page-intro flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="section-eyebrow">${escapeHtml(eyebrow)}</p><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-description">${escapeHtml(description)}</p></div>${action}</header>`;
}

function teacherButton(label, action, id, style = "secondary-button") {
  return `<button class="${style}" type="button" data-action="${action}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
}

function renderScheduleRows(rows, teacher) {
  if (!rows.length) return emptyState("No lessons are scheduled yet.");
  return rows.map((row) => `
    <article class="schedule-row">
      <div class="schedule-time">${escapeHtml(days[row.day_of_week - 1])}<br /><span class="font-normal text-slate-400">${prettyTime(row.start_time)}</span><br /><span class="font-normal text-slate-400">${prettyTime(row.end_time)}</span></div>
      <div class="min-w-0"><div class="flex flex-wrap items-center justify-between gap-2"><h2 class="font-bold text-slate-800">${escapeHtml(row.title)}</h2>${teacher ? `<span class="flex gap-2">${teacherButton("Edit", "edit-schedule", row.id)}${teacherButton("Delete", "delete-schedule", row.id, "danger-button")}</span>` : ""}</div><p class="mt-1 text-xs font-bold uppercase tracking-wide text-blue-700">${escapeHtml(row.subject)}</p><p class="mt-1 text-sm text-slate-500">${escapeHtml(row.topic || "Class lesson")}</p></div>
    </article>`).join("");
}

async function renderHome() {
  const isTeacher = activeSession.profile.role === "teacher";
  const [schedules, assignments, announcements, requests] = await Promise.all([
    getSchedules(),
    getAssignments(),
    getAnnouncements(),
    isTeacher ? getEnrollmentRequests() : Promise.resolve([]),
  ]);
  updatePendingRequestBadge(requests.length);
  const now = new Date();
  const day = now.getDay();
  const dayNumber = day === 0 || day === 6 ? 1 : day;
  const nextAssignment = assignments.filter((item) => new Date(item.due_at) >= now).sort((a, b) => new Date(a.due_at) - new Date(b.due_at))[0];
  const recentAnnouncements = announcements.slice(0, 3);
  document.querySelector("#header-date").textContent = prettyDate(now, { weekday: "long", month: "long", day: "numeric" });
  const header = pageIntro(
    "CLASSROOM OVERVIEW",
    `Welcome, ${activeSession.profile.full_name.split(" ")[0]}`,
    "Your classroom information is loaded from Supabase.",
    isTeacher ? teacherButton(requests.length ? `${requests.length} student request${requests.length === 1 ? "" : "s"} to review` : "Manage classroom", "navigate", "teacher", "primary-button") : "",
  );
  const requestNotice = isTeacher && requests.length
    ? `<button class="panel-card mt-6 flex w-full flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 text-left" type="button" data-action="navigate" data-id="teacher"><span><span class="block font-bold text-amber-900">${requests.length} student access request${requests.length === 1 ? "" : "s"} waiting for approval</span><span class="mt-1 block text-sm text-amber-800">Review each request and assign a student number when approving.</span></span><span class="font-bold text-amber-900">Review requests →</span></button>`
    : "";
  document.querySelector("#page-content").innerHTML = `${header}${requestNotice}
    <div class="mt-7 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section><div class="mb-4"><p class="section-eyebrow">THIS WEEK</p><h2 class="mt-1 font-display text-xl font-bold">Today’s lessons</h2><p class="mt-1 text-sm text-slate-500">${prettyDate(now.getDay() === 0 || now.getDay() === 6 ? new Date(now.getTime() + (day === 0 ? 86400000 : 2 * 86400000)) : now, { weekday: "long", month: "long", day: "numeric" })}</p></div><div class="space-y-3">${renderScheduleRows(schedules.filter((row) => row.day_of_week === dayNumber), activeSession.profile.role === "teacher")}</div></section>
      <div class="space-y-5"><section class="panel-card"><p class="section-eyebrow">NEXT DEADLINE</p>${nextAssignment ? `<h2 class="mt-2 font-display text-lg font-bold">${escapeHtml(nextAssignment.title)}</h2><p class="mt-1 text-sm text-slate-500">Due ${prettyDate(nextAssignment.due_at, { weekday: "short", month: "short", day: "numeric" })}</p><button class="mt-4 text-sm font-bold text-blue-700" type="button" data-action="navigate" data-id="assignments">View assignment →</button>` : '<p class="mt-2 text-sm text-slate-500">No upcoming deadlines.</p>'}</section>
      <section class="panel-card"><p class="section-eyebrow">LATEST NEWS</p>${recentAnnouncements.length ? recentAnnouncements.map((item) => `<article class="mt-4 border-t border-slate-100 pt-4 first:border-0 first:pt-0"><h3 class="font-bold">${escapeHtml(item.title)}</h3><p class="mt-1 text-sm leading-6 text-slate-500">${escapeHtml(item.content)}</p></article>`).join("") : '<p class="mt-3 text-sm text-slate-500">No announcements yet.</p>'}</section></div>
    </div>`;
}

function updatePendingRequestBadge(count) {
  const badge = document.querySelector("#pending-request-badge");
  if (!badge) return;
  badge.textContent = String(count);
  badge.classList.toggle("hidden", count === 0);
}

async function renderSchedulePage() {
  const rows = await getSchedules();
  const teacher = activeSession.profile.role === "teacher";
  const action = teacher ? teacherButton("＋ Add lesson", "new-schedule", "", "primary-button") : "";
  const content = days.map((name, index) => {
    const items = rows.filter((row) => row.day_of_week === index + 1);
    return `<section class="panel-card"><h2 class="mb-4 font-display text-lg font-bold">${name}</h2><div class="space-y-3">${renderScheduleRows(items, teacher)}</div></section>`;
  }).join("");
  document.querySelector("#page-content").innerHTML = `${pageIntro("PLAN YOUR WEEK", "Class schedule", "Weekly lesson times and topics.", action)}<div class="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">${content}</div>`;
}

function submissionStatus(submission) {
  return submission?.status || "not submitted";
}

async function renderAssignmentsPage() {
  const [assignments, submissions] = await Promise.all([getAssignments(), getSubmissions()]);
  const teacher = activeSession.profile.role === "teacher";
  const action = teacher ? teacherButton("＋ Create assignment", "new-assignment", "", "primary-button") : "";
  const list = assignments.length ? assignments.map((assignment) => {
    if (teacher) {
      const count = submissions.filter((submission) => submission.assignment_id === assignment.id).length;
      return `<article class="panel-card"><div class="flex flex-wrap items-start justify-between gap-3"><div><p class="section-eyebrow">${prettyDate(assignment.published_at)}</p><h2 class="mt-2 font-display text-lg font-bold">${escapeHtml(assignment.title)}</h2></div><span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">${count} submissions</span></div><p class="mt-3 text-sm leading-6 text-slate-600">${escapeHtml(assignment.description)}</p><p class="mt-3 text-sm font-semibold">Due ${prettyDate(assignment.due_at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><div class="mt-4 flex flex-wrap gap-2">${assignment.attachment_path ? teacherButton("Open attachment", "open-assignment-file", assignment.attachment_path) : ""}${teacherButton("Edit", "edit-assignment", assignment.id)}${teacherButton("Delete", "delete-assignment", assignment.id, "danger-button")}</div></article>`;
    }
    const ownSubmission = submissions.find((submission) => submission.assignment_id === assignment.id);
    return `<article class="panel-card"><div class="flex flex-wrap items-start justify-between gap-3"><div><p class="section-eyebrow">${prettyDate(assignment.published_at)}</p><h2 class="mt-2 font-display text-lg font-bold">${escapeHtml(assignment.title)}</h2></div><span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">${escapeHtml(submissionStatus(ownSubmission))}</span></div><p class="mt-3 text-sm leading-6 text-slate-600">${escapeHtml(assignment.description)}</p><p class="mt-3 text-sm font-semibold">Due ${prettyDate(assignment.due_at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>${assignment.attachment_path ? `<button class="mt-3 text-sm font-bold text-blue-700" type="button" data-action="open-assignment-file" data-id="${escapeHtml(assignment.attachment_path)}">Download assignment attachment ↗</button>` : ""}${ownSubmission?.file_path ? `<button class="mt-3 block text-sm font-bold text-blue-700" type="button" data-action="open-submission-file" data-id="${escapeHtml(ownSubmission.file_path)}">Open your submitted file ↗</button>` : ""}${ownSubmission?.feedback ? `<div class="mt-4 rounded-xl bg-emerald-50 p-3 text-sm"><p class="font-bold text-emerald-800">Teacher feedback${ownSubmission.grade !== null ? ` · ${escapeHtml(ownSubmission.grade)} / 100` : ""}</p><p class="mt-1 text-emerald-900">${escapeHtml(ownSubmission.feedback)}</p></div>` : ownSubmission?.grade !== null && ownSubmission?.grade !== undefined ? `<p class="mt-3 text-sm font-bold text-emerald-700">Grade: ${escapeHtml(ownSubmission.grade)} / 100</p>` : ""}${ownSubmission?.status !== "reviewed" ? `<form class="data-form mt-4 border-t border-slate-100 pt-4" data-form="submission" data-assignment="${escapeHtml(assignment.id)}" data-file="${escapeHtml(ownSubmission?.file_path || "")}"><label class="form-label" for="submission-${escapeHtml(assignment.id)}">${ownSubmission ? "Update your work" : "Your submission"}</label><textarea id="submission-${escapeHtml(assignment.id)}" name="submission_text" class="form-control" rows="3" maxlength="10000" placeholder="Write your response…" required>${escapeHtml(ownSubmission?.submission_text || "")}</textarea><label class="form-label mt-3" for="file-${escapeHtml(assignment.id)}">Attachment (optional)</label><input id="file-${escapeHtml(assignment.id)}" name="file" class="form-control" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" /><button class="primary-button mt-3" type="submit">${ownSubmission ? "Save changes" : "Submit work"}</button></form>` : ""}</article>`;
  }).join("") : emptyState("No assignments have been published.");
  document.querySelector("#page-content").innerHTML = `${pageIntro("KEEP MAKING PROGRESS", "Assignments", "Published work, deadlines, submissions, and feedback.", action)}<div class="mt-7 grid gap-4 lg:grid-cols-2">${list}</div>${teacher ? renderSubmissionQueue(submissions) : ""}`;
}

function renderSubmissionQueue(submissions) {
  const items = submissions.map((submission) => `<article class="rounded-xl border border-slate-100 p-4"><div class="flex flex-wrap justify-between gap-2"><div><h3 class="font-bold">${escapeHtml(submission.assignments?.title || "Assignment")}</h3><p class="mt-1 text-sm text-slate-500">${escapeHtml(submission.profiles?.full_name || "Student")} · ${escapeHtml(submission.profiles?.student_number || "")} · ${escapeHtml(submission.status)}</p></div><p class="text-xs text-slate-400">${prettyDate(submission.submitted_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div><p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">${escapeHtml(submission.submission_text || "File submission")}</p>${submission.file_path ? `<button class="mt-3 text-sm font-bold text-blue-700" type="button" data-action="open-submission-file" data-id="${escapeHtml(submission.file_path)}">Open student attachment ↗</button>` : ""}<form class="data-form mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[8rem_1fr_auto]" data-form="review" data-id="${escapeHtml(submission.id)}"><div><label class="form-label" for="grade-${escapeHtml(submission.id)}">Grade / 100</label><input id="grade-${escapeHtml(submission.id)}" name="grade" class="form-control" type="number" min="0" max="100" step="0.01" value="${submission.grade === null ? "" : escapeHtml(submission.grade)}" /></div><div><label class="form-label" for="feedback-${escapeHtml(submission.id)}">Feedback</label><input id="feedback-${escapeHtml(submission.id)}" name="feedback" class="form-control" maxlength="5000" value="${escapeHtml(submission.feedback || "")}" /></div><button class="primary-button self-end" type="submit">Save review</button></form></article>`).join("");
  return `<section class="mt-8"><h2 class="font-display text-xl font-bold">Student submissions</h2><div class="mt-4 space-y-3">${items || emptyState("No student submissions yet.")}</div></section>`;
}

async function renderResourcesPage() {
  const resources = await getResources();
  const teacher = activeSession.profile.role === "teacher";
  const action = teacher ? teacherButton("＋ Add resource", "new-resource", "", "primary-button") : "";
  const list = resources.length ? resources.map((item) => {
    const url = safeExternalUrl(item.resource_url);
    return `<article class="panel-card flex flex-col"><p class="section-eyebrow">CLASS RESOURCE</p><h2 class="mt-2 font-display font-bold">${escapeHtml(item.title)}</h2><p class="mt-2 flex-1 text-sm leading-6 text-slate-500">${escapeHtml(item.description)}</p>${url ? `<a class="mt-4 text-sm font-bold text-blue-700" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open resource ↗</a>` : '<p class="mt-3 text-sm text-rose-700">This link is invalid.</p>'}${teacher ? `<div class="mt-4 flex gap-2 border-t border-slate-100 pt-3">${teacherButton("Edit", "edit-resource", item.id)}${teacherButton("Delete", "delete-resource", item.id, "danger-button")}</div>` : ""}</article>`;
  }).join("") : emptyState("No learning resources have been added.");
  document.querySelector("#page-content").innerHTML = `${pageIntro("LEARNING MATERIALS", "Resources", "Links and study materials shared with the classroom.", action)}<div class="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">${list}</div>`;
}

async function renderAnnouncementsPage() {
  const announcements = await getAnnouncements();
  const teacher = activeSession.profile.role === "teacher";
  const action = teacher ? teacherButton("＋ Post announcement", "new-announcement", "", "primary-button") : "";
  const list = announcements.length ? announcements.map((item) => `<article class="panel-card"><p class="text-xs text-slate-400">${prettyDate(item.created_at, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><h2 class="mt-2 font-display text-lg font-bold">${escapeHtml(item.title)}</h2><p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">${escapeHtml(item.content)}</p>${teacher ? `<div class="mt-4 flex gap-2 border-t border-slate-100 pt-3">${teacherButton("Edit", "edit-announcement", item.id)}${teacherButton("Delete", "delete-announcement", item.id, "danger-button")}</div>` : ""}</article>`).join("") : emptyState("There are no announcements yet.");
  document.querySelector("#page-content").innerHTML = `${pageIntro("CLASS UPDATES", "Announcements", "Important news and reminders from your teacher.", action)}<div class="mt-7 max-w-4xl space-y-4">${list}</div>`;
}

async function renderShowcasePage() {
  const teacher = activeSession.profile.role === "teacher";
  const projects = await getShowcase(teacher);
  const action = !teacher ? teacherButton("＋ Share a project", "new-showcase", "", "primary-button") : "";
  const approved = projects.filter((project) => project.review_status === "approved");
  const cards = approved.length ? approved.map((project) => {
    const link = project.project_url ? safeExternalUrl(project.project_url) : null;
    return `<article class="panel-card"><div class="flex h-28 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-violet-100 text-4xl text-indigo-400" aria-hidden="true">✳</div><p class="section-eyebrow mt-4">APPROVED CLASS PROJECT</p><h2 class="mt-1 font-display font-bold">${escapeHtml(project.title)}</h2><p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">${escapeHtml(project.description)}</p>${link ? `<a class="mt-3 inline-block text-sm font-bold text-blue-700" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View project ↗</a>` : ""}<p class="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">Shared by a classmate</p></article>`;
  }).join("") : emptyState("No approved projects yet.");
  const own = projects.filter((project) => project.review_status !== "approved");
  const ownQueue = own.length ? `<section class="mt-8"><h2 class="font-display text-xl font-bold">${teacher ? "Projects to review" : "Your projects under review"}</h2><div class="mt-4 grid gap-3 md:grid-cols-2">${own.map((project) => `<article class="panel-card"><p class="text-xs font-semibold uppercase tracking-wide text-amber-700">${escapeHtml(project.review_status)}</p><h3 class="mt-2 font-bold">${escapeHtml(project.title)}</h3><p class="mt-2 text-sm text-slate-500">${escapeHtml(project.description)}</p>${teacher ? `<p class="mt-2 text-xs text-slate-400">Submitted by ${escapeHtml(project.student_name)} · ${escapeHtml(project.student_number)}</p><div class="mt-3 flex gap-2">${teacherButton("Approve", "approve-showcase", project.id, "primary-button")}${teacherButton("Reject", "reject-showcase", project.id, "danger-button")}</div>` : ""}</article>`).join("")}</div></section>` : "";
  document.querySelector("#page-content").innerHTML = `${pageIntro("CELEBRATE LEARNING", "Student showcase", "Only teacher-approved project details are shared with classmates.", action)}<div class="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">${cards}</div>${ownQueue}`;
}

async function renderAttendancePage() {
  if (activeSession.profile.role !== "teacher") {
    const records = await getMyAttendance();
    const rows = records.map((record) => `<tr class="roster-row"><td class="py-3 pr-4">${prettyDate(record.attendance_date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</td><td class="py-3 font-semibold capitalize">${escapeHtml(record.status)}</td></tr>`).join("");
    document.querySelector("#page-content").innerHTML = `${pageIntro("YOUR CLASS RECORD", "My attendance", "Attendance entries recorded by your teacher.")}<section class="panel-card mt-7 max-w-2xl"><div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th class="pb-3 pr-4">Date</th><th class="pb-3">Status</th></tr></thead><tbody>${rows}</tbody></table></div>${records.length ? "" : '<p class="py-6 text-sm text-slate-500">There are no attendance records yet.</p>'}</section>`;
    return;
  }
  const date = todayString();
  const [roster, attendance] = await Promise.all([getRoster(), getAttendance(date)]);
  const activeRoster = roster.filter((student) => student.active);
  const byStudent = new Map(attendance.map((record) => [record.student_id, record]));
  const rows = activeRoster.map((student) => {
    const record = byStudent.get(student.id);
    return `<form class="attendance-row data-form" data-form="attendance" data-student="${escapeHtml(student.id)}"><div><p class="font-semibold">${escapeHtml(student.full_name)}</p><p class="text-xs text-slate-400">${escapeHtml(student.student_number)}</p></div><label class="sr-only" for="attendance-${escapeHtml(student.id)}">Attendance for ${escapeHtml(student.full_name)}</label><select id="attendance-${escapeHtml(student.id)}" class="form-control" name="status"><option value="">Not recorded</option>${statuses.map((status) => `<option value="${status}" ${record?.status === status ? "selected" : ""}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join("")}</select><button class="secondary-button" type="submit">Save</button></form>`;
  }).join("");
  document.querySelector("#page-content").innerHTML = `${pageIntro("TEACHER TOOLS", "Attendance", `Record class attendance for ${prettyDate(date)}.`)}<section class="panel-card mt-7 max-w-3xl"><div class="space-y-2">${rows || emptyState("No student profiles were found.")}</div></section>`;
}

async function renderTeacherPage() {
  const [roster, submissions, projects, requests] = await Promise.all([
    getRoster(),
    getSubmissions(),
    getShowcase(true),
    getEnrollmentRequests(),
  ]);
  const activeStudents = roster.filter((student) => student.active).length;
  updatePendingRequestBadge(requests.length);
  const needsReview = submissions.filter((item) => item.status !== "reviewed").length;
  const pendingProjects = projects.filter((item) => item.review_status === "pending").length;
  const rosterRows = roster.map((student) => `<tr class="roster-row"><td class="py-3 pr-4"><p class="font-semibold">${escapeHtml(student.full_name)}</p><p class="text-xs ${student.active ? "text-emerald-700" : "text-slate-400"}">${student.active ? "Active" : "Access disabled"}</p></td><td class="py-3 pr-4 text-slate-500">${escapeHtml(student.student_number)}</td><td class="py-3 text-right"><div class="flex flex-wrap justify-end gap-2">${teacherButton("Edit", "edit-student", student.id)}${teacherButton(student.active ? "Disable access" : "Restore access", "toggle-student-access", student.id, student.active ? "danger-button" : "secondary-button")}</div></td></tr>`).join("");
  const requestCards = requests.map((request) => `<article class="rounded-xl border border-slate-100 p-4"><div class="flex flex-wrap justify-between gap-2"><div><h3 class="font-bold">${escapeHtml(request.full_name)}</h3><p class="mt-1 text-sm text-slate-500">${escapeHtml(request.email)}</p></div><p class="text-xs text-slate-400">Requested ${prettyDate(request.created_at)}</p></div><div class="mt-4 flex flex-wrap items-end gap-3"><form class="data-form flex flex-1 flex-wrap items-end gap-3" data-form="approve-enrollment" data-id="${escapeHtml(request.id)}"><div class="min-w-40 flex-1"><label class="form-label" for="student-number-${escapeHtml(request.id)}">Assign student number</label><input id="student-number-${escapeHtml(request.id)}" class="form-control" name="student_number" required maxlength="50" pattern="[A-Za-z0-9._-]{1,50}" title="Use 1–50 letters, numbers, dots, underscores, or hyphens" placeholder="e.g. S-026" /></div><button class="primary-button" type="submit">Approve</button></form>${teacherButton("Reject", "reject-enrollment", request.id, "danger-button")}</div></article>`).join("");
  document.querySelector("#page-content").innerHTML = `${pageIntro("TEACHER TOOLS", "Teacher dashboard", "Approve student access requests and manage classroom membership.")}<div class="mt-7 grid gap-4 sm:grid-cols-3"><div class="stat-card"><p class="stat-label">Active students</p><p class="stat-value">${activeStudents}</p><p class="stat-hint">${roster.length - activeStudents} with access disabled</p></div><div class="stat-card"><p class="stat-label">To review</p><p class="stat-value">${needsReview}</p><p class="stat-hint">Student submissions</p></div><div class="stat-card"><p class="stat-label">Projects awaiting approval</p><p class="stat-value">${pendingProjects}</p><p class="stat-hint">Student showcase</p></div></div><section class="panel-card mt-6"><div class="mb-4"><h2 class="font-display text-lg font-bold">Student access requests</h2><p class="mt-1 text-sm text-slate-500">Approve requests to add students. Choose a unique student number for each approved student.</p></div><div class="space-y-3">${requestCards || emptyState("There are no pending student requests.")}</div></section><section class="panel-card mt-6"><div class="mb-4"><h2 class="font-display text-lg font-bold">Student roster</h2><p class="mt-1 text-sm text-slate-500">Disabling access keeps the student’s submissions, grades, and attendance history.</p></div><div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th class="pb-3 pr-4">Student</th><th class="pb-3 pr-4">Student number</th><th class="pb-3 text-right">Actions</th></tr></thead><tbody>${rosterRows || '<tr><td class="py-4 text-sm text-slate-500" colspan="3">No student profiles yet.</td></tr>'}</tbody></table></div></section><div class="mt-6 grid gap-3 sm:grid-cols-3">${teacherButton("Manage schedule", "navigate", "schedule", "primary-button")}${teacherButton("Manage assignments", "navigate", "assignments", "primary-button")}${teacherButton("Manage announcements", "navigate", "announcements", "primary-button")}</div>`;
}

function fieldMarkup(field) {
  const id = `record-${field.name}`;
  const common = `id="${id}" name="${field.name}" class="form-control" ${field.required ? "required" : ""} ${field.maxLength ? `maxlength="${field.maxLength}"` : ""}`;
  if (field.type === "textarea") return `<div><label class="form-label" for="${id}">${escapeHtml(field.label)}</label><textarea ${common} rows="${field.rows || 3}">${escapeHtml(field.value || "")}</textarea></div>`;
  if (field.type === "select") return `<div><label class="form-label" for="${id}">${escapeHtml(field.label)}</label><select ${common}>${field.options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(field.value) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></div>`;
  return `<div><label class="form-label" for="${id}">${escapeHtml(field.label)}</label><input ${common} type="${field.type || "text"}" value="${escapeHtml(field.value || "")}" ${field.min !== undefined ? `min="${field.min}"` : ""} /></div>`;
}

function openRecordDialog(type, record = {}) {
  const configurations = {
    schedule: {
      title: record.id ? "Edit lesson" : "Add lesson",
      fields: [
        { name: "title", label: "Lesson title", value: record.title, required: true, maxLength: 120 },
        { name: "subject", label: "Subject", value: record.subject, required: true, maxLength: 80 },
        { name: "day_of_week", label: "Day", type: "select", value: record.day_of_week || 1, options: days.map((day, index) => [index + 1, day]) },
        { name: "start_time", label: "Start time", type: "time", value: record.start_time?.slice(0, 5), required: true },
        { name: "end_time", label: "End time", type: "time", value: record.end_time?.slice(0, 5), required: true },
        { name: "topic", label: "Lesson topic", type: "textarea", value: record.topic, maxLength: 500 },
      ],
    },
    assignment: {
      title: record.id ? "Edit assignment" : "Create assignment",
      fields: [
        { name: "title", label: "Assignment title", value: record.title, required: true, maxLength: 150 },
        { name: "description", label: "Instructions", type: "textarea", value: record.description, required: true, maxLength: 5000 },
        { name: "published_at", label: "Publication date and time", type: "datetime-local", value: record.published_at ? toLocalDateTime(record.published_at) : toLocalDateTime(new Date()), required: true },
        { name: "due_at", label: "Due date and time", type: "datetime-local", value: record.due_at ? toLocalDateTime(record.due_at) : "", required: true },
        { name: "attachment", label: "Attachment (optional, PDF/image/text, up to 10 MB)", type: "file" },
      ],
    },
    resource: {
      title: record.id ? "Edit resource" : "Add resource",
      fields: [
        { name: "title", label: "Resource title", value: record.title, required: true, maxLength: 150 },
        { name: "description", label: "Description", type: "textarea", value: record.description, maxLength: 2000 },
        { name: "resource_url", label: "Resource URL", type: "url", value: record.resource_url, required: true, maxLength: 2048 },
      ],
    },
    announcement: {
      title: record.id ? "Edit announcement" : "Post announcement",
      fields: [
        { name: "title", label: "Title", value: record.title, required: true, maxLength: 150 },
        { name: "content", label: "Message", type: "textarea", value: record.content, required: true, maxLength: 5000 },
      ],
    },
    showcase: {
      title: "Share a project",
      fields: [
        { name: "title", label: "Project title", value: record.title, required: true, maxLength: 120 },
        { name: "description", label: "Description", type: "textarea", value: record.description, required: true, maxLength: 2000 },
        { name: "project_url", label: "Project link (optional)", type: "url", value: record.project_url, maxLength: 2048 },
      ],
    },
    student: {
      title: "Edit student profile",
      fields: [
        { name: "full_name", label: "Full name", value: record.full_name, required: true, maxLength: 100 },
        { name: "student_number", label: "Student number", value: record.student_number, required: true, maxLength: 50 },
      ],
    },
  };
  const configuration = configurations[type];
  const form = document.querySelector("#record-form");
  form.dataset.type = type;
  form.dataset.recordId = record.id || "";
  document.querySelector("#record-dialog-title").textContent = configuration.title;
  document.querySelector("#record-dialog-fields").innerHTML = configuration.fields.map(fieldMarkup).join("");
  document.querySelector("#record-dialog-error").classList.add("hidden");
  document.querySelector("#record-dialog").showModal();
  document.querySelector("#record-dialog-fields").querySelector("input,textarea,select")?.focus();
}

function toLocalDateTime(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function formValues(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

async function handleRecordSubmit(form) {
  const type = form.dataset.type;
  const id = form.dataset.recordId || null;
  const data = await formValues(form);
  if (["resource", "showcase"].includes(type) && data.project_url !== undefined && data.project_url !== "") {
    if (!safeExternalUrl(data.project_url)) throw new Error("Enter a valid http:// or https:// link.");
  }
  if (type === "resource" && !safeExternalUrl(data.resource_url)) throw new Error("Enter a valid http:// or https:// resource link.");

  if (type === "schedule") {
    const { title, subject, day_of_week, start_time, end_time, topic } = data;
    if (end_time <= start_time) throw new Error("The lesson end time must be after its start time.");
    await saveSchedule(id, { title: title.trim(), subject: subject.trim(), day_of_week: Number(day_of_week), start_time, end_time, topic: topic.trim() });
  } else if (type === "assignment") {
    const publishedAt = new Date(data.published_at);
    const dueAt = new Date(data.due_at);
    if (Number.isNaN(publishedAt.getTime()) || Number.isNaN(dueAt.getTime()) || dueAt < publishedAt) {
      throw new Error("The due date must be on or after the publication date.");
    }
    const existing = id ? (await getAssignments()).find((assignment) => assignment.id === id) : null;
    if (id && !existing) throw new Error("The assignment could not be found. Refresh the page.");
    const file = form.querySelector('[name="attachment"]').files[0];
    let attachmentPath = existing?.attachment_path || null;
    const values = {
      title: data.title.trim(),
      description: data.description.trim(),
      published_at: publishedAt.toISOString(),
      due_at: dueAt.toISOString(),
      attachment_path: attachmentPath,
    };
    if (id) {
      const newPath = file ? await uploadAssignmentAttachment(id, file) : null;
      if (newPath) values.attachment_path = newPath;
      try {
        await saveAssignment(id, values);
      } catch (error) {
        if (newPath) {
          try {
            await removeAssignmentAttachment(newPath);
          } catch (cleanupError) {
            throw new Error(`${getErrorMessage(error)} Also, the new attachment could not be cleaned up: ${getErrorMessage(cleanupError)}`);
          }
        }
        throw error;
      }
      if (file && existing.attachment_path) await removeAssignmentAttachment(existing.attachment_path);
    } else {
      const saved = await saveAssignment(null, { ...values, attachment_path: null });
      if (file) {
        let newPath = null;
        try {
          newPath = await uploadAssignmentAttachment(saved.id, file);
          await saveAssignment(saved.id, { attachment_path: newPath });
        } catch (error) {
          if (newPath) {
            try {
              await removeAssignmentAttachment(newPath);
            } catch (cleanupError) {
              throw new Error(`${getErrorMessage(error)} Also, the uploaded attachment could not be cleaned up: ${getErrorMessage(cleanupError)}`);
            }
          }
          throw new Error(`The assignment was created, but its attachment could not be saved: ${getErrorMessage(error)}`);
        }
      }
    }
  } else if (type === "resource") {
    await saveResource(id, { title: data.title.trim(), description: data.description.trim(), resource_url: safeExternalUrl(data.resource_url) });
  } else if (type === "announcement") {
    await saveAnnouncement(id, { title: data.title.trim(), content: data.content.trim() });
  } else if (type === "showcase") {
    await saveShowcase({ title: data.title.trim(), description: data.description.trim(), project_url: data.project_url ? safeExternalUrl(data.project_url) : "" });
  } else if (type === "student") {
    await updateStudentProfile(id, data.full_name.trim(), data.student_number.trim());
  }

  document.querySelector("#record-dialog").close();
  showToast("Changes saved.");
  await loadPage(document.querySelector(".nav-link.active")?.dataset.page || "home");
}

async function handleDataForm(form) {
  const type = form.dataset.form;
  if (type === "submission") {
    const values = await formValues(form);
    await saveSubmission(form.dataset.assignment, String(values.submission_text).trim(), form.querySelector('[name="file"]').files[0], form.dataset.file || null);
    showToast("Your work was submitted.");
  } else if (type === "review") {
    const values = await formValues(form);
    const gradeText = String(values.grade || "").trim();
    const grade = gradeText === "" ? null : Number(gradeText);
    if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 100)) throw new Error("Grade must be between 0 and 100.");
    await reviewSubmission(form.dataset.id, grade, String(values.feedback || "").trim());
    showToast("Feedback saved.");
  } else if (type === "attendance") {
    const values = await formValues(form);
    if (!values.status) throw new Error("Choose an attendance status.");
    await saveAttendance(form.dataset.student, todayString(), values.status);
    showToast("Attendance saved.");
  } else if (type === "approve-enrollment") {
    const values = await formValues(form);
    await approveEnrollmentRequest(form.dataset.id, String(values.student_number).trim());
    showToast("Student request approved.");
  }
  await loadPage(document.querySelector(".nav-link.active")?.dataset.page || "home");
}

async function handleAction(button) {
  const { action, id } = button.dataset;
  if (action === "navigate") return navigate(id);
  if (action === "refresh-page") return loadPage(document.querySelector(".nav-link.active")?.dataset.page || "home");
  if (action.startsWith("new-")) {
    return openRecordDialog(action.slice(4), {});
  }
  if (action.startsWith("edit-")) {
    const type = action.slice(5);
    const loaders = {
      schedule: [getSchedules, "schedules"],
      assignment: [getAssignments, "assignments"],
      resource: [getResources, "resources"],
      announcement: [getAnnouncements, "announcements"],
      student: [getRoster, "roster"],
    };
    const [loader] = loaders[type] || [];
    if (!loader) return;
    const record = (await loader()).find((item) => item.id === id);
    if (!record) throw new Error("The selected record could not be found. Refresh the page.");
    openRecordDialog(type, record);
    return;
  }
  const deletions = {
    "delete-schedule": [deleteSchedule, "lesson"],
    "delete-assignment": [deleteAssignment, "assignment"],
    "delete-resource": [deleteResource, "resource"],
    "delete-announcement": [deleteAnnouncement, "announcement"],
  };
  if (deletions[action]) {
    const [remove, noun] = deletions[action];
    if (!confirm(`Delete this ${noun}? This cannot be undone.`)) return;
    await remove(id);
    showToast(`${noun[0].toUpperCase()}${noun.slice(1)} deleted.`);
    return loadPage(document.querySelector(".nav-link.active")?.dataset.page || "home");
  }
  if (action === "reject-enrollment") {
    if (!confirm("Reject this student access request? The Auth account will remain but will not have classroom access.")) return;
    await rejectEnrollmentRequest(id);
    showToast("Student request rejected.");
    return loadPage("teacher");
  }
  if (action === "toggle-student-access") {
    const roster = await getRoster();
    const student = roster.find((item) => item.id === id);
    if (!student) throw new Error("The student profile could not be found. Refresh the page.");
    const enableAccess = !student.active;
    const prompt = enableAccess
      ? `Restore classroom access for ${student.full_name}?`
      : `Disable classroom access for ${student.full_name}? Their records will be kept.`;
    if (!confirm(prompt)) return;
    await setStudentAccess(id, enableAccess);
    showToast(enableAccess ? "Student access restored." : "Student access disabled.");
    return loadPage("teacher");
  }
  if (action === "approve-showcase" || action === "reject-showcase") {
    await reviewShowcase(id, action === "approve-showcase");
    showToast(action === "approve-showcase" ? "Project approved." : "Project rejected.");
    return loadPage("showcase");
  }
  if (action === "open-assignment-file" || action === "open-submission-file") {
    const bucket = action === "open-assignment-file" ? "assignment-files" : "submission-files";
    const url = await getSignedFileUrl(bucket, id);
    window.location.assign(url);
  }
}

function showLoginMessage(message, isError = true) {
  const element = document.querySelector("#login-message");
  element.textContent = message;
  element.classList.remove("hidden", "error");
  if (isError) element.classList.add("error");
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = document.querySelector("#login-submit");
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    const { user, profile } = await signInWithPassword(
      document.querySelector("#login-email").value.trim(),
      document.querySelector("#login-password").value,
    );
    form.reset();
    showApp({ user, profile });
  } catch (error) {
    showLoginMessage(getErrorMessage(error));
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
}

async function handleStudentSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = document.querySelector("#signup-submit");
  const message = document.querySelector("#signup-message");
  button.disabled = true;
  button.textContent = "Sending request…";
  message.classList.add("hidden");
  message.classList.remove("error");
  try {
    const { confirmationRequired } = await registerStudent(
      form.elements.full_name.value.trim(),
      form.elements.email.value.trim(),
      form.elements.password.value,
    );
    form.reset();
    message.textContent = confirmationRequired
      ? "If registration succeeded, check your email to confirm your address. After that, wait for teacher approval before signing in. If you already have an account, sign in instead."
      : "Your request was sent. The teacher must approve it before you can sign in.";
    message.classList.remove("hidden");
  } catch (error) {
    message.textContent = getErrorMessage(error);
    message.classList.remove("hidden");
    message.classList.add("error");
  } finally {
    button.disabled = false;
    button.textContent = "Send access request";
  }
}

async function handleSignOut() {
  const button = document.querySelector("#sign-out-button");
  button.disabled = true;
  try {
    await signOut();
    showLogin("You have signed out.", false);
  } catch (error) {
    showToast(getErrorMessage(error));
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  setTheme(document.documentElement.dataset.theme || "light");
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentTheme = document.documentElement.dataset.theme;
      setTheme(currentTheme === "dark" ? "light" : "dark", true);
    });
  });
  document.querySelector("#login-mode-button").addEventListener("click", () => setAuthMode("login"));
  document.querySelector("#signup-mode-button").addEventListener("click", () => setAuthMode("signup"));
  document.querySelector("#login-form").addEventListener("submit", handleLogin);
  document.querySelector("#student-signup-form").addEventListener("submit", handleStudentSignup);
  document.querySelector("#sign-out-button").addEventListener("click", handleSignOut);
  document.querySelector("#open-menu").addEventListener("click", openMenu);
  document.querySelector("#close-menu").addEventListener("click", closeMenu);
  document.querySelector("#sidebar-backdrop").addEventListener("click", closeMenu);
  document.querySelector("#close-record-dialog").addEventListener("click", () => document.querySelector("#record-dialog").close());
  document.querySelector("#cancel-record-dialog").addEventListener("click", () => document.querySelector("#record-dialog").close());
  document.querySelector("#record-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    const error = document.querySelector("#record-dialog-error");
    button.disabled = true;
    error.classList.add("hidden");
    try {
      await handleRecordSubmit(form);
    } catch (exception) {
      error.textContent = getErrorMessage(exception);
      error.classList.remove("hidden");
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("[data-page]");
    if (link) {
      event.preventDefault();
      navigate(link.dataset.page);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    button.disabled = true;
    try {
      await handleAction(button);
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest(".data-form");
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      await handleDataForm(form);
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      if (button) button.disabled = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  window.addEventListener("popstate", () => navigate(location.hash.slice(1) || "home", false));
  window.addEventListener("hashchange", () => {
    const page = location.hash.slice(1);
    if (page && page !== document.querySelector(".nav-link.active")?.dataset.page) navigate(page, false);
  });
}

async function initialize() {
  bindEvents();
  try {
    const session = await getCurrentSession();
    if (session) showApp(session);
    else showLogin();
  } catch (error) {
    showLogin(getErrorMessage(error));
  }
}

initialize();
