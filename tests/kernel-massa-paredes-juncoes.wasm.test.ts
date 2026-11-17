/**
 * Massa M2, fase 1a: as paredes inclinadas geradas pela massa fecham nas junções com as vizinhas da MESMA cadeia? Sobre o kernel REAL, M3 (torre torcida) e
 * M4 (bulbo) viram paredes por passo no projeto; confere-se, nas extremidades de todas as paredes de um nível, o estado de junção do motor (`joinStatus`), as
 * junções inclinadas (`analyzeLevelTilt`), os avisos de junção inclinada e a sobreposição de paredes colineares empilhadas (que NÃO é sobreposição: faixas de cota
 * disjuntas). Medido: a torre torcida fecha só em pares dentro do passo (nenhuma junção entre passos empilhados) e sem aviso; o bulbo tem aviso de inclinação
 * inviável na junção em faces curtas muito inclinadas (plano B do motor: corte simples).
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, comandoDerivarParedes, isWall, validateProject, type Project } from '@hestia/model';
import { ServicoMassa, analyzeLevelTilt, derivarParedesInclinadasDaMassa, resolveLevel, wallTiltJoinIssues, type OpcoesParedesTorcidas } from '../packages/engine/src/index.ts';
import { joinStatus } from '../packages/engine/src/joins.ts';
import { levelFrames } from '../packages/engine/src/resolveFrames.ts';
import { projetoComMassas } from '../packages/engine/src/fixtureMassa.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
beforeAll(async () => {
  if (bytes) ger = await GerenciadorKernelV2.dosBytes(bytes);
});
const srv = (): ServicoMassa => new ServicoMassa(() => ger);

/** Projeto com as paredes da massa nos `n` primeiros níveis, e o nível do térreo. */
function geraParedes(massa: string, n: number, opt: OpcoesParedesTorcidas): { p: Project; terreo: string } {
  const base = projetoComMassas();
  const ids = [...base.levels].sort((a, b) => a.elevation - b.elevation).map((l) => l.id);
  const niveis = ids.slice(0, n);
  const r = derivarParedesInclinadasDaMassa(base, massa, niveis, opt, srv(), srv())!;
  const s = new ProjectStore(base);
  const cadeias = r.porNivel.flatMap((nv) => nv.passos.flatMap((ps) => ps.cadeias.map((c) => ({ nivelId: nv.nivelId, pontos: c.pontos, tilts: c.tilts, baseOffset: ps.baseOffset, topoNivelId: ps.topoNivelId, altura: ps.altura }))));
  s.exec(comandoDerivarParedes(s.project, { massaId: massa, typeId: Object.keys(base.wallTypes)[0]!, niveis, cadeias, locationLine: 'finishExterior' }));
  return { p: s.project, terreo: ids[0]! };
}

/** Histograma dos estados de junção das pontas do nível e quantas parcerias cruzam passos empilhados (baseOffset diferente). */
function junções(p: Project, nivel: string): { hist: Record<string, number>; cruzadas: number } {
  const frames = levelFrames(p, nivel);
  const hist: Record<string, number> = {};
  let cruzadas = 0;
  for (const f of frames) {
    for (const ponta of ['a', 'b'] as const) {
      const st = joinStatus(frames, f.wall.id, ponta);
      hist[st.kind] = (hist[st.kind] ?? 0) + 1;
      const outros = st.kind === 'pair' || st.kind === 'node' ? st.partners.map((q) => q.wallId) : st.kind === 'tee' ? [st.hostId] : [];
      for (const o of outros) if (Math.abs((p.elements[o] as { baseOffset: number }).baseOffset - f.wall.baseOffset) > 1e-9) cruzadas++;
    }
  }
  return { hist, cruzadas };
}

const avisosDeParede = (p: Project): number => validateProject(p).filter((i) => i.elementId && isWall(p.elements[i.elementId])).length;

describe('massa M2: junções das paredes inclinadas da mesma cadeia', () => {
  it.skipIf(!bytes)('M3, 1 passo por andar: 4 paredes, todas as 8 pontas em par, nenhum aviso de junção ou de parede', () => {
    const { p, terreo } = geraParedes('m3', 1, { modo: 'porNivel' });
    expect(Object.values(p.elements).filter(isWall)).toHaveLength(4);
    expect(junções(p, terreo)).toEqual({ hist: { pair: 8 }, cruzadas: 0 });
    expect(wallTiltJoinIssues(p)).toEqual([]);
    expect(avisosDeParede(p)).toBe(0);
  });

  it('(M3, tolerância padrão) 16 passos empilhados no térreo: 64 paredes, 128 pontas em par, sem junção entre passos, sem avisos e sem falsa sobreposição', () => {
    if (!bytes) return;
    const { p, terreo } = geraParedes('m3', 1, {});
    expect(Object.values(p.elements).filter(isWall)).toHaveLength(64);
    expect(junções(p, terreo)).toEqual({ hist: { pair: 128 }, cruzadas: 0 });
    const frames = levelFrames(p, terreo);
    const an = analyzeLevelTilt(frames, new Map(Object.values(resolveLevel(p, terreo).walls).map((w) => [w.wallId, w.height] as const)));
    expect([an.joins.size, an.cunhas.length, an.avisos.length]).toEqual([64, 0, 0]);
    expect(wallTiltJoinIssues(p)).toEqual([]);
    expect(avisosDeParede(p)).toBe(0);
  });

  it('(M4 bulbo, 5 níveis) 480 paredes todas em par, mas 38 avisos de inclinação inviável na junção (faces curtas e muito inclinadas)', () => {
    if (!bytes) return;
    const { p, terreo } = geraParedes('m4', 5, {});
    expect(Object.values(p.elements).filter(isWall)).toHaveLength(480);
    expect(junções(p, terreo).cruzadas).toBe(0);
    expect(wallTiltJoinIssues(p)).toHaveLength(38);
  });
});
