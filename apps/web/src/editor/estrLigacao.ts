/**
 * Ligação da estrutura (pilar, viga e fundação) ao kernel (docs/estrutura/PLANO.md, ficha R1a): os painéis e modais da U1 chamam funções INJETÁVEIS
 * (`definirPerfilContorno`, `definirLeituraEstr`) e aqui elas passam a consultar o adaptador de `@hestia/engine` (consultas 205 `estr_perfil` e 203
 * `estr_quant`). Sem kernel pronto, ou enquanto a 203 não existe, as duas devolvem `null` e a interface mostra "indisponível" / "—". Nada é calculado aqui.
 */
import { leituraEstr as leituraDoKernel, perfilContornoEstr, type ContornoEstr, type LeituraEstrutura } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { definirPerfilContorno, type ContornoPerfil } from '../ui/dialogs/perfilContorno.ts';
import { definirLeituraEstr, type LeituraEstr } from '../ui/estrLeitura.ts';

export const contornoParaUi = (c: ContornoEstr | null): ContornoPerfil | null => (c ? { anel: c.anel, furos: c.furos } : null);

export function leituraParaUi(l: LeituraEstrutura | null): LeituraEstr | null {
  if (!l) return null;
  return { volume: l.volume, areaForma: l.areaForma, comprimento: l.comprimento, ...(l.peso === undefined ? {} : { peso: l.peso }) };
}

/** Liga os dois pontos de injeção da U1 ao adaptador. `projeto` entrega o projeto atual no momento da leitura. */
export function ligarEstrutura(projeto: () => Project): void {
  definirPerfilContorno((perfil) => contornoParaUi(perfilContornoEstr(perfil)));
  definirLeituraEstr((id: Id) => leituraParaUi(leituraDoKernel(projeto(), id)));
}
