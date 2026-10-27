import { announcements, assignments, resources, schedules, showcase, students } from "./sample-data.js";
import { getCurrentSession, signInWithPassword, signOut } from "./supabase.js";

const pageNames = {
  home: "Good morning, class!",
  schedule: "Class schedule",
  assignments: "Assignments",
  resources: "Learning resources",
  showcase: "Student showcase",
  announcements: "Announcements",
  teacher: "Teacher dashboard",
};
const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const colors = {
  blue: "bg-blue-100 text-blue-700",
  violet: "bg-violet-100 text-violet-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
  sky: "bg-sky-100 text-sky-700",
};
let toastTimeout;
let activeProfile = null;
let activeEmail = "";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function dayForDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6 ? "Monday" : dayOrder[day - 1];
}

function renderScheduleRows(items, compact = false) {
  if (!items.length) return '<p class="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No lessons scheduled for this day.</p>';
  return items.map((item) => `
    <article class="schedule-row">
      <div class="schedule-time">${escapeHtml(item.start)}<br /><span class="font-normal text-slate-400">${escapeHtml(item.end)}</span></div>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="schedule-dot"></span><h3 class="font-bold text-slate-800">${escapeHtml(item.title)}</h3>
          <span class="rounded-full px-2 py-0.5 text-[.68rem] font-bold ${colors[item.color]}">${escapeHtml(item.subject)}</span>
        </div>
        <p class="mt-1 text-sm text-slate-500">${escapeHtml(item.topic)}</p>
        ${compact ? "" : `<p class="mt-1 text-xs text-slate-400">${escapeHtml(item.start)} – ${escapeHtml(item.end)}</p>`}
      </div>
    </article>`).join("");
}

