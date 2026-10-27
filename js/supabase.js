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
    .select("id, full_name, student_number, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load your classroom profile: ${error.message}`);
  if (!data || !["teacher", "student"].includes(data.role)) {
    throw new Error("This sign-in is not linked to a classroom profile. Contact your teacher.");
  }
  return data;
}

export async function signInWithPassword(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  try {
    const profile = await getClassroomProfile(data.user.id);
    return { user: data.user, profile };
  } catch (error) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw new Error(`${error.message} Sign-out also failed: ${signOutError.message}`);
    throw error;
  }
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
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw new Error(`${error.message} Sign-out also failed: ${signOutError.message}`);
    throw error;
  }
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
}
