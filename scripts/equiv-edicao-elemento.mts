// Equivalência no projeto real: caminho rápido (atualizarAberturas) x remontagem completa, por edição.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolveLevel } from '@hestia/engine';
import { migrateProject, ProjectStore, type Id } from '@hestia/model';
import { ModelScene } from '@hestia/render';
import * as THREE from 'three';
const faixas = (ms: ModelScene): Map<string, number> => { const m = new Map<string, number>(); ms.scene.traverse((o) => { const rg = (o.userData as { ranges?: Array<{ id: string; count: number }> }).ranges; if (!rg || !(o instanceof THREE.Mesh)) return; for (const r of rg) m.set(r.id, (m.get(r.id) ?? 0) + r.count); }); return m; };
const p0 = migrateProject(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const O = { edges: true, shadows: true, dark: false };
const niveis = (p: typeof p0) => p.levels.map((l) => resolveLevel(p, l.id));
const hash = (ms: ModelScene): string => {
  const v = ms.exportarVetores();
  const r = (x: number): string => (Math.round(x * 1e4) / 1e4).toFixed(4);
  const tri: string[] = [];
  for (let i = 0; i < v.trianglePositions.length; i += 9) tri.push([0, 3, 6].map((k) => `${r(v.trianglePositions[i + k]!)},${r(v.trianglePositions[i + k + 1]!)},${r(v.trianglePositions[i + k + 2]!)}`).sort().join(' '));
  const ar: string[] = [];
  for (let i = 0; i + 5 < v.edges.length; i += 6) ar.push([`${r(v.edges[i]!)},${r(v.edges[i + 1]!)},${r(v.edges[i + 2]!)}`, `${r(v.edges[i + 3]!)},${r(v.edges[i + 4]!)},${r(v.edges[i + 5]!)}`].sort().join(' '));
  const h = (a: string[]): string => createHash('md5').update(a.sort().join('\n')).digest('hex').slice(0, 10);
  return `tri ${tri.length} ${h(tri)} arestas ${ar.length} ${h(ar)}`;
};
const ops = Object.values(p0.elements).filter((e) => e.kind === 'window' || e.kind === 'door') as Array<{ id: Id; kind: string; hostId: Id; offset: number }>;
const alvos = [ops.filter((o) => o.kind === 'window')[40]!, ops.filter((o) => o.kind === 'window')[90]!, ops.filter((o) => o.kind === 'door')[10]!, ops.filter((o) => o.kind === 'door')[200]!];
const rapido = new ModelScene();
if (process.env.NOFAST) (rapido as unknown as { atualizarAberturas: () => boolean }).atualizarAberturas = () => false;
rapido.update(p0, niveis(p0), O);
let atual = p0;
for (const o of alvos) {
  const cmds = [
    { nome: 'apagar ' + o.kind, cmd: { type: 'deleteElements', ids: [o.id] } },
    { nome: 'mover ' + o.kind, cmd: { type: 'updateElements', ids: [o.id], patch: { offset: o.offset + 0.15 } } },
  ];
  for (const { nome, cmd } of cmds) {
    const s = new ProjectStore(atual);
    s.exec(cmd as never);
    const p1 = s.project;
    const nivel = (atual.elements[o.hostId] as { levelId: Id }).levelId;
    const t = performance.now();
    const lv = resolveLevel(p1, nivel);
    const t1 = performance.now();
    const ok = rapido.atualizarAberturas(p1, atual, nivel, [o.hostId], lv, O);
    const t2 = performance.now();
    let msg = `${nome} ${o.id}: rápido=${ok}${ok ? '' : ' (recusa ' + rapido.ultimaRecusa + ')'} resolver ${(t1 - t).toFixed(0)} ms + cena ${(t2 - t1).toFixed(0)} ms`;
    if (ok) {
      const completo = new ModelScene();
      completo.update(p1, niveis(p1), O);
      const a = hash(rapido);
      const b = hash(completo);
      msg += a === b ? ` IGUAL (${a})` : ` DIFERENTE\n   rápido   ${a}\n   completo ${b}`;
      if (a !== b) { const fa = faixas(rapido); const fb = faixas(completo); for (const k of new Set([...fa.keys(), ...fb.keys()])) if (fa.get(k) !== fb.get(k)) msg += `
   id ${k}: rápido ${fa.get(k)} completo ${fb.get(k)}`; }
      if (a !== b) { const fa = faixas(rapido); const fb = faixas(completo); for (const k of new Set([...fa.keys(), ...fb.keys()])) if (fa.get(k) !== fb.get(k)) msg += `
   id ${k}: ${fa.get(k)} x completo ${fb.get(k)}`; }
      completo.dispose();
      atual = p1;
    } else {
      rapido.update(p1, niveis(p1), O);
      const completo = new ModelScene();
      completo.update(p1, niveis(p1), O);
      const a = hash(rapido);
      const b = hash(completo);
      msg += a === b ? ` | remontagem comum IGUAL ao completo` : ` | remontagem comum DIFERENTE do completo
   ${a}
   ${b}`;
      completo.dispose();
      atual = p1;
    }
    console.log(msg);
    if (nome.startsWith('apagar')) { s.undo(); const p2 = s.project; const ok2 = rapido.atualizarAberturas(p2, p1, nivel, [o.hostId], resolveLevel(p2, nivel), O); if (!ok2) rapido.update(p2, niveis(p2), O); atual = p2; }
  }
}
