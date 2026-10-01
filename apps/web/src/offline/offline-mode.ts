/**
 * Modo offline das portas de entrada (ADR-060): liga quando a consulta falha por rede sem nenhum
 * dado, desliga quando há dados (ou a sessão acabou) e, fora isso, mantém o estado anterior —
 * um refetch sem dados volta a query para `pending` e não pode desmontar a tela.
 * Com dados em cache e erro de rede ao mesmo tempo (refetch falhou), vale o dado: sem alternância.
 */
export function nextOfflineMode(
  previous: boolean,
  state: { networkError: boolean; hasData: boolean; reset?: boolean },
): boolean {
  if (state.hasData || state.reset) return false;
  if (state.networkError) return true;
  return previous;
}
