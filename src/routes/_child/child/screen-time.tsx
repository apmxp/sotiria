import { createFileRoute } from '@tanstack/react-router';
import { ScreenTimePage } from '@/components/sotiria/child';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_child/child/screen-time')({ head: () => pageHead('My Screen Time', 'Understand your digital day, set a goal to grow with, and find a balance that feels right.'), component: ScreenTimePage });
