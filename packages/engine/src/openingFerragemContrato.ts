import type { OpeningModel, OpeningPart } from './openingModelTypes.ts';
import { anelDaPeca, dentroDoAnel, fatiaEm, folgaAte, folgaAteAlguma, type Anel } from './openingFerragemGeom.ts';

/*
 * Contrato de posição válida das ferragens em vão com forma (docs/estudo-esquadrias/42), como verificador: devolve as violações
 * (vazio = tudo certo). Usado pelos testes de varredura e pela validação do projeto. Tolerância de contato e de contorno: 1 mm.
 *
 * Dobradiça: (a) dentro do contorno; (b) encostada na folha; (c) encostada no batente (quando o modelo tem batente ou divisor);
 * (d) a aresta da folha existe (largura >= 6 cm) em toda a altura dela mais 2 cm em cada ponta; (e) espaçamento >= 2 x altura e
 * regular, quantidade igual à do vão retangular ou reduzida COM aviso; (f) do mesmo lado do eixo que no vão retangular.
 * Maçaneta: dentro do contorno, todos os pontos sobre a folha (folha, vidro, almofadas; as peças assentadas na face, sobre a madeira) e uma peça encostada nela; ou removida COM aviso.
 */

const TOL = 1e-3;
const FACE: ReadonlySet<string> = new Set(['leaf', 'glass', 'leafPanel']);

const chaveH = (id: string): string => /^hinge-(.+)-\d+$/.exec(id)?.[1] ?? id;
const chaveM = (id: string): string => id.split('-')[1] ?? id;
const centroZ = (p: OpeningPart): number => (p.box.z0 + p.box.z1) / 2;

function agrupa(ps: readonly OpeningPart[], chave: (id: string) => string): Map<string, OpeningPart[]> {
  const out = new Map<string, OpeningPart[]>();
  for (const p of ps) out.set(chave(p.id), [...(out.get(chave(p.id)) ?? []), p]);
  return out;
}

/** Lado do eixo (-1 esquerda, +1 direita) da dobradiça em relação ao centro do vão retangular da folha de mesma chave; 0 se não há folha. */
function ladoDoEixo(m: OpeningModel, chave: string, h: OpeningPart): number {
  const f = m.parts.filter((p) => p.role === 'leaf' && !p.dashed && (p.id === `leaf-${chave}` || p.id.startsWith(`leaf-${chave}-`)));
  if (f.length === 0) return 0;
  const c = (Math.min(...f.map((p) => p.box.t0)) + Math.max(...f.map((p) => p.box.t1))) / 2;
  return Math.sign((h.box.t0 + h.box.t1) / 2 - c);
}

