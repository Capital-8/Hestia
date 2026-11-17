import { fechamentoAceito, rumosParaPoligono, TOLERANCIA_FECHAMENTO, type PoligonoDeRumos } from '@hestia/engine';
import { formatQuantity, ladosPadrao, localizacaoDe, lotIssue, makeLot, newId, unitsOf, type Command, type Id, type Lot, type Project, type ProjectStore } from '@hestia/model';
import { t as traduzir, type Dict, type Lang } from '../../editor/i18n.ts';

type DictKey = keyof Dict;

/**
 * Lógica do diálogo "Por tabela…" das linhas de propriedade (ficha P3), sem React. Cada linha da tabela tem azimute (GRAUS, a partir do norte
 * verdadeiro, sentido horário) e distância (m); o ponto inicial vem de um clique na planta ou de coordenada digitada. O azimute usa o
 * `norteVerdadeiro` da `localizacao` do projeto (emenda E4: direção no projeto = azimute + norte). O erro de fechamento é a distância entre o
 * último ponto calculado e o primeiro; a tabela só é aceita com erro ≤ 0,05 m ou com a caixa "fechar no primeiro ponto" marcada (A.4 regra 19).
 */

export interface LinhaRumoForm {
  /** Graus, a partir do norte verdadeiro, sentido horário. */
  azimute: number;
  /** Metros. */
  distancia: number;
}

export interface FormRumos {
  /** Ponto inicial (m, coordenadas do projeto). */
  inicio: { x: number; y: number };
  linhas: LinhaRumoForm[];
  /** "Fechar no primeiro ponto": aceita a tabela mesmo com erro de fechamento acima da tolerância. */
  fecharNoPrimeiro: boolean;
}

/** Número mínimo de linhas (um triângulo). */
export const LINHAS_MINIMAS = 3;

/** Formulário de partida: origem e quatro linhas vazias (o usuário preenche ou acrescenta). */
export const formRumosVazio = (): FormRumos => ({
  inicio: { x: 0, y: 0 },
  linhas: Array.from({ length: 4 }, () => ({ azimute: 0, distancia: 0 })),
  fecharNoPrimeiro: false,
});

/** Lote L1 (retângulo 12 × 30 a partir da origem, sentido anti-horário, primeira linha = frente) como tabela: usado nos testes. */
export const formRumosL1 = (): FormRumos => ({
  inicio: { x: 0, y: 0 },
  linhas: [{ azimute: 90, distancia: 12 }, { azimute: 0, distancia: 30 }, { azimute: 270, distancia: 12 }, { azimute: 180, distancia: 30 }],
  fecharNoPrimeiro: false,
});

const GRAU = Math.PI / 180;

/** Polígono da tabela com o norte verdadeiro do projeto (radianos em `Localizacao`). */
export const poligonoDoForm = (f: FormRumos, norteVerdadeiro: number): PoligonoDeRumos =>
  rumosParaPoligono(f.inicio, f.linhas.map((l) => ({ azimute: l.azimute, distancia: l.distancia })), norteVerdadeiro);

/** Norte verdadeiro do projeto em graus (só para mostrar). */
export const norteEmGraus = (p: Pick<Project, 'localizacao'>): number => localizacaoDe(p).norteVerdadeiro / GRAU;

export interface AvaliacaoRumos {
  /** Erro de fechamento (m), ao vivo. */
  erroFechamento: number;
  /** A tabela fecha dentro da regra de aceite (erro ≤ 0,05 m ou "fechar no primeiro ponto")? */
  fechamentoOk: boolean;
  /** Polígono (um ponto por linha). */
  pontos: Array<{ x: number; y: number }>;
  /** Motivo de a tabela não poder ser aceita, já traduzido, ou null se pode. */
  problema: string | null;
}

const msg = (lang: Lang, key: DictKey, args?: Record<string, string | number>): string => traduzir(lang, key, args);

/** Lote que a tabela gera: o primeiro lado (primeira linha) é a frente; os demais, laterais com recuo 0. */
export function loteDoForm(f: FormRumos, p: Pick<Project, 'localizacao'>, id: Id, levelId: Id, nome: string): Omit<Lot, 'order'> {
  const pol = poligonoDoForm(f, localizacaoDe(p).norteVerdadeiro);
  const lados = ladosPadrao(pol.pontos.length);
  if (lados.length > 0) lados[0] = { papel: 'frente', recuo: 0 };
  return makeLot({ id, levelId, name: nome, contorno: pol.pontos, lados });
}

/**
 * Avaliação ao vivo da tabela: linhas inválidas, erro de fechamento acima da tolerância sem a caixa marcada, ou polígono que o modelo recusa
 * (cruzado, fora do limite...). Devolve sempre o erro de fechamento, para o diálogo mostrá-lo enquanto o usuário digita.
 */
export function avaliarRumos(f: FormRumos, p: Pick<Project, 'localizacao' | 'settings'>, lang: Lang = 'pt'): AvaliacaoRumos {
  const pol = poligonoDoForm(f, localizacaoDe(p).norteVerdadeiro);
  const base = { erroFechamento: pol.erroFechamento, fechamentoOk: fechamentoAceito(pol.erroFechamento, f.fecharNoPrimeiro), pontos: pol.pontos };
  if (f.linhas.length < LINHAS_MINIMAS) return { ...base, problema: msg(lang, 'ui_lt_rumos_min', { n: LINHAS_MINIMAS }) };
  const ruim = f.linhas.findIndex((l) => !Number.isFinite(l.azimute) || !Number.isFinite(l.distancia) || !(l.distancia > 0));
  if (ruim >= 0) return { ...base, problema: msg(lang, 'ui_lt_rumos_linha_invalida', { n: ruim + 1 }) };
  if (!Number.isFinite(f.inicio.x) || !Number.isFinite(f.inicio.y)) return { ...base, problema: msg(lang, 'ui_lt_rumos_inicio_invalido') };
  if (!base.fechamentoOk) return { ...base, problema: msg(lang, 'ui_lt_rumos_erro_fechamento', { erro: formatQuantity(unitsOf(p), 'length', pol.erroFechamento), max: formatQuantity(unitsOf(p), 'length', TOLERANCIA_FECHAMENTO) }) };
  const lote = loteDoForm(f, p, 'lt_avaliacao', 'lv_avaliacao', 'Lote');
  const problema = lotIssue({ ...lote, order: 0 }, lang);
  return { ...base, problema };
}

/** Comando que cria o lote da tabela, ou o motivo de recusar. */
export function comandoDoFormRumos(f: FormRumos, p: Project, levelId: Id, nome: string, lang: Lang = 'pt'): { command: Command; id: Id } | { problema: string } {
  const a = avaliarRumos(f, p, lang);
  if (a.problema) return { problema: a.problema };
  const id = newId('lt');
  return { command: { type: 'addLot', lot: loteDoForm(f, p, id, levelId, nome) }, id };
}

/** Aplica a tabela como UM passo de desfazer. Devolve o id do lote criado, ou o problema (nada muda). */
export function aplicarRumos(store: Pick<ProjectStore, 'exec' | 'project'>, f: FormRumos, levelId: Id, nome: string, rotulo: string, lang: Lang = 'pt'): { id: Id } | { problema: string } {
  const r = comandoDoFormRumos(f, store.project, levelId, nome, lang);
  if ('problema' in r) return r;
  try {
    store.exec(r.command, rotulo, lang);
    return { id: r.id };
  } catch (e) {
    return { problema: e instanceof Error ? e.message : String(e) };
  }
}
