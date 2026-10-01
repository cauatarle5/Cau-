# OPEN_QUESTIONS: Atlas

Dúvidas que **não bloqueiam** a fase atual (PROMPT_MESTRE 0.2). Cada item: contexto, fase em que precisa ser resolvido, opção provisória.

- **TBCA:** viabilidade de acesso aos dados (licença, formato). Resolver na Fase 2; provisório: só TACO + USDA.
- **Deploy:** provedor da API e do Postgres (Railway, Render ou Fly + Neon). Resolver na Fase 8 via ADR.
- **Macros acima das kcal:** com `protein_g_per_kg` alto e poucas kcal, proteína + gordura podem passar da meta (carboidrato vai a 0). Resolver na Fase 2 junto com a distribuição por tipo de dia; provisório: faixa de `protein_g_per_kg` limitada a 1,2–3,5.
- **Aviso de variação de peso retroativo:** o cliente compara com a tendência mais recente, a API com a tendência até a data do registro; podem divergir em registros retroativos. Não bloqueia (é só aviso).
- **Leite fluido e itens ausentes na TACO:** "Leite, de vaca, integral" e "desnatado, UHT" estão marcados como "em análise" (*) na TACO e ficaram fora do seed; requeijão, whey, tilápia etc. não existem na TACO. O fallback USDA (P6.4) não foi possível neste ambiente (rede bloqueia api.nal.usda.gov). Provisório: cadastro rápido de alimento personalizado. Resolver quando houver acesso à USDA/TBCA.
- **Operação offline recusada (4xx) não é revertida no aparelho:** a fila descarta e avisa, mas a série continua visível localmente até concluir o treino. Raro (validação acontece no cliente). Resolver se aparecer na prática (Fase 8, PWA).
- **Limpeza de `idempotency_keys`:** resolvida na Fase 6 (job diário apaga chaves com mais de 7 dias, ADR-049). Duas requisições simultâneas com a mesma chave executam ambas; as criações do treino são idempotentes pelo id, então o efeito é o mesmo.
- **Recarregar a página sem rede:** exige service worker (PWA, Fase 8). Hoje o treino funciona offline com o app aberto e sobrevive a fechar/reabrir com rede.
- **Cópia de dia não é transacional entre slots:** se um slot falhar, os anteriores ficam gravados; o reenvio com a mesma `Idempotency-Key` devolve a resposta original. Resolver se aparecer na prática.
- **`eaten_at` ao registrar refeição de outro dia:** usa o horário atual; o dia continua sendo o da refeição. Revisitar com o registro retroativo.
- **Proposta travada:** se aplicar der certo mas a conclusão no banco falhar, a proposta fica pendente com trava e não pode ser reaplicada (evita duplicar). Hoje isso exige ajuste manual; um job de reconciliação pode entrar na Fase 8.
