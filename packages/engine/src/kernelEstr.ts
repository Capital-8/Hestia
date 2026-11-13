/**
 * Adaptador da estrutura para o kernel Rust (docs/estrutura/PLANO.md, A.5; esquema v19, seções 200 a 206 mais a 19 `niveis`; ficha R1a). NÃO calcula
 * geometria: só monta as seções a partir de um `Project` (pilares, vigas, fundações, seus tipos e os perfis personalizados). Molde: `kernelGuardaCorpo.ts`.
 * O envio e a diferença por linhas ficam em `kernelEstrEnvio.ts`; as tabelas de colunas e enums, em `kernelEstrTabelas.ts`.
 *
 * Numeração estável: cada linha tem um `id_num` internado por uma chave textual (o id do elemento ou do tipo; o conteúdo, nos perfis). Passando a cena
 * anterior em `anterior`, as chaves que já existiam mantêm o número e as novas ganham o próximo; assim editar um pilar só muda a linha dele.
 *
 * Cache por ASSINATURA do elemento + tipo + nível: o hash do elemento, do tipo dele e das cotas dos níveis que ele lê. Se bate com a da cena anterior,
 * a linha anterior é reaproveitada (mesmo objeto) sem montar nada, e o envio por diferença nem a compara em profundidade.
 *
 * Só entram os tipos e perfis que algum elemento usa. Elemento inválido (`motivoInvalidoEstr`: tipo ou nível inexistente, perfil ou número inválido,
 * pilar sem altura) fica de fora, é contado em `invalidos` e vira o aviso `estr-invalida`: nunca chega ao kernel, que recusaria a consulta inteira.
 * A parede hospedeira (`hostWallId`) NÃO viaja (`hosp_num` = ausente): o pilar já está na posição certa pelo comando e a seção 1 não existe nesta cena.
 */
import { beamTypesOf, columnTypesOf, footingTypesOf, isBeam, isColumn, type Beam, type BeamType, type Column, type ColumnType, type Footing, type FootingType, type Id, type PerfilForma, type Project } from '@hestia/model';
import { hashTexto } from './assinaturasNivel.ts';
import { aneisDoPerfil, chaveDoPerfil, codigoDaForma, parametrosDoPerfil } from './kernelEstrPerfil.ts';
import {
  ALINHAMENTO_CODIGO,
  COLUNAS_ESTR,
  DISCIPLINA_CODIGO,
  EXTREMIDADE_CODIGO,
  FORMA_FUNDACAO_CODIGO,
  ID_AUSENTE_ESTR,
  MODO_FUNDACAO_CODIGO,
  NOMES_SECOES_ESTR,
  SEM_PESCOCO,
  type CategoriaEstr,
  type NomeSecaoEstr,
} from './kernelEstrTabelas.ts';
import { baseETopoDoPilar, cotaDoNivel, elementosEstr, motivoInvalidoEstr, type ElementoEstr } from './kernelEstrValidade.ts';

export * from './kernelEstrTabelas.ts';
export * from './kernelEstrEnvio.ts';
export { chaveDoPerfil, parametrosDoPerfil } from './kernelEstrPerfil.ts';

/** Valores de uma linha, na ordem de `COLUNAS_ESTR[secao]`. */
export type LinhaEstr = readonly number[];

/** Número interno por chave textual, estável entre montagens quando se reaproveita o mapa anterior. */
interface Internador {
  mapa: Map<string, number>;
  proximo: number;
}

/** O que a cena guarda de cada elemento de estrutura: a assinatura e a linha (`null` = inválido, ficou de fora). */
export interface ElementoNaCenaEstr {
  categoria: CategoriaEstr;
  num: number;
  nivelId: Id;
  assinatura: string;
  tipoId: Id;
  linha: LinhaEstr | null;
}

export interface CenaEstr {
  /** `id_num` -> linha, por seção. */
  secoes: Record<NomeSecaoEstr, Map<number, LinhaEstr>>;
  internadores: Record<string, Internador>;
  /** id do elemento -> o que a cena guarda dele (inclusive os inválidos). */
  elementos: Map<Id, ElementoNaCenaEstr>;
  /** `id_num` -> id do elemento, por categoria (para traduzir as saídas das consultas). */
  idDe: Record<CategoriaEstr, Map<number, Id>>;
  /** id do tipo -> `id_num`, por categoria. */
  tipoDe: Record<CategoriaEstr, Map<Id, number>>;
  /** id do material -> `material_num` (internado por esta cena; materiais novos entram no fim). */
  materialDe: Map<Id, number>;
  /** id do nível -> `nivel_num` (índice em `p.levels`). */
  nivelDe: Map<Id, number>;
  /** Elementos que ficaram de fora por não passarem na validação do TS. */
  invalidos: Id[];
}

export interface OpcoesCenaEstr {
  /** Cena anterior: as chaves que já existiam mantêm o `id_num`, e as linhas de elementos com a mesma assinatura são reaproveitadas. */
  anterior?: CenaEstr | null;
}

const NOMES_INTERNADORES = ['pilares', 'vigas', 'fundacoes', 'tipos_pilar', 'tipos_viga', 'tipos_fundacao', 'perfil_num', 'perfis'] as const;
const NAN = Number.NaN;

