import type { ColunasDeEntrada } from './codec.ts';
import type { FonteDaCena } from './cena.ts';
import type { LinhaParede } from './referencia.ts';

/** Linhas de parede -> colunas da seção `paredes` (ordem do esquema). */
export function colunasDeParedes(paredes: readonly LinhaParede[]): ColunasDeEntrada {
  const n = paredes.length;
  const id = new Uint32Array(n);
  const nivel = new Uint32Array(n);
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const bx = new Float64Array(n);
  const by = new Float64Array(n);
  const esp = new Float64Array(n);
  paredes.forEach((p, i) => {
    id[i] = p.id;
    nivel[i] = p.nivel;
    ax[i] = p.ax;
    ay[i] = p.ay;
    bx[i] = p.bx;
    by[i] = p.by;
    esp[i] = p.espessura;
  });
  return { id_num: id, nivel_num: nivel, ax, ay, bx, by, espessura: esp };
}

/** Fonte da cena que reenvia a seção `paredes` a partir de uma lista lida na hora (a fonte da verdade). */
export function fonteDeParedes(ler: () => readonly LinhaParede[]): FonteDaCena {
  return (cena) => {
    const ps = ler();
    cena.definirSecao('paredes', colunasDeParedes(ps), ps.length);
  };
}

/** Paredes determinísticas para testes: grade de segmentos horizontais/verticais em `niveis` pavimentos. */
export function paredesDeTeste(niveis: number, porNivel: number): LinhaParede[] {
  const saida: LinhaParede[] = [];
  let id = 1;
  for (let nv = 0; nv < niveis; nv++) {
    for (let i = 0; i < porNivel; i++) {
      const x = (i % 10) * 3;
      const y = Math.floor(i / 10) * 3;
      const horizontal = i % 2 === 0;
      saida.push({
        id: id++,
        nivel: nv,
        ax: x,
        ay: y,
        bx: horizontal ? x + 3 : x,
        by: horizontal ? y : y + 3,
        espessura: 0.15 + (i % 3) * 0.05,
      });
    }
  }
  return saida;
}
