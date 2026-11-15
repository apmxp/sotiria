import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from '@/components/sotiria/auth';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/reset-password')({ ssr: false, head: () => pageHead('Reset Password', 'Choose a new password for your Sotiría parent account.'), component: ResetPasswordPage });
