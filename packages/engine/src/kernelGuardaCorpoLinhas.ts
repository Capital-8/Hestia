/**
 * Linhas por tipo de elemento do adaptador do guarda-corpo (decisão 0055, Fase 2): tipo (trilhos, corrimãos, postes, preenchimentos), escada e rampa.
 * Cada função empurra as linhas nas seções por meio do contexto da montagem (`CtxGC`), que numera as chaves e internam perfis e materiais.
 */
import type { CorrimaoGC, Id, PerfilGC, Project, RefBaseGC, RefTopoGC, TipoGuardaCorpo } from '@hestia/model';
import type { ResolvedRamp } from './ramps.ts';
import type { ResolvedStair } from './stairs.ts';
import { ENUM, ID_AUSENTE_GC, codigo, type NomeSecaoGC } from './kernelGuardaCorpoTabelas.ts';

/** O que a montagem oferece às funções de linhas. */
export interface CtxGC {
  push: (secao: NomeSecaoGC, valores: Record<string, number>) => void;
  idDe: (secao: NomeSecaoGC, chave: string) => number;
  materialNum: (id: Id | null | undefined) => number;
  perfil: (pf: PerfilGC) => number;
}

/**
 * Profundidade do degrau (m) da escada: a distância média entre linhas de espelho consecutivas do primeiro lance com pelo menos duas. Sem isso, o piso
 * mínimo do tipo. Só serve à extensão `maisPiso` do corrimão.
 */
export function profundidadeDoDegrau(s: ResolvedStair): number {
  const porComponente = new Map<number, ResolvedStair['risers']>();
  for (const r of s.risers) porComponente.set(r.componentIndex, [...(porComponente.get(r.componentIndex) ?? []), r]);
  for (const ci of [...porComponente.keys()].sort((a, b) => a - b)) {
    const lista = [...porComponente.get(ci)!].sort((a, b) => a.index - b.index);
    if (lista.length < 2) continue;
    let soma = 0;
    for (let k = 1; k < lista.length; k++) {
      const m0 = { x: (lista[k - 1]!.a.x + lista[k - 1]!.b.x) / 2, y: (lista[k - 1]!.a.y + lista[k - 1]!.b.y) / 2 };
      const m1 = { x: (lista[k]!.a.x + lista[k]!.b.x) / 2, y: (lista[k]!.a.y + lista[k]!.b.y) / 2 };
      soma += Math.hypot(m1.x - m0.x, m1.y - m0.y);
    }
    return soma / (lista.length - 1);
  }
  return s.type.minTread;
}


const refBase = (r: RefBaseGC): [number, number] => (r.de === 'trilho' ? [1, r.indice] : [0, 0]);
const refTopo = (r: RefTopoGC): [number, number] => (r.de === 'trilho' ? [1, r.indice] : r.de === 'corrimao' ? [2, r.indice] : [0, 0]);

