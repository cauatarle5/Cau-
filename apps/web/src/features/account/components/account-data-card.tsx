'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { FormField } from '@/features/auth/components/form-field';
import { useOnboarding } from '@/features/onboarding/store';
import { ApiError } from '@/lib/api';
import { kvClearUser } from '@/offline/kv';

import { accountApi } from '../api';

const CONFIRM_WORD = 'EXCLUIR';

/** "Seus dados" (LGPD, ADR-061): exportação completa e exclusão definitiva da conta. */
export function AccountDataCard() {
  const router = useRouter();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    setExportError(null);
    setExporting(true);
    try {
      await accountApi.downloadExport();
    } catch (err) {
      setExportError(
        err instanceof ApiError ? err.message : 'Não foi possível exportar seus dados.',
      );
    } finally {
      setExporting(false);
    }
  }

  async function onDelete(e: SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      await accountApi.delete({ password, confirmation: CONFIRM_WORD });
      await kvClearUser();
      qc.clear();
      useOnboarding.getState().reset();
      router.replace('/entrar');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir a conta.');
      setDeleting(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <CardTitle>Seus dados</CardTitle>
        <CardDescription>
          Baixe tudo o que o Atlas guarda sobre você ou exclua sua conta de vez.
        </CardDescription>
      </div>
      <div className="space-y-2">
        <Button variant="outline" onClick={() => void onExport()} disabled={exporting}>
          {exporting ? 'Preparando arquivo…' : 'Exportar meus dados'}
        </Button>
        {exportError ? (
          <p role="alert" className="text-sm text-destructive">
            {exportError}
          </p>
        ) : null}
      </div>

      {open ? (
        <form
          onSubmit={(e) => void onDelete(e)}
          className="space-y-3 rounded-lg border border-destructive p-3"
          aria-labelledby="delete-title"
        >
          <p id="delete-title" className="text-sm font-medium">
            Excluir conta definitivamente
          </p>
          <p className="text-sm text-muted-foreground">
            Todos os seus registros (refeições, treinos, medidas, conversas) serão apagados agora e
            não poderão ser recuperados. Cópias de segurança antigas são descartadas em até 8
            semanas.
          </p>
          <FormField
            id="delete-password"
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            required
          />
          <FormField
            id="delete-confirm"
            label={`Digite ${CONFIRM_WORD} para confirmar`}
            autoComplete="off"
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
            }}
            required
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              variant="destructive"
              disabled={deleting || !password || confirmation.trim() !== CONFIRM_WORD}
            >
              {deleting ? 'Excluindo…' : 'Excluir minha conta'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setPassword('');
                setConfirmation('');
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="destructive"
          onClick={() => {
            setOpen(true);
          }}
        >
          Excluir conta
        </Button>
      )}
    </Card>
  );
}
