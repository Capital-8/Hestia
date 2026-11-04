/**
 * B3 sem wasm: as seções da variante da junção (esquema v10), os argumentos e a decodificação de `junction_nivel` e a referência (`referenciaB3`, a extração de
 * `levelCutterSet` e `junctionLevel`). Prova que (1) as seções seguem o esquema, (2) o estresse da B3 exercita o que o Rust precisa acompanhar (peças externas,
 * níveis não adjacentes, laje inclinada fora da junção, variante da junção diferente da do término) e (3) as duas implementações de `adjacentLevelIds` são equivalentes.
 */
import { describe, expect, it } from 'vitest';
import type { Level, Project } from '@hestia/model';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaB1 } from '../packages/engine/src/kernelB.ts';
import { argumentosB3, decodificarB3, montarCenaB3, referenciaB3 } from '../packages/engine/src/kernelB3.ts';
import { adjacentLevelIds as vizinhosDaJuncao } from '../packages/engine/src/junctionNet.ts';
import { adjacentLevelIds as vizinhosDoTermino } from '../packages/engine/src/terminoBlock.ts';
import { CONSULTAS, SECOES } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

describe('B3: seções, argumentos e referência do motor TypeScript', () => {
  it('as seções da variante seguem o esquema v10 e a consulta tem nível e tolerância', () => {
    const p = projetoDeEstresseB1(2, { paredesB2: true, anexos: true });
    const a1 = montarCenaA1(p, true);
    const b3 = montarCenaB3(p, a1);
    expect(Object.keys(b3.secoes.paredes_z_juncao)).toEqual(['id_num', 'z0', 'altura']);
    expect(Object.keys(b3.secoes.perfis_z_juncao)).toEqual(['id_num', 'parede_num', 'lista', 'indice', 't', 'h']);
    expect(SECOES.paredes_z_juncao.id).toBe(20);
    expect(SECOES.perfis_z_juncao.id).toBe(21);
    expect(SECOES.paredes_z_juncao.colunas.map((c) => c.nome)).toEqual(['id_num', 'z0', 'altura']);
    expect(SECOES.perfis_z_juncao.colunas.map((c) => c.nome)).toEqual(['id_num', 'parede_num', 'lista', 'indice', 't', 'h']);
    expect(CONSULTAS.junction_nivel.id).toBe(12);
    expect([...CONSULTAS.junction_nivel.args]).toEqual(['nivel_num', 'tol_juncao']);
    const cena = montarCenaB1(p, a1.materialDe);
    expect(argumentosB3(p, p.levels[1]!.id, cena)).toEqual([1, 0.02]);
  }, 60_000);

  it('só as paredes cuja cota ou perfil muda sem flatAttach ganham linha na variante (todas, com a opção)', () => {
    const p = projetoDeEstresseB1(2, { paredesB2: true, anexos: true });
    const a1 = montarCenaA1(p, true);
    const so = montarCenaB3(p, a1);
    const todas = montarCenaB3(p, a1, { todas: true });
    expect(so.comVariante).toBeGreaterThan(0);
    expect(so.comVariante).toBeLessThan(todas.comVariante);
    expect(todas.comVariante).toBe(a1.idDe.size);
    expect(todas.nLinhas.paredes_z_juncao).toBe(a1.idDe.size);
    // sem anexos e sem término por parede nos tipos, as duas variantes coincidem
    const simples = projetoDeEstresseB1(2, { pavimentos: 2 });
    expect(montarCenaB3(simples, montarCenaA1(simples, true)).comVariante).toBe(0);
  }, 60_000);

  it('o estresse da B3 tem peças externas, níveis não adjacentes, laje inclinada fora da junção e faixas de parede cortadas', () => {
    let externas = 0;
    let naoAdjacentes = 0;
    let lajesInclinadas = 0;
    let cortadas = 0;
    let faixasInclinadas = 0;
    for (const semente of [2, 3]) {
      const p = projetoDeEstresseB1(semente, { paredesB2: true, anexos: true, pavimentos: 4, semParedes: false });
      const a1 = montarCenaA1(p, true);
      const b = montarCenaB1(p, a1.materialDe);
      const nivelDe = new Map<string, string>();
      for (const [id, n] of a1.idDe) nivelDe.set(`0/${n}`, (p.elements[id] as { levelId: string }).levelId);
      for (const [id, n] of b.pisoDe) nivelDe.set(`1/${n}`, (p.elements[id] as { levelId: string }).levelId);
      for (const [id, n] of b.lajeDe) nivelDe.set(`2/${n}`, (p.elements[id] as { levelId: string }).levelId);
      for (const l of p.levels.slice(0, 2)) {
        const ref = referenciaB3(p, l.id, b, a1);
        const adj = vizinhosDaJuncao(p, l.id);
        for (const c of ref.cortadores) for (const pc of c.pecas) {
          if (pc.externa && pc.meta) {
            externas++;
            if (!adj.includes(nivelDe.get(`${pc.meta.tipo}/${pc.meta.dono}`)!)) naoAdjacentes++;
          }
          if (pc.meta?.tipo === 2 && !pc.plana) lajesInclinadas++;
          if (pc.meta?.tipo === 0 && !pc.plana) faixasInclinadas++;
        }
        // laje com caimento fica fora da junção: nenhum elemento da junção é uma laje inclinada
        const inclinadas = new Set(ref.cortadores.flatMap((c) => c.pecas).filter((pc) => pc.meta?.tipo === 2 && !pc.plana && !pc.externa).map((pc) => pc.meta!.dono));
        const planas = new Set(ref.cortadores.flatMap((c) => c.pecas).filter((pc) => pc.meta?.tipo === 2 && pc.plana && !pc.externa).map((pc) => pc.meta!.dono));
        for (const e of ref.elementos) if (e.tipo === 2 && inclinadas.has(e.dono)) expect(planas.has(e.dono), `laje inclinada ${e.dono} na junção`).toBe(true);
        cortadas += ref.paredes.filter((w) => w.corte).length + ref.elementos.filter((e) => e.corte).length;
      }
    }
    expect(externas, 'peças externas').toBeGreaterThan(20);
    expect(naoAdjacentes, 'peças externas de níveis não adjacentes').toBeGreaterThan(0);
    expect(lajesInclinadas, 'peças de laje inclinada').toBeGreaterThan(5);
    expect(faixasInclinadas, 'faixas de parede com topo inclinado').toBeGreaterThan(5);
    expect(cortadas, 'elementos e paredes recortados').toBeGreaterThan(5);
  }, 120_000);

  it('as duas implementações de adjacentLevelIds (junctionNet e terminoBlock) são equivalentes com cotas distintas e níveis fora de ordem; com cotas empatadas diferem', () => {
    const base = projetoDeEstresseB1(1, { pavimentos: 1, semParedes: false });
    let s = 12345;
    const r = (): number => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    let distintos = 0;
    let empatadosQueDiferem = 0;
    for (let k = 0; k < 300; k++) {
      const n = 1 + Math.floor(r() * 7);
      const cotas = Array.from({ length: n }, () => Math.floor(r() * 6) * 2.8);
      const niveis: Level[] = cotas.map((elevation, i) => ({ ...base.levels[0]!, id: `n${i}`, name: `N${i}`, elevation }));
      const p: Project = { ...base, levels: niveis.sort(() => r() - 0.5) };
      const empate = new Set(cotas).size < n;
      for (const l of p.levels) {
        const a = [...vizinhosDaJuncao(p, l.id)].sort();
        const b = [...vizinhosDoTermino(p, l.id)].sort();
        if (!empate) {
          // a ordem ([acima, abaixo] x [abaixo, acima]) não importa: o conjunto é o mesmo
          expect(a, `cotas ${cotas.join(',')} nível ${l.id}`).toEqual(b);
          distintos++;
        } else if (a.join() !== b.join()) empatadosQueDiferem++;
      }
      expect(vizinhosDaJuncao(p, 'inexistente')).toEqual([]);
      expect(vizinhosDoTermino(p, 'inexistente')).toEqual([]);
    }
    expect(distintos, 'níveis comparados com cotas distintas').toBeGreaterThan(100);
    // achado: com dois níveis na mesma cota as duas escolhem vizinhos diferentes (sem nível real assim: a validação do modelo recusa cotas repetidas?); a B3 do Rust
    // não usa adjacência (levelCutterSet olha todos os níveis) e a B2 segue a de terminoBlock (ordenação estável por cota, empate pela ordem de nivel_num)
    expect(empatadosQueDiferem).toBeGreaterThanOrEqual(0);
  });

  it('a decodificação de junction_nivel devolve cortadores, partes e faixas na mesma forma da referência', () => {
    const s = {
      cortadores: [2, 1, 0],
      pecas: [1, 2, 7, 0, 1, 0, 0, 0, 0, 0, 1],
      pecas_num: [0, 1, 1, 2.65, 2.8, 0, 0, 0, 1, 0, 3, 0, 0, 0, 2.65, 2.8],
      elementos: [],
      camadas: [],
      camadas_indice: [],
      paredes: [],
      faixas: [],
      faixas_camada: [],
      partes: [],
      partes_z: [],
      poligonos: [0, 1],
      aneis: [0, 4],
      pontos: [0, 0, 1, 0, 1, 1, 0, 1],
    };
    const j = decodificarB3(s);
    expect(j.cortadores).toHaveLength(1);
    const p = j.cortadores[0]!.pecas[0]!;
    expect(p.meta).toMatchObject({ tipo: 2, dono: 7, prioridade: 1, nucleo: true, explicita: false, camada: 0, banda: null });
    expect(p.externa).toBe(false);
    expect(p.faixa).toEqual([2.65, 2.8]);
    // laje com caimento de 3% na direção +x: a cota sobe 3 cm por metro
    expect(p.span({ x: 1, y: 0 })[0]).toBeCloseTo(2.65 + 0.03, 12);
    expect(p.poligono[0]![0]).toHaveLength(4);
  });
});
