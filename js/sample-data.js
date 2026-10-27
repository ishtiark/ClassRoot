// Fictional classroom content for the Phase 1 prototype only.
export const schedules = [
  { day: "Monday", title: "Morning meeting", subject: "Community", start: "8:30 AM", end: "9:00 AM", topic: "Goals for the week", color: "blue" },
  { day: "Monday", title: "Mathematics", subject: "Math", start: "9:10 AM", end: "10:00 AM", topic: "Fractions in everyday life", color: "violet" },
  { day: "Monday", title: "Language arts", subject: "English", start: "10:20 AM", end: "11:10 AM", topic: "Finding the main idea", color: "amber" },
  { day: "Monday", title: "Science lab", subject: "Science", start: "12:30 PM", end: "1:20 PM", topic: "States of matter", color: "emerald" },
  { day: "Monday", title: "Creative studio", subject: "Art", start: "1:30 PM", end: "2:15 PM", topic: "Color and composition", color: "rose" },
  { day: "Tuesday", title: "Mathematics", subject: "Math", start: "8:30 AM", end: "9:20 AM", topic: "Equivalent fractions", color: "violet" },
  { day: "Tuesday", title: "Science lab", subject: "Science", start: "9:30 AM", end: "10:20 AM", topic: "Observing materials", color: "emerald" },
  { day: "Tuesday", title: "Language arts", subject: "English", start: "10:40 AM", end: "11:30 AM", topic: "Reading workshop", color: "amber" },
  { day: "Tuesday", title: "Social studies", subject: "Social studies", start: "12:30 PM", end: "1:20 PM", topic: "Maps and communities", color: "sky" },
  { day: "Wednesday", title: "Language arts", subject: "English", start: "8:30 AM", end: "9:20 AM", topic: "Drafting a strong paragraph", color: "amber" },
  { day: "Wednesday", title: "Mathematics", subject: "Math", start: "9:30 AM", end: "10:20 AM", topic: "Fractions on a number line", color: "violet" },
  { day: "Wednesday", title: "Creative studio", subject: "Art", start: "10:40 AM", end: "11:30 AM", topic: "Sketchbook explorations", color: "rose" },
  { day: "Wednesday", title: "Science lab", subject: "Science", start: "12:30 PM", end: "1:20 PM", topic: "Matter: predict and test", color: "emerald" },
  { day: "Thursday", title: "Mathematics", subject: "Math", start: "8:30 AM", end: "9:20 AM", topic: "Comparing fractions", color: "violet" },
  { day: "Thursday", title: "Language arts", subject: "English", start: "9:30 AM", end: "10:20 AM", topic: "Peer reading circles", color: "amber" },
  { day: "Thursday", title: "Social studies", subject: "Social studies", start: "10:40 AM", end: "11:30 AM", topic: "Our neighborhood stories", color: "sky" },
  { day: "Thursday", title: "Science lab", subject: "Science", start: "12:30 PM", end: "1:20 PM", topic: "Recording observations", color: "emerald" },
  { day: "Friday", title: "Community circle", subject: "Community", start: "8:30 AM", end: "9:00 AM", topic: "Celebrating our week", color: "blue" },
  { day: "Friday", title: "Language arts", subject: "English", start: "9:10 AM", end: "10:00 AM", topic: "Share a favorite book", color: "amber" },
  { day: "Friday", title: "Mathematics", subject: "Math", start: "10:20 AM", end: "11:10 AM", topic: "Math games and review", color: "violet" },
  { day: "Friday", title: "Project time", subject: "Project", start: "12:30 PM", end: "1:30 PM", topic: "Build, reflect, share", color: "sky" },
];

export const assignments = [
  { id: "fractions", title: "Fractions in my day", subject: "Mathematics", published: "October 20, 2026", due: "2026-10-30T15:00:00", dueLabel: "Friday, Oct 30 · 3:00 PM", description: "Find three examples of fractions in everyday life. Draw or write about each example and explain what the fraction represents.", type: "Reflection", status: "Not submitted" },
  { id: "reading", title: "Reading response: a big idea", subject: "Language arts", published: "October 22, 2026", due: "2026-11-02T15:00:00", dueLabel: "Monday, Nov 2 · 3:00 PM", description: "Choose a book you are reading. Write a short paragraph about its main idea and include one detail that supports your thinking.", type: "Writing", status: "Not submitted" },
  { id: "matter", title: "Matter detective notes", subject: "Science", published: "October 16, 2026", due: "2026-10-23T15:00:00", dueLabel: "Friday, Oct 23 · 3:00 PM", description: "Observe an object at home and describe its properties. Is it a solid, liquid, or gas? What evidence helped you decide?", type: "Science", status: "Submitted" },
  { id: "community", title: "A map of my community", subject: "Social studies", published: "October 24, 2026", due: "2026-11-06T15:00:00", dueLabel: "Friday, Nov 6 · 3:00 PM", description: "Create a simple map showing three places that are important to your community. Add labels and a short explanation.", type: "Project", status: "Not submitted" },
];

