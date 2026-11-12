/**
 * Sobrescritas da instância da parede cortina na forma do adaptador (decisão 0056, fase 2; §4.3 e §4.4): linhas extras (106), segmentos removidos
 * (107), linhas geradas sobrescritas (108) e painéis por célula (109). TS puro, sem geometria: só traduz `CurtainInstance` para
 * `SobrescritasCortinaKernel`. Quem remapeia, funde regiões e acusa órfãs é o Rust.
 *
 * Regras de tradução:
 * - Comprimento gravado: o modelo não guarda o comprimento do eixo na gravação. Ele já reescreve `pos` a cada mudança de L ou H
 *   (`ajustarCortinasAlteradas`), então a posição vale no comprimento ATUAL: `comprimentoGravado` é o do eixo agora.
 * - Linha extra com sobrescrita (`lineOverrides` com `added`): funde-se à extra como no resolvedor do modelo (`resolverParede`). A primeira
 *   sobrescrita de cada extra vale; a repetida não. Posição, travamento e montante da sobrescrita substituem os da extra quando vêm.
 * - Montante que não existe no projeto: a linha herda o do eixo (a posição e o travamento continuam valendo). Painel de célula que não existe:
 *   a célula sai (o validador do modelo já aponta a referência quebrada).
 * - Célula com abertura (porta ou janela, fase 5): entra como esquadria (seção 112) quando o chamador diz que o tipo existe (`tipoAberturaExiste`);
 *   sem a função, não entra (comportamento da fase 2). Painel e esquadria na mesma célula: o Rust deixa a esquadria vencer.
 * - Desvio: o kernel não tem "sem montante" para uma linha EXTRA (só para a gerada). Extra com `mullionTypeId: null` herda o montante do
 *   eixo até o contrato ganhar o modo para extras. A linha gerada com `null` vai como "sem montante" normalmente.
 *
 * Os ids que o adaptador usa para internar as linhas são: a extra pelo id dela (estável), a sobrescrita e o segmento pelo índice dentro da
 * cortina (únicos por construção no modelo; `normalizarParede` mantém a lista limpa).
 */
import type { AddedGridLine, CurtainInstance, CurtainPanelType, Id, LineOverride, LineRef, MullionType } from '@hestia/model';
import type { SobrescritasCortinaKernel } from './kernelCortina.ts';

/** Linha gerada (índice na gravação): a forma de `LineRef` que não é extra. */
type LinhaGerada = Extract<LineRef, { axis: 'u' | 'v' }>;

/** Sobrescritas de uma cortina traduzidas, e os tipos de montante e de painel que elas referenciam (o adaptador precisa deles na entrada). */
export interface SobrescritasDaInstancia {
  /** Ausente quando a instância não tem nada a sobrescrever: o kernel recebe a cortina sem as seções 106 a 109. */
  sobrescritas?: SobrescritasCortinaKernel;
  montantes: Id[];
  paineis: Id[];
  /** Tipos de abertura referenciados pelas esquadrias das células (fase 5): o adaptador precisa deles na seção 7. */
  aberturas: Id[];
}

/**
 * `inst` é a instância do modelo; `comprimento` o L (eixo U) e o H (eixo V) atuais, que viram o `comprimentoGravado`; `mont` e `pain` os tipos do
 * projeto, para só referenciar o que existe.
 */