const categoriaDe = (e: ElementoEstr): CategoriaEstr => (isColumn(e) ? 'pilar' : isBeam(e) ? 'viga' : 'fundacao');
const SECAO_DO_ELEMENTO: Record<CategoriaEstr, NomeSecaoEstr> = { pilar: 'pilares', viga: 'vigas', fundacao: 'fundacoes' };

/** Soma da espessura das camadas de acabamento do pilar arquitetônico (0 sem camadas). */
const espessuraDasCamadas = (t: ColumnType): number => (t.disciplina === 'arquitetonico' ? (t.camadas ?? []).reduce((s, l) => s + l.thickness, 0) : 0);

/** Projeto -> seções 19 e 200 a 206. Veja o comentário do arquivo. */
export function montarCenaEstr(p: Project, opcoes: OpcoesCenaEstr = {}): CenaEstr {
  const ant = opcoes.anterior ?? null;
  const materialDe = new Map<Id, number>(ant?.materialDe ?? []);
  const nivelDe = new Map<Id, number>(p.levels.map((l, i) => [l.id, i] as const));
  const secoes = Object.fromEntries(NOMES_SECOES_ESTR.map((n) => [n, new Map<number, LinhaEstr>()])) as Record<NomeSecaoEstr, Map<number, LinhaEstr>>;
  const internadores = Object.fromEntries(
    NOMES_INTERNADORES.map((n) => {
      const a = ant?.internadores[n];
      return [n, a ? { mapa: new Map(a.mapa), proximo: a.proximo } : { mapa: new Map<string, number>(), proximo: 1 }];
    }),
  ) as Record<string, Internador>;
  const idDe = { pilar: new Map<number, Id>(), viga: new Map<number, Id>(), fundacao: new Map<number, Id>() };
  const tipoDe = { pilar: new Map<Id, number>(), viga: new Map<Id, number>(), fundacao: new Map<Id, number>() };
  const elementos = new Map<Id, ElementoNaCenaEstr>();
  const invalidos: Id[] = [];

  const internar = (nome: string, chave: string): number => {
    const i = internadores[nome]!;
    let n = i.mapa.get(chave);
    if (n === undefined) {
      n = i.proximo++;
      i.mapa.set(chave, n);
    }
    return n;
  };
  const poeLinha = (secao: NomeSecaoEstr, valores: LinhaEstr): void => {
    if (valores.length !== COLUNAS_ESTR[secao].length) throw new Error(`estrutura: ${secao} espera ${COLUNAS_ESTR[secao].length} colunas, recebeu ${valores.length}`);
    secoes[secao].set(valores[0]!, valores);
  };
  const materialNum = (id: Id): number => {
    let n = materialDe.get(id);
    if (n === undefined) materialDe.set(id, (n = materialDe.size + 1));
    return n;
  };

  // ---- níveis (cotas) ----
  p.levels.forEach((l, i) => poeLinha('niveis', [i + 1, i, l.elevation]));

  // ---- perfis personalizados (internados por conteúdo) ----
  const perfisVistos = new Set<string>();
  /** `perfil_num` do perfil personalizado (e as linhas dos vértices); `ID_AUSENTE` nas demais formas. */
  const perfilNum = (pf: PerfilForma): number => {
    if (pf.forma !== 'personalizado') return ID_AUSENTE_ESTR;
    const chave = chaveDoPerfil(pf);
    const num = internar('perfil_num', chave);
    if (!perfisVistos.has(chave)) {
      perfisVistos.add(chave);
      aneisDoPerfil(pf).forEach((anel, a) =>
        anel.forEach(([x, y], i) => poeLinha('perfis', [internar('perfis', `${chave}#${a}#${i}`), num, a, i, x, y])),
      );
    }
    return num;
  };

  // ---- tipos (só os usados) ----
  const tipoPilar = (t: ColumnType): number => {
    const ja = tipoDe.pilar.get(t.id);
    if (ja !== undefined) return ja;
    const id = internar('tipos_pilar', t.id);
    tipoDe.pilar.set(t.id, id);
    poeLinha('tipos_pilar', [id, DISCIPLINA_CODIGO[t.disciplina], codigoDaForma(t.perfil), ...parametrosDoPerfil(t.perfil), perfilNum(t.perfil), materialNum(t.materialId), espessuraDasCamadas(t)]);
    return id;
  };
  const tipoViga = (t: BeamType): number => {
    const ja = tipoDe.viga.get(t.id);
    if (ja !== undefined) return ja;
    const id = internar('tipos_viga', t.id);
    tipoDe.viga.set(t.id, id);
    poeLinha('tipos_viga', [id, codigoDaForma(t.perfil), ...parametrosDoPerfil(t.perfil), perfilNum(t.perfil), materialNum(t.materialId)]);
    return id;
  };
  const tipoFundacao = (t: FootingType): number => {
    const ja = tipoDe.fundacao.get(t.id);
    if (ja !== undefined) return ja;
    const id = internar('tipos_fundacao', t.id);
    tipoDe.fundacao.set(t.id, id);
    const pescoco = t.modo === 'isolada' && t.forma !== 'estaca' ? t.pescoco : undefined;
    poeLinha('tipos_fundacao', [
      id,
      MODO_FUNDACAO_CODIGO[t.modo],
      FORMA_FUNDACAO_CODIGO[t.forma],
      codigoDaForma(t.base),
      ...parametrosDoPerfil(t.base),
      perfilNum(t.base),
      t.alturaBase,
      pescoco ? codigoDaForma(pescoco) : SEM_PESCOCO,
      ...(pescoco ? parametrosDoPerfil(pescoco) : [NAN, NAN, NAN, NAN, NAN, NAN]),
      pescoco ? perfilNum(pescoco) : ID_AUSENTE_ESTR,
      pescoco ? (t.alturaPescoco ?? NAN) : NAN,
      materialNum(t.materialId),
    ]);
    return id;
  };

  // ---- elementos ----
  const tiposPilar = columnTypesOf(p);
  const tiposViga = beamTypesOf(p);
  const tiposFundacao = footingTypesOf(p);
  const sigTipo = new Map<string, string>();
  const assinaturaDoTipo = (cat: CategoriaEstr, id: Id, t: unknown): string => {
    const chave = `${cat}:${id}`;
    let s = sigTipo.get(chave);
    if (s === undefined) sigTipo.set(chave, (s = JSON.stringify(t ?? null)));
    return s;
  };

  for (const e of elementosEstr(p)) {
    const categoria = categoriaDe(e);
    const tipo = isColumn(e) ? tiposPilar[e.typeId] : isBeam(e) ? tiposViga[e.typeId] : tiposFundacao[e.typeId];
    const nivelNum = nivelDe.get(e.levelId);
    const topoNum = isColumn(e) && e.topLevelId !== null ? nivelDe.get(e.topLevelId) : undefined;
    const bt = isColumn(e) ? baseETopoDoPilar(p, e) : null;
    const assinatura = hashTexto([JSON.stringify(e), assinaturaDoTipo(categoria, e.typeId, tipo), nivelNum, topoNum, cotaDoNivel(p, e.levelId), bt?.base, bt?.topo].join('|'));
    const num = internar(SECAO_DO_ELEMENTO[categoria], e.id);
    idDe[categoria].set(num, e.id);
    const velho = ant?.elementos.get(e.id);
    const reaproveita = velho !== undefined && velho.assinatura === assinatura && velho.categoria === categoria;
    const valido = reaproveita ? velho.linha !== null : tipo !== undefined && nivelNum !== undefined && motivoInvalidoEstr(p, e) === null;
    if (!valido || tipo === undefined || nivelNum === undefined) {
      elementos.set(e.id, { categoria, num, nivelId: e.levelId, assinatura, tipoId: e.typeId, linha: null });
      invalidos.push(e.id);
      continue;
    }
    // O tipo vai à cena a cada montagem (poucas linhas); com a mesma numeração, a linha reaproveitada já traz o `tipo_num` certo.
    const tipoNumero = isColumn(e) ? tipoPilar(tipo as ColumnType) : isBeam(e) ? tipoViga(tipo as BeamType) : tipoFundacao(tipo as FootingType);
    const linha = reaproveita ? velho.linha! : isColumn(e) ? linhaPilar(e, num, nivelNum, tipoNumero, topoNum) : isBeam(e) ? linhaViga(e, num, nivelNum, tipoNumero) : linhaFundacao(e, num, nivelNum, tipoNumero);
    elementos.set(e.id, { categoria, num, nivelId: e.levelId, assinatura, tipoId: e.typeId, linha });
    poeLinha(SECAO_DO_ELEMENTO[categoria], linha);
  }

  return { secoes, internadores, elementos, idDe, tipoDe, materialDe, nivelDe, invalidos };
}

