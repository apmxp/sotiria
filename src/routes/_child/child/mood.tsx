import { createFileRoute } from '@tanstack/react-router';
import { MoodPage } from '@/components/sotiria/child';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_child/child/mood')({ head: () => pageHead('My Mood', 'A private moment for you. Check in with your feelings and keep a gentle journal.'), component: MoodPage });
