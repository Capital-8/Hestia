import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeMass, secaoCirculo, type Mass, type SecaoMassa } from '@hestia/model';
import {
  adicionarSecao,
  alturaTotal,
  aplicarSecoes,
  aplicarTorcao,
  caixaDaPrevia,
  contornoDaSecao,
  contornosDaPilha,
  distribuirTorcao,
  duplicarSecao,
  editarSecao,
  removerSecao,
  torcaoTotalGraus,
  trocarForma,
  validacaoAoVivo,
} from './massSecoesForm.ts';

const quad = (z: number, rotacao = 0): SecaoMassa => ({ z, perfil: { forma: 'poligono', lados: 4, raio: 5 }, rotacao, escala: 1, dx: 0, dy: 0 });
const pilha = (...zs: number[]): SecaoMassa[] => zs.map((z) => quad(z));

function massaNoStore(secoes: SecaoMassa[]): { store: ProjectStore; massa: Mass } {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addMass', mass: makeMass({ id: 'ms_f1', levelId: 'lv_0', secoes }) });
  const massa = store.project.elements['ms_f1'];
  if (!massa || massa.kind !== 'mass') throw new Error('massa não criada');
  return { store, massa };
}

describe('torção total em graus', () => {
  it('distribui a rotação linearmente em z: rotacao_i = total · z_i / z_última', () => {
    const r = distribuirTorcao(pilha(0, 10, 20, 30), 90);
    expect(r.map((s) => s.rotacao)).toEqual([0, (Math.PI / 2) / 3, (Math.PI / 2) * (2 / 3), Math.PI / 2].map((v) => expect.closeTo(v, 12)));
  });

  it('com alturas desiguais, a rotação acompanha z (não o índice da seção)', () => {
    const r = distribuirTorcao(pilha(0, 3, 30), 60);
    expect(r[1]!.rotacao).toBeCloseTo((60 / 180) * Math.PI * 0.1, 12);
    expect(r[2]!.rotacao).toBeCloseTo(Math.PI / 3, 12);
  });

  it('o valor atual é deduzido da última seção e volta a graus', () => {
    const feita = distribuirTorcao(pilha(0, 12, 24), -45);
    expect(torcaoTotalGraus(feita)).toBeCloseTo(-45, 9);
    expect(torcaoTotalGraus(pilha(0, 5))).toBe(0);
  });

  it('não altera a pilha original e ignora valor não finito', () => {
    const base = pilha(0, 10);
    distribuirTorcao(base, 30);
    expect(base[1]!.rotacao).toBe(0);
    expect(distribuirTorcao(base, Number.NaN)[1]!.rotacao).toBe(0);
  });

  it('aplicar a torção na massa é UM passo de desfazer', () => {
    const { store } = massaNoStore(pilha(0, 10, 20));
    const antes = store.project;
    const r = aplicarTorcao(store, 'ms_f1', 90, 'Torção', 'pt');
    expect(r.ok).toBe(true);
    const m = store.project.elements['ms_f1'];
    expect(m && m.kind === 'mass' ? torcaoTotalGraus(m.secoes) : null).toBeCloseTo(90, 9);
    store.undo();
    const volta = store.project.elements['ms_f1'];
    expect(volta && volta.kind === 'mass' ? torcaoTotalGraus(volta.secoes) : null).toBe(0);
    expect(store.project).not.toBe(antes);
  });
});

describe('adicionar, remover e duplicar seção', () => {
  it('adicionar acrescenta no topo, copia a última e mantém z crescente', () => {
    const r = adicionarSecao(pilha(0, 4, 10))!;
    expect(r).toHaveLength(4);
    expect(r[3]!.z).toBe(16);
    expect(r[3]!.perfil).toEqual(r[2]!.perfil);
    expect(r[3]!.perfil).not.toBe(r[2]!.perfil);
  });

  it('adicionar recusa no limite de 64 seções', () => {
    const cheia = Array.from({ length: 64 }, (_, i) => quad(i));
    expect(adicionarSecao(cheia)).toBeNull();
    expect(adicionarSecao(cheia.slice(0, 63))).toHaveLength(64);
  });

  it('remover recusa quando restariam menos de 2 seções', () => {
    expect(removerSecao(pilha(0, 5), 0)).toBeNull();
    expect(removerSecao(pilha(0, 5, 9), 1)!.map((s) => s.z)).toEqual([0, 9]);
  });

  it('remover a primeira reencosta a pilha em z = 0', () => {
    const r = removerSecao(pilha(0, 4, 10), 0)!;
    expect(r.map((s) => s.z)).toEqual([0, 6]);
  });

  it('duplicar põe a cópia no meio do intervalo e mantém z estritamente crescente', () => {
    const r = duplicarSecao(pilha(0, 4, 10), 0)!;
    expect(r.map((s) => s.z)).toEqual([0, 2, 4, 10]);
    expect(r[1]!.perfil).toEqual(r[0]!.perfil);
  });

  it('duplicar a última sobe um passo; recusa no limite de 64 e em intervalo pequeno demais', () => {
    expect(duplicarSecao(pilha(0, 4, 10), 2)!.map((s) => s.z)).toEqual([0, 4, 10, 16]);
    expect(duplicarSecao(Array.from({ length: 64 }, (_, i) => quad(i)), 3)).toBeNull();
    expect(duplicarSecao(pilha(0, 0.015), 0)).toBeNull();
  });

  it('editar uma seção troca só os campos pedidos', () => {
    const r = editarSecao(pilha(0, 4), 1, { z: 6, escala: 2 });
    expect(r[1]).toMatchObject({ z: 6, escala: 2 });
    expect(r[0]!.z).toBe(0);
  });
});

