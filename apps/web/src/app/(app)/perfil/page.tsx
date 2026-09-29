'use client';

import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { useLogout, useMe } from '@/features/auth/hooks/use-auth';

export default function ProfilePage() {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  const onLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        router.replace('/entrar');
      },
    });
  };

  return (
    <>
      <PageHeader title="Perfil" subtitle="Dados pessoais, objetivos e preferências." />
      <Card className="space-y-4">
        <div className="space-y-1">
          <CardTitle>{me.data?.user.name}</CardTitle>
          <CardDescription>{me.data?.user.email}</CardDescription>
        </div>
        <Button variant="outline" onClick={onLogout} disabled={logout.isPending}>
          Sair
        </Button>
      </Card>
    </>
  );
}
