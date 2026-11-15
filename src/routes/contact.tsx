import { createFileRoute } from '@tanstack/react-router';
import { ContactPage } from '@/components/sotiria/legal';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/contact')({ head: () => pageHead('Contact', 'Questions, ideas, or a story about your family’s journey — every message is welcome.'), component: ContactPage });