describe('validação ao vivo com a mensagem do modelo', () => {
  const { massa } = massaNoStore(pilha(0, 10));

  it('pilha válida não tem mensagem', () => {
    expect(validacaoAoVivo(massa, pilha(0, 10), 'pt')).toBeNull();
  });

  it('z não crescente devolve a mensagem de z crescente', () => {
    const msg = validacaoAoVivo(massa, pilha(0, 5, 5), 'pt');
    expect(msg).toMatch(/crescente|altura/i);
    expect(msg).toBe(validacaoAoVivo({ ...massa, secoes: pilha(0, 5, 5) }, pilha(0, 5, 5), 'pt'));
  });

  it('dimensão menor ou igual a zero devolve a mensagem de dimensão', () => {
    const ruim = editarSecao(pilha(0, 10), 1, { perfil: { forma: 'circulo', raio: 0 } });
    expect(validacaoAoVivo(massa, ruim, 'pt')).toMatch(/dimens|maior que zero|> 0/i);
    expect(validacaoAoVivo(massa, ruim, 'en')).not.toBe(validacaoAoVivo(massa, ruim, 'pt'));
  });

  it('perfil livre que se cruza devolve a mensagem de perfil não simples', () => {
    const gravata = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }];
    const ruim = editarSecao(pilha(0, 10), 1, { perfil: { forma: 'livre', pontos: gravata } });
    expect(validacaoAoVivo(massa, ruim, 'pt')).toMatch(/simples|cruz/i);
  });

  it('seção fora de 2 a 64 e rotação maior que π entre vizinhas são recusadas', () => {
    expect(validacaoAoVivo(massa, pilha(0), 'pt')).toBeTruthy();
    const torta = [quad(0), quad(10, 4)];
    expect(validacaoAoVivo(massa, torta, 'pt')).toBeTruthy();
  });
});

describe('aplicar as seções', () => {
  it('gera um único setMassSecoes (um passo de desfazer)', () => {
    const { store } = massaNoStore(pilha(0, 10));
    const passos: string[] = [];
    store.subscribe(() => passos.push(store.undoLabel ?? ''));
    const r = aplicarSecoes(store, 'ms_f1', [quad(0), quad(5), quad(12)], 'Seções da massa', 'pt');
    expect(r).toEqual({ ok: true, erro: null });
    expect(passos).toHaveLength(1);
    expect(store.undoLabel).toBe('Seções da massa');
    const m = store.project.elements['ms_f1'];
    expect(m && m.kind === 'mass' ? m.secoes.map((s) => s.z) : null).toEqual([0, 5, 12]);
    store.undo();
    const volta = store.project.elements['ms_f1'];
    expect(volta && volta.kind === 'mass' ? volta.secoes.map((s) => s.z) : null).toEqual([0, 10]);
  });

  it('recusa pilha inválida com a mensagem do modelo e sem gravar', () => {
    const { store } = massaNoStore(pilha(0, 10));
    const antes = store.project;
    const r = aplicarSecoes(store, 'ms_f1', pilha(0, 5, 5), 'x', 'pt');
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(store.project).toBe(antes);
    expect(store.canUndo).toBe(true);
  });
});

describe('forma, contorno e prévia', () => {
  it('trocar a forma aproveita o tamanho: círculo para polígono mantém o raio', () => {
    expect(trocarForma({ forma: 'circulo', raio: 3 }, 'poligono')).toEqual({ forma: 'poligono', lados: 6, raio: 3 });
    expect(trocarForma({ forma: 'circulo', raio: 3 }, 'elipse')).toEqual({ forma: 'elipse', rx: 3, ry: 3 });
    const livre = trocarForma({ forma: 'poligono', lados: 4, raio: 2 }, 'livre');
    expect(livre.forma === 'livre' ? livre.pontos.length : 0).toBeGreaterThanOrEqual(3);
  });

  it('o contorno aplica escala, rotação e deslocamento nessa ordem', () => {
    const s: SecaoMassa = { z: 0, perfil: { forma: 'poligono', lados: 4, raio: 1 }, rotacao: Math.PI / 2, escala: 2, dx: 10, dy: 0 };
    const [a] = contornoDaSecao(s);
    // vértice em +x local, escala 2 → (2,0); girado 90° → (0,2); deslocado → (10,2)
    expect(a!.x).toBeCloseTo(10, 9);
    expect(a!.y).toBeCloseTo(2, 9);
  });

  it('a caixa da prévia cobre todos os contornos e é quadrada', () => {
    const aneis = contornosDaPilha([secaoCirculo(0, 1), { ...secaoCirculo(5, 3), dx: 4 }]);
    const c = caixaDaPrevia(aneis);
    expect(c.largura).toBeCloseTo(c.altura, 12);
    expect(c.minX).toBeLessThan(-1);
    expect(c.minX + c.largura).toBeGreaterThan(7);
    expect(caixaDaPrevia([])).toEqual({ minX: -1, minY: -1, largura: 2, altura: 2 });
  });

  it('altura total é o z da última seção', () => {
    expect(alturaTotal({ secoes: pilha(0, 4, 11) })).toBe(11);
  });
});
