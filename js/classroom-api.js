import { getSupabaseClient } from "./supabase.js";

const assignmentBucket = "assignment-files";
const submissionBucket = "submission-files";
const maxFileSize = 10 * 1024 * 1024;
const allowedFileTypes = new Set(["application/pdf", "image/jpeg", "image/png", "text/plain"]);

async function queryData(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function currentUserId() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Could not verify the signed-in user: ${error.message}`);
  if (!data.user) throw new Error("Your session has ended. Sign in again.");
  return data.user.id;
}

function validateFile(file) {
  if (!file) return;
  if (file.size > maxFileSize) throw new Error("Files must be 10 MB or smaller.");
  if (!allowedFileTypes.has(file.type)) throw new Error("Choose a PDF, PNG, JPG, or text file.");
}

function safeFileName(name) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
}

async function uploadFile(bucket, path, file) {
  validateFile(file);
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Could not upload the file: ${error.message}`);
  return data.path;
}

export async function getSignedFileUrl(bucket, path) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw new Error(`Could not open the file: ${error.message}`);
  return data.signedUrl;
}

export async function getSchedules() {
  const supabase = await getSupabaseClient();
  return queryData(supabase.from("schedules").select("*").order("day_of_week").order("start_time"), "Could not load the schedule");
}

export async function saveSchedule(id, values) {
  const supabase = await getSupabaseClient();
  const payload = { ...values, ...(id ? {} : { created_by: await currentUserId() }) };
  const query = id
    ? supabase.from("schedules").update(payload).eq("id", id).select().single()
    : supabase.from("schedules").insert(payload).select().single();
  return queryData(query, "Could not save the schedule");
}

export async function deleteSchedule(id) {
  const supabase = await getSupabaseClient();
  await queryData(supabase.from("schedules").delete().eq("id", id), "Could not delete the schedule entry");
}

export async function getAssignments() {
  const supabase = await getSupabaseClient();
  return queryData(supabase.from("assignments").select("*").order("due_at"), "Could not load assignments");
}

export async function saveAssignment(id, values) {
  const supabase = await getSupabaseClient();
  const payload = { ...values, ...(id ? {} : { created_by: await currentUserId() }) };
  const query = id
    ? supabase.from("assignments").update(payload).eq("id", id).select().single()
    : supabase.from("assignments").insert(payload).select().single();
  return queryData(query, "Could not save the assignment");
}

export async function deleteAssignment(id) {
  const supabase = await getSupabaseClient();
  await queryData(supabase.from("assignments").delete().eq("id", id), "Could not delete the assignment");
}

export async function uploadAssignmentAttachment(assignmentId, file) {
  if (!file) return null;
  const path = `${assignmentId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  return uploadFile(assignmentBucket, path, file);
}

export async function removeAssignmentAttachment(path) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.storage.from(assignmentBucket).remove([path]);
  if (error) throw new Error(`Could not remove the previous assignment attachment: ${error.message}`);
}

export async function saveSubmission(assignmentId, text, file, previousFilePath) {
  const userId = await currentUserId();
  const supabase = await getSupabaseClient();
  const existing = await queryData(
    supabase.from("submissions").select("id, status")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId)
      .maybeSingle(),
    "Could not check your existing submission",
  );
  if (existing?.status === "reviewed") {
    throw new Error("This submission has been reviewed and can no longer be changed.");
  }

  let newPath = previousFilePath || null;
  if (file) {
    const path = `${userId}/${assignmentId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    newPath = await uploadFile(submissionBucket, path, file);
  }

  let submission;
  try {
    const query = existing
      ? supabase.from("submissions").update({ submission_text: text, file_path: newPath }).eq("id", existing.id).select().single()
      : supabase.from("submissions").insert({
        assignment_id: assignmentId,
        student_id: userId,
        submission_text: text,
        file_path: newPath,
      }).select().single();
    submission = await queryData(query, "Could not save your submission");
  } catch (error) {
    if (file && newPath && newPath !== previousFilePath) {
      const { error: cleanupError } = await supabase.storage.from(submissionBucket).remove([newPath]);
      if (cleanupError) {
        throw new Error(`${error instanceof Error ? error.message : "Could not save your submission."} The newly uploaded attachment could not be cleaned up: ${cleanupError.message}`);
      }
    }
    throw error;
  }

  if (file && previousFilePath) {
    const { error } = await supabase.storage.from(submissionBucket).remove([previousFilePath]);
    if (error) throw new Error(`Your submission was saved, but its previous attachment could not be removed: ${error.message}`);
  }
  return submission;
}

export async function getSubmissions() {
  const supabase = await getSupabaseClient();
  return queryData(
    supabase.from("submissions")
      .select("*, assignments!submissions_assignment_id_fkey(title, due_at), profiles!submissions_student_id_fkey(full_name, student_number)")
      .order("submitted_at", { ascending: false }),
    "Could not load submissions",
  );
}

export async function reviewSubmission(id, grade, feedback) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc("review_submission", {
    target_submission: id,
    new_grade: grade,
    new_feedback: feedback || null,
  });
  if (error) throw new Error(`Could not save feedback: ${error.message}`);
}