/** Trilhos, corrimãos, postes e preenchimentos do tipo `t` (a linha de `tipos_guarda` é da montagem). `id` é o `id_num` do tipo. */
export function linhasDoTipo(c: CtxGC, t: TipoGuardaCorpo, id: number): void {
  const { push, idDe, materialNum, perfil } = c;
  t.trilhos.forEach((tr, i) =>
    push('trilhos_guarda', { id_num: idDe('trilhos_guarda', `${t.id}:${i}`), tipo_num: id, indice: i, altura: tr.altura, desloc: tr.deslocamento, perfil_num: perfil(tr.perfil), material_num: materialNum(tr.materialId) }),
  );
  t.corrimaos.forEach((c: CorrimaoGC, i) =>
    push('corrimaos_guarda', {
      id_num: idDe('corrimaos_guarda', `${t.id}:${i}`),
      tipo_num: id,
      indice: i,
      funcao: codigo(ENUM.funcao, c.funcao, 'função do corrimão'),
      posicao: codigo(ENUM.posicao, c.posicao, 'posição do corrimão'),
      altura: c.altura,
      afastamento: c.afastamento,
      perfil_num: perfil(c.perfil),
      material_num: materialNum(c.materialId),
      ext_ini_estilo: codigo(ENUM.estilo, c.extensaoInicio.estilo, 'extensão'),
      ext_ini_comp: c.extensaoInicio.comprimento,
      ext_ini_mais_piso: c.extensaoInicio.maisPiso ? 1 : 0,
      ext_fim_estilo: codigo(ENUM.estilo, c.extensaoFim.estilo, 'extensão'),
      ext_fim_comp: c.extensaoFim.comprimento,
      ext_fim_mais_piso: c.extensaoFim.maisPiso ? 1 : 0,
      sup_layout: codigo(ENUM.layout, c.suportes.layout, 'layout de suporte'),
      sup_espac: c.suportes.espacamento,
      sup_numero: c.suportes.numero,
      sup_justif: codigo(ENUM.justif, c.suportes.justificacao, 'justificação de suporte'),
      sup_perfil_num: perfil(c.suportes.perfil),
      sup_comp: c.suportes.comprimento,
      transicao: codigo(ENUM.transicao, c.transicao, 'transição'),
      juncao: codigo(ENUM.juncao, c.juncao, 'junção do corrimão'),
      raio_filete: c.raioFilete,
    }),
  );
  const papeis = [
    ['inicio', t.postes.inicio],
    ['fim', t.postes.fim],
    ['canto', t.postes.canto],
    ['intermediario', t.postes.intermediario],
  ] as const;
  papeis.forEach(([nome, po], papel) => {
    const inter = nome === 'intermediario' ? t.postes.intermediario : null;
    push('postes_guarda', {
      id_num: idDe('postes_guarda', `${t.id}:${nome}`),
      tipo_num: id,
      papel,
      ativo: po.ativo ? 1 : 0,
      perfil_num: perfil(po.perfil),
      material_num: materialNum(po.materialId),
      acima: po.alturaAcima,
      abaixo: po.profundidadeAbaixo,
      ang_canto: nome === 'canto' ? t.postes.anguloCanto : 0,
      modo: inter ? codigo(ENUM.modoPoste, inter.modo, 'modo do poste') : 0,
      espacamento: inter ? inter.espacamento : 0,
      numero: inter ? inter.numero : 0,
    });
  });
  t.preenchimentos.forEach((pr, indice) => {
    const chave = `${t.id}:${indice}`;
    const [bt, bi] = refBase(pr.base);
    const [tt, ti] = refTopo(pr.topo);
    if (pr.tipo === 'balaustres') {
      const pdId = idDe('padroes_guarda', chave);
      const pd = pr.porDegrau;
      push('padroes_guarda', {
        id_num: pdId,
        tipo_num: id,
        indice,
        base_tipo: bt,
        base_idx: bi,
        topo_tipo: tt,
        topo_idx: ti,
        periodo: pr.periodo,
        justif: codigo(ENUM.justif, pr.justificacao, 'justificação do padrão'),
        sobra: codigo(ENUM.sobra, pr.sobra, 'sobra do padrão'),
        quebra: codigo(ENUM.quebra, pr.quebra, 'quebra do padrão'),
        ang_quebra: pr.anguloQuebra,
        escopo: codigo(ENUM.escopo, pr.escopo, 'escopo do padrão'),
        pd_ativo: pd.ativo ? 1 : 0,
        pd_qtd: pd.quantidade,
        pd_dist: pd.distanciaDaQuina,
        pd_perfil_num: pd.modelo ? perfil(pd.modelo.perfil) : ID_AUSENTE_GC,
        pd_material_num: materialNum(pd.modelo?.materialId),
      });
      pr.elementos.forEach((e, k) =>
        push('padrao_elementos_guarda', {
          id_num: idDe('padrao_elementos_guarda', `${chave}:${k}`),
          padrao_num: pdId,
          indice: k,
          perfil_num: e.modelo ? perfil(e.modelo.perfil) : ID_AUSENTE_GC,
          material_num: materialNum(e.modelo?.materialId),
          dist_anterior: e.distanciaAnterior,
          desloc_lateral: e.deslocamentoLateral,
          desloc_base: e.deslocamentoBase,
          desloc_topo: e.deslocamentoTopo,
        }),
      );
    } else {
      const f = pr.familia;
      push('paineis_guarda', {
        id_num: idDe('paineis_guarda', chave),
        tipo_num: id,
        indice,
        familia: codigo(ENUM.familia, f, 'família de painel'),
        base_tipo: bt,
        base_idx: bi,
        topo_tipo: tt,
        topo_idx: ti,
        desl_base: pr.deslocamentoBase,
        desl_topo: pr.deslocamentoTopo,
        espessura: pr.espessura,
        folga_lateral: pr.folgaLateral,
        largura_max: pr.larguraMaxima,
        material_num: materialNum(pr.materialId),
        perf_diam: f === 'chapa-perfurada' ? (pr.perfuracao?.diametro ?? 0) : 0,
        perf_passo_x: f === 'chapa-perfurada' ? (pr.perfuracao?.passoX ?? 0) : 0,
        perf_passo_y: f === 'chapa-perfurada' ? (pr.perfuracao?.passoY ?? 0) : 0,
        perf_alternado: f === 'chapa-perfurada' && pr.perfuracao?.alternado ? 1 : 0,
        tela_larg: f === 'tela' ? (pr.tela?.larguraMalha ?? 0) : 0,
        tela_alt: f === 'tela' ? (pr.tela?.alturaMalha ?? 0) : 0,
        tela_fio: f === 'tela' ? (pr.tela?.diametroFio ?? 0) : 0,
        cabo_diam: f === 'cabo-aco' ? (pr.cabos?.diametro ?? 0) : 0,
        cabo_espac: f === 'cabo-aco' ? (pr.cabos?.espacamento ?? 0) : 0,
        cabo_orient: f === 'cabo-aco' && pr.cabos ? codigo(ENUM.orientacao, pr.cabos.orientacao, 'orientação de cabo') : 0,
      });
    }
  });
}

