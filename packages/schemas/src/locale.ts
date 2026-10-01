import { z } from 'zod';
import pt from 'zod/v4/locales/pt.js';

// Mensagens padrão do Zod em português (interface em pt-BR). Importa só o locale usado: o
// namespace `z.locales` arrastava todos os idiomas para o bundle do front (Fase 8, LCP).
z.config(pt());
