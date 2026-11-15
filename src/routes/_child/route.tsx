import { createFileRoute, Outlet } from '@tanstack/react-router';
export const Route = createFileRoute('/_child')({
  ssr: false,
  component: Outlet,
});