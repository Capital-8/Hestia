import { tipoDaFamiliaDeTubo } from '@hestia/engine';
import { isComponent, type Component, type Familia, type Project, type ProjectStore } from '@hestia/model';
import { textoDaTroca, trocarBitolaDoTubo, type AmbienteTroca } from '@hestia/tools';

/*
 * Troca de bitola pelo painel de propriedades (fase 3, ficha B3): para tubo de família COM tipo de tubulação (Krona etc.), editar o DN
 * (pelo tipo da família ou pelo parâmetro `DN`) chama o planejador e o aplicador do motor de rede, em vez de só gravar o valor: as
 * conexões do tubo são trocadas, ganham redução ou saem com alerta. Qualquer outra família segue o caminho de sempre (`tratado: false`).
 */

/** Resultado da tentativa: `tratado` = o painel não deve gravar nada por conta própria; `recusa` = motivo (nada mudou); `mensagem` = texto de status. */
export interface ResultadoDaTrocaNoPainel {
  tratado: boolean;
  recusa?: string;
  mensagem: string;
}

const NAO_TRATADO: ResultadoDaTrocaNoPainel = { tratado: false, mensagem: '' };

const ambienteDe = (store: ProjectStore): AmbienteTroca => ({ project: () => store.project, exec: (c) => store.exec(c), transaction: (rotulo, fn) => store.transaction(rotulo, fn) });

/** O componente único da seleção, se for tubo de família com tipo de tubulação. */
export function tuboComTipoDeTubulacao(p: Project, componentes: readonly Component[]): Component | null {
  const c = componentes.length === 1 ? componentes[0] : undefined;
  return c && isComponent(p.elements[c.id]) && tipoDaFamiliaDeTubo(c.familyId) !== undefined ? c : null;
}

/** DN (mm) que o tipo `typeId` da família define (`null` = padrão da família); `null` se não define. */
export function dnDoTipo(familia: Familia, typeId: string | null): number | null {
  const dn = familia.tipos.find((t) => t.id === (typeId ?? familia.tipoPadrao))?.valores.DN;
  return typeof dn === 'number' ? dn : null;
}

/** Troca o DN do tubo único da seleção para `novoDn`; seleção que não é esse tubo não é tratada. */
export function trocarDnPeloPainel(store: ProjectStore, componentes: readonly Component[], novoDn: number): ResultadoDaTrocaNoPainel {
  const tubo = tuboComTipoDeTubulacao(store.project, componentes);
  if (!tubo || !Number.isFinite(novoDn)) return NAO_TRATADO;
  const r = trocarBitolaDoTubo(ambienteDe(store), tubo.id, novoDn);
  if (!r.ok) return { tratado: true, recusa: r.recusa, mensagem: textoDaTroca(r) };
  return { tratado: true, mensagem: [`Bitola do tubo trocada para DN ${novoDn}.`, ...r.mensagens].join(' ') };
}

/** Mesma troca, a partir do tipo escolhido no seletor: só age quando o tipo muda o DN do tubo. */
export function trocarTipoPeloPainel(store: ProjectStore, componentes: readonly Component[], familia: Familia, typeId: string | null): ResultadoDaTrocaNoPainel {
  const tubo = tuboComTipoDeTubulacao(store.project, componentes);
  const dn = dnDoTipo(familia, typeId);
  if (!tubo || dn === null) return NAO_TRATADO;
  const atual = tubo.values?.DN ?? dnDoTipo(familia, tubo.typeId);
  return atual === dn ? NAO_TRATADO : trocarDnPeloPainel(store, componentes, dn);
}
