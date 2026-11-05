import type { Command } from './commands.ts';
import { newId } from './ids.ts';
import { t, type Lang } from './i18n.ts';
import { openingTypeIssue } from './opening.ts';
import type { Id, Material, OpeningType, Project } from './types.ts';

/*
 * Biblioteca do usuário: duplicar um tipo de porta ou janela e levar tipos de um projeto para outro por arquivo JSON.
 * Tudo aqui é função pura: quem grava é o chamador, que executa `importOpeningTypes(...).commands` numa só transação.
 */

/** Marca do arquivo de tipos de abertura (distingue de um projeto ou de outro JSON do Hestia). */
export const TIPOS_ABERTURA_FORMATO = 'hestia-opening-types';
/** Versão do formato de tipos de abertura que este Hestia grava e lê. Arquivo mais novo é recusado. */
export const TIPOS_ABERTURA_VERSAO = 1;

/** Arquivo de tipos de abertura: os tipos escolhidos e os materiais que eles usam (os que existirem no projeto). */
export interface OpeningTypesFile {
  kind: typeof TIPOS_ABERTURA_FORMATO;
  schemaVersion: typeof TIPOS_ABERTURA_VERSAO;
  types: OpeningType[];
  materials: Material[];
}

/** Resultado da importação: os comandos a executar, os nomes que entram e os tipos pulados com o motivo. */
export interface ImportOpeningTypesResult {
  /** Materiais antes dos tipos. Vazio quando nada entra. */
  commands: Command[];
  /** Nomes dos tipos que entram no projeto, na ordem do arquivo. */
  imported: string[];
  skipped: Array<{ name: string; reason: string }>;
}

type CamposTipo = Partial<Record<keyof OpeningType, unknown>>;
type CamposMaterial = Partial<Record<keyof Material, unknown>>;

const LEAVES: readonly number[] = [0, 1, 2, 3, 4];
const FECHAMENTOS: readonly string[] = ['inherit', 'none', 'interior', 'exterior', 'both'];
const HACHURAS: readonly string[] = ['solid', 'diagonal', 'cross', 'dots', 'gesso', 'none'];
const UNIDADES: readonly string[] = ['m2', 'm3', 'm'];

const medida = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const texto = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
const entre = (x: unknown, min: number, max: number): boolean => medida(x) && x >= min && x <= max;

/** Cópia profunda: o que sai ou entra na biblioteca não compartilha objetos com o projeto. */
const copia = <T>(v: T): T => structuredClone(v);

/**
 * Trocam-se os ids de material de um tipo: qualquer campo `materialId` ou `*MaterialId`, em qualquer nível (folha,
 * vidro, soleira...). Devolve uma cópia com os ids trocados. Usado para listar e para reapontar os materiais.
 */
function trocaMateriais<T>(v: T, troca: (id: Id) => Id): T {
  if (Array.isArray(v)) return v.map((x: unknown) => trocaMateriais(x, troca)) as T;
  if (typeof v !== 'object' || v === null) return v;
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(v as Record<string, unknown>)) {
    const ehMaterial = chave === 'materialId' || chave.endsWith('MaterialId');
    saida[chave] = ehMaterial && texto(valor) ? troca(valor) : trocaMateriais(valor, troca);
  }
  return saida as T;
}

/** Ids de material que um tipo referencia, sem repetição. */
export function materiaisDoTipo(t: OpeningType): Id[] {
  const achados = new Set<Id>();
  trocaMateriais(t, (id) => {
    achados.add(id);
    return id;
  });
  return [...achados];
}

/** Códigos já usados no projeto (vazio não conta: é "não informado"). */
function codigosDo(p: Pick<Project, 'openingTypes'>): Set<string> {
  return new Set(Object.values(p.openingTypes).map((t) => t.code).filter((c): c is string => typeof c === 'string' && c !== ''));
}

