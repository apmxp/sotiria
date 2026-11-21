import { createFileRoute } from '@tanstack/react-router';
import { TermsPage } from '@/components/sotiria/legal';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/terms')({ head: () => pageHead('Sotiría Terms of Use', 'Review the terms for using Sotiría, a child digital wellbeing website and Android app for families.', { path: '/terms', indexable: true }), component: TermsPage });