export function sobrescritasDaInstancia(
  inst: CurtainInstance | undefined,
  comprimento: { u: number; v: number },
  mont: Readonly<Record<Id, MullionType>>,
  pain: Readonly<Record<Id, CurtainPanelType>>,
  /** O tipo de abertura existe no projeto? Sem a função, as esquadrias das células não entram (como na fase 2). */
  tipoAberturaExiste?: (id: Id) => boolean,
): SobrescritasDaInstancia {
  const montantes = new Set<Id>();
  const paineis = new Set<Id>();
  const aberturas = new Set<Id>();
  const montanteValido = (id: Id | undefined): Id | undefined => {
    if (id === undefined || !mont[id]) return undefined;
    montantes.add(id);
    return id;
  };

  // Extras: a primeira de cada id vale (como o modelo); eixo inválido não entra.
  const extras = new Map<Id, AddedGridLine>();
  for (const ex of inst?.addedLines ?? []) {
    if ((ex.axis === 'u' || ex.axis === 'v') && !extras.has(ex.id)) extras.set(ex.id, ex);
  }
  const sobreExtra = new Map<Id, LineOverride>();
  const sobreGerada: Array<{ ov: LineOverride; line: LinhaGerada }> = [];
  for (const ov of inst?.lineOverrides ?? []) {
    if ('added' in ov.line) {
      if (extras.has(ov.line.added) && !sobreExtra.has(ov.line.added)) sobreExtra.set(ov.line.added, ov);
    } else {
      sobreGerada.push({ ov, line: ov.line });
    }
  }

  const linhasExtras: NonNullable<SobrescritasCortinaKernel['linhasExtras']>[number][] = [];
  for (const ex of extras.values()) {
    const ov = sobreExtra.get(ex.id);
    const montante = montanteValido(ov?.mullionTypeId !== undefined ? (ov.mullionTypeId ?? undefined) : (ex.mullionTypeId ?? undefined));
    linhasExtras.push({
      id: ex.id,
      eixo: ex.axis,
      pos: ov?.pos ?? ex.pos,
      travada: (ov?.locked ?? ex.locked) === true,
      comprimentoGravado: comprimento[ex.axis],
      ...(montante !== undefined ? { montante } : {}),
    });
  }

  const segmentosRemovidos: NonNullable<SobrescritasCortinaKernel['segmentosRemovidos']>[number][] = [];
  for (const sg of inst?.removedSegments ?? []) {
    const medida = { k: sg.k, nk: sg.nk, mid: sg.mid };
    if ('added' in sg.line) {
      // Segmento de extra que não existe mais: sai junto com a extra (o modelo também o descarta).
      const ex = extras.get(sg.line.added);
      if (ex) segmentosRemovidos.push({ eixo: ex.axis, origem: 'extra', linha: ex.id, ...medida });
    } else if (sg.line.axis === 'u' || sg.line.axis === 'v') {
      segmentosRemovidos.push({ eixo: sg.line.axis, origem: 'gerada', linha: sg.line.index, posNorm: sg.line.pos, n: sg.line.n, ...medida });
    }
  }

  const linhasSobrescritas: NonNullable<SobrescritasCortinaKernel['linhasSobrescritas']>[number][] = [];
  for (const { ov, line } of sobreGerada) {
    // `null` = esta linha sem montante (o kernel aceita "sem montante" na gerada); tipo inexistente = herda.
    const montante = ov.mullionTypeId === null ? null : montanteValido(ov.mullionTypeId ?? undefined);
    linhasSobrescritas.push({
      eixo: line.axis,
      linha: line.index,
      n: line.n,
      posNorm: line.pos,
      travada: ov.locked === true,
      comprimentoGravado: comprimento[line.axis],
      ...(ov.pos !== undefined ? { pos: ov.pos } : {}),
      ...(montante !== undefined ? { montante } : {}),
    });
  }

  const celulasSobrescritas: NonNullable<SobrescritasCortinaKernel['celulasSobrescritas']>[number][] = [];
  const esquadrias: NonNullable<SobrescritasCortinaKernel['esquadrias']>[number][] = [];
  for (const e of inst?.cells ?? []) {
    if (e.override.kind === 'opening') {
      // Esquadria na célula (fase 5): referencia um tipo de abertura do projeto; tipo ausente não entra (o validador do modelo o aponta).
      const o = e.override;
      if (!tipoAberturaExiste?.(o.openingTypeId)) continue;
      aberturas.add(o.openingTypeId);
      esquadrias.push({
        i: e.key.i,
        j: e.key.j,
        nu: e.key.nu,
        nv: e.key.nv,
        s: e.key.s,
        z: e.key.z,
        tipoAbertura: o.openingTypeId,
        flipHand: o.flipHand,
        flipFacing: o.flipFacing,
        fit: o.fit ?? 'cell',
        ...(o.align ? { align: o.align } : {}),
        ...(typeof o.sillOverride === 'number' ? { sillOverride: o.sillOverride } : {}),
      });
      continue;
    }
    if (e.override.kind !== 'panel') continue;
    const painel = e.override.panelTypeId;
    if (!pain[painel]) continue;
    paineis.add(painel);
    celulasSobrescritas.push({ i: e.key.i, j: e.key.j, nu: e.key.nu, nv: e.key.nv, s: e.key.s, z: e.key.z, painel });
  }

  const sob: SobrescritasCortinaKernel = {};
  if (linhasExtras.length > 0) sob.linhasExtras = linhasExtras;
  if (segmentosRemovidos.length > 0) sob.segmentosRemovidos = segmentosRemovidos;
  if (linhasSobrescritas.length > 0) sob.linhasSobrescritas = linhasSobrescritas;
  if (celulasSobrescritas.length > 0) sob.celulasSobrescritas = celulasSobrescritas;
  if (esquadrias.length > 0) sob.esquadrias = esquadrias;
  const algo = Object.keys(sob).length > 0;
  return { ...(algo ? { sobrescritas: sob } : {}), montantes: [...montantes], paineis: [...paineis], aberturas: [...aberturas] };
}
