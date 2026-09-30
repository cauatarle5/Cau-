import { Button } from '@/components/ui/button';

export function StepNav({
  onBack,
  submitLabel = 'Continuar',
  pending,
  error,
}: {
  onBack?: (() => void) | undefined;
  submitLabel?: string;
  pending: boolean;
  error?: string | undefined;
}) {
  return (
    <div className="space-y-3 pt-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {onBack ? (
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Voltar
          </Button>
        ) : null}
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? 'Salvando…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.';
}
