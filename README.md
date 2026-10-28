# AI 2nd Batch — Thakurgaon

A vanilla JavaScript classroom website for the AI 2nd Batch training in Thakurgaon, connected to Supabase Auth, PostgreSQL, Row Level Security (RLS), and private Storage buckets. Students can request accounts, but cannot access classroom data until the teacher approves them.

## 1. Configure Supabase

1. Create a Supabase project in the Supabase dashboard.
2. In **Project Settings → API**, copy the project URL and **publishable** key.
3. Put those values in `js/config.js`:

   ```js
   export const supabaseUrl = "https://YOUR-PROJECT-ID.supabase.co";
   export const supabasePublishableKey = "YOUR_PUBLISHABLE_KEY";
   ```

   The project URL and publishable key are intended to be visible in browser code and are committed so GitHub Pages can load them. **Never** put a service-role or secret key in this website. Security must come from the database's RLS policies.
4. Open Supabase **SQL Editor**, paste in `supabase/schema.sql`, and run it once on a new project. It creates the classroom tables, access policies, helper functions, and two private file buckets. Do not run it on a database with valuable existing classroom data without first reviewing and backing up that data.
5. Run `supabase/enrollment-migration.sql` in the SQL Editor. It adds student request approval, active/inactive access, and an Auth signup trigger. Existing student records remain active.
6. In Supabase **Authentication settings**, enable email sign-ups and email confirmations. Add CAPTCHA protection if available. The trigger stores new sign-ups as pending requests; only teacher approval creates an active classroom profile.
7. In **Authentication → URL Configuration**, add your local site URL to the allowed redirect URLs if required. With Live Server, this is commonly `http://127.0.0.1:5500/**`.

## 4. Publish with GitHub Pages

1. Push the project to the `main` branch on GitHub.
2. In the repository, open **Settings → Pages** and set the source to **GitHub Actions**.
3. Open **Actions** and wait for the **Deploy to GitHub Pages** workflow to finish.
4. The site will be available at `https://<your-github-username>.github.io/<repository-name>/`.
5. In Supabase **Authentication → URL Configuration**, set the Site URL to that address and add it to the Redirect URLs list.

The workflow deploys the static files directly; no build step is required.

## 5. Create teacher and student accounts

Create the teacher Auth account through Supabase dashboard user management, then add its matching profile from the SQL Editor. Do not expose a service-role key. Students can select **Request access** on the sign-in page to submit a registration request. The teacher reviews their name and email in the dashboard and assigns a unique student number when approving. Rejected requests and unapproved accounts cannot access classroom data.

To add an existing Auth user as the teacher, replace the sample values with that user's exact Auth email:

```sql
insert into public.profiles (id, full_name, student_number, role)
select id, 'Teacher Name', null, 'teacher'
from auth.users
where email = 'teacher@example.edu';
```

```sql
insert into public.profiles (id, full_name, student_number, role)
select id, 'Student Name', 'S-001', 'student'
from auth.users
where email = 'student@example.edu';
```

The database enforces one teacher and prevents browser users from changing roles. In the Teacher dashboard, disabling a student's access preserves their submissions, grades, and attendance; access can be restored later. Authentication account deletion and password resets remain trusted-admin tasks.

## 6. Run locally

1. Open this folder in VS Code.
2. Right-click `index.html` and select **Open with Live Server**. Use `http://localhost` or `http://127.0.0.1`; do not open the file as `file://`.
3. Sign in with an Auth user that has a matching `profiles` row.

An Auth user without a valid classroom profile is signed out and shown an error. The app uses Tailwind's CDN for development; production deployment should compile Tailwind CSS instead.

## Features connected to Supabase

- **Authentication and enrollment:** Email/password sign-in, student access requests, teacher approval/rejection, and session restoration. Email confirmation should be enabled in Supabase.
- **Profiles:** Teacher roster, student numbers, profile editing, and reversible student access disabling.
- **Schedule:** Students read; the teacher can create, edit, and delete lessons.
- **Assignments:** Students read published work and submit text or optional private files. The teacher manages assignments, reads submissions, and records grades and feedback.
- **Resources and announcements:** The teacher manages records; authenticated classroom users can read them.
- **Attendance:** The teacher records attendance; students can view only their own history.
- **Showcase:** Students submit projects; the teacher approves or rejects them. Classmates see only approved project details. Student profile IDs are not exposed through the showcase query.
- **Storage:** Assignment materials and submission files use private buckets with RLS-protected object access and short-lived signed download links. Files are limited to 10 MB and PDF, PNG, JPG, or text.

## Security notes

- RLS is enabled on every classroom table. Hiding teacher controls in the browser is not the security boundary.
- Students cannot view other students' submissions, grades, feedback, attendance, or pending projects.
- Students cannot change their own grade, feedback, submission status, profile role, or showcase approval state.
- The database enforces important constraints and uses teacher-only database functions for reviewing work and showcase entries.
- New Auth sign-ups are pending only. Approval creates the student profile; disabling access removes app access while preserving classroom records.
- Never store real student passwords, publishable project details that should remain private, or service-role credentials in source control.

## Validate the setup

After creating a teacher and two test students, try these checks:

1. Sign in as a student. Verify they can read classroom data and cannot see teacher-only controls.
2. Submit work as student A. Sign in as student B and verify student A's submission, feedback, and attendance are not visible.
3. As the teacher, record attendance, review a submission, and approve a showcase entry.
4. As a student, verify the approved project is visible, the pending project is not, and only that student's attendance and work are displayed.
5. Try changing role, grade, feedback, attendance, or approval in the browser client; RLS and database grants should reject the request.

If these permission checks do not behave as described, stop and review the SQL policies before using real student information.
