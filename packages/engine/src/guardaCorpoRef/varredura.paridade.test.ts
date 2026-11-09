// @ts-nocheck -- referencia de paridade (so os testes a usam); a indexacao de vetores fixos [x, y, z] nao passa em noUncheckedIndexedAccess. Pendente: tipar com tuplas nomeadas.
/**
 * Paridade da varredura do guarda-corpo (decisão 0055, Fase 3b). A referência TS gera `varredura.paridade.json` (com `GERAR_PARIDADE_GC=1`) e o teste
 * cargo `gc_varredura::paridade` compara o Rust com esse arquivo: contagens exatas e posições a 1e-6 m. Aqui, sem a variável, o teste confere que a
 * referência continua produzindo o arquivo versionado e que as invariantes (malha fechada, Euler 2, volume) valem.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MalhaRef, type V3 } from './malha.ts';
import {
  corrimaoLancePatamar, estender, filete, LIMITE_ESQUADRIA, perfilCircular, perfilDe, perfilRetangular, posicoesSuportes, quadros, soldar, suporte, varrer, type P2,
} from './varredura.ts';

const ARQUIVO = new URL('./varredura.paridade.json', import.meta.url);

interface SaidaMalha { tipo: 'malha'; vertices: number; arestas: number; faces: number; euler: number; fechada: boolean; volume: number; soma: V3 }
interface SaidaPontos { tipo: 'pontos'; pontos: V3[] }
interface SaidaNumeros { tipo: 'numeros'; valores: number[] }
type Saida = SaidaMalha | SaidaPontos | SaidaNumeros;

function malha(nos: V3[], fechado: boolean, perfil: P2[]): SaidaMalha {
  const m = new MalhaRef();
  const g = m.adicionarGrupo(varrer(nos, fechado, perfil, LIMITE_ESQUADRIA));
  const a = m.analisar(g);
  return { tipo: 'malha', vertices: a.vertices, arestas: a.arestas, faces: a.faces, euler: a.euler, fechada: a.fechada, volume: a.volume, soma: m.somaCoordenadas(g) };
}
const pontos = (p: V3[][]): SaidaPontos => ({ tipo: 'pontos', pontos: p.flat() });

function helice(r: number, passo: number, voltas: number, porVolta: number): V3[] {
  const n = Math.floor(voltas * porVolta);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / porVolta;
    return [r * Math.cos(a), r * Math.sin(a), (passo * a) / (2 * Math.PI)] as V3;
  });
}

const EM_L: V3[] = [[0, 0, 0], [2, 0, 0], [2, 2, 0]];
const LANCE: V3[] = [[0, 0, 0], [3, 0, 1.5]];
const PATAMAR: V3[] = [[3, 0, 1.5], [4.2, 0, 1.5]];
const a170 = (170 * Math.PI) / 180;

export function casos(): Record<string, Saida> {
  const circ = perfilCircular(0.04, 0);
  const ele: P2[] = [[0, 0], [0.04, 0], [0.04, 0.01], [0.01, 0.01], [0.01, 0.04], [0, 0.04]];
  const c: Record<string, Saida> = {};
  c.reta_circular = malha([[0, 0, 1], [2, 0, 1]], false, circ);
  c.em_l_retangular = malha(EM_L, false, perfilRetangular(0.05, 0.03));
  c.lance_patamar = malha([[0, 0, 0], [3, 0, 1.5], [4, 0, 1.5]], false, circ);
  c.helice = malha(helice(1, 0.5, 2, 90), false, perfilCircular(0.03, 0));
  c.chanfro_170 = malha([[0, 0, 0], [1, 0, 0], [1 + Math.cos(a170), Math.sin(a170), 0]], false, perfilRetangular(0.05, 0.05));
  c.laco_fechado = malha([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], true, perfilRetangular(0.03, 0.03));
  c.poligono_ele = malha([[0, 0, 0], [1, 0, 0]], false, perfilDe(2, 0, 0, ele, 0));
  c.filete_pontos = pontos([filete(EM_L, 0.3, 0.002, null)]);
  c.filete_malha = malha(filete(EM_L, 0.3, 0.002, null), false, circ);
  c.solda_pontos = pontos([soldar(EM_L, 0.04)]);
  c.ganso = pontos(corrimaoLancePatamar(LANCE, PATAMAR, 0.9, 1.0, 0.04, 'pescoco-de-ganso'));
  c.simples = pontos(corrimaoLancePatamar(LANCE, PATAMAR, 0.9, 0.9, 0.04, 'simples'));
  c.nenhuma = pontos(corrimaoLancePatamar(LANCE, PATAMAR, 0.9, 1.0, 0.04, 'nenhuma'));
  c.nao_colinear = pontos(corrimaoLancePatamar([[0, 0, 0], [2, 0, 1]], [[2, 0, 1], [2, 1, 1]], 0.9, 1.0, 0.04, 'pescoco-de-ganso'));
  c.extensoes = pontos([estender([[0, 0, 0], [3, 0, 1.5], [4, 0, 1.5]], { comprimento: 0.3, maisPiso: true, horizontal: false }, { comprimento: 0.3, maisPiso: false, horizontal: true }, 0.28)]);
  c.suportes = { tipo: 'numeros', valores: [
    ...posicoesSuportes(2, 1, 0.5, 0, 0, []), -1, ...posicoesSuportes(1, 1, 0.4, 0, 1, []), -1, ...posicoesSuportes(1, 1, 0.4, 0, 2, []), -1,
    ...posicoesSuportes(1, 3, 0, 3, 0, []), -1, ...posicoesSuportes(2, 4, 0.7, 0, 0, []), -1, ...posicoesSuportes(2, 5, 0.7, 0, 0, []), -1,
    ...posicoesSuportes(2, 2, 0, 0, 0, [0, 1, 5]),
  ] };
  const sup = suporte([1, 0, 1], [1, 0, 0], 1, 0.06, perfilCircular(0.02, 0));
  const m = new MalhaRef();
  const g = m.adicionarGrupo(sup);
  const a = m.analisar(g);
  c.suporte_malha = { tipo: 'malha', vertices: a.vertices, arestas: a.arestas, faces: a.faces, euler: a.euler, fechada: a.fechada, volume: a.volume, soma: m.somaCoordenadas(g) };
  return c;
}

describe('guarda-corpo 3b: referência TS da varredura', () => {
  const todos = casos();

  it('gera ou confere o arquivo de paridade', () => {
    const json = JSON.stringify(todos, null, 1) + '\n';
    if (process.env.GERAR_PARIDADE_GC === '1') writeFileSync(ARQUIVO, json);
    const salvo = JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Record<string, Saida>;
    expect(Object.keys(salvo)).toEqual(Object.keys(todos));
    for (const [nome, v] of Object.entries(todos)) expect(JSON.parse(JSON.stringify(v)), nome).toEqual(salvo[nome]);
  });

  it('malhas sólidas são fechadas, orientadas e de volume positivo', () => {
    for (const nome of ['reta_circular', 'em_l_retangular', 'lance_patamar', 'helice', 'chanfro_170', 'poligono_ele', 'filete_malha', 'suporte_malha']) {
      const s = todos[nome] as SaidaMalha;
      expect(s.fechada, nome).toBe(true);
      expect(s.euler, nome).toBe(2);
      expect(s.volume, nome).toBeGreaterThan(0);
    }
    const laco = todos.laco_fechado as SaidaMalha;
    expect(laco.fechada && laco.euler === 0).toBe(true);
  });

  it('esquadria em L tem o volume exato da soma dos comprimentos', () => {
    const s = todos.em_l_retangular as SaidaMalha;
    expect(s.volume).toBeCloseTo(0.05 * 0.03 * 4, 7);
  });

  it('quadros da hélice sem torção: cada passo é a rotação mínima do anterior', () => {
    const q = quadros(helice(1, 0.5, 2, 360), false);
    for (let i = 1; i < q.length; i++) {
      const d = q[i].n[0] * q[i].t[0] + q[i].n[1] * q[i].t[1] + q[i].n[2] * q[i].t[2];
      expect(Math.abs(d)).toBeLessThan(1e-12);
    }
  });
});
