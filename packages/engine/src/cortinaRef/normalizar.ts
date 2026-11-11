/**
 * Normalização das sobrescritas da parede cortina (decisão 0056, §4.4 passos 5 e 6): a próxima edição da cortina remove as
 * órfãs e regrava as chaves adotadas (índice e posição novos), para a sobrescrita acompanhar a célula dali em diante.
 * Pura: devolve a instância nova; quem grava é o comando (`normalizarSobrescritas` roda no mesmo passo de desfazer).
 * Linhas extras e linhas de sobrescrita são regravadas na posição e no comprimento atuais; segmento órfão sai, segmento
 * ignorado por região não retangular fica (o aviso continua visível até o usuário corrigir).
 */
import { at, type AddedGridLine, type CellOverrideEntry, type CortinaEntrada, type CurtainInstanceRef, type LineOverride, type LineRef, type SegmentRef } from './tipos.ts';
import { resolverGrade, type GradeResolvida } from './grade.ts';
import { ESTADO, centroNorm, chaveDaCelula, refDaLinhaGerada } from './remap.ts';

/** Segmento de uma linha global (ver `segmentos.ts`) gravado como `SegmentRef` na grade `g` atual. */
function segmentoGravado(g: GradeResolvida, a: number, b: number): SegmentRef {
  const eixoNome = a <= g.nu ? 'u' : 'v';
  const eixo = eixoNome === 'u' ? g.u : g.v;
  const outro = eixoNome === 'u' ? g.v : g.u;
  // Linha interna: U = a (1..nu-1); V = a - nu - 1 (1..nv-1). A origem é indexada a partir de 0.
  const o = eixo.origens[eixoNome === 'u' ? a - 1 : a - g.nu - 2];
  const linha: LineRef = o?.origem === 'extra' && o.id !== undefined
    ? { added: o.id }
    : refDaLinhaGerada(eixoNome, o?.indiceGerado ?? 1, eixo.gerado);
  return { line: linha, k: b, nk: outro.n, mid: centroNorm(outro.bordas, b) };
}

export function normalizarSobrescritas(e: CortinaEntrada): CurtainInstanceRef {
  const inst = e.instancia ?? {};
  const g = resolverGrade(e);
  const out: CurtainInstanceRef = {};
  if (inst.grid) out.grid = inst.grid;
  if (inst.defaultPanelTypeId !== undefined) out.defaultPanelTypeId = inst.defaultPanelTypeId;

  const added: AddedGridLine[] = (inst.addedLines ?? []).map((a) => {
    const eixo = a.axis === 'u' ? g.u : g.v;
    const idx = eixo.origens.findIndex((o) => o.id === a.id);
    return idx >= 0 ? { ...a, pos: at(eixo.linhas, idx), comprimentoGravado: eixo.comprimento } : { ...a };
  });

  const cells: CellOverrideEntry[] = [];
  (inst.cells ?? []).forEach((c, ordem) => {
    const r = g.remap.celulas[ordem];
    if (r && r.estado === ESTADO.adotada) cells.push({ key: chaveDaCelula(g, r.a, r.b), override: c.override });
  });

  const linhas: LineOverride[] = [];
  (inst.lineOverrides ?? []).forEach((ov, ordem) => {
    const r = g.remap.linhas[ordem];
    if (!r || r.estado !== ESTADO.adotada) return;
    const no: LineOverride = { line: ov.line };
    if (!('added' in ov.line)) {
      const eixoNome = r.b === 0 ? 'u' : 'v';
      const eixo = eixoNome === 'u' ? g.u : g.v;
      const gi = eixo.origens[r.a - 1]?.indiceGerado;
      if (gi === undefined) return;
      no.line = refDaLinhaGerada(eixoNome, gi, eixo.gerado);
      if (ov.pos !== undefined) {
        no.pos = at(eixo.linhas, r.a - 1);
        no.comprimentoGravado = eixo.comprimento;
      }
    }
    if (ov.locked !== undefined) no.locked = ov.locked;
    if (ov.mullionTypeId !== undefined) no.mullionTypeId = ov.mullionTypeId;
    linhas.push(no);
  });

  const segs: SegmentRef[] = [];
  (inst.removedSegments ?? []).forEach((_, ordem) => {
    const r = g.remap.segmentos[ordem];
    if (r && r.estado === ESTADO.adotada) segs.push(segmentoGravado(g, r.a, r.b));
  });

  if (added.length > 0) out.addedLines = added;
  if (linhas.length > 0) out.lineOverrides = linhas;
  if (segs.length > 0) out.removedSegments = segs;
  if (cells.length > 0) out.cells = cells;
  return out;
}
