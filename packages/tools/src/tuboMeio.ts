import type { Vec2 } from '@hestia/geom';
import { tipoSemConexoes, type RegrasConexao } from '@hestia/engine';
import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { extremosDoTubo, type ExtremosTubo } from './tuboGeometria.ts';
import type { PreviewItem } from './types.ts';

/*
 * Meio de tubo como ORIGEM ou ALVO do traçado (fase 4, ficha F5). O snap 'meio de tubo' marca o ponto do EIXO mais perto do cursor em
 * planta (a cota vem do tubo, não do cursor): o clique ali inicia ou fecha o traçado em derivação (tê ou junção 45° do tipo). Aqui só a
 * geometria do snap, o marcador ('derivar aqui') e o motivo de um tipo que não deriva; a divisão do tubo e as peças estão em
 * `tuboDerivacao.ts` e a rota até o alvo em `tuboRota.ts`.
 */

/** Tubo sob o cursor: a instância, os extremos dela e o ponto do eixo (m). */
export interface MeioDeTubo {
  c: Component;
  ext: ExtremosTubo;
  xyz: [number, number, number];
}

/** Raio (px) do halo do meio de tubo e passo (px) da cruz que o acompanha. */
const RAIO_PX = 9;
const LADOS = 4;

/**
 * Ponto do eixo do tubo da família `familiaId` mais perto de `at` em planta, até `tolPlano` (m) do eixo e a `margem` (m) das pontas
 * (nelas vale a porta). `zTol` (m): diferença de cota aceita entre o tubo e `zRef`; `Infinity` pega o tubo seja qual for a cota (o
 * ramal em outra cota é justamente o caso). Com mais de um tubo no mesmo lugar em planta vale o de cota mais perto de `zRef`.
 * Tubo vertical não entra (em planta é um ponto, sem meio).
 */
export function meioDeTubo(p: Project, familiaId: string, at: Vec2, zRef: number, tolPlano: number, margem: number, zTol: number, excluir?: Id): MeioDeTubo | null {
  let melhor: MeioDeTubo | null = null;
  let melhorChave: [number, number] = [Infinity, Infinity];
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || e.familyId !== familiaId || e.id === excluir) continue;
    const ext = extremosDoTubo(p, e);
    if (!ext) continue;
    const [dx, dy, dz] = [ext.b[0] - ext.a[0], ext.b[1] - ext.a[1], ext.b[2] - ext.a[2]];
    const h2 = dx * dx + dy * dy;
    if (h2 < 1e-12) continue;
    const t = ((at.x - ext.a[0]) * dx + (at.y - ext.a[1]) * dy) / h2;
    const L = Math.hypot(dx, dy, dz);
    if (t * L < margem || (1 - t) * L < margem) continue;
    const xyz: [number, number, number] = [ext.a[0] + t * dx, ext.a[1] + t * dy, ext.a[2] + t * dz];
    const dPlano = Math.hypot(xyz[0] - at.x, xyz[1] - at.y);
    const dCota = Math.abs(xyz[2] - zRef);
    if (dPlano > tolPlano || dCota > zTol) continue;
    const chave: [number, number] = [dCota, dPlano];
    if (chave[0] < melhorChave[0] - 1e-9 || (Math.abs(chave[0] - melhorChave[0]) <= 1e-9 && chave[1] < melhorChave[1])) {
      melhor = { c: e, ext, xyz };
      melhorChave = chave;
    }
  }
  return melhor;
}

/** Marcador do snap: halo em losango no ponto do eixo e o rótulo (`derivar aqui`, ou o motivo se o tipo não deriva). */
export function itensDoMeio(m: MeioDeTubo, mpp: number, rotulo: string): PreviewItem[] {
  const c = { x: m.xyz[0], y: m.xyz[1] };
  const r = RAIO_PX * mpp;
  const anel = (k: number): Vec2[] => Array.from({ length: LADOS }, (_, i) => ({ x: c.x + k * r * Math.cos((2 * Math.PI * i) / LADOS), y: c.y + k * r * Math.sin((2 * Math.PI * i) / LADOS) }));
  return [
    { kind: 'polygon', ring: anel(1) },
    { kind: 'polygon', ring: anel(0.5) },
    { kind: 'label', at: c, text: rotulo },
  ];
}

/** Por que o tipo de tubulação não deriva do meio do tubo, ou null se pode (a conta do ângulo fica com o resolvedor de nó). */
export interface SemDerivacao {
  motivo: string;
  sugestao: string;
}

const SUGESTAO_CAIXA = 'Sugestão: ligue o eletroduto numa caixa (as entradas dela recebem os eletrodutos) e derive de lá.';

/**
 * Tipo sem tê e sem junção (eletroduto rígido da Krona elétrica) ou sem nenhuma conexão (corrugado): derivar do meio do trecho é
 * bloqueado com o motivo e a sugestão. `regras` null = sem regras de conexão do domínio (nada a afirmar).
 */
export function semDerivacao(familiaId: string, regras: RegrasConexao | null, dominio: string): SemDerivacao | null {
  if (tipoSemConexoes(familiaId)) return { motivo: 'o eletroduto corrugado não tem tê nem junção: ele não deriva do meio de outro trecho, só sai de uma caixa.', sugestao: SUGESTAO_CAIXA };
  if (!regras || regras.te !== '' || regras.juncao45 !== '') return null;
  const motivo = 'este tipo de tubulação não tem tê nem junção de 45°: não dá para derivar do meio do tubo.';
  return { motivo, sugestao: dominio === 'eletroduto' ? SUGESTAO_CAIXA : 'Sugestão: escolha um tipo de tubulação que tenha tê ou derive de uma conexão que já exista.' };
}
