import { supabasePublishableKey, supabaseUrl } from "./config.js";

let clientPromise;

export async function getSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase is not configured. Add your project URL and publishable key to js/config.js.");
  }

  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) => createClient(supabaseUrl, supabasePublishableKey));
  }

  return clientPromise;
}

export async function getClassroomProfile(userId) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, student_number, role, active")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load your classroom profile: ${error.message}`);
  if (data?.active && ["teacher", "student"].includes(data.role)) return data;

  const { data: request, error: requestError } = await supabase
    .from("enrollment_requests")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (requestError) {
    throw new Error(`Could not check your student access request: ${requestError.message}`);
  }

  if (data && !data.active) throw new Error("Your classroom access has been disabled. Contact your teacher.");
  if (request?.status === "pending") throw new Error("Your student request is waiting for teacher approval.");
  if (request?.status === "rejected") throw new Error("Your student request was not approved. Contact your teacher.");
  throw new Error("This sign-in is not linked to an active classroom profile. Contact your teacher.");
}

async function signOutAfterAccessError(supabase, error) {
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) throw new Error(`${error.message} Sign-out also failed: ${signOutError.message}`);
  throw error;
}

export async function signInWithPassword(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  try {
    const profile = await getClassroomProfile(data.user.id);
    return { user: data.user, profile };
  } catch (error) {
    await signOutAfterAccessError(supabase, error);
  }
}

export async function registerStudent(fullName, email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, request_student_access: true },
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });
  if (error) throw new Error(`Could not submit your student request: ${error.message}`);

  if (data.session) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw new Error(`Your request was created, but automatic sign-out failed: ${signOutError.message}`);
    }
  }
  return { confirmationRequired: !data.session };
}

export async function getCurrentSession() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not check the sign-in session: ${error.message}`);
  if (!data.session) return null;

  try {
    const profile = await getClassroomProfile(data.session.user.id);
    return { user: data.session.user, profile };
  } catch (error) {
    await signOutAfterAccessError(supabase, error);
  }
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
}