/** Violações do contrato nas dobradiças e na maçaneta de `m` (modelo com forma). `sem` é o mesmo vão retangular; `ring` o contorno da esquadria. */
export function violacoesDeFerragem(m: OpeningModel, sem: OpeningModel, ring: Anel): string[] {
  const v: string[] = [];
  const avisos = m.ferragemAvisos ?? [];
  const quadro = m.parts.filter((p) => p.material === 'frame' && ['jamb', 'head', 'mullion', 'transom'].includes(p.role) && anelDaPeca(p).every(([x, z]) => dentroDoAnel(ring, x, z, 2 * TOL)));
  const grupoSem = agrupa(sem.parts.filter((p) => p.role === 'hinge'), chaveH);
  for (const [chave, hs] of agrupa(m.parts.filter((p) => p.role === 'hinge'), chaveH)) {
    const pedido = grupoSem.get(chave)?.length ?? hs.length;
    if (hs.length > pedido) v.push(`dobradiça ${chave}: ${hs.length} > pedido ${pedido}`);
    if (hs.length < pedido && !avisos.some((a) => a.tipo === 'hinge' && a.folha === chave && a.pedido === pedido && a.colocado === hs.length)) v.push(`dobradiça ${chave}: reduzida a ${hs.length} de ${pedido} sem aviso`);
    const folha = m.parts.filter((p) => p.role === 'leaf' && !p.dashed && (p.id === `leaf-${chave}` || p.id.startsWith(`leaf-${chave}-`)));
    if (folha.length === 0) continue;
    const aneis = folha.map(anelDaPeca);
    const zs = hs.map(centroZ).sort((a, b) => a - b);
    const ref = grupoSem.get(chave)?.[0];
    for (const h of hs) {
      const b = h.box;
      const cantos = [[b.t0, b.z0], [b.t1, b.z0], [b.t1, b.z1], [b.t0, b.z1]] as const;
      if (cantos.some(([x, z]) => !dentroDoAnel(ring, x, z, TOL))) v.push(`${h.id}: fora do contorno`);
      const gf = folgaAteAlguma(b, folha);
      if (gf > TOL) v.push(`${h.id}: solta da folha (${gf.toFixed(4)} m)`); // units-ok: texto técnico do diagnóstico, em m
      if (quadro.length > 0) {
        const gq = folgaAteAlguma(b, quadro);
        if (gq > TOL) v.push(`${h.id}: solta do batente (${gq.toFixed(4)} m)`); // units-ok: texto técnico do diagnóstico, em m
      }
      for (let z = b.z0 - 0.02; z <= b.z1 + 0.02 + 1e-9; z += 0.005) {
        const f = fatiaEm(aneis, z);
        if (!f || f.max - f.min < 0.06) {
          v.push(`${h.id}: sem aresta de articulação em z=${z.toFixed(3)}`); // units-ok: texto técnico do diagnóstico, em m
          break;
        }
      }
      // lado do eixo: o do vão retangular, e a dobradiça fica na aresta da folha DESSE lado (extremo da fatia, a até 5 cm: 4 cm de desvio + a caixa)
      const lado = ref ? ladoDoEixo(sem, chave, ref) : 0;
      const fatia = fatiaEm(aneis, centroZ(h));
      const tc = (b.t0 + b.t1) / 2;
      if (lado !== 0 && (!fatia || Math.abs((lado < 0 ? fatia.min : fatia.max) - tc) > 0.05)) v.push(`${h.id}: lado do eixo trocado`);
    }
    const esp = 2 * (hs[0]!.box.z1 - hs[0]!.box.z0);
    const passos = zs.slice(1).map((z, i) => z - zs[i]!);
    if (passos.some((d) => d < esp - 1e-9)) v.push(`dobradiças ${chave}: espaçamento < 2 x altura`);
    if (passos.length >= 2 && Math.max(...passos) - Math.min(...passos) > 1e-3) v.push(`dobradiças ${chave}: distribuição irregular`);
  }
  const maosSem = new Set(sem.parts.filter((p) => p.role === 'handle').map((p) => chaveM(p.id)));
  const maos = agrupa(m.parts.filter((p) => p.role === 'handle'), chaveM);
  for (const chave of maosSem) {
    const g = maos.get(chave);
    if (!g) {
      if (!avisos.some((a) => a.tipo === 'handle' && a.folha === chave && a.colocado === 0)) v.push(`maçaneta ${chave}: removida sem aviso`);
      continue;
    }
    const idx = g[0]!.leaf;
    const faces = m.parts.filter((p) => FACE.has(p.role) && !p.dashed && idx !== undefined && p.leaf === idx);
    const aneisFace = faces.map(anelDaPeca);
    const madeira = faces.filter((p) => p.role === 'leaf');
    const [ms0, ms1] = [Math.min(...madeira.map((p) => p.box.s0)), Math.max(...madeira.map((p) => p.box.s1))];
    for (const p of g) {
      const assentada = Math.max(0, p.box.s0 - ms1, ms0 - p.box.s1) <= TOL;
      const base = assentada ? madeira.map(anelDaPeca) : aneisFace;
      const pts: Anel = p.profile?.plane === 'tz' ? p.profile.pts : [[p.box.t0, p.box.z0], [p.box.t1, p.box.z0], [p.box.t1, p.box.z1], [p.box.t0, p.box.z1]];
      if (pts.some(([x, z]) => !dentroDoAnel(ring, x, z, TOL))) v.push(`${p.id}: fora do contorno`);
      if (pts.some(([x, z]) => !base.some((a) => dentroDoAnel(a, x, z, TOL)))) v.push(`${p.id}: ${assentada ? 'sai da madeira da folha' : 'sai da folha'}`);
    }
    if (faces.length > 0 && Math.min(...g.map((p) => Math.min(...faces.map((f) => folgaAte(p.box, f))))) > TOL) v.push(`maçaneta ${chave}: solta da folha`);
  }
  return v;
}