/** Componentes, bordas, espelhos e anéis de patamar da escada `s` (a linha de `escadas_gc` é da montagem). `id` é o `id_num` da escada. */
export function linhasDaEscada(c: CtxGC, p: Project, s: ResolvedStair, id: number): void {
  const { push, idDe } = c;
  const el = p.elements[s.id];
  const comps = el?.kind === 'stair' ? el.components : [];
  comps.forEach((c, ci) => {
    const chaveC = `${s.id}:${ci}`;
    const compId = idDe('escada_componentes_gc', chaveC);
    const sp = s.spiral && s.spiral.componentIndex === ci ? s.spiral : null;
    push('escada_componentes_gc', {
      id_num: compId,
      escada_num: id,
      indice: ci,
      tipo: c.kind === 'run' ? 0 : 1,
      caracol: sp ? 1 : 0,
      centro_x: sp?.center.x ?? 0,
      centro_y: sp?.center.y ?? 0,
      r_int: sp?.rInner ?? 0,
      r_ext: sp?.rOuter ?? 0,
    });
    if (c.kind === 'run') {
      (['esquerdo', 'direito'] as const).forEach((lado, ld) => {
        (ld === 0 ? c.boundaryLeft : c.boundaryRight).forEach((cv, ordem) =>
          push('escada_curvas_gc', { id_num: idDe('escada_curvas_gc', `${chaveC}:${lado}:${ordem}`), componente_num: compId, lado: ld, ordem, ax: cv.a.x, ay: cv.a.y, bx: cv.b.x, by: cv.b.y, sag: cv.sag }),
        );
      });
      s.risers
        .filter((r) => r.componentIndex === ci)
        .sort((a, b) => a.index - b.index)
        .forEach((r) =>
          push('escada_espelhos_gc', { id_num: idDe('escada_espelhos_gc', `${chaveC}:${r.index}`), componente_num: compId, indice: r.index, ax: r.a.x, ay: r.a.y, bx: r.b.x, by: r.b.y, z0: r.z0, z1: r.z1 }),
        );
    } else {
      let k = 0;
      for (const passo of s.steps.filter((x) => x.kind === 'landing' && x.componentIndex === ci).sort((a, b) => a.index - b.index)) {
        for (const q of passo.polygon) {
          push('escada_patamares_gc', { id_num: idDe('escada_patamares_gc', `${chaveC}:${k}`), componente_num: compId, indice: k, x: q.x, y: q.y, z: passo.z });
          k++;
        }
      }
    }
  });
}

/** Lances e anéis de patamar da rampa `r` (a linha de `rampas_gc` é da montagem). `id` é o `id_num` da rampa. */
export function linhasDaRampa(c: CtxGC, r: ResolvedRamp, id: number): void {
  const { push, idDe } = c;
  for (const f of r.flights) {
    push('rampa_lances_gc', {
      id_num: idDe('rampa_lances_gc', `${r.id}:${f.componentIndex}`),
      rampa_num: id,
      indice: f.componentIndex,
      sx: f.start.x,
      sy: f.start.y,
      ex: f.end.x,
      ey: f.end.y,
      ax: f.startEdge[0].x,
      ay: f.startEdge[0].y,
      bx: f.startEdge[1].x,
      by: f.startEdge[1].y,
      cx: f.endEdge[0].x,
      cy: f.endEdge[0].y,
      dx: f.endEdge[1].x,
      dy: f.endEdge[1].y,
      z0: f.z0,
      z1: f.z1,
    });
  }
  for (const pat of r.landings) {
    pat.polygon.forEach((q, k) =>
      push('rampa_patamares_gc', { id_num: idDe('rampa_patamares_gc', `${r.id}:${pat.componentIndex}:${k}`), rampa_num: id, componente: pat.componentIndex, indice: k, x: q.x, y: q.y, z: pat.z }),
    );
  }
}
