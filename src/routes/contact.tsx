import { createFileRoute } from '@tanstack/react-router';
import { ContactPage } from '@/components/sotiria/legal';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/contact')({ head: () => pageHead('Contact Sotiría', 'Contact Sotiría with questions or feedback about the child digital wellbeing app and family website.', { path: '/contact', indexable: true }), component: ContactPage });
