import { createFileRoute } from '@tanstack/react-router';
import { ChildDashboard } from '@/components/sotiria/child';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_child/child/dashboard')({ head: () => pageHead('Child Dashboard', 'Your little world: today’s screen balance, mood check-in, safety lessons, and a daily offline adventure.'), component: ChildDashboard });
