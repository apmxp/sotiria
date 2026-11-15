import { createFileRoute } from '@tanstack/react-router';
import { ReportsPage } from '@/components/sotiria/parent';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_authenticated/parent/reports')({ head: () => pageHead('Screen-Time Reports', 'A clearer picture of the week, with exportable insights to guide your family’s next conversation.'), component: ReportsPage });
