import { DEFAULT_DISCIPLINE, planOf, presetTone, type Discipline, type Id, type Project } from '@hestia/model';
import { planViewIdDe } from './viewIdentity.ts';

/*
 * Disciplina que a rede traçada precisa para não ficar em meio-tom (ficha B9, defeito 5). Na disciplina de trabalho padrão (Arquitetura)
 * tubos e eletrodutos entram em MEIO-TOM, e meio-tom não se seleciona (`visibilidade.ts`). Decisão do dono: ao ativar Tubo ou Eletroduto
 * numa planta assim, o programa NÃO troca a disciplina; só AVISA (o controlador mostra o aviso na barra de status). A troca fica com o usuário,
 * pelo seletor "Disciplinas".
 */

/** Disciplina da rede que cada ferramenta de traçado desenha. */
const DISCIPLINA_DO_TRACO: Readonly<Record<string, Discipline>> = { tubo: 'hidrossanitario', eletroduto: 'eletrico' };

/**
 * Disciplina que a rede precisaria ter ao ativar a ferramenta `id`, ou null quando nada deve ser avisado (não é ferramenta de rede, o usuário
 * já escolheu uma disciplina pessoal, a vista não é planta, ou a rede já aparece normal). Função pura: não altera estado.
 * `p` só serve para ler a disciplina da planta.
 */
export function disciplinaParaTracar(id: string, st: { minhaDisciplina: Discipline | null; view: string; levelId: Id; planKind?: string; planViewId?: Id | null }, p: Project): Discipline | null {
  const alvo = DISCIPLINA_DO_TRACO[id];
  if (!alvo || st.minhaDisciplina !== null || st.view !== 'plan') return null;
  const trabalho = planOf(p, st.levelId, planViewIdDe(st)).discipline ?? DEFAULT_DISCIPLINE;
  return presetTone(trabalho, alvo) === 'normal' ? null : alvo;
}
