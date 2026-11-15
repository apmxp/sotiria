import { createFileRoute } from '@tanstack/react-router';
import { ParentDashboard } from '@/components/sotiria/parent';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_authenticated/parent/dashboard')({ head: () => pageHead('Parent Overview', 'A thoughtful look at your child’s digital wellbeing — guidance, not surveillance.'), component: ParentDashboard });
