import { createFileRoute } from '@tanstack/react-router';
import { RoutinesPage } from '@/components/sotiria/parent';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_authenticated/parent/routines')({ head: () => pageHead('Family Routines', 'Agree on small, positive routines together and celebrate the little steps.'), component: RoutinesPage });
