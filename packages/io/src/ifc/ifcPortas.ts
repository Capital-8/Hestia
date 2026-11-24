import { isComponent, levelElevation, pontoNoMundo, type Component, type Project } from '@hestia/model';
import type { LigacaoResolvida, ResolucaoFamilia } from '@hestia/engine';
import { gid, type IfcCtx, type IfcStorey } from './ifcCtx.ts';
import { addPropertySet, type PropValue } from './ifcProperties.ts';
import { localPlacement } from './ifcSolids.ts';
import { en, OMIT, ref, stepString } from './ifcStep.ts';

/*
 * Portas de ligação (ficha E2, CONTRATO §3 e §6): cada `LigacaoResolvida` da família vira um `IFCDISTRIBUTIONPORT` ligado ao
 * produto por `IFCRELCONNECTSPORTTOELEMENT`, e cada par de ligações conectadas (`Component.ligacoes`) vira um
 * `IFCRELCONNECTSPORTS`, uma vez por par. Família sem ligação não gera nada aqui.
 */

/** Nome do property set das portas e dos produtos com ligações (tipo: o que vem da família; instância: as conexões). */
const PSET_FAMILIA = 'Pset_HestiaFamilia';

/** Fluxo da ligação → `FlowDirection`: `entrada` recebe o fluxo no corpo (SINK), `saida` entrega (SOURCE). CONFERIR: sentido. */
const FLUXO_IFC: Record<LigacaoResolvida['fluxo'], string> = {
  entrada: 'SINK',
  saida: 'SOURCE',
  ambos: 'SOURCEANDSINK',
};

/**
 * Domínio → `SystemType` (`IfcDistributionSystemEnum`). CONFERIR: nomes do enum de memória (eletroduto e eletrocalha caem em
 * ELECTRICAL; estrutural não tem sistema e sai NOTDEFINED).
 */
const SISTEMA_IFC: Record<LigacaoResolvida['dominio'], string> = {
  agua_fria: 'DOMESTICCOLDWATER',
  agua_quente: 'DOMESTICHOTWATER',
  esgoto: 'SEWAGE',
  ventilacao: 'VENT',
  pluvial: 'RAINWATER',
  gas: 'GAS',
  incendio: 'FIREPROTECTION',
  eletrica_forca: 'ELECTRICAL',
  eletrica_dados: 'DATA',
  eletroduto: 'ELECTRICAL',
  eletrocalha: 'ELECTRICAL',
  ar_insuflamento: 'VENTILATION',
  ar_retorno: 'VENTILATION',
  refrigerante: 'REFRIGERATION',
  estrutural: 'NOTDEFINED',
};

/** Chave da porta de uma ligação de uma instância: `componenteId|ligacaoId`. */
export const chaveDaPorta = (componenteId: string, ligacaoId: string): string => `${componenteId}|${ligacaoId}`;

/** Ponto local da família (m) no mundo, com a elevação do nível e a inclinação/espelho da instância. */
function noMundo(p: Project, comp: Component, local: readonly [number, number, number]): [number, number, number] {
  const alvo = { ...comp, z: levelElevation(p, comp.levelId) + comp.z };
  const m = pontoNoMundo(alvo, { x: local[0], y: local[1], z: local[2] });
  return [m.x, m.y, m.z];
}

