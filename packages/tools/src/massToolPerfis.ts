import type { Vec2 } from '@hestia/geom';
import { secaoCirculo, type Mass, type PerfilMassa, type SecaoMassa } from '@hestia/model';

/**
 * Geometria dos perfis e das pilhas de seções da ferramenta Massa (A.2 e E7/E4). Tudo aqui é função pura: a ferramenta
 * (`massTool.ts`) clica, guarda o passo e chama estas funções. O modelo valida o resultado (`massIssue`), não este módulo.
 */

/** Um perfil já posicionado: `centro` em mundo e `perfil` em coordenadas locais a esse centro. */
export interface CapturaPerfil {
  centro: Vec2;
  perfil: PerfilMassa;
}

/** Dados de uma massa antes de virar comando: origem, seções e interpolação. */
export interface DadosMassa {
  origem: Vec2;
  secoes: SecaoMassa[];
  interpolacao: Mass['interpolacao'];
}

/** Arredonda a 1 mm (1e-3 m), como pede o centro do perfil livre (ficha T1 do plano). */
const arredonda1mm = (v: number): number => Math.round(v * 1000) / 1000;

const distancia = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Círculo: o centro é o primeiro clique e o raio vai até o segundo (ou ao ponto digitado). */
export function capturaCirculo(centro: Vec2, borda: Vec2): CapturaPerfil {
  return { centro, perfil: { forma: 'circulo', raio: distancia(centro, borda) } };
}

/** Elipse: `rx` e `ry` são os lados do retângulo entre o centro e o canto clicado (|dx| e |dy|). */
export function capturaElipse(centro: Vec2, canto: Vec2): CapturaPerfil {
  return { centro, perfil: { forma: 'elipse', rx: Math.abs(canto.x - centro.x), ry: Math.abs(canto.y - centro.y) } };
}

/** Polígono regular: o raio é a distância do centro ao clique; o vértice cai em +x local (E1 item 2). */
export function capturaPoligono(centro: Vec2, borda: Vec2, lados: number): CapturaPerfil {
  return { centro, perfil: { forma: 'poligono', lados, raio: distancia(centro, borda) } };
}

/**
 * Perfil livre: o centro é o centróide dos vértices (média), arredondado a 1 mm; os pontos saem locais a esse centro.
 * Como o centro é o próprio arredondado, os pontos de mundo voltam exatamente aos cliques (centro + local).
 */
export function capturaLivre(pontos: readonly Vec2[]): CapturaPerfil {
  const n = Math.max(1, pontos.length);
  const soma = pontos.reduce((s, q) => ({ x: s.x + q.x, y: s.y + q.y }), { x: 0, y: 0 });
  const centro = { x: arredonda1mm(soma.x / n), y: arredonda1mm(soma.y / n) };
  return { centro, perfil: { forma: 'livre', pontos: pontos.map((q) => ({ x: q.x - centro.x, y: q.y - centro.y })) } };
}

/** Seção de perfil com rotação 0, escala 1 e o deslocamento dado. */
const secao = (z: number, perfil: PerfilMassa, dx: number, dy: number): SecaoMassa => ({ z, perfil, rotacao: 0, escala: 1, dx, dy });

/**
 * Extrusão e mistura: duas seções, na base (z = 0) e no topo (z = altura). A origem é o centro do perfil da base e o
 * topo entra com o seu deslocamento em relação a ela. Extrusão passa o mesmo perfil nos dois lados (deslocamento 0).
 */
export function pilhaDeDois(base: CapturaPerfil, topo: CapturaPerfil, altura: number): DadosMassa {
  const origem = base.centro;
  return {
    origem,
    secoes: [secao(0, base.perfil, 0, 0), secao(altura, topo.perfil, topo.centro.x - origem.x, topo.centro.y - origem.y)],
    interpolacao: 'linear',
  };
}

/** Razões do bulbo (M4 de A.10, E3 e E4): raio em fração do raio máximo e cota em fração da altura. */
const RAZAO_RAIO_BULBO = [0.5, 0.8333, 1, 0.6667, 0.25];
const RAZAO_Z_BULBO = [0, 0.2667, 0.5333, 0.8, 1];

/**
 * Bulbo: cinco seções de círculo, com raios R·razão em z = H·razão, interpolação suave. A origem é o centro. Só
 * círculo: um perfil que não seja círculo dá raio 0 e o modelo recusa a massa.
 */
export function pilhaBulbo(centro: CapturaPerfil, altura: number): DadosMassa {
  const raioMax = centro.perfil.forma === 'circulo' ? centro.perfil.raio : 0;
  return {
    origem: centro.centro,
    secoes: RAZAO_RAIO_BULBO.map((r, i) => secaoCirculo(altura * RAZAO_Z_BULBO[i]!, raioMax * r)),
    interpolacao: 'suave',
  };
}

/** Pontos do contorno do perfil em mundo, para a prévia (n pontos por volta nos perfis curvos). */
export function anelDoPerfil(perfil: PerfilMassa, centro: Vec2, n = 48): Vec2[] {
  switch (perfil.forma) {
    case 'circulo':
      return voltaElipse(centro, perfil.raio, perfil.raio, n);
    case 'elipse':
      return voltaElipse(centro, perfil.rx, perfil.ry, n);
    case 'poligono':
      return Array.from({ length: perfil.lados }, (_, k) => {
        const a = (2 * Math.PI * k) / perfil.lados;
        return { x: centro.x + perfil.raio * Math.cos(a), y: centro.y + perfil.raio * Math.sin(a) };
      });
    case 'livre':
      return perfil.pontos.map((q) => ({ x: centro.x + q.x, y: centro.y + q.y }));
  }
}

function voltaElipse(c: Vec2, rx: number, ry: number, n: number): Vec2[] {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) };
  });
}
