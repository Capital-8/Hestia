import { classeIfcDaFamilia, isComponent, levelElevation, matrizDoComponente, type Component, type Familia, type Project } from '@hestia/model';
import { caixaDoComponente, malhaDoComponente, malhaDosCorpos, resolverComponente, type Malha, type ResolucaoFamilia } from '@hestia/engine';
import { gid, optStr, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { faceSetOf, tessellatedShape } from './ifcGeneric.ts';
import { addPropertySet, type PropValue } from './ifcProperties.ts';
import { localPlacement } from './ifcSolids.ts';
import { addConexoesDePortas, addPortas } from './ifcPortas.ts';
import { en, OMIT, ref, stepString } from './ifcStep.ts';

/** Nome do property set dos componentes de marcenaria e equipamentos colocados no projeto. */
const PSET_NAME = 'Pset_Hestia_Componente';

/** `PredefinedType` vem como enum IFC (ex.: `BEND`); texto livre ou fora desse formato sai omitido, para o arquivo continuar válido. */
const TIPO_PREDEFINIDO = /^[A-Z][A-Z_]*$/;

/** Nome do produto: o nome da família e a marca, quando a instância tem uma. */
function nomeDoComponente(p: Project, comp: Component): string {
  const familia = p.componentFamilies?.[comp.familyId]?.nome ?? comp.familyId;
  const marca = comp.mark.trim();
  return marca ? `${familia} ${marca}` : familia;
}

/** Propriedades do componente: família, tipo, marca, dimensões da caixa (mm) e a quantidade de peças não vazias. */
function propriedadesDoComponente(p: Project, comp: Component, res: ResolucaoFamilia): Array<[string, PropValue]> {
  const props: Array<[string, PropValue]> = [
    ['Familia', comp.familyId],
    ['Tipo', comp.typeId ?? 'padrao'],
    ['Marca', comp.mark],
    ['Pecas', res.pecas.filter((q) => !q.vazio).length],
  ];
  const caixa = caixaDoComponente(p, comp, res);
  if (caixa) {
    // A caixa vem em metros; o pset publica as três medidas em milímetros, como o resto da família.
    props.push(
      ['Largura', (caixa.max[0] - caixa.min[0]) * 1000],
      ['Altura', (caixa.max[2] - caixa.min[2]) * 1000],
      ['Profundidade', (caixa.max[1] - caixa.min[1]) * 1000],
    );
  }
  return props;
}

/** Malha no mundo com a transformação da instância (`matrizDoComponente`, coluna a coluna); espelho troca dois índices, como em `malhaDoComponente`. */
function malhaNoMundo(local: Malha, mat: readonly number[], espelha: boolean): Malha {
  const g = (i: number): number => mat[i] ?? 0;
  const positions = new Array<number>(local.positions.length);
  for (let i = 0; i < local.positions.length; i += 3) {
    const x = local.positions[i]!;
    const y = local.positions[i + 1]!;
    const z = local.positions[i + 2]!;
    positions[i] = g(0) * x + g(4) * y + g(8) * z + g(12);
    positions[i + 1] = g(1) * x + g(5) * y + g(9) * z + g(13);
    positions[i + 2] = g(2) * x + g(6) * y + g(10) * z + g(14);
  }
  const normals = new Array<number>(local.normals.length);
  for (let i = 0; i < local.normals.length; i += 3) {
    const x = local.normals[i]!;
    const y = local.normals[i + 1]!;
    const z = local.normals[i + 2]!;
    normals[i] = g(0) * x + g(4) * y + g(8) * z;
    normals[i + 1] = g(1) * x + g(5) * y + g(9) * z;
    normals[i + 2] = g(2) * x + g(6) * y + g(10) * z;
  }
  const indices = local.indices.slice();
  if (espelha) {
    for (let i = 0; i < indices.length; i += 3) {
      const troca = indices[i]!;
      indices[i] = indices[i + 1]!;
      indices[i + 1] = troca;
    }
  }
  return { positions, normals, indices, pecaDoTriangulo: local.pecaDoTriangulo.slice() };
}

/**
 * Malha sólida da instância no mundo: as peças (`malhaDoComponente`) e, quando a família tem corpos, a malha deles pela mesma
 * matriz. Sem corpos devolve a malha das peças como está (a saída das famílias antigas não muda).
 */
function malhaDoComponenteParaIfc(p: Project, comp: Component, res: ResolucaoFamilia): Malha {
  const pecas = malhaDoComponente(p, comp, res).solidas;
  const corpos = res.corpos ?? [];
  if (corpos.length === 0) return pecas;
  const mat = matrizDoComponente({ ...comp, z: levelElevation(p, comp.levelId) + comp.z });
  const dosCorpos = malhaNoMundo(malhaDosCorpos(corpos).solidas, mat, comp.mirrored);
  const base = pecas.positions.length / 3;
  return {
    positions: [...pecas.positions, ...dosCorpos.positions],
    normals: [...pecas.normals, ...dosCorpos.normals],
    indices: [...pecas.indices, ...dosCorpos.indices.map((i) => i + base)],
    pecaDoTriangulo: [...pecas.pecaDoTriangulo, ...dosCorpos.pecaDoTriangulo],
  };
}

/** Categorias que existiam antes da ADR 0061: a exportação delas continua `IFCFURNITURE` (decisão do orquestrador, 2026-11-24). */
const CATEGORIAS_ANTIGAS = new Set(['marcenaria', 'mobiliario', 'loucas', 'equipamento', 'generico']);

/**
 * Classe do produto: família antiga (categoria antiga, sem `ifc`, sem corpos e sem ligações) mantém `IFCFURNITURE` — o arquivo IFC dos
 * projetos existentes não muda. Com `ifc` explícito, corpos, ligações ou categoria nova vale `classeIfcDaFamilia` (CONTRATO §6).
 */
function classeDoProduto(f: Familia): string {
  const antiga = CATEGORIAS_ANTIGAS.has(f.categoria) && f.ifc === undefined && (f.corpos ?? []).length === 0 && (f.ligacoes ?? []).length === 0;
  return antiga ? 'IFCFURNITURE' : classeIfcDaFamilia(f);
}

/**
 * Componente colocado vira o produto IFC da classe da família (`classeIfcDaFamilia`; sem família no projeto, `IFCFURNITURE`):
 * `ObjectType` = id da família, `Name` = nome da família com a marca, `PredefinedType` = `Familia.ifc.tipoPredefinido` quando
 * existe (senão omitido) e o corpo em `IFCTRIANGULATEDFACESET` com a malha das peças e dos corpos sólidos (metros, cota local do
 * nível). Componente sem malha sai como produto sem forma. Família com ligações ganha `Pset_HestiaFamilia` e as portas.
 */
function addComponente(c: IfcCtx, comp: Component, portas: Map<string, number>): void {
  const st = storeyOf(c, comp.levelId);
  if (!st) return;
  const familia = c.p.componentFamilies?.[comp.familyId];
  const res = resolverComponente(c.p, comp);
  const malha = malhaDoComponenteParaIfc(c.p, comp, res);
  const faceSet = faceSetOf(c.w, malha, st.elev);
  const shape = faceSet === null ? OMIT : ref(tessellatedShape(c.w, c.ctx, faceSet));
  const place = localPlacement(c.w, st.place, [0, 0, 0]);
  const tipo = familia?.ifc?.tipoPredefinido;
  const produto = c.w.add(familia ? classeDoProduto(familia) : 'IFCFURNITURE', [
    gid(`component:${comp.id}`),
    OMIT,
    stepString(nomeDoComponente(c.p, comp)),
    OMIT,
    stepString(comp.familyId),
    ref(place),
    shape,
    optStr(comp.mark.trim() || undefined),
    tipo !== undefined && TIPO_PREDEFINIDO.test(tipo) ? en(tipo) : OMIT,
  ]);
  st.contained.push(produto);
  addPropertySet(c, `pset:component:${comp.id}`, PSET_NAME, propriedadesDoComponente(c.p, comp, res), produto);
  addPortas(c, comp, res, st, produto, portas);
}

/** Ordem estável dos componentes: a ordem de criação e, no empate, o id. */
const byOrderAndId = (a: Component, b: Component): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Componentes do projeto, depois dos elementos nativos e dos importados, contidos no pavimento pelo exportador. */
export function addComponents(c: IfcCtx): void {
  const portas = new Map<string, number>();
  for (const comp of Object.values(c.p.elements).filter(isComponent).sort(byOrderAndId)) addComponente(c, comp, portas);
  addConexoesDePortas(c, portas);
}