/** Direção local (sentido para fora) no mundo: a diferença entre a transformada de `local` e a da origem da família. */
function direcaoNoMundo(p: Project, comp: Component, direcao: readonly [number, number, number]): [number, number, number] {
  const a = noMundo(p, comp, direcao);
  const b = noMundo(p, comp, [0, 0, 0]);
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Propriedades da porta: as de tipo (vêm da família; medidas em mm) e a direção no mundo. */
function propriedadesDaPorta(lig: LigacaoResolvida, direcao: readonly [number, number, number]): Array<[string, PropValue]> {
  const props: Array<[string, PropValue]> = [
    ['Dominio', lig.dominio],
    ['Secao', lig.secao],
    ['Fluxo', lig.fluxo],
    ['DirecaoX', direcao[0]],
    ['DirecaoY', direcao[1]],
    ['DirecaoZ', direcao[2]],
  ];
  if (lig.sistema) props.push(['Sistema', lig.sistema]);
  if (lig.diametro > 0) props.push(['Diametro', lig.diametro * 1000]);
  if (lig.largura > 0) props.push(['Largura', lig.largura * 1000]);
  if (lig.altura > 0) props.push(['Altura', lig.altura * 1000]);
  for (const [nome, valor] of Object.entries(lig.propriedades)) {
    if (Number.isFinite(valor)) props.push([nome, valor]);
  }
  return props;
}

/**
 * Portas de uma instância: um `IFCDISTRIBUTIONPORT` por ligação resolvida, na colocação do pavimento (cota local), ligado ao
 * `produto` por `IFCRELCONNECTSPORTTOELEMENT`. As portas vão para `portas` (por `chaveDaPorta`), para o `IFCRELCONNECTSPORTS`.
 * Atributos da porta (IFC4): GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation,
 * FlowDirection, PredefinedType (omitido), SystemType. CONFERIR: ordem e presença de PredefinedType no `IfcDistributionPort`.
 */
export function addPortas(
  c: IfcCtx,
  comp: Component,
  res: ResolucaoFamilia,
  st: IfcStorey,
  produto: number,
  portas: Map<string, number>,
): void {
  const familia = c.p.componentFamilies?.[comp.familyId];
  for (const lig of res.ligacoes ?? []) {
    const [x, y, z] = noMundo(c.p, comp, lig.posicao);
    const place = localPlacement(c.w, st.place, [x, y, z - st.elev]);
    const porta = c.w.add('IFCDISTRIBUTIONPORT', [
      gid(`porta:${comp.id}:${lig.id}`),
      OMIT,
      stepString(lig.nome),
      OMIT,
      OMIT,
      ref(place),
      OMIT,
      en(FLUXO_IFC[lig.fluxo]),
      OMIT,
      en(SISTEMA_IFC[lig.dominio]),
    ]);
    c.w.add('IFCRELCONNECTSPORTTOELEMENT', [gid(`porta-elemento:${comp.id}:${lig.id}`), OMIT, OMIT, OMIT, ref(porta), ref(produto)]);
    const direcao = direcaoNoMundo(c.p, comp, lig.direcao);
    addPropertySet(c, `pset:porta:${comp.id}:${lig.id}`, PSET_FAMILIA, propriedadesDaPorta(lig, direcao), porta);
    portas.set(chaveDaPorta(comp.id, lig.id), porta);
  }
  if ((res.ligacoes?.length ?? 0) > 0 && familia) {
    const conexoes = Object.keys(comp.ligacoes ?? {}).length;
    addPropertySet(
      c,
      `pset:familia:${comp.id}`,
      PSET_FAMILIA,
      [['Categoria', familia.categoria], ['Ligacoes', res.ligacoes?.length ?? 0], ['Conexoes', conexoes]],
      produto,
    );
  }
}

/**
 * `IFCRELCONNECTSPORTS` de cada par de portas conectadas (`Component.ligacoes`, simétrico): uma relação por par, mesmo que a
 * conexão esteja escrita nos dois lados. Par com alguma porta ausente (instância sem pavimento) não sai.
 */
export function addConexoesDePortas(c: IfcCtx, portas: ReadonlyMap<string, number>): void {
  const feitas = new Set<string>();
  const instancias = Object.values(c.p.elements).filter(isComponent).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const comp of instancias) {
    for (const [ligacaoId, cx] of Object.entries(comp.ligacoes ?? {})) {
      const par = [chaveDaPorta(comp.id, ligacaoId), chaveDaPorta(cx.componenteId, cx.ligacaoId)].sort();
      const [chaveA, chaveB] = par;
      if (chaveA === undefined || chaveB === undefined) continue;
      const chave = `${chaveA}~${chaveB}`;
      if (feitas.has(chave)) continue;
      const a = portas.get(chaveA);
      const b = portas.get(chaveB);
      if (a === undefined || b === undefined) continue;
      feitas.add(chave);
      c.w.add('IFCRELCONNECTSPORTS', [gid(`conexao:${chave}`), OMIT, OMIT, OMIT, ref(a), ref(b), OMIT]);
    }
  }
}
