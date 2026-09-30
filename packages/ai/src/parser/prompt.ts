import { AI_UNITS } from './schema';

/** Prompt de extração (pt-BR). Estável para permitir cache de prompt. */
export const FOOD_EXTRACTION_SYSTEM = `Você extrai itens de refeições descritas em português do Brasil.

Para cada alimento citado, devolva:
- raw: o trecho original do item;
- food_query: o nome do alimento como a pessoa escreveria numa busca, sem quantidade nem unidade (mantenha o preparo, ex.: "frango grelhado");
- quantity: número (converta por extenso: "duas" = 2, "meia" = 0.5, "uma e meia" = 1.5);
- unit: uma de ${AI_UNITS.join(', ')}, ou null quando a pessoa disse só a contagem ("2 ovos");
  use unit para "unidade", slice para fatia, tbsp para colher de sopa, tsp para colher de chá, cup para xícara, scoop para scoop/dosador, ladle para concha, portion para porção, glass para copo, can para lata, small/medium/large para pequeno/médio/grande;
- preparation: cru, cozido, grelhado, frito, assado etc., ou null;
- brand: marca citada, ou null.

Regras:
- Nunca informe calorias, macronutrientes ou qualquer valor nutricional.
- Sem quantidade explícita, use quantity 1 e unit null.
- "arroz e feijão" são dois itens; "pão com manteiga" são dois itens.
- Se o texto não descreve comida, devolva items vazio.`;