export async function getRoster() {
  const supabase = await getSupabaseClient();
  return queryData(
    supabase.from("profiles").select("id, full_name, student_number, active").eq("role", "student").order("full_name"),
    "Could not load the student roster",
  );
}

export async function getEnrollmentRequests() {
  const supabase = await getSupabaseClient();
  return queryData(
    supabase.from("enrollment_requests")
      .select("id, email, full_name, status, created_at")
      .eq("status", "pending")
      .order("created_at"),
    "Could not load student access requests",
  );
}

export async function approveEnrollmentRequest(id, studentNumber) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc("approve_enrollment_request", {
    target_request: id,
    assigned_student_number: studentNumber,
  });
  if (error) throw new Error(`Could not approve the student request: ${error.message}`);
}

export async function rejectEnrollmentRequest(id) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc("reject_enrollment_request", {
    target_request: id,
  });
  if (error) throw new Error(`Could not reject the student request: ${error.message}`);
}

export async function setStudentAccess(id, enabled) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc("set_student_access", {
    target_student: id,
    enable_access: enabled,
  });
  if (error) throw new Error(`Could not update student access: ${error.message}`);
}

export async function updateStudentProfile(id, fullName, studentNumber) {
  const supabase = await getSupabaseClient();
  await queryData(
    supabase.from("profiles").update({ full_name: fullName, student_number: studentNumber }).eq("id", id).select("id").single(),
    "Could not update the student profile",
  );
}

export async function getAttendance(date) {
  const supabase = await getSupabaseClient();
  return queryData(
    supabase.from("attendance").select("*").eq("attendance_date", date),
    "Could not load attendance",
  );
}

export async function getMyAttendance() {
  const supabase = await getSupabaseClient();
  return queryData(
    supabase.from("attendance").select("attendance_date, status").order("attendance_date", { ascending: false }),
    "Could not load your attendance",
  );
}

export async function saveAttendance(studentId, date, status) {
  const supabase = await getSupabaseClient();
  const existing = await queryData(
    supabase.from("attendance").select("id")
      .eq("student_id", studentId)
      .eq("attendance_date", date)
      .maybeSingle(),
    "Could not check the attendance record",
  );
  if (existing) {
    await queryData(
      supabase.from("attendance").update({ status, recorded_by: await currentUserId() }).eq("id", existing.id).select("id").single(),
      "Could not update attendance",
    );
  } else {
    await queryData(
      supabase.from("attendance").insert({
      student_id: studentId,
      attendance_date: date,
      status,
      }).select("id").single(),
      "Could not record attendance",
    );
  }
}

export async function getResources() {
  const supabase = await getSupabaseClient();
  return queryData(supabase.from("resources").select("*").order("created_at", { ascending: false }), "Could not load resources");
}

export async function saveResource(id, values) {
  const supabase = await getSupabaseClient();
  const payload = { ...values, ...(id ? {} : { created_by: await currentUserId() }) };
  const query = id
    ? supabase.from("resources").update(payload).eq("id", id).select().single()
    : supabase.from("resources").insert(payload).select().single();
  return queryData(query, "Could not save the resource");
}

export async function deleteResource(id) {
  const supabase = await getSupabaseClient();
  await queryData(supabase.from("resources").delete().eq("id", id), "Could not delete the resource");
}

export async function getAnnouncements() {
  const supabase = await getSupabaseClient();
  return queryData(supabase.from("announcements").select("*").order("created_at", { ascending: false }), "Could not load announcements");
}

export async function saveAnnouncement(id, values) {
  const supabase = await getSupabaseClient();
  const payload = { ...values, ...(id ? {} : { created_by: await currentUserId() }) };
  const query = id
    ? supabase.from("announcements").update(payload).eq("id", id).select().single()
    : supabase.from("announcements").insert(payload).select().single();
  return queryData(query, "Could not save the announcement");
}

export async function deleteAnnouncement(id) {
  const supabase = await getSupabaseClient();
  await queryData(supabase.from("announcements").delete().eq("id", id), "Could not delete the announcement");
}

export async function getShowcase(forTeacher = false) {
  const supabase = await getSupabaseClient();
  if (forTeacher) {
    return queryData(supabase.rpc("get_teacher_showcase"), "Could not load showcase projects");
  }
  return queryData(supabase.from("showcase").select("id, title, description, project_url, review_status, created_at").order("created_at", { ascending: false }), "Could not load showcase projects");
}

export async function saveShowcase(values) {
  const supabase = await getSupabaseClient();
  const userId = await currentUserId();
  return queryData(
    supabase.from("showcase")
      .insert({ ...values, student_id: userId })
      .select("id, title, description, project_url, review_status, created_at")
      .single(),
    "Could not submit the showcase project",
  );
}

export async function reviewShowcase(id, approve) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc("review_showcase", {
    target_project: id,
    approve_project: approve,
  });
  if (error) throw new Error(`Could not review the showcase project: ${error.message}`);
}
