import { DEFAULT_DISCIPLINE, planOf, presetTone, type Discipline, type Id, type Project } from '@hestia/model';
import { planViewIdDe } from './viewIdentity.ts';

/*
 * Disciplina de trabalho ao traçar rede (ficha B9, defeito 5). Na disciplina de trabalho padrão (Arquitetura) tubos e eletrodutos entram
 * em MEIO-TOM, e meio-tom não se seleciona (`visibilidade.ts`): o usuário traçava o tubo e não conseguia clicar nele. Ao ativar Tubo ou
 * Eletroduto numa planta cuja disciplina deixaria a rede em meio-tom, a disciplina PESSOAL (sessão, nunca o projeto) passa à da rede; o
 * seletor "Disciplinas" da barra da vista mostra a troca e volta a "Automática" quando o usuário quiser.
 */

/** Disciplina da rede que cada ferramenta de traçado desenha. */
const DISCIPLINA_DO_TRACO: Readonly<Record<string, Discipline>> = { tubo: 'hidrossanitario', eletroduto: 'eletrico' };

/**
 * Disciplina pessoal a assumir ao ativar a ferramenta `id`, ou null (não é ferramenta de rede, o usuário já escolheu uma disciplina, a vista
 * não é planta, ou a rede já aparece normal). `p` só serve para ler a disciplina da planta.
 */
export function disciplinaParaTracar(id: string, st: { minhaDisciplina: Discipline | null; view: string; levelId: Id; planKind?: string; planViewId?: Id | null }, p: Project): Discipline | null {
  const alvo = DISCIPLINA_DO_TRACO[id];
  if (!alvo || st.minhaDisciplina !== null || st.view !== 'plan') return null;
  const trabalho = planOf(p, st.levelId, planViewIdDe(st)).discipline ?? DEFAULT_DISCIPLINE;
  return presetTone(trabalho, alvo) === 'normal' ? null : alvo;
}
