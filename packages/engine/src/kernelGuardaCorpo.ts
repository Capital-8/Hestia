/**
 * Adaptador do guarda-corpo para o kernel Rust (decisão 0055, Fase 2; esquema v13, seções 60 a 81). NÃO calcula geometria: só monta as seções a partir de
 * um `Project` com os hospedeiros JÁ resolvidos (`ResolvedStair`, `ResolvedRamp`; o Rust não conhece o Project). O envio e a diferença por linhas ficam em
 * `kernelGuardaCorpoEnvio.ts`; as tabelas de colunas e enums, em `kernelGuardaCorpoTabelas.ts`.
 *
 * Numeração estável: cada linha tem um `id_num` internado por uma chave textual (o id do elemento mais a posição). Passando a cena anterior em
 * `anterior`, as chaves que já existiam mantêm o número, e as novas ganham o próximo; assim editar uma escada só muda as linhas dela.
 *
 * Só entram na cena os hospedeiros que algum guarda-corpo usa, e só os tipos, perfis e normas que eles precisam; guarda-corpo cujo hospedeiro ou tipo
 * não existe (ou cuja escada/rampa não resolveu) fica de fora e é contado em `ignorados` (o validador do modelo já aponta `railing-host-missing`).
 */
import {
  isGuardaCorpo,
  normaDe,
  perfisNormaDo,
  type Id,
  type PerfilGC,
  type PerfilNorma,
  type Project,
  type TipoGuardaCorpo,
} from '@hestia/model';
import { resolveRampOne, type ResolvedRamp } from './ramps.ts';
import { resolveStairOne, type ResolvedStair } from './stairs.ts';
import { linhasDaEscada, linhasDaRampa, linhasDoTipo, profundidadeDoDegrau, type CtxGC } from './kernelGuardaCorpoLinhas.ts';
import { COLUNAS, ENUM, ID_AUSENTE_GC, LIMITES_NORMA, NOMES_SECOES_GC, TOL_CORDA_PADRAO_GC, chavePerfil, codigo, ladosDoCirculo, type ColunasGC, type NomeSecaoGC } from './kernelGuardaCorpoTabelas.ts';

export * from './kernelGuardaCorpoTabelas.ts';
export * from './kernelGuardaCorpoEnvio.ts';
export { profundidadeDoDegrau } from './kernelGuardaCorpoLinhas.ts';

/** Número interno por chave textual, estável entre montagens quando se reaproveita o mapa anterior. */
interface Internador {
  mapa: Map<string, number>;
  proximo: number;
}

export interface CenaGC {
  secoes: Record<NomeSecaoGC, ColunasGC>;
  nLinhas: Record<NomeSecaoGC, number>;
  internadores: Record<NomeSecaoGC, Internador>;
  /** id do guarda-corpo -> `id_num`. */
  guardaDe: Map<Id, number>;
  escadaDe: Map<Id, number>;
  rampaDe: Map<Id, number>;
  tipoDe: Map<Id, number>;
  normaDe: Map<Id, number>;
  /** id do material -> `material_num` (o mesmo mapa da cena das paredes quando se passa o dela; materiais novos entram no fim). */
  materialDe: Map<Id, number>;
  /** id do nível -> `nivel_num` (índice em `p.levels`). */
  nivelDe: Map<Id, number>;
  /** `id_num` da norma do projeto: é o `norma_num` que as consultas de avisos recebem. */
  normaProjetoNum: number;
  /** Guarda-corpos que ficaram de fora: tipo, nível ou hospedeiro inexistente (ou hospedeiro que não resolveu). */
  ignorados: Id[];
}

const novoInternador = (): Internador => ({ mapa: new Map(), proximo: 1 });

export interface OpcoesCenaGC {
  /** Escadas já resolvidas (por id); as que faltam são resolvidas aqui, só as usadas por algum guarda-corpo. */
  escadas?: ReadonlyMap<Id, ResolvedStair>;
  rampas?: ReadonlyMap<Id, ResolvedRamp>;
  /** Mapa de materiais da cena das paredes, para a numeração ser a mesma. */
  materialDe?: Map<Id, number>;
  /** Cena anterior: as chaves que já existiam mantêm o `id_num`. */
  anterior?: CenaGC | null;
}

/**
 * Projeto -> seções 60 a 81. Só guarda-corpos com tipo e hospedeiro resolvidos entram; veja o comentário do arquivo.
 */
