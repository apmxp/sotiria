import { createFileRoute } from '@tanstack/react-router';
import { ActivitiesPage } from '@/components/sotiria/child';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_child/child/activities')({ head: () => pageHead('Offline Activities', 'A whole world beyond the screen: creative, outdoor, family, and science adventures to try.'), component: ActivitiesPage });
