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
const FIN = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.015 } as const;

/** Escada reta ao longo de +x (espelho k em x = k*0,28), guarda-corpo no lado esquerdo com o tipo pedido (de fábrica, sem mexer no "por degrau"). */
function projeto(tipoId: string, acabamento: boolean, alterar?: (t: TipoGuardaCorpo) => void, pisada = PISADA): Project {
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
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [straight(N_ESPELHOS, pisada)] }) });
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

/** Menor N com vão livre (pisada útil / N - largura) dentro da esfera: a conta do enunciado, feita aqui de forma independente do Rust. */
function nMinimo(pisadaUtil: number, largura: number, esfera: number): number {
  let n = 1;
  while (n > 0 && pisadaUtil / n - largura > esfera + 1e-9) n++;
  return n;
}

const ESFERA = 0.11;

describe('montantes do guarda-corpo na escada (tipo de fábrica -> kernel -> malha)', () => {
  for (const tipo of ['gct_balaustres', 'gct_madeira']) {
    for (const acab of [false, true]) {
      it.skipIf(!bytes)(`${tipo}${acab ? ' com acabamento' : ''}: quantidade automática, no centro das faixas iguais da pisada`, () => {
        const p = projeto(tipo, acab);
        const pr = p.tiposGuardaCorpo[tipo]!.preenchimentos[0]!;
        expect(pr.tipo === 'balaustres' && pr.porDegrau.ativo && pr.porDegrau.automatico === true && pr.porDegrau.distanciaDoBocel === null).toBe(true);
        const largura = (pr.tipo === 'balaustres' ? pr.porDegrau.modelo?.perfil.largura : 0) ?? 0;
        const q = nMinimo(PISADA, largura, ESFERA);
        const b = balaustres(p);
        const degraus = N_ESPELHOS - 1; // o último espelho chega ao piso de cima, que não é degrau
        // Com acabamento a faixa vai da frente do bocel (1,5 cm antes da quina) ao bocel seguinte; sem, da quina à quina seguinte.
        const frente = acab ? -0.015 : 0;
        // O último degrau não tem bocel seguinte: com acabamento a pisada útil chega a 29,5 cm.
        const util = (d: number): number => (acab && d === degraus - 1 ? PISADA + 0.015 : PISADA);
        let esperados = Array.from({ length: q * degraus }, (_, i) => {
          const d = Math.floor(i / q);
          return d * PISADA + frente + ((i % q) + 0.5) * (util(d) / q);
        });
        // Um montante que encostaria no poste do início (meia seção do poste + meia do montante) é descartado, como sempre foi.
        const meiaPoste = (p.tiposGuardaCorpo[tipo]!.postes.inicio.perfil.largura ?? 0) / 2;
        esperados = esperados.filter((x) => x >= meiaPoste + largura / 2 - 1e-9);
        expect(b.length).toBe(esperados.length);
        b.forEach((m, i) => expect(m.cx, `balaústre ${i}`).toBeCloseTo(esperados[i]!, 3));
      });
    }
  }

  // Pisadas de 25 a 32 cm e perfis de 2 a 4 cm: o padrão de fábrica nunca dispara o aviso de vão, e com um balaústre a menos por degrau dispararia.
  for (const cm of [25, 26, 27, 28, 29, 30, 31, 32]) {
    for (const larg of [0.02, 0.03, 0.04]) {
      it.skipIf(!bytes)(`automático: pisada ${cm} cm, perfil ${larg * 100} cm: sem aviso de vão; N-1 avisa`, () => {
        const pisada = cm / 100;
        const trocarPerfil = (t: TipoGuardaCorpo): void => {
          for (const pr of t.preenchimentos) {
            if (pr.tipo !== 'balaustres') continue;
            for (const m of [pr.porDegrau.modelo, ...pr.elementos.map((e) => e.modelo)]) if (m) m.perfil = { ...m.perfil, largura: larg, ...(m.perfil.forma === 'retangular' ? { altura: larg } : {}) };
          }
        };
        const q = nMinimo(pisada, larg, ESFERA);
        const comN = (n: number | null) => projeto('gct_balaustres', false, (t) => {
          trocarPerfil(t);
          if (n !== null) for (const pr of t.preenchimentos) if (pr.tipo === 'balaustres') pr.porDegrau = { ...pr.porDegrau, automatico: false, quantidade: n };
        }, pisada);
        const vaos = (p: Project): number => new ServicoGuardaCorpo(() => ger).avisos(p)!.filter((a) => a.codigo === 1).length;
        definirGerenciadorDoGuardaCorpo(() => ger);
        const auto = comN(null);
        expect(vaos(auto), 'padrão automático').toBe(0);
        expect(balaustres(auto).length).toBeGreaterThanOrEqual(q * (N_ESPELHOS - 2));
        if (q > 1) expect(vaos(comN(q - 1)), 'N-1').toBeGreaterThan(0);
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
          const quina = k * PISADA - (acab ? 0.015 : 0);
          expect(Math.abs(m.cx - quina), `cx ${m.cx} quina ${k}`).toBeGreaterThanOrEqual(meia - 1e-6);
        }
      }
    }
  });
});
