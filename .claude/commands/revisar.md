---
description: Revisa o diff da branch atual contra main com o checklist do projeto
---
Revise `git diff main...HEAD` com um subagente revisor independente, aplicando o checklist (PROMPT_MESTRE 16.3):

- isolamento por `user_id` em toda query;
- cálculo fora de `packages/core`;
- número vindo de LLM;
- regra nova sem teste;
- tratamento de erro faltando (RFC 7807, `code` estável);
- tipos `any`;
- componentes React com lógica de negócio;
- migrations destrutivas ou editadas após aplicadas;
- regressões de acessibilidade.

Liste os problemas por severidade (alta, média, baixa) com `arquivo:linha`. Os de severidade alta devem ser corrigidos antes do merge.
