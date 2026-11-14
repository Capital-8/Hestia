// Suplemento de exemplo "Grade de paredes" (runtime script; permissões model.read, model.write e ui.*).
// Fluxo: o diálogo pede largura, altura e passo (metro; o Hestia mostra nas unidades do projeto) e abre a ferramenta
// de dois cliques. A cada evento da ferramenta o handler `grade(ctx, evento)` devolve um rascunho de prévia; no segundo
// clique devolve o lote de comandos `addWall`, que o Hestia valida e aplica como UM passo de Desfazer.
// Toda porta do host é ASSÍNCRONA: use `await`.

const MAX_PAREDES = 400;
let valores = { largura: 6, altura: 4, passo: 2 };
let inicio = null; // primeiro clique da linha de base (metro)

/** Posições (metro) ao longo de uma dimensão: 0, passo, 2*passo... e sempre a borda final. */
function posicoes(total, passo) {
  const p = [];
  for (let x = 0; x < total - 1e-6; x += passo) p.push(x);
  p.push(total);
  return p;
}

/** Segmentos [a, b] da grade a partir da linha de base a->b (a define a origem; b, a direção). */
function segmentos(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp < 0.01) return [];
  const u = { x: dx / comp, y: dy / comp }; // direção da largura
  const v = { x: -u.y, y: u.x }; // direção da altura (perpendicular)
  const ponto = (s, t) => ({ x: a.x + u.x * s + v.x * t, y: a.y + u.y * s + v.y * t });
  const { largura, altura, passo } = valores;
  const saida = [];
  for (const t of posicoes(altura, passo)) saida.push([ponto(0, t), ponto(largura, t)]);
  for (const s of posicoes(largura, passo)) saida.push([ponto(s, 0), ponto(s, altura)]);
  return saida.slice(0, MAX_PAREDES);
}

const previa = (a, b) => ({ draft: { lines: segmentos(a, b).map(([p, q]) => ({ a: p, b: q, dashed: true })), points: [a], labels: [] } });
const limpa = { draft: { lines: [], points: [], labels: [] } };

export async function grade(ctx, ev) {
  switch (ev.type) {
    case 'start':
      valores = { ...valores, ...(ev.values ?? {}) };
      inicio = null;
      return limpa;
    case 'move':
      return inicio ? previa(inicio, ev.point) : undefined;
    case 'cancel':
      inicio = null;
      return limpa;
    case 'point': {
      if (!ev.complete) {
        inicio = ev.point;
        return previa(inicio, ev.point);
      }
      const [a, b] = ev.collected.base;
      inicio = null;
      const projeto = await ctx.model.read();
      const nivel = projeto.levels[0];
      const tipo = Object.keys(projeto.wallTypes)[0];
      const comandos = [];
      for (const [p, q] of segmentos(a, b)) {
        const id = await ctx.model.newId('w');
        comandos.push({
          type: 'addWall',
          wall: {
            id, kind: 'wall', typeId: tipo, levelId: nivel.id, a: p, b: q,
            baseOffset: 0, topLevelId: null, height: 2.8, topOffset: 0,
            attachBottomToFloor: false, attachTopToFloor: false, attachTopToRoof: false,
            locationLine: 'wallCenter', flipped: false, noJoinStart: false, noJoinEnd: false,
            joinStart: { kind: 'butt', flip: false }, joinEnd: { kind: 'butt', flip: false },
            sag: 0, topProfile: null, mark: '', comments: '',
          },
        });
      }
      if (comandos.length === 0) return { message: 'Escolha dois pontos mais distantes.', ...limpa };
      return { commit: { label: 'Grade de paredes', commands: comandos }, ...limpa };
    }
    default:
      return undefined;
  }
}
