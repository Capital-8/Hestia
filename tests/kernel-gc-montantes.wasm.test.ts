/**
 * Montantes do guarda-corpo na escada, pelo caminho REAL do app: tipo de fábrica (`gct_balaustres`, `gct_madeira`) -> linhas do kernel -> Rust ->
 * malha 3D. O centro de cada balaústre tem de cair sobre o piso do degrau (meio da pisada com "por degrau" de fábrica) e, no modo por espaçamento,
 * nunca a menos de meia seção da quina/espelho. Sem e com acabamento (bocel). Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { straight } from '../packages/engine/src/fixtureGuardaCorpo.ts';
import { ServicoGuardaCorpo, definirGerenciadorDoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, defaultStairTypeId, makeGuardaCorpo, makeStair, type Project, type StairType, type TipoGuardaCorpo } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const PISADA = 0.28;
const N_ESPELHOS = 17;
const FIN = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 } as const;

/** Escada reta ao longo de +x (espelho k em x = k*0,28), guarda-corpo no lado esquerdo com o tipo pedido (de fábrica, sem mexer no "por degrau"). */
function projeto(tipoId: string, acabamento: boolean, alterar?: (t: TipoGuardaCorpo) => void): Project {
  const s = new ProjectStore(createEmptyProject());
  let typeId = defaultStairTypeId;
  if (acabamento) {
    typeId = 'stt_acab';
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    s.exec({ type: 'upsertStairType', stairType: { ...base, id: typeId, ...FIN } as StairType });
  }
  if (alterar) {
    const t = structuredClone(s.project.tiposGuardaCorpo[tipoId]!);
    alterar(t);
    s.exec({ type: 'upsertTipoGuardaCorpo', tipo: t });
  }
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [straight(N_ESPELHOS, PISADA)] }) });
  const lado = { lance: true, patamar: true };
  const nenhum = { lance: false, patamar: false };
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: tipoId, hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: nenhum }, posicaoBase: 'degrau' } }) });
  return s.project;
}

/** Centros em x (ao longo da escada) e larguras em x de cada balaústre, achados pelas componentes conexas da malha. */
function balaustres(p: Project): Array<{ cx: number; largura: number }> {
  definirGerenciadorDoGuardaCorpo(() => ger);
  const malhas = new ServicoGuardaCorpo(() => ger).malhas(p)!;
  const out: Array<{ cx: number; largura: number }> = [];
  for (const parte of malhas[0]!.partes.filter((x) => x.papel === 'balaustre')) {
    const n = parte.positions.length / 3;
    const pai = Array.from({ length: n }, (_, i) => i);
    const raiz = (a: number): number => {
      while (pai[a] !== a) a = pai[a] = pai[pai[a]!]!;
      return a;
    };
    for (let i = 0; i < parte.indices.length; i += 3) {
      const a = raiz(parte.indices[i]!);
      for (const j of [1, 2]) {
        const b = raiz(parte.indices[i + j]!);
        if (a !== b) pai[b] = a;
      }
    }
    const caixa = new Map<number, [number, number]>();
    for (let i = 0; i < n; i++) {
      const x = parte.positions[3 * i]!;
      const c = caixa.get(raiz(i)) ?? [Infinity, -Infinity];
      caixa.set(raiz(i), [Math.min(c[0], x), Math.max(c[1], x)]);
    }
    for (const [a, b] of caixa.values()) out.push({ cx: (a + b) / 2, largura: b - a });
  }
  return out.sort((a, b) => a.cx - b.cx);
}

describe('montantes do guarda-corpo na escada (tipo de fábrica -> kernel -> malha)', () => {
  for (const tipo of ['gct_balaustres', 'gct_madeira']) {
    for (const acab of [false, true]) {
      it.skipIf(!bytes)(`${tipo}${acab ? ' com acabamento' : ''}: 2 por degrau, no centro das faixas iguais da pisada`, () => {
        const p = projeto(tipo, acab);
        const pr = p.tiposGuardaCorpo[tipo]!.preenchimentos[0]!;
        expect(pr.tipo === 'balaustres' && pr.porDegrau.ativo && pr.porDegrau.quantidade === 2 && pr.porDegrau.distanciaDoBocel === null).toBe(true);
        const b = balaustres(p);
        const degraus = N_ESPELHOS - 1; // o último espelho chega ao piso de cima, que não é degrau
        // Com acabamento a faixa vai da frente do bocel (2 cm antes da quina) ao bocel seguinte; sem, da quina à quina seguinte.
        const frente = acab ? -0.02 : 0;
        let esperados = Array.from({ length: 2 * degraus }, (_, i) => Math.floor(i / 2) * PISADA + frente + ((i % 2) + 0.5) * (PISADA / 2));
        // Um montante que encostaria no poste do início (meia seção do poste + meia do montante) é descartado, como sempre foi.
        const meiaPoste = (p.tiposGuardaCorpo[tipo]!.postes.inicio.perfil.largura ?? 0) / 2;
        const meiaMontante = ((pr.tipo === 'balaustres' ? pr.porDegrau.modelo?.perfil.largura : 0) ?? 0) / 2;
        esperados = esperados.filter((x) => x >= meiaPoste + meiaMontante - 1e-9);
        expect(b.length).toBe(esperados.length);
        b.forEach((m, i) => {
          // O último degrau não tem bocel seguinte: com acabamento a pisada útil chega a 30 cm (faixas de 15 cm, centros em 7,5 e 22,5 cm).
          const ultimo = acab && i >= b.length - 2;
          const certo = ultimo ? (N_ESPELHOS - 2) * PISADA + frente + (i === b.length - 2 ? 0.075 : 0.225) : esperados[i]!;
          expect(m.cx, `balaústre ${i}`).toBeCloseTo(certo, 3);
        });
      });
    }
  }

  it.skipIf(!bytes)('por espaçamento (por degrau desligado, tipo já gravado): nenhum centro a menos de meia seção da quina', () => {
    const desligar = (t: TipoGuardaCorpo): void => {
      for (const pr of t.preenchimentos) if (pr.tipo === 'balaustres') pr.porDegrau = { ...pr.porDegrau, ativo: false };
    };
    for (const acab of [false, true]) {
      const b = balaustres(projeto('gct_balaustres', acab, desligar));
      expect(b.length).toBeGreaterThan(40);
      for (const m of b) {
        const meia = m.largura / 2;
        // Quina = frente do bocel (acabado) ou a face do espelho; fim da pisada = a quina do degrau seguinte (menos o bocel dele).
        for (let k = 0; k < N_ESPELHOS; k++) {
          const quina = k * PISADA - (acab ? 0.02 : 0);
          expect(Math.abs(m.cx - quina), `cx ${m.cx} quina ${k}`).toBeGreaterThanOrEqual(meia - 1e-6);
        }
      }
    }
  });
});
