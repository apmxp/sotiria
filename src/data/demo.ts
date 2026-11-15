/**
 * Sotiría demo data: data models, sample content, and the sample family state.
 * Everything here is simulated — no device tracking, no real accounts.
 * Business rules live in src/lib/wellbeing.ts.
 */
import { addDays, dayKey } from '@/lib/dates';

export type Mood = 'Joyful' | 'Calm' | 'Curious' | 'Tired' | 'Sad' | 'Frustrated';
export type ScreenCategory = 'Learning' | 'Videos' | 'Games' | 'Other';
/** One manually entered screen-time record. Sotiría never measures device usage automatically. */
export interface ScreenEntry { id: string; date: string; category: ScreenCategory; minutes: number; appName: string }
export type RoutineDays = 'Every day' | 'Weekdays' | 'Weekends';
export type Role = 'child' | 'parent';

/** Private to the child. Never part of the parent projection. */
export interface MoodEntry { date: string; mood: Mood; reflection: string }
export interface Routine { id: string; name: string; time: string; days: RoutineDays; completedOn: string[] }
export interface ActivityCompletion { id: string; date: string }

export interface DemoState {
  version: 2;
  name: string;
  parentName: string;
  avatar: string;
  goal: number;
  /** Hours of screen time per day (YYYY-MM-DD). Past days are sample data; the child enters today's total. */
  usageLog: Record<string, number>;
  /** Manual entries; days that have entries get their usageLog total from them. */
  screenEntries: ScreenEntry[];
  moods: MoodEntry[];
  lessons: string[];
  activityLog: ActivityCompletion[];
  /** One date entry per break the child marked as taken. */
  breakLog: string[];
  routines: Routine[];
  breakReminders: boolean;
  childNotifications: boolean;
  weeklySummary: boolean;
  consent: boolean;
  lastRole: Role;
}

export const moods: Mood[] = ['Joyful', 'Calm', 'Curious', 'Tired', 'Sad', 'Frustrated'];
export const routineDayOptions: RoutineDays[] = ['Every day', 'Weekdays', 'Weekends'];
export const avatarOptions = ['🌱', '🦋', '🚀', '🌻', '🐢', '⭐'];

/** Sample hours for the 13 days before today, oldest first (previous week, then this week). */
const sampleHistory = [2.4, 2.8, 2.2, 3.0, 2.6, 3.3, 2.5, 2.1, 2.5, 1.8, 2.7, 2.3, 3.1];

/** Illustrative split used to break a daily total into categories. */
export const sampleCategorySplit = [
  { label: 'Learning', share: 0.35 },
  { label: 'Videos', share: 0.25 },
  { label: 'Games', share: 0.3 },
  { label: 'Other', share: 0.1 },
];

export const conversationPrompts = [
  'What’s something interesting you learned online today?',
  'Which app or game made you feel good this week, and why?',
  'If you could invent a new offline adventure, what would it be?',
  'Have you ever seen something online that felt confusing? What did you do?',
  'What’s one thing you’d like us to try together without screens?',
];

/** A fresh sample family, with dates relative to `today`. */
export function createSampleState(today: string = dayKey()): DemoState {
  const d = (offset: number) => addDays(today, offset);
  const usageLog: Record<string, number> = {};
  sampleHistory.forEach((hours, i) => { usageLog[d(i - sampleHistory.length)] = hours; });
  return {
    version: 2,
    name: 'Alex',
    parentName: 'Sam',
    avatar: 'A',
    goal: 3,
    usageLog,
    screenEntries: [],
    moods: [
      { date: d(-1), mood: 'Calm', reflection: 'Reading in the garden felt peaceful.' },
      { date: d(-2), mood: 'Curious', reflection: 'I made a paper airplane.' },
      { date: d(-3), mood: 'Joyful', reflection: '' },
    ],
    lessons: ['privacy', 'messages', 'kindness', 'social'],
    activityLog: [
      { id: 'plane', date: d(-1) },
      { id: 'story', date: d(-2) },
      { id: 'garden', date: d(-3) },
      { id: 'recipe', date: d(-5) },
      { id: 'nature', date: d(-6) },
    ],
    breakLog: [d(-1), d(-1), d(-2)],
    routines: [
      { id: 'dinner', name: 'Screen-free family dinner', time: '18:30', days: 'Every day', completedOn: [d(-1), d(-2), d(-3), d(-4)] },
      { id: 'reading', name: 'Reading before bedtime', time: '20:00', days: 'Every day', completedOn: [d(-1), d(-2)] },
      { id: 'outdoor', name: 'Outdoor activity time', time: '16:00', days: 'Weekdays', completedOn: [d(-1)] },
      { id: 'weekend', name: 'Weekend family activity', time: '10:00', days: 'Weekends', completedOn: [] },
    ],
    breakReminders: true,
    childNotifications: true,
    weeklySummary: true,
    consent: false,
    lastRole: 'child',
  };
}

