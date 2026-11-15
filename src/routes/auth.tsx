import { createFileRoute, redirect } from '@tanstack/react-router';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/auth')({ head: () => pageHead('Account access', 'Sign in to your Sotiría family account.'), beforeLoad: () => { throw redirect({ to: '/login' }); } });