function renderHome() {
  const now = new Date();
  const today = dayForDate(now);
  document.querySelector("#header-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  const shownDate = new Date(now);
  if (now.getDay() === 0) shownDate.setDate(now.getDate() + 1);
  if (now.getDay() === 6) shownDate.setDate(now.getDate() + 2);
  document.querySelector("#today-title").textContent = now.getDay() === 0 || now.getDay() === 6 ? "Monday's schedule" : "Today's schedule";
  document.querySelector("#today-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(shownDate);
  document.querySelector("#home-schedule").innerHTML = renderScheduleRows(schedules.filter((lesson) => lesson.day === today), true);

  const next = assignments
    .filter((assignment) => assignment.status !== "Submitted" && new Date(assignment.due) >= now)
    .sort((a, b) => new Date(a.due) - new Date(b.due))[0];
  document.querySelector("#next-assignment-card").innerHTML = next
    ? `<div class="flex items-start justify-between gap-3"><div><p class="section-eyebrow">UP NEXT</p><h2 class="mt-2 font-display text-lg font-bold text-slate-900">${escapeHtml(next.title)}</h2></div><span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Due soon</span></div><p class="mt-2 text-sm text-slate-500">${escapeHtml(next.subject)} · ${escapeHtml(next.dueLabel)}</p><a href="#assignments" data-page="assignments" class="mt-4 inline-flex text-sm font-bold text-blue-700">Open assignment <span class="ml-1" aria-hidden="true">→</span></a>`
    : '<p class="text-sm text-slate-500">You are all caught up. No upcoming assignments!</p>';

  document.querySelector("#latest-news").innerHTML = `
    <div class="flex gap-3">
      <span class="mt-1 grid h-8 w-8 flex-none place-items-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true">✦</span>
      <div><p class="text-xs font-semibold text-slate-400">${escapeHtml(announcements[0].date)}</p><h3 class="mt-1 text-sm font-bold text-slate-800">${escapeHtml(announcements[0].title)}</h3><p class="mt-1 text-sm leading-5 text-slate-500">${escapeHtml(announcements[0].content)}</p></div>
    </div>`;
  document.querySelector("#home-announcements").innerHTML = announcements.slice(0, 3).map((announcement) => `
    <article class="panel-card">
      <div class="flex items-center justify-between gap-2"><span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">${escapeHtml(announcement.category)}</span><time class="text-xs text-slate-400">${escapeHtml(announcement.date)}</time></div>
      <h3 class="mt-3 font-display font-bold text-slate-900">${escapeHtml(announcement.title)}</h3>
      <p class="mt-2 text-sm leading-6 text-slate-500">${escapeHtml(announcement.content)}</p>
    </article>`).join("");
}

function renderWeeklySchedule() {
  document.querySelector("#weekly-schedule").innerHTML = dayOrder.map((day) => `
    <section class="panel-card">
      <div class="mb-4 flex items-center justify-between"><h2 class="font-display text-lg font-bold text-slate-900">${day}</h2><span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">${schedules.filter((lesson) => lesson.day === day).length} lessons</span></div>
      <div class="space-y-3">${renderScheduleRows(schedules.filter((lesson) => lesson.day === day))}</div>
    </section>`).join("");
}

function renderAssignments() {
  const filter = document.querySelector("#assignment-filter").value;
  const visible = assignments.filter((assignment) => {
    if (filter === "submitted") return assignment.status === "Submitted";
    if (filter === "upcoming") return assignment.status !== "Submitted";
    return true;
  });
  document.querySelector("#assignment-list").innerHTML = visible.map((assignment) => {
    const submitted = assignment.status === "Submitted";
    return `<article class="panel-card">
      <div class="flex flex-wrap items-start justify-between gap-3"><div><span class="rounded-full px-2.5 py-1 text-xs font-bold ${colors.violet}">${escapeHtml(assignment.subject)}</span><h2 class="mt-3 font-display text-lg font-bold text-slate-900">${escapeHtml(assignment.title)}</h2></div><span class="rounded-full px-2.5 py-1 text-xs font-bold ${submitted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}">${submitted ? "Submitted" : "Not submitted"}</span></div>
      <p class="mt-3 text-sm leading-6 text-slate-600">${escapeHtml(assignment.description)}</p>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div><p class="text-xs text-slate-400">Published ${escapeHtml(assignment.published)}</p><p class="mt-1 text-sm font-semibold text-slate-700">Due ${escapeHtml(assignment.dueLabel)}</p></div>${submitted ? '<span class="text-xs font-semibold text-emerald-700">Your work is recorded in this demo</span>' : `<button class="primary-button submit-assignment" type="button" data-assignment="${escapeHtml(assignment.id)}">Submit work</button>`}</div>
      ${!submitted ? `<form class="assignment-form mt-4 hidden rounded-xl bg-slate-50 p-4" data-form="${escapeHtml(assignment.id)}"><label class="form-label" for="submission-${escapeHtml(assignment.id)}">Your work</label><textarea id="submission-${escapeHtml(assignment.id)}" class="form-control" rows="3" maxlength="2000" required placeholder="Write a short response…"></textarea><p class="mt-2 text-xs text-slate-400">File attachments will be added in a later phase.</p><div class="mt-3 flex gap-2"><button class="primary-button" type="submit">Save demo submission</button><button class="secondary-button cancel-submission" type="button">Cancel</button></div></form>` : ""}
    </article>`;
  }).join("") || '<div class="panel-card text-sm text-slate-500">No assignments match this filter.</div>';
}

function formatDueLabel(value) {
  const date = new Date(value);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(date);
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  return `${dateLabel} · ${timeLabel}`;
}

function toLocalDateTimeValue(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDateValue(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderTeacherAssignments() {
  document.querySelector("#teacher-assignment-list").innerHTML = assignments.map((assignment) => `
    <article class="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 p-4 sm:flex-row sm:items-center">
      <div class="min-w-0"><h3 class="font-bold text-slate-800">${escapeHtml(assignment.title)}</h3><p class="mt-1 text-sm text-slate-500">${escapeHtml(assignment.subject)} · Due ${escapeHtml(assignment.dueLabel)}</p></div>
      <button class="secondary-button edit-assignment" type="button" data-assignment="${escapeHtml(assignment.id)}">Edit assignment</button>
    </article>`).join("");
}

function renderResources() {
  document.querySelector("#resource-list").innerHTML = resources.map((resource) => `
    <article class="panel-card flex min-h-52 flex-col">
      <div class="flex items-start justify-between"><span class="grid h-11 w-11 place-items-center rounded-xl text-lg font-bold ${colors[resource.color]}">${escapeHtml(resource.icon)}</span><span class="text-xs font-semibold text-slate-400">${escapeHtml(resource.kind)}</span></div>
      <h2 class="mt-4 font-display font-bold text-slate-900">${escapeHtml(resource.title)}</h2><p class="mt-2 flex-1 text-sm leading-6 text-slate-500">${escapeHtml(resource.description)}</p>
      <a class="mt-4 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-900" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Open resource <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new tab)</span></a>
    </article>`).join("");
}

function renderAnnouncements() {
  document.querySelector("#announcement-list").innerHTML = announcements.map((announcement) => `
    <article class="panel-card">
      <div class="flex flex-wrap items-center justify-between gap-2"><span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">${escapeHtml(announcement.category)}</span><time class="text-xs text-slate-400">${escapeHtml(announcement.date)}</time></div>
      <h2 class="mt-3 font-display text-lg font-bold text-slate-900">${escapeHtml(announcement.title)}</h2><p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(announcement.content)}</p>
    </article>`).join("");
}

function renderShowcase() {
  const approvedProjects = showcase.filter((project) => project.approved);
  document.querySelector("#showcase-list").innerHTML = approvedProjects.map((project) => `
    <article class="panel-card">
      <div class="flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-100 text-4xl text-indigo-400" aria-hidden="true">✳</div>
      <p class="mt-4 text-xs font-bold uppercase tracking-wider text-blue-700">Class project</p><h2 class="mt-1 font-display font-bold text-slate-900">${escapeHtml(project.title)}</h2><p class="mt-2 text-sm leading-6 text-slate-500">${escapeHtml(project.description)}</p>
      ${project.project_url ? `<a class="mt-3 inline-block text-sm font-bold text-blue-700" href="${escapeHtml(project.project_url)}" target="_blank" rel="noopener noreferrer">View project ↗</a>` : ""}
      <p class="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">Shared by ${escapeHtml(project.student)}</p>
    </article>`).join("") || '<p class="panel-card text-sm text-slate-500">No approved projects yet. Check back soon!</p>';
  document.querySelector("#review-queue").innerHTML = showcase.filter((project) => !project.approved).map((project) => `
    <article class="rounded-xl border border-slate-100 p-3"><div class="flex items-start justify-between gap-2"><div><h3 class="text-sm font-bold text-slate-800">${escapeHtml(project.title)}</h3><p class="mt-1 text-xs text-slate-500">Submitted by ${escapeHtml(project.student)}</p></div><span class="rounded-full bg-amber-50 px-2 py-1 text-[.68rem] font-bold text-amber-700">Pending</span></div><p class="mt-2 text-sm text-slate-500">${escapeHtml(project.description)}</p><div class="mt-3 flex gap-2"><button class="approve-project rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100" type="button" data-project="${escapeHtml(project.id)}">Approve</button><button class="reject-project rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200" type="button" data-project="${escapeHtml(project.id)}">Reject</button></div></article>`).join("") || '<p class="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No projects waiting for review.</p>';
}

function renderRoster(search = "") {
  const normalizedSearch = search.trim().toLowerCase();
  const visible = students.filter((student) =>
    student.full_name.toLowerCase().includes(normalizedSearch) || student.student_number.toLowerCase().includes(normalizedSearch),
  );
  document.querySelector("#student-roster").innerHTML = visible.map((student) => {
    const initials = student.full_name.split(" ").map((part) => part[0]).join("");
    return `<tr class="roster-row"><td class="py-3 pr-4"><div class="flex items-center gap-3"><span class="avatar avatar-sky !h-9 !w-9 !text-[.62rem]">${escapeHtml(initials)}</span><span class="font-semibold text-slate-700">${escapeHtml(student.full_name)}</span></div></td><td class="py-3 pr-4 text-slate-500">${escapeHtml(student.student_number)}</td><td class="py-3 pr-4"><span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Sample account</span></td><td class="py-3 text-right"><button class="secondary-button edit-student !min-h-8 !px-3 !py-1 !text-xs" type="button" data-student="${escapeHtml(student.student_number)}" aria-label="Edit ${escapeHtml(student.full_name)}">Edit</button></td></tr>`;
  }).join("");
  document.querySelector("#roster-empty").classList.toggle("hidden", visible.length > 0);
}

function openEditor(type, record) {
  const dialog = document.querySelector("#edit-record-dialog");
  const title = document.querySelector("#edit-dialog-title");
  const description = document.querySelector("#edit-dialog-description");
  const fields = document.querySelector("#edit-dialog-fields");
  const form = document.querySelector("#edit-record-form");
  const error = document.querySelector("#edit-dialog-error");
  error.classList.add("hidden");
  form.dataset.recordType = type;
  fields.dataset.recordId = type === "student" ? record.student_number : record.id;

  if (type === "student") {
    title.textContent = "Edit student";
    description.textContent = "Update this fictional student's roster details.";
    fields.innerHTML = `
      <div><label class="form-label" for="edit-student-name">Full name</label><input id="edit-student-name" name="full_name" class="form-control" value="${escapeHtml(record.full_name)}" maxlength="80" autocomplete="name" required /></div>
      <div><label class="form-label" for="edit-student-number">Student number</label><input id="edit-student-number" name="student_number" class="form-control" value="${escapeHtml(record.student_number)}" maxlength="20" required /></div>`;
  } else {
    title.textContent = "Edit assignment";
    description.textContent = "Update the assignment details shown to the class.";
    fields.innerHTML = `
      <div><label class="form-label" for="edit-assignment-title">Assignment title</label><input id="edit-assignment-title" name="title" class="form-control" value="${escapeHtml(record.title)}" maxlength="100" required /></div>
      <div><label class="form-label" for="edit-assignment-subject">Subject</label><input id="edit-assignment-subject" name="subject" class="form-control" value="${escapeHtml(record.subject)}" maxlength="60" required /></div>
      <div><label class="form-label" for="edit-assignment-description">Instructions</label><textarea id="edit-assignment-description" name="description" class="form-control" rows="4" maxlength="2000" required>${escapeHtml(record.description)}</textarea></div>
      <div><label class="form-label" for="edit-assignment-published">Publication date</label><input id="edit-assignment-published" name="published" class="form-control" type="date" value="${toLocalDateValue(record.published)}" required /></div>
      <div><label class="form-label" for="edit-assignment-due">Due date and time</label><input id="edit-assignment-due" name="due" class="form-control" type="datetime-local" value="${toLocalDateTimeValue(record.due)}" required /></div>`;
  }
  dialog.showModal();
  fields.querySelector("input").focus();
}

function handleEditorSubmit(form) {
  const type = form.dataset.recordType;
  const recordId = document.querySelector("#edit-dialog-fields").dataset.recordId;
  const formData = new FormData(form);
  const error = document.querySelector("#edit-dialog-error");
  const fail = (message) => {
    error.textContent = message;
    error.classList.remove("hidden");
  };
  error.classList.add("hidden");

  if (type === "student") {
    const student = students.find((item) => item.student_number === recordId);
    if (!student) return fail("That student could not be found. Close this form and try again.");
    const fullName = String(formData.get("full_name") || "").trim();
    const studentNumber = String(formData.get("student_number") || "").trim();
    if (fullName.length < 2 || studentNumber.length < 2) return fail("Enter a name and a student number with at least 2 characters.");
    if (students.some((item) => item !== student && item.student_number.toLowerCase() === studentNumber.toLowerCase())) {
      return fail("That student number is already being used. Choose a unique number.");
    }
    student.full_name = fullName;
    student.student_number = studentNumber;
    renderRoster(document.querySelector("#student-search").value);
    document.querySelector("#edit-record-dialog").close();
    showToast("Student details updated for this demo.");
    return;
  }

  if (type === "assignment") {
    const assignment = assignments.find((item) => item.id === recordId);
    if (!assignment) return fail("That assignment could not be found. Close this form and try again.");
    const title = String(formData.get("title") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const published = String(formData.get("published") || "");
    const due = String(formData.get("due") || "");
    const publishedDate = new Date(`${published}T00:00:00`);
    const dueDate = new Date(due);
    if (title.length < 2 || subject.length < 2 || description.length < 5) {
      return fail("Enter a title, subject, and instructions. Instructions need at least 5 characters.");
    }
    if (!published || Number.isNaN(publishedDate.getTime()) || Number.isNaN(dueDate.getTime())) {
      return fail("Enter a valid publication date and due date.");
    }
    if (dueDate < publishedDate) return fail("The due date must be on or after the publication date.");
    assignment.title = title;
    assignment.subject = subject;
    assignment.description = description;
    assignment.published = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(publishedDate);
    assignment.due = due;
    assignment.dueLabel = formatDueLabel(due);
    renderAssignments();
    renderTeacherAssignments();
    renderHome();
    document.querySelector("#edit-record-dialog").close();
    showToast("Assignment details updated for this demo.");
  }
}

function setPage(page) {
  const selectedPage = pageNames[page] && (page !== "teacher" || activeProfile?.role === "teacher") ? page : "home";
  document.querySelectorAll(".page-section").forEach((section) => section.classList.add("hidden"));
  document.querySelector(`#page-${selectedPage}`).classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.page === selectedPage;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelector("#page-heading").textContent = pageNames[selectedPage];
  document.title = `${pageNames[selectedPage]} · Classroom Hub`;
  closeMenu();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function openMenu() {
  document.querySelector("#sidebar").classList.remove("-translate-x-full");
  document.querySelector("#sidebar-backdrop").classList.remove("hidden");
  document.querySelector("#close-menu").focus();
}

function closeMenu() {
  document.querySelector("#sidebar").classList.add("-translate-x-full");
  document.querySelector("#sidebar-backdrop").classList.add("hidden");
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const pageLink = event.target.closest("[data-page]");
    if (pageLink) {
      event.preventDefault();
      const page = pageLink.dataset.page;
      window.history.pushState({ page }, "", `#${page}`);
      setPage(page);
      return;
    }

    const submitButton = event.target.closest(".submit-assignment");
    if (submitButton) {
      const form = document.querySelector(`[data-form="${CSS.escape(submitButton.dataset.assignment)}"]`);
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden")) form.querySelector("textarea").focus();
      return;
    }
    const editStudentButton = event.target.closest(".edit-student");
    if (editStudentButton) {
      const student = students.find((item) => item.student_number === editStudentButton.dataset.student);
      if (student) openEditor("student", student);
      return;
    }
    const editAssignmentButton = event.target.closest(".edit-assignment");
    if (editAssignmentButton) {
      const assignment = assignments.find((item) => item.id === editAssignmentButton.dataset.assignment);
      if (assignment) openEditor("assignment", assignment);
      return;
    }
    if (event.target.closest(".cancel-submission")) {
      event.target.closest("form").classList.add("hidden");
      return;
    }
    const approveButton = event.target.closest(".approve-project");
    const rejectButton = event.target.closest(".reject-project");
    if (approveButton || rejectButton) {
      const projectId = (approveButton || rejectButton).dataset.project;
      const index = showcase.findIndex((project) => project.id === projectId);
      if (index >= 0) {
        showcase.splice(index, 1);
        renderShowcase();
        showToast(approveButton ? "Project approved for the demo showcase." : "Project rejected in this demo.");
      }
      return;
    }
    if (event.target.closest("#open-showcase-form")) {
      document.querySelector("#showcase-form").classList.remove("hidden");
      document.querySelector("#project-title").focus();
    }
    if (event.target.closest("#cancel-showcase")) document.querySelector("#showcase-form").classList.add("hidden");
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "login-form") {
      event.preventDefault();
      handleLogin(event.target);
      return;
    }
    if (event.target.id === "edit-record-form") {
      event.preventDefault();
      if (!event.target.reportValidity()) return;
      handleEditorSubmit(event.target);
      return;
    }
    const assignmentForm = event.target.closest(".assignment-form");
    if (assignmentForm) {
      event.preventDefault();
      if (!assignmentForm.reportValidity()) return;
      const id = assignmentForm.dataset.form;
      const assignment = assignments.find((item) => item.id === id);
      if (!assignment) return;
      assignment.status = "Submitted";
      renderAssignments();
      renderHome();
      showToast("Demo submission saved in this browser session.");
      return;
    }
    if (event.target.id === "showcase-form") {
      event.preventDefault();
      const form = event.target;
      const title = document.querySelector("#project-title").value.trim();
      const description = document.querySelector("#project-description").value.trim();
      const projectUrl = document.querySelector("#project-url").value.trim();
      const message = document.querySelector("#showcase-form-message");
      message.classList.add("hidden");
      if (title.length < 2 || description.length < 5) {
        message.textContent = "Please enter a title and a description of at least 5 characters.";
        message.classList.remove("hidden");
        message.classList.add("error");
        return;
      }
      if (projectUrl && !isSafeWebUrl(projectUrl)) {
        message.textContent = "Please use a valid https:// or http:// project link.";
        message.classList.remove("hidden");
        message.classList.add("error");
        return;
      }
      showcase.push({ id: `project-${Date.now()}`, title, description, project_url: projectUrl, student: "Demo student", approved: false });
      form.reset();
      form.classList.add("hidden");
      message.classList.add("hidden");
      renderShowcase();
      showToast("Project sent to the teacher for demo review.");
    }
  });

  document.querySelector("#assignment-filter").addEventListener("change", renderAssignments);
  document.querySelector("#student-search").addEventListener("input", (event) => renderRoster(event.target.value));
  document.querySelector("#sign-out-button").addEventListener("click", handleSignOut);
  document.querySelector("#open-menu").addEventListener("click", openMenu);
  document.querySelector("#close-menu").addEventListener("click", closeMenu);
  document.querySelector("#sidebar-backdrop").addEventListener("click", closeMenu);
  document.querySelector("#close-edit-dialog").addEventListener("click", () => document.querySelector("#edit-record-dialog").close());
  document.querySelector("#cancel-edit-dialog").addEventListener("click", () => document.querySelector("#edit-record-dialog").close());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  window.addEventListener("popstate", () => setPage(window.location.hash.slice(1) || "home"));
}

function setAuthMessage(message, isError = true) {
  const element = document.querySelector("#login-message");
  element.textContent = message;
  element.classList.remove("hidden", "error");
  if (isError) element.classList.add("error");
}

function showLogin() {
  activeProfile = null;
  activeEmail = "";
  document.querySelector("#app-shell").classList.add("hidden");
  document.querySelector("#login-screen").classList.remove("hidden");
  document.querySelector("#login-email").focus();
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
}

function showApp(user, profile) {
  activeProfile = profile;
  activeEmail = user.email || "";
  const displayName = profile.full_name || activeEmail;
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  document.querySelector("#profile-name").textContent = displayName;
  document.querySelector("#profile-role").textContent = profile.role === "teacher" ? "Teacher account" : "Student account";
  document.querySelector("#profile-avatar").textContent = initials;
  document.querySelector("#header-avatar").textContent = initials;
  document.querySelector("#teacher-nav-link").classList.toggle("hidden", profile.role !== "teacher");
  document.querySelector("#login-screen").classList.add("hidden");
  document.querySelector("#app-shell").classList.remove("hidden");
  const requestedPage = window.location.hash.slice(1) || "home";
  setPage(requestedPage);
}

async function handleLogin(form) {
  const button = document.querySelector("#login-submit");
  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value;
  const message = document.querySelector("#login-message");
  message.classList.add("hidden");

  if (!form.reportValidity()) return;
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    const { user, profile } = await signInWithPassword(email, password);
    form.reset();
    showApp(user, profile);
  } catch (error) {
    setAuthMessage(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
}

async function handleSignOut() {
  const button = document.querySelector("#sign-out-button");
  button.disabled = true;
  try {
    await signOut();
    showLogin();
    setAuthMessage("You have signed out.", false);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not sign out.");
  } finally {
    button.disabled = false;
  }
}

function isSafeWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function initialize() {
  renderHome();
  renderWeeklySchedule();
  renderAssignments();
  renderResources();
  renderAnnouncements();
  renderShowcase();
  renderRoster();
  renderTeacherAssignments();
  document.querySelector("#student-total").textContent = String(students.length);
  document.querySelector("#active-assignment-total").textContent = String(assignments.filter((item) => item.status !== "Submitted").length);
  document.querySelector("#nav-assignment-count").textContent = String(assignments.filter((item) => item.status !== "Submitted").length);
  bindEvents();
  try {
    const session = await getCurrentSession();
    if (session) showApp(session.user, session.profile);
    else showLogin();
  } catch (error) {
    showLogin();
    setAuthMessage(error instanceof Error ? error.message : "Could not connect to classroom sign-in.");
  }
}

initialize();