export const lessons = [
 { id: 'privacy', title: 'Your information is yours', category: 'Personal information', description: 'Discover what to keep private and who you can trust.', minutes: 5, icon: 'shield', content: 'Your full name, address, school, passwords, and phone number are personal. Keep them off public profiles. Ask a trusted adult before sharing information, even if someone seems friendly.', question: 'An online friend asks for your home address. What do you do?', answers: ['Share it so they can send a gift', 'Keep it private and talk to a trusted adult', 'Post it on your profile'], correct: 1, explanation: 'Your address is private. A trusted adult can help you decide what is safe to share.' },
 { id: 'messages', title: 'Spot a suspicious message', category: 'Messages & scams', description: 'Pause, think, and ask before opening unexpected links.', minutes: 6, icon: 'mail', content: 'Messages promising prizes or asking you to act quickly may be scams. Do not click unknown links, download attachments, or share passwords. Pause and show a trusted adult.', question: 'A message says you won a prize and must click now. What is safest?', answers: ['Click before the prize expires', 'Send your password', 'Pause and show a trusted adult'], correct: 2, explanation: 'Unexpected prizes and urgent requests are warning signs. Pause and ask for help.' },
 { id: 'kindness', title: 'Kindness goes a long way', category: 'Online kindness', description: 'Make the online world a kinder place for everyone.', minutes: 5, icon: 'heart', content: 'People deserve kindness online just as they do in person. If you see hurtful messages, do not join in. Save evidence if it is safe, use block or report tools, and talk to a trusted adult.', question: 'Someone posts a hurtful comment about your friend. What can help?', answers: ['Join in with another joke', 'Support your friend and tell a trusted adult', 'Send a hurtful reply'], correct: 1, explanation: 'Support and asking for help are safer than joining in or retaliating.' },
 { id: 'social', title: 'Share with a little care', category: 'Responsible sharing', description: 'Think about yourself and others before you post.', minutes: 4, icon: 'users', content: 'Before sharing, ask: Is this kind? Is it private? Do I have permission? Respect friends who do not want their photos shared. Use age-appropriate spaces with a trusted adult.', question: 'You want to post a photo of your friend. What should you do first?', answers: ['Ask your friend and a trusted adult for permission', 'Post it without asking', 'Tag their home location'], correct: 0, explanation: 'Ask permission and respect their answer. Photos and locations can reveal personal information.' },
 { id: 'footprints', title: 'Your digital footprints', category: 'Digital footprints', description: 'Learn about the little traces we leave online.', minutes: 5, icon: 'footprints', content: 'Posts, comments, and photos can leave a digital footprint. Even deleted posts may have been copied. Think before sharing, keep personal details private, and choose kind words.', question: 'Can a post still be seen after you delete it?', answers: ['No, it disappears everywhere', 'Only if it has a picture', 'Yes, someone may have saved or shared it'], correct: 2, explanation: 'Someone may have saved a screenshot or copy. A thoughtful pause before posting helps.' },
 { id: 'click', title: 'Think before you click', category: 'Safe browsing', description: 'Become a thoughtful, confident internet explorer.', minutes: 6, icon: 'mouse', content: 'Unknown links and downloads can be unsafe. Check with a trusted adult before clicking or downloading something new. If something makes you uncomfortable, close it and ask for help.', question: 'A pop-up asks you to download a free game from an unknown site. What next?', answers: ['Close it and check with a trusted adult', 'Download it right away', 'Enter your personal details'], correct: 0, explanation: 'Unknown downloads may be unsafe. Check with a trusted adult first.' },
];
export const activities = [
 { id: 'draw', title: 'Draw Your Dream World', category: 'Creativity', minutes: 20, difficulty: 'Easy', materials: 'Paper, colored pencils', description: 'Let your imagination wander. What does your dream world look like?', steps: ['Find a comfortable spot and gather your paper and pencils.', 'Imagine a world with anything you love: mountains, floating gardens, or friendly creatures.', 'Sketch your world, then add colors and little details.', 'Give your world a name. Share it with someone if you like.'], supervision: false, icon: 'palette' },
 { id: 'plane', title: 'Create a Paper Airplane', category: 'Science & Discovery', minutes: 15, difficulty: 'Easy', materials: 'A sheet of paper', description: 'Fold, fly, and discover what makes your airplane soar.', steps: ['Fold a sheet of paper in half lengthwise.', 'Fold the top corners toward the center, then fold again.', 'Fold the plane in half and fold down two wings.', 'Test it in a clear space away from people and compare your flights.'], supervision: false, icon: 'plane' },
 { id: 'story', title: 'Read a Short Story', category: 'Reading & Learning', minutes: 15, difficulty: 'Easy', materials: 'A favorite book', description: 'Find a cozy corner and go on an adventure through a book.', steps: ['Choose a book you are curious about.', 'Find a quiet comfortable place.', 'Read a chapter or short story.', 'Imagine a different ending or tell someone your favorite part.'], supervision: false, icon: 'book' },
 { id: 'garden', title: 'Plant a Small Garden', category: 'Outdoor Adventures', minutes: 30, difficulty: 'Medium', materials: 'Seeds, soil, a pot, water', description: 'Meet local plants and help something green grow.', steps: ['Ask an adult to help choose safe seeds and a pot.', 'Fill the pot with soil and plant your seeds.', 'Water gently and find a sunny place.', 'Check your plant every day and draw how it changes.'], supervision: true, icon: 'sprout' },
 { id: 'recipe', title: 'Make a Family Recipe', category: 'Family Activities', minutes: 45, difficulty: 'Medium', materials: 'Ingredients chosen with an adult', description: 'Help prepare a favorite Ethiopian family recipe together.', steps: ['Ask an adult to choose a family recipe with you.', 'Wash your hands and gather the ingredients together.', 'Help with safe tasks such as measuring and mixing.', 'Share the meal and ask about its family story.'], supervision: true, icon: 'chef' },
 { id: 'recycle', title: 'Build a Recycled Creation', category: 'Science & Discovery', minutes: 30, difficulty: 'Medium', materials: 'Clean cardboard, paper, tape', description: 'Turn everyday materials into something extraordinary.', steps: ['Gather clean safe recycled materials with an adult.', 'Plan a robot, house, or creature.', 'Ask an adult for help with scissors or tools.', 'Put your creation together and give it a name.'], supervision: true, icon: 'blocks' },
 { id: 'nature', title: 'Explore Local Nature', category: 'Outdoor Adventures', minutes: 30, difficulty: 'Easy', materials: 'Notebook, comfortable shoes', description: 'Look closely at the plants and colors near your home.', steps: ['Choose a safe walking route with an adult.', 'Look for three different leaf shapes.', 'Draw what you see without picking unknown plants.', 'Share one new thing you noticed.'], supervision: true, icon: 'tree' },
 { id: 'patterns', title: 'Art Inspired by Ethiopia', category: 'Creativity', minutes: 25, difficulty: 'Easy', materials: 'Paper and colored pencils', description: 'Explore beautiful traditional patterns with a family member.', steps: ['Ask a family member about a pattern on a traditional textile.', 'Look at its repeating shapes and colors.', 'Draw your own pattern inspired by what you learned.', 'Share the story behind your artwork.'], supervision: false, icon: 'palette' },
 { id: 'music', title: 'Move to Your Favorite Music', category: 'Music & Movement', minutes: 10, difficulty: 'Easy', materials: 'Music and a clear space', description: 'Stretch, dance, and make a little room for movement.', steps: ['Find a clear space and choose a favorite song.', 'Stretch gently and take a slow breath.', 'Move or dance in a way that feels comfortable.', 'Cool down and drink some water.'], supervision: false, icon: 'music' },
 { id: 'board', title: 'Create Your Own Board Game', category: 'Family Activities', minutes: 40, difficulty: 'Medium', materials: 'Cardboard, pencils, safe game pieces', description: 'Dream up a new game to enjoy with your family.', steps: ['Draw a path or board on cardboard.', 'Invent simple rules and a goal.', 'Make game pieces from safe materials.', 'Play with your family and improve the rules together.'], supervision: false, icon: 'puzzle' },
];