export function montarCenaGC(p: Project, opcoes: OpcoesCenaGC = {}): CenaGC {
  const materialDe = opcoes.materialDe ?? opcoes.anterior?.materialDe ?? new Map<Id, number>();
  const nivelDe = new Map<Id, number>(p.levels.map((l, i) => [l.id, i] as const));
  const secoes = Object.fromEntries(NOMES_SECOES_GC.map((n) => [n, Object.fromEntries(COLUNAS[n].map((c) => [c, [] as number[]]))])) as Record<NomeSecaoGC, ColunasGC>;
  const internadores = Object.fromEntries(
    NOMES_SECOES_GC.map((n) => {
      const a = opcoes.anterior?.internadores[n];
      return [n, a ? { mapa: new Map(a.mapa), proximo: a.proximo } : novoInternador()];
    }),
  ) as Record<NomeSecaoGC, Internador>;
  const push = (secao: NomeSecaoGC, valores: Record<string, number>): void => {
    for (const c of COLUNAS[secao]) {
      const v = valores[c];
      if (v === undefined) throw new Error(`guarda-corpo: coluna ${c} de ${secao} sem valor`);
      secoes[secao][c]!.push(v);
    }
  };
  const idDe = (secao: NomeSecaoGC, chave: string): number => {
    const i = internadores[secao];
    let n = i.mapa.get(chave);
    if (n === undefined) {
      n = i.proximo++;
      i.mapa.set(chave, n);
    }
    return n;
  };
  const materialNum = (id: Id | null | undefined): number => {
    if (id === null || id === undefined) return 0;
    let n = materialDe.get(id);
    if (n === undefined) materialDe.set(id, (n = materialDe.size + 1));
    return n;
  };

  const guardas = Object.values(p.elements)
    .filter(isGuardaCorpo)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));

  const guardaDe = new Map<Id, number>();
  const escadaDe = new Map<Id, number>();
  const rampaDe = new Map<Id, number>();
  const tipoDe = new Map<Id, number>();
  const normaDeMapa = new Map<Id, number>();
  const ignorados: Id[] = [];
  const escadasResolvidas = new Map<Id, ResolvedStair | null>();
  const rampasResolvidas = new Map<Id, ResolvedRamp | null>();
  const escada = (id: Id): ResolvedStair | null => {
    if (!escadasResolvidas.has(id)) {
      const dado = opcoes.escadas?.get(id);
      const el = p.elements[id];
      escadasResolvidas.set(id, dado ?? (el?.kind === 'stair' ? resolveStairOne(p, el) : null));
    }
    return escadasResolvidas.get(id) ?? null;
  };
  const rampa = (id: Id): ResolvedRamp | null => {
    if (!rampasResolvidas.has(id)) {
      const dado = opcoes.rampas?.get(id);
      const el = p.elements[id];
      rampasResolvidas.set(id, dado ?? (el?.kind === 'ramp' ? resolveRampOne(p, el) : null));
    }
    return rampasResolvidas.get(id) ?? null;
  };

  // ---- perfis (internados por conteúdo) ----
  const ctx: CtxGC = { push, idDe, materialNum, perfil: (pf) => perfil(pf) };
  const perfilDe = new Map<string, number>();
  const perfil = (pf: PerfilGC): number => {
    const chave = chavePerfil(pf);
    const ja = perfilDe.get(chave);
    if (ja !== undefined) return ja;
    const id = idDe('perfis_guarda', chave);
    perfilDe.set(chave, id);
    const pontos = pf.forma === 'poligono' ? (pf.pontos ?? []) : [];
    push('perfis_guarda', {
      id_num: id,
      forma: codigo(ENUM.forma, pf.forma, 'forma de perfil'),
      largura: pf.largura,
      altura: pf.forma === 'retangular' ? pf.altura : 0,
      n_pontos: pontos.length,
      lados: pf.forma === 'circular' ? ladosDoCirculo(pf.largura) : 0,
    });
    pontos.forEach((q, i) => push('perfis_guarda_pontos', { id_num: idDe('perfis_guarda_pontos', `${chave}:${i}`), perfil_num: id, indice: i, x: q.x, y: q.y }));
    return id;
  };

  // ---- normas ----
  const normaNum = (n: PerfilNorma): number => {
    const ja = normaDeMapa.get(n.id);
    if (ja !== undefined) return ja;
    const id = idDe('normas_guarda', n.id);
    normaDeMapa.set(n.id, id);
    let flags = 0;
    const linha: Record<string, number> = { id_num: id, n_flags: 0 };
    LIMITES_NORMA.forEach(([coluna, ler], k) => {
      const v = ler(n.limites);
      if (v === undefined) {
        linha[coluna] = 0;
        return;
      }
      flags |= 1 << k;
      linha[coluna] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    });
    linha['n_flags'] = flags >>> 0;
    push('normas_guarda', linha);
    return id;
  };
  const normaProjeto = normaDe(p, null);
  const normaProjetoNum = normaNum(normaProjeto);

  // ---- tipos ----
  const tipo = (t: TipoGuardaCorpo): number => {
    const ja = tipoDe.get(t.id);
    if (ja !== undefined) return ja;
    const id = idDe('tipos_guarda', t.id);
    tipoDe.set(t.id, id);
    const normaPerfil = t.normaId ? perfisNormaDo(p)[t.normaId] : undefined;
    push('tipos_guarda', {
      id_num: id,
      altura: t.altura,
      desloc: t.deslocamento,
      ajuste_patamar: t.ajusteAlturaPatamar,
      folga_inferior: t.folgaInferior,
      junc_angular: codigo(ENUM.juncAngular, t.juncaoAngular, 'junção angular'),
      junc_tangente: codigo(ENUM.juncTangente, t.juncaoTangente, 'junção tangente'),
      conexao: codigo(ENUM.conexao, t.conexaoTrilho, 'conexão de trilho'),
      tol_corda: TOL_CORDA_PADRAO_GC,
      // Sempre a norma que vale para o tipo (a dele ou a do projeto): a geometria (balaústres automáticos) e os avisos leem a mesma esfera.
      norma_num: normaNum(normaPerfil ?? normaProjeto),
    });
    linhasDoTipo(ctx, t, id);
    return id;
  };

  // ---- hospedeiros ----
  const adicionarEscada = (s: ResolvedStair): number => {
    const ja = escadaDe.get(s.id);
    if (ja !== undefined) return ja;
    const id = idDe('escadas_gc', s.id);
    escadaDe.set(s.id, id);
    push('escadas_gc', { id_num: id, nivel_num: nivelDe.get(s.levelId) ?? 0, z_base: s.baseZ, z_topo: s.topZ, altura_espelho: s.riserHeight, profundidade_piso: profundidadeDoDegrau(s) });
    linhasDaEscada(ctx, p, s, id);
    return id;
  };
  const adicionarRampa = (r: ResolvedRamp): number => {
    const ja = rampaDe.get(r.id);
    if (ja !== undefined) return ja;
    const id = idDe('rampas_gc', r.id);
    rampaDe.set(r.id, id);
    push('rampas_gc', { id_num: id, nivel_num: nivelDe.get(r.levelId) ?? 0, z_base: r.baseZ, z_topo: r.topZ });
    linhasDaRampa(ctx, r, id);
    return id;
  };

  // ---- guarda-corpos ----
  for (const g of guardas) {
    const t = p.tiposGuardaCorpo[g.typeId];
    const nivel = nivelDe.get(g.levelId);
    if (!t || nivel === undefined) {
      ignorados.push(g.id);
      continue;
    }
    const h = g.hospedeiro;
    let hosp = 0;
    let hospNum = ID_AUSENTE_GC;
    let lados = 0;
    let posBase = 0;
    if (h.tipo === 'escada') {
      const s = escada(h.escadaId);
      if (!s) {
        ignorados.push(g.id);
        continue;
      }
      hosp = 1;
      hospNum = adicionarEscada(s);
    } else if (h.tipo === 'rampa') {
      const r = rampa(h.rampaId);
      if (!r) {
        ignorados.push(g.id);
        continue;
      }
      hosp = 2;
      hospNum = adicionarRampa(r);
    }
    if (h.tipo !== 'manual') {
      lados = (h.lados.esquerdo.lance ? 1 : 0) | (h.lados.esquerdo.patamar ? 2 : 0) | (h.lados.direito.lance ? 4 : 0) | (h.lados.direito.patamar ? 8 : 0);
      posBase = h.posicaoBase === 'lateral' ? 1 : 0;
    }
    const tipoNum = tipo(t);
    const id = idDe('guardas_corpo', g.id);
    guardaDe.set(g.id, id);
    const so = g.sobrescritas;
    push('guardas_corpo', {
      id_num: id,
      nivel_num: nivel,
      tipo_num: tipoNum,
      hosp,
      hosp_num: hospNum,
      lados,
      pos_base: posBase,
      desloc: g.deslocamento ?? t.deslocamento,
      altura: g.altura ?? Number.NaN,
      inverter: g.inverter ? 1 : 0,
      fechado: h.tipo === 'manual' && h.fechado ? 1 : 0,
      lado_desloc: h.tipo === 'manual' ? (h.ladoDeslocamento === 'esquerdo' ? 0 : h.ladoDeslocamento === 'direito' ? 1 : 2) : 0,
      cota_base: h.tipo === 'manual' ? g.cotaBase : 0,
      flags: ((so?.postesIntermediarios ?? true) ? 1 : 0) | ((so?.preenchimentoAtivo ?? true) ? 2 : 0) | ((so?.corrimaoAtivo ?? true) ? 4 : 0),
    });
    if (h.tipo === 'manual') {
      h.caminho.forEach((q, i) => push('guarda_caminhos_manuais', { id_num: idDe('guarda_caminhos_manuais', `${g.id}:${i}`), guarda_num: id, indice: i, x: q.x, y: q.y, dz: q.dz }));
    }
  }

  const nLinhas = Object.fromEntries(NOMES_SECOES_GC.map((n) => [n, secoes[n]['id_num']!.length])) as Record<NomeSecaoGC, number>;
  return { secoes, nLinhas, internadores, guardaDe, escadaDe, rampaDe, tipoDe, normaDe: normaDeMapa, materialDe, nivelDe, normaProjetoNum, ignorados };
}