/** `base` se ninguém usa; senão `base-2`, `base-3`... o primeiro livre. Código vazio fica vazio. */
function codigoLivre(base: string, usados: ReadonlySet<string>): string {
  if (!base || !usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Id de tipo que não está em `usados` (o gerado é único na prática; a checagem cobre o caso raro). */
function idLivre(usados: ReadonlySet<Id>): Id {
  let id = newId('ot');
  while (usados.has(id)) id = newId('ot');
  return id;
}

/** Cópia de um tipo do projeto com id novo, nome "<nome> (cópia)" e código livre. Não altera `p`. */
export function duplicateOpeningType(p: Project, id: Id, lang: Lang = 'pt'): OpeningType {
  const origem = p.openingTypes[id];
  if (!origem) throw new Error(t(lang, 'md_ot_not_found'));
  const copy = copia(origem);
  copy.id = idLivre(new Set(Object.keys(p.openingTypes)));
  copy.name = t(lang, 'md_doc_type_copy', { name: origem.name });
  if (origem.code) copy.code = codigoLivre(origem.code, codigosDo(p));
  return copy;
}

/** Arquivo com os tipos escolhidos e os materiais que eles referenciam (só os que existem no projeto). */
export function exportOpeningTypes(p: Project, ids: readonly Id[], lang: Lang = 'pt'): OpeningTypesFile {
  const types = [...new Set(ids)].map((id) => {
    const tipo = p.openingTypes[id];
    if (!tipo) throw new Error(t(lang, 'md_ot_not_found_id', { id }));
    return copia(tipo);
  });
  const usados = new Set<Id>(types.flatMap(materiaisDoTipo));
  const materials = [...usados].flatMap((id) => {
    const m = p.materials[id];
    return m ? [copia(m)] : [];
  });
  return { kind: TIPOS_ABERTURA_FORMATO, schemaVersion: TIPOS_ABERTURA_VERSAO, types, materials };
}

/** Recusa o que não é arquivo de tipos ou é de versão mais nova. Devolve as listas cruas para conferir uma a uma. */
function lerArquivo(data: unknown): { types: unknown[]; materials: unknown[] } {
  if (typeof data !== 'object' || data === null) throw new Error('O arquivo não é de tipos de esquadria do Hestia.');
  const d = data as Partial<Record<'kind' | 'schemaVersion' | 'types' | 'materials', unknown>>;
  if (d.kind !== TIPOS_ABERTURA_FORMATO) throw new Error('O arquivo não é de tipos de esquadria do Hestia.');
  if (typeof d.schemaVersion !== 'number' || !Number.isInteger(d.schemaVersion) || d.schemaVersion < 1) {
    throw new Error('Versão do arquivo ausente ou inválida.');
  }
  if (d.schemaVersion > TIPOS_ABERTURA_VERSAO) {
    throw new Error(
      `O arquivo é da versão ${d.schemaVersion} do formato de tipos, mais nova que a deste Hestia (versão ${TIPOS_ABERTURA_VERSAO}). Atualize o Hestia para importá-lo.`,
    );
  }
  if (!Array.isArray(d.types)) throw new Error('O arquivo não traz a lista de tipos.');
  return { types: d.types, materials: Array.isArray(d.materials) ? d.materials : [] };
}

/** Material com os campos do contrato. Campo fora do formato faz o material ser ignorado. */
function materialValido(v: unknown): v is Material {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as CamposMaterial;
  return (
    texto(m.id) &&
    typeof m.name === 'string' &&
    typeof m.color === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(m.color) &&
    typeof m.hatch === 'string' &&
    HACHURAS.includes(m.hatch) &&
    entre(m.gloss, 0, 1) &&
    entre(m.opacity, 0, 1) &&
    medida(m.cost) &&
    m.cost >= 0 &&
    typeof m.unit === 'string' &&
    UNIDADES.includes(m.unit)
  );
}

/** Mesmo conteúdo (o id não entra). */
const mesmoMaterial = (a: Material, b: Material): boolean =>
  a.name === b.name &&
  a.color.toLowerCase() === b.color.toLowerCase() &&
  a.hatch === b.hatch &&
  a.gloss === b.gloss &&
  a.opacity === b.opacity &&
  a.cost === b.cost &&
  a.unit === b.unit;

/** Motivo para o tipo não entrar, ou null quando ele está dentro do contrato (campos base e regra do modelo). */
function tipoIssue(v: unknown): string | null {
  if (typeof v !== 'object' || v === null) return 'não é um tipo de abertura';
  const t = v as CamposTipo;
  if (!texto(t.id)) return 'id ausente';
  if (!texto(t.name)) return 'nome ausente';
  if (t.kind !== 'door' && t.kind !== 'window') return 'deve ser porta ou janela';
  if (!medida(t.width) || t.width <= 0) return 'largura deve ser maior que zero';
  if (!medida(t.height) || t.height <= 0) return 'altura deve ser maior que zero';
  if (!medida(t.sill) || t.sill < 0) return 'peitoril inválido';
  if (typeof t.leaves !== 'number' || !LEAVES.includes(t.leaves)) return 'contagem de folhas inválida';
  if (!texto(t.plan)) return 'símbolo de planta ausente';
  if (!texto(t.frameMaterialId)) return 'material da esquadria ausente';
  if (!texto(t.glassMaterialId)) return 'material do vidro ausente';
  if (typeof t.closure !== 'string' || !FECHAMENTOS.includes(t.closure)) return 'fechamento do vão desconhecido';
  if (t.code !== undefined && typeof t.code !== 'string') return 'código inválido';
  if (t.description !== undefined && typeof t.description !== 'string') return 'descrição inválida';
  if (t.leafMaterialId !== undefined && !texto(t.leafMaterialId)) return 'material da folha inválido';
  const soleira = t.threshold as { materialId?: unknown } | undefined;
  if (soleira?.materialId !== undefined && !texto(soleira.materialId)) return 'material da soleira inválido';
  try {
    return openingTypeIssue(t as OpeningType);
  } catch {
    return 'valores fora do formato';
  }
}

/**
 * Traz tipos de um arquivo para o projeto. Recusa arquivo de outro formato ou de versão mais nova (lança erro em
 * português). Tipo inválido é pulado e listado. Colisão de id gera id novo; colisão de código ganha sufixo; material
 * que falta entra pelo id; material com o mesmo id e conteúdo diferente entra com id novo e o tipo é reapontado.
 * Um tipo pulado não deixa material nem código para trás.
 */
export function importOpeningTypes(p: Project, data: unknown): ImportOpeningTypesResult {
  const arq = lerArquivo(data);
  const idsTipo = new Set<Id>(Object.keys(p.openingTypes));
  const codigos = codigosDo(p);
  const idsMaterial = new Set<Id>(Object.keys(p.materials));
  const materiaisArquivo = new Map<Id, Material>();
  for (const m of arq.materials) {
    if (materialValido(m) && !materiaisArquivo.has(m.id)) materiaisArquivo.set(m.id, m);
  }
  /** Id do arquivo → id no projeto, para os materiais já resolvidos por tipos anteriores desta importação. */
  const mapaMaterial = new Map<Id, Id>();
  const comandosMaterial: Command[] = [];
  const comandosTipo: Command[] = [];
  const imported: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  const nomeDo = (v: unknown): string => {
    const nome = typeof v === 'object' && v !== null ? (v as CamposTipo).name : undefined;
    return texto(nome) ? nome : '(sem nome)';
  };

  for (const bruto of arq.types) {
    const nome = nomeDo(bruto);
    const motivo = tipoIssue(bruto);
    if (motivo) {
      skipped.push({ name: nome, reason: motivo });
      continue;
    }
    const tipo = copia(bruto as OpeningType);
    // Estado deste tipo: só vai para o projeto se o tipo inteiro passar.
    const mapaLocal = new Map<Id, Id>();
    const materiaisNovos: Material[] = [];
    const resolve = (ref: Id): Id | null => {
      const feito = mapaMaterial.get(ref) ?? mapaLocal.get(ref);
      if (feito) return feito;
      const fonte = materiaisArquivo.get(ref);
      const existente = p.materials[ref];
      if (!fonte) {
        if (!existente) return null;
        mapaLocal.set(ref, ref);
        return ref;
      }
      if (existente && mesmoMaterial(existente, fonte)) {
        mapaLocal.set(ref, ref);
        return ref;
      }
      // Id livre entra com o mesmo id; id ocupado por outro conteúdo recebe um id novo.
      const destino = existente || idsMaterial.has(ref) ? idMaterialLivre(idsMaterial) : ref;
      mapaLocal.set(ref, destino);
      materiaisNovos.push({ ...copia(fonte), id: destino });
      return destino;
    };
    const ausente = materiaisDoTipo(tipo).find((ref) => resolve(ref) === null);
    if (ausente !== undefined) {
      skipped.push({ name: nome, reason: `material "${ausente}" não está no arquivo nem no projeto` });
      continue;
    }
    const comMateriais = trocaMateriais(tipo, (ref) => resolve(ref) ?? ref);
    const novo: OpeningType = { ...comMateriais, id: idsTipo.has(comMateriais.id) ? idLivre(idsTipo) : comMateriais.id };
    if (novo.code) novo.code = codigoLivre(novo.code, codigos);

    for (const [de, para] of mapaLocal) mapaMaterial.set(de, para);
    for (const m of materiaisNovos) comandosMaterial.push({ type: 'upsertMaterial', material: m });
    comandosTipo.push({ type: 'upsertOpeningType', openingType: novo });
    idsTipo.add(novo.id);
    if (novo.code) codigos.add(novo.code);
    imported.push(novo.name);
  }

  return { commands: [...comandosMaterial, ...comandosTipo], imported, skipped };
}

/** Id de material livre, já reservado no conjunto (para dois materiais novos da mesma importação não colidirem). */
function idMaterialLivre(usados: Set<Id>): Id {
  let id = newId('mat');
  while (usados.has(id)) id = newId('mat');
  usados.add(id);
  return id;
}