function linhaPilar(c: Column, num: number, nivel: number, tipo: number, topo: number | undefined): LinhaEstr {
  return [num, nivel, tipo, DISCIPLINA_CODIGO[c.disciplina], c.pos.x, c.pos.y, c.rotation, c.baseOffset, topo ?? ID_AUSENTE_ESTR, c.topOffset, c.height ?? NAN, ID_AUSENTE_ESTR];
}

function linhaViga(b: Beam, num: number, nivel: number, tipo: number): LinhaEstr {
  return [num, nivel, tipo, b.a.x, b.a.y, b.b.x, b.b.y, b.zOffsetA, b.zOffsetB, ALINHAMENTO_CODIGO[b.alinhamento], b.rotation, EXTREMIDADE_CODIGO[b.extremidadeA], EXTREMIDADE_CODIGO[b.extremidadeB]];
}

function linhaFundacao(f: Footing, num: number, nivel: number, tipo: number): LinhaEstr {
  const isolada = f.pos !== undefined;
  return [num, nivel, tipo, isolada ? f.pos!.x : NAN, isolada ? f.pos!.y : NAN, f.rotation, f.a?.x ?? NAN, f.a?.y ?? NAN, f.b?.x ?? NAN, f.b?.y ?? NAN, ID_AUSENTE_ESTR, f.topOffset];
}
