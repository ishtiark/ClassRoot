# Classroom Hub

A responsive classroom website built with HTML, Tailwind CSS via CDN, and vanilla JavaScript modules. The current login uses Supabase Auth; classroom content and student names are still fictional sample data until later database phases.

## Run it in VS Code

1. Open the `D:\ClassRoot` folder in VS Code.
2. Copy `js/config.example.js` to `js/config.local.js`.
3. In `js/config.local.js`, enter the Supabase project URL and **publishable** key from your project's API settings. Never use a service-role or secret key in this website.
4. Run `index.html` using a local web server such as the **Live Server** VS Code extension. ES modules and Supabase Auth should not be tested by opening the file directly.
5. Keep an internet connection available for the Tailwind CSS, Google Fonts, and Supabase client CDNs.

Run `supabase/schema.sql` in the Supabase SQL Editor before signing in. The `js/config.local.js` file is excluded from Git.

## Configure accounts safely

1. In Supabase Authentication settings, turn off public sign-ups. Accounts should be created by a trusted administrator, not from this public website.
2. In Supabase Authentication → Users, create the teacher account and each student account with an email and initial password. Give each student their login details privately.
3. In the Supabase SQL Editor, create the matching profile for each Auth user. Replace the email/name with the correct account details:

   ```sql
   insert into public.profiles (id, full_name, student_number, role)
   select id, 'Teacher Name', null, 'teacher'
   from auth.users
   where email = 'teacher@example.edu';

   insert into public.profiles (id, full_name, student_number, role)
   select id, 'Student Name', 'S-001', 'student'
   from auth.users
   where email = 'student@example.edu';
   ```

   Run one insert per account and verify each insert adds one row. The schema deliberately gives browser users no profile insert, update, or delete permission. Assign the initial teacher role only through this trusted SQL setup.
4. Use the email/password sign-in page to log in. A valid Auth account without a matching profile is signed out and shown a contact-teacher message.

The browser UI hides the teacher dashboard from student accounts based on the profile returned by Supabase. This is only navigation; real data access must be protected by RLS policies on each future application table. The current lessons, assignments, showcase, and roster are static sample content, not per-account Supabase records.

## What is and is not connected

- Supabase Auth email/password sign-in, session restoration, profile lookup, role-aware navigation, and sign-out are connected.
- `profiles` has RLS enabled. Users can read their own profile; a teacher can read profiles. Browser roles cannot insert or change profiles or promote accounts.
- Class schedules, assignments, resources, announcements, submissions, attendance, and showcase are still demo-only and are not yet connected to Supabase.
- Teacher roster and assignment edits are local prototype interactions. They do not update `profiles` or assignment records.
- Never enter real student data into the sample roster or demo forms.

The Tailwind CDN is appropriate for prototyping only; production deployment should use a proper Tailwind build process.
