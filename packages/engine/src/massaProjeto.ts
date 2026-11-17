/**
 * Liga o modelo da massa ao adaptador do kernel (plano de massa, A.5 e A.8 item 4): do `Project` à `EntradaMassaKernel` (`kernelMassa.ts`), e as
 * assinaturas de geometria por massa. TS puro, sem kernel: nada aqui calcula anel, fatia ou malha (isso é do Rust).
 *
 * Assinatura: hash do que o kernel recebe da massa (origem, cota da base, interpolação, resolução, arranjo e seções). Cor e nome NÃO entram: mudar
 * só a cor não muda a geometria. A assinatura geral junta as de todas as massas com a ordem e as cotas dos níveis (a seção `niveis`).
 *
 * Massa que o modelo recusa (`massIssue`) e massa de nível inexistente ficam FORA do envio: o kernel nunca recebe o que o modelo não aceitaria, e
 * o painel mostra `massa-invalida` (`massaIssues.ts`). As demais continuam calculadas.
 */
import { isMass, massIssue, type Id, type Mass, type Project, type SecaoMassa } from '@hestia/model';
import { hashTexto } from './assinaturasNivel.ts';
import { FORMA_MASSA, INTERP_MASSA, type EntradaMassaKernel, type MassaKernel, type SecaoKernelMassa } from './kernelMassa.ts';

/** Resultado da ligação modelo → kernel. */
export interface EntradaMassaProjeto {
  entrada: EntradaMassaKernel;
  /** `nivel_num` por nível (índice em `p.levels`). */
  nivelDe: Map<Id, number>;
  /** Id do nível por `nivel_num` (índice = `nivel_num`). */
  idsDosNiveis: Id[];
  /** Massas enviadas ao kernel, na ordem de envio. */
  enviadas: Id[];
  /** Massas que não vão ao kernel: recusadas pelo modelo ou em nível inexistente. */
  invalidas: Id[];
  /** Hash de cada massa enviada (geometria). */
  assinaturas: Map<Id, string>;
  /** Hash de todas as massas enviadas, dos níveis (ordem e cota) e da ordem dos níveis. Igual = a cena do kernel já está certa. */
  assinatura: string;
}

/** Massas do projeto na ordem de criação (`order`). */
export function massasDoProjeto(p: Project): Mass[] {
  return Object.values(p.elements).filter(isMass).sort((a, b) => a.order - b.order);
}

/** Seção do modelo → seção do kernel (`forma` pela tabela de `FORMA_MASSA`; o que não se aplica vai zerado). */
function secaoDeKernel(s: SecaoMassa): SecaoKernelMassa {
  const base = { z: s.z, rot: s.rotacao, escala: s.escala, dx: s.dx, dy: s.dy, lados: 0, p2: 0, pontos: [] };
  const perfil = s.perfil;
  switch (perfil.forma) {
    case 'circulo':
      return { ...base, forma: FORMA_MASSA.circulo, p1: perfil.raio };
    case 'elipse':
      return { ...base, forma: FORMA_MASSA.elipse, p1: perfil.rx, p2: perfil.ry };
    case 'poligono':
      return { ...base, forma: FORMA_MASSA.poligono, p1: perfil.raio, lados: perfil.lados };
    case 'livre':
      return { ...base, forma: FORMA_MASSA.livre, p1: 0, pontos: perfil.pontos.map((q) => ({ x: q.x, y: q.y })) };
  }
}

/** A massa como o kernel a lê. `cota` é a do nível dela; a base fica em `cota + baseOffset`. */
export function massaDeKernel(m: Mass, nivelNum: number, cota: number): MassaKernel {
  return {
    id: m.id,
    nivelNum,
    ox: m.origem.x,
    oy: m.origem.y,
    zBase: cota + m.baseOffset,
    interp: m.interpolacao === 'suave' ? INTERP_MASSA.suave : INTERP_MASSA.linear,
    resolucao: m.resolucao,
    arranjo: m.arranjo ? { n: m.arranjo.n, cx: m.arranjo.cx, cy: m.arranjo.cy, ang: m.arranjo.anguloTotal } : null,
    secoes: m.secoes.map(secaoDeKernel),
  };
}

const entradaMemo = new WeakMap<Project, EntradaMassaProjeto>();

/** Projeto → entrada do adaptador. Memorizado por projeto (o motor é imutável, como em `cortinaProjeto.ts`). */
export function entradaMassaDoProjeto(p: Project): EntradaMassaProjeto {
  const memo = entradaMemo.get(p);
  if (memo) return memo;
  const nivelDe = new Map<Id, number>(p.levels.map((l, i) => [l.id, i] as const));
  const massas: MassaKernel[] = [];
  const enviadas: Id[] = [];
  const invalidas: Id[] = [];
  const assinaturas = new Map<Id, string>();
  for (const m of massasDoProjeto(p)) {
    const nivelNum = nivelDe.get(m.levelId);
    if (nivelNum === undefined || massIssue(m) !== null) {
      invalidas.push(m.id);
      continue;
    }
    const k = massaDeKernel(m, nivelNum, p.levels[nivelNum]!.elevation);
    massas.push(k);
    enviadas.push(m.id);
    assinaturas.set(m.id, hashTexto(JSON.stringify(k)));
  }
  const cotas = p.levels.map((l) => l.elevation);
  const porId = [...assinaturas].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, h]) => `${id}:${h}`).join('|');
  const assinatura = hashTexto(`${porId}#${cotas.join(',')}#${p.levels.map((l) => l.id).join(',')}`);
  const r: EntradaMassaProjeto = {
    entrada: { massas, cotas },
    nivelDe,
    idsDosNiveis: p.levels.map((l) => l.id),
    enviadas,
    invalidas,
    assinaturas,
    assinatura,
  };
  entradaMemo.set(p, r);
  return r;
}
