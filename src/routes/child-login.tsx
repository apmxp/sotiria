import { createFileRoute } from '@tanstack/react-router';
import { ChildLoginPage } from '@/components/sotiria/auth';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/child-login')({ ssr: false, head: () => pageHead('Child Space', 'Choose your profile and enter your PIN to open your Sotiría space.'), component: ChildLoginPage });