export const announcements = [
  { id: "week", title: "Welcome to a new week!", date: "October 27, 2026", category: "Class news", content: "This week we'll explore fractions, share our favorite books, and investigate how materials change. Bring your curiosity and your science notebook!" },
  { id: "library", title: "Library books due Thursday", date: "October 24, 2026", category: "Reminder", content: "Please return or renew your library book by Thursday so everyone can choose something new for the weekend." },
  { id: "showcase", title: "Share your learning", date: "October 22, 2026", category: "Celebration", content: "The student showcase is open! Send me a project you feel proud of. I'll review it before it appears on our class page." },
  { id: "lab", title: "Science lab materials", date: "October 20, 2026", category: "Coming up", content: "Our science investigations use classroom materials. You do not need to bring anything from home." },
];

export const resources = [
  { title: "Fraction number line", description: "A visual guide for comparing and locating fractions.", kind: "Math guide", icon: "⅓", color: "violet", url: "https://www.khanacademy.org/math/arithmetic/fraction-arithmetic" },
  { title: "Reading for meaning", description: "Practice noticing the main idea and supporting details.", kind: "Reading practice", icon: "Aa", color: "amber", url: "https://www.readingrockets.org/" },
  { title: "States of matter", description: "Explore solids, liquids, and gases with simple examples.", kind: "Science link", icon: "◌", color: "emerald", url: "https://www.bbc.co.uk/bitesize/topics/zkgg87h" },
  { title: "Our classroom notes", description: "A quick recap of this week's classroom learning topics.", kind: "Lesson notes", icon: "▤", color: "blue", url: "https://www.nasa.gov/" },
  { title: "Creative thinking", description: "Try a short drawing prompt and share what you notice.", kind: "Creative activity", icon: "✳", color: "rose", url: "https://www.tate.org.uk/kids" },
  { title: "Map skills for beginners", description: "Learn about symbols, directions, and map keys.", kind: "Social studies", icon: "⌖", color: "sky", url: "https://education.nationalgeographic.org/" },
];

export const showcase = [
  { id: "project-one", title: "My neighborhood map", description: "I included the library, the park, and our school. The map key shows what each symbol means.", student: "Avery M.", project_url: "", approved: true },
  { id: "project-two", title: "Fraction pizza", description: "A colorful way to show halves, quarters, and eighths using a favorite food.", student: "Jordan K.", project_url: "", approved: true },
  { id: "project-three", title: "Cloud watcher journal", description: "Drawings and notes from a week of looking at the sky.", student: "Riley T.", project_url: "", approved: false },
];

export const students = [
  { full_name: "Avery Morgan", student_number: "S-001" },
  { full_name: "Jordan Kim", student_number: "S-002" },
  { full_name: "Riley Thompson", student_number: "S-003" },
  { full_name: "Casey Patel", student_number: "S-004" },
  { full_name: "Morgan Chen", student_number: "S-005" },
  { full_name: "Taylor Brooks", student_number: "S-006" },
  { full_name: "Quinn Rivera", student_number: "S-007" },
  { full_name: "Cameron Ellis", student_number: "S-008" },
  { full_name: "Skyler Nguyen", student_number: "S-009" },
  { full_name: "Reese Walker", student_number: "S-010" },
  { full_name: "Parker Davis", student_number: "S-011" },
  { full_name: "Rowan Bennett", student_number: "S-012" },
  { full_name: "Emerson Clark", student_number: "S-013" },
  { full_name: "Finley Adams", student_number: "S-014" },
  { full_name: "Dakota Flores", student_number: "S-015" },
  { full_name: "Harper Wilson", student_number: "S-016" },
  { full_name: "Logan Murphy", student_number: "S-017" },
  { full_name: "Sage Robinson", student_number: "S-018" },
  { full_name: "Elliot Garcia", student_number: "S-019" },
  { full_name: "Noah Cooper", student_number: "S-020" },
  { full_name: "Milan Foster", student_number: "S-021" },
  { full_name: "Alexis Reed", student_number: "S-022" },
  { full_name: "Kai Simmons", student_number: "S-023" },
  { full_name: "Samira Price", student_number: "S-024" },
  { full_name: "Remy James", student_number: "S-025" },
];
