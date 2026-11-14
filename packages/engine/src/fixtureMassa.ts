/**
 * Massas de referência M1 a M5 (plano de massa, A.10; emendas E3 e E4) para os testes do motor e do kernel. Todas com origem (0, 0), no nível de cota
 * 0, resolução 64, salvo indicação. O equivalente Rust é `crates/geom-wasm/src/massa_fixture.rs` (só em teste).
 *
 * O projeto de referência tem 11 níveis, de 0 a 30 m de 3 em 3 m (como a R2 do kernel), para que as fatias caiam em todas as cotas de A.10.
 */
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeLevel, makeMass, type Mass, type PerfilMassa, type Project, type SecaoMassa } from '@hestia/model';

/** Raio do quadrado de lado 8 (M3): 4·√2 exato, para a área dar 64 (E3 item 2). */
export const RAIO_M3 = 4 * Math.SQRT2;

const sec = (z: number, perfil: PerfilMassa, extra: Partial<Pick<SecaoMassa, 'rotacao' | 'escala' | 'dx' | 'dy'>> = {}): SecaoMassa => ({
  z,
  perfil,
  rotacao: 0,
  escala: 1,
  dx: 0,
  dy: 0,
  ...extra,
});

const retangulo: Vec2[] = [
  { x: -5, y: -3 },
  { x: 5, y: -3 },
  { x: 5, y: 3 },
  { x: -5, y: 3 },
];

/** Gota de 8 pontos da pétala (E3 item 3): ponta em +x, anti-horária, origem local dentro. */
export const GOTA_PETALA: Vec2[] = [
  { x: 1.6, y: 0 },
  { x: 0.7, y: 0.5 },
  { x: 0, y: 0.7 },
  { x: -0.6, y: 0.5 },
  { x: -0.9, y: 0 },
  { x: -0.6, y: -0.5 },
  { x: 0, y: -0.7 },
  { x: 0.7, y: -0.5 },
];

const base = (id: string, nome: string, secoes: SecaoMassa[], extra: Partial<Omit<Mass, 'kind' | 'order'>> = {}): Mass => ({
  ...makeMass({ id, levelId: 'lv_0', name: nome, secoes, ...extra }),
  order: 0,
});

/** M1 caixa: livre retângulo 10 × 6, extrusão de 9 m, linear. Volume 540. */
export const massaM1 = (): Mass => base('m1', 'M1 caixa', [sec(0, { forma: 'livre', pontos: retangulo }), sec(9, { forma: 'livre', pontos: retangulo })]);

/** M2 cilindro: círculo de raio 5, extrusão de 12 m. */
export const massaM2 = (): Mass => base('m2', 'M2 cilindro', [sec(0, { forma: 'circulo', raio: 5 }), sec(12, { forma: 'circulo', raio: 5 })]);

/** M3 torre torcida: quadrado de lado 8 (polígono de 4 lados), 30 m, rotação de 0 a π/2, linear. */
export const massaM3 = (): Mass =>
  base('m3', 'M3 torre torcida', [
    sec(0, { forma: 'poligono', lados: 4, raio: RAIO_M3 }),
    sec(30, { forma: 'poligono', lados: 4, raio: RAIO_M3 }, { rotacao: Math.PI / 2 }),
  ]);

/** M4 bulbo: círculos de raio 3; 5; 6; 4; 1,5 em z = 0; 4; 8; 12; 15, suave. */
export const massaM4 = (): Mass =>
  base(
    'm4',
    'M4 bulbo',
    [
      sec(0, { forma: 'circulo', raio: 3 }),
      sec(4, { forma: 'circulo', raio: 5 }),
      sec(8, { forma: 'circulo', raio: 6 }),
      sec(12, { forma: 'circulo', raio: 4 }),
      sec(15, { forma: 'circulo', raio: 1.5 }),
    ],
    { interpolacao: 'suave' },
  );

/** M5 flor, parte 1: o bulbo M4 no centro (massa 5). */
export const massaM5Bulbo = (): Mass => ({ ...massaM4(), id: 'm5', name: 'M5 flor (centro)' });

/** M5 flor, parte 2: a pétala em gota de 8 pontos, 4 seções inclinadas para fora, suave, arranjo de 12 cópias em volta de (0, 0), volta completa. */
export const massaM5Petala = (): Mass =>
  base(
    'm5p',
    'M5 pétala',
    [
      sec(0, { forma: 'livre', pontos: GOTA_PETALA }, { escala: 1, dx: 4 }),
      sec(4, { forma: 'livre', pontos: GOTA_PETALA }, { escala: 1.6, dx: 6 }),
      sec(8, { forma: 'livre', pontos: GOTA_PETALA }, { escala: 1.3, dx: 8.5 }),
      sec(11, { forma: 'livre', pontos: GOTA_PETALA }, { escala: 0.5, dx: 10.5 }),
    ],
    { interpolacao: 'suave', arranjo: { n: 12, cx: 0, cy: 0, anguloTotal: 2 * Math.PI } },
  );

/** As massas de A.10 na ordem de criação: M1, M2, M3, M4, M5 (bulbo e pétala). */
export const massasDeReferencia = (): Mass[] => [massaM1(), massaM2(), massaM3(), massaM4(), massaM5Bulbo(), massaM5Petala()];

/** Projeto com as massas de referência e os 11 níveis (0 a 30 m, de 3 em 3 m). */
export function projetoComMassas(): Project {
  const s = new ProjectStore(createEmptyProject());
  for (let i = 2; i <= 10; i++) s.exec({ type: 'upsertLevel', level: makeLevel({ id: `lv_${i}`, name: `Nível ${i + 1}`, elevation: i * 3 }) });
  for (const m of massasDeReferencia()) s.exec({ type: 'addMass', mass: m });
  return s.project;
}
