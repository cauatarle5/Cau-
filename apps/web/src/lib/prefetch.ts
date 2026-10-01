/**
 * Pedidos feitos antes da hidratação (LCP, ADR-062). O script inline do `<head>` dispara sessão,
 * perfil e as consultas da tela aberta enquanto o JS ainda baixa; `apiRequest` usa cada resposta
 * uma única vez. Os caminhos precisam ser idênticos aos de `features/<x>/api.ts`: um caminho
 * diferente só deixa de aproveitar o pedido (nunca serve dado errado).
 */

declare global {
  interface Window {
    __atlasPrefetch?: Record<string, Promise<Response> | undefined>;
  }
}

/** Uma resposta pré-buscada só vale no carregamento inicial (nunca dado velho depois). */
const MAX_AGE_MS = 10_000;

export function takePrefetch(path: string): Promise<Response> | undefined {
  if (typeof window === 'undefined' || !window.__atlasPrefetch) return undefined;
  const pending = window.__atlasPrefetch[path];
  window.__atlasPrefetch[path] = undefined;
  return performance.now() < MAX_AGE_MS ? pending : undefined;
}

/**
 * Consultas por tela, com `d` = hoje e `d7` = hoje + 7 no fuso do último usuário do aparelho
 * (`atlas:last-session`, ver `offline/last-session.ts`).
 */
const ROUTES = `{
  '/hoje': ['/daily-context/'+d, '/checkins/'+d, '/planned-workouts?from='+d+'&to='+d7, '/nutrition/day-summary?date='+d]
}`;

export const PREFETCH_SCRIPT = `(function(){try{
var p=location.pathname;
if(p==='/'||/^\\/(entrar|cadastro|offline|onboarding)(\\/|$)/.test(p))return;
var keys=['/auth/me','/profile'];
try{
  var tz=JSON.parse(localStorage.getItem('atlas:last-session')||'null').user.timezone;
  var f=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
  var d=f.format(new Date());
  var t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+7);var d7=t.toISOString().slice(0,10);
  keys=keys.concat(${ROUTES}[p]||[]);
}catch(e){}
var w=window.__atlasPrefetch={};
keys.forEach(function(k){var r=fetch('/api/v1'+k,{credentials:'same-origin'});r.catch(function(){});w[k]=r;});
}catch(e){}})();`.replace(/\n\s*/g, '');
