import { createFileRoute } from '@tanstack/react-router';
import { SafetyPage } from '@/components/sotiria/child';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_child/child/online-safety')({ head: () => pageHead('Online Safety', 'Six short lessons to explore the digital world with confidence and care.'), component: SafetyPage });
