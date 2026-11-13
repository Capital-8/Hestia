//! Massas de referência M1 a M5 (plano de massa, A.10), só para teste, e as ferramentas de conferência da malha.
//!
//! Todas com origem (0, 0), nível 0, base na cota 0 e resolução 64. O equivalente TS é `packages/engine/src/fixtureMassa.ts`.

use crate::cena::Cena;
use crate::massa_malha::MalhaMassa;
use crate::massa_tipos::{Arranjo, Massa, Perfil, Secao};
use crate::secoes_massa::{MassaLinha, MassaPontoLinha, MassaSecaoLinha};
use std::f64::consts::{FRAC_PI_2, TAU};

fn secao(z: f64, perfil: Perfil) -> Secao {
    Secao { z, perfil, rot: 0.0, escala: 1.0, dx: 0.0, dy: 0.0 }
}

fn massa(num: u32, suave: bool, secoes: Vec<Secao>) -> Massa {
    Massa { num, nivel: 0, ox: 0.0, oy: 0.0, z_base: 0.0, suave, resolucao: 64, arranjo: None, secoes }
}

/// M1 caixa: livre retângulo 10 × 6 (centrado), extrusão de 9 m, linear. Volume 540.
pub fn m1() -> Massa {
    let ret = Perfil::Livre { pontos: vec![[-5.0, -3.0], [5.0, -3.0], [5.0, 3.0], [-5.0, 3.0]] };
    massa(1, false, vec![secao(0.0, ret.clone()), secao(9.0, ret)])
}

/// M2 cilindro: círculo de raio 5, extrusão de 12 m.
pub fn m2() -> Massa {
    massa(2, false, vec![secao(0.0, Perfil::Circulo { raio: 5.0 }), secao(12.0, Perfil::Circulo { raio: 5.0 })])
}

/// M3 torre torcida: quadrado de lado 8 (polígono de 4 lados; o raio "5,657" de A.10 é 4·√2 arredondado, aqui exato para a área ser 64), 30 m,
/// rotação de 0 a π/2, linear.
pub fn m3() -> Massa {
    let q = Perfil::Poligono { lados: 4, raio: 4.0 * std::f64::consts::SQRT_2 };
    massa(3, false, vec![secao(0.0, q.clone()), Secao { rot: FRAC_PI_2, ..secao(30.0, q) }])
}

/// M4 bulbo: círculos de raio 3; 5; 6; 4; 1,5 em z = 0; 4; 8; 12; 15, suave.
pub fn m4() -> Massa {
    let c = |z: f64, raio: f64| secao(z, Perfil::Circulo { raio });
    massa(4, true, vec![c(0.0, 3.0), c(4.0, 5.0), c(8.0, 6.0), c(12.0, 4.0), c(15.0, 1.5)])
}

/// A pétala da M5: gota de 8 pontos (ponta em +x, anti-horária, com a origem local dentro), em 4 seções que se afastam do centro (dx cresce com a
/// altura: inclinadas para fora), suave, em arranjo de 12 cópias em volta de (0, 0), volta completa.
///
/// Valores: z = 0; 4; 8; 11, escala = 1; 1,6; 1,3; 0,5 e dx = 4; 6; 8,5; 10,5.
pub fn m5_petala() -> Massa {
    let gota = Perfil::Livre { pontos: vec![[1.6, 0.0], [0.7, 0.5], [0.0, 0.7], [-0.6, 0.5], [-0.9, 0.0], [-0.6, -0.5], [0.0, -0.7], [0.7, -0.5]] };
    let s = |z: f64, escala: f64, dx: f64| Secao { escala, dx, ..secao(z, gota.clone()) };
    Massa { arranjo: Some(Arranjo { n: 12, cx: 0.0, cy: 0.0, ang: TAU }), ..massa(6, true, vec![s(0.0, 1.0, 4.0), s(4.0, 1.6, 6.0), s(8.0, 1.3, 8.5), s(11.0, 0.5, 10.5)]) }
}

/// M5 flor: o bulbo M4 no centro (massa 5) mais a pétala em arranjo (massa 6).
pub fn m5() -> Vec<Massa> {
    vec![Massa { num: 5, ..m4() }, m5_petala()]
}

/// M1 a M5, uma lista por massa de referência.
pub fn todas() -> Vec<(&'static str, Vec<Massa>)> {
    vec![("M1", vec![m1()]), ("M2", vec![m2()]), ("M3", vec![m3()]), ("M4", vec![m4()]), ("M5", m5())]
}

/// Grava as massas nas seções 140 a 142 da cena (ids de seção e de ponto sequenciais), como o adaptador TS faria.
pub fn por_na_cena(c: &mut Cena, massas: &[Massa]) {
    for m in massas {
        let a = m.arranjo.unwrap_or(Arranjo { n: 1, cx: 0.0, cy: 0.0, ang: 0.0 });
        let linha = MassaLinha { nivel: m.nivel, ox: m.ox, oy: m.oy, z_base: m.z_base, interp: u8::from(m.suave), resolucao: m.resolucao, arr_n: a.n, arr_cx: a.cx, arr_cy: a.cy, arr_ang: a.ang };
        c.massa.massas.insert(m.num, linha);
        for (i, s) in m.secoes.iter().enumerate() {
            let id = c.massa.secoes.len() as u32 + 1;
            let (forma, p1, p2, lados) = match &s.perfil {
                Perfil::Circulo { raio } => (0, *raio, 0.0, 0),
                Perfil::Elipse { rx, ry } => (1, *rx, *ry, 0),
                Perfil::Poligono { lados, raio } => (2, *raio, 0.0, *lados),
                Perfil::Livre { pontos } => {
                    for (j, p) in pontos.iter().enumerate() {
                        let pid = c.massa.pontos.len() as u32 + 1;
                        c.massa.pontos.insert(pid, MassaPontoLinha { secao: id, ordem: j as u32, x: p[0], y: p[1] });
                    }
                    (3, 0.0, 0.0, 0)
                }
            };
            c.massa.secoes.insert(id, MassaSecaoLinha { massa: m.num, ordem: i as u32, z: s.z, forma, p1, p2, lados, rot: s.rot, escala: s.escala, dx: s.dx, dy: s.dy });
        }
    }
}

/// Conferência de uma malha.
#[derive(Clone, Debug, PartialEq)]
pub struct Analise {
    /// Toda aresta orientada aparece uma única vez e a sua inversa também: cada aresta em exatamente 2 triângulos, com orientação coerente.
    pub fechada: bool,
    /// Volume com sinal pelo teorema da divergência (positivo com as normais para fora).
    pub volume: f64,
    /// Nenhum `NaN` nem infinito nos vértices.
    pub finita: bool,
    pub triangulos: usize,
}

/// Analisa a malha inteira (todas as cascas juntas; como não compartilham vértices, a conferência vale casca a casca).
pub fn analisar(m: &MalhaMassa) -> Analise {
    let nv = m.vertices.len();
    let mut volume = 0.0;
    let mut fechada = m.indices.len() % 3 == 0 && m.indices.iter().all(|&i| (i as usize) < nv);
    if fechada {
        // Arestas orientadas agrupadas pelo vértice de saída (contagem + preenchimento): a conferência é linear, sem mapa nem ordenação global.
        let mut inicio = vec![0usize; nv + 1];
        for t in m.indices.chunks_exact(3) {
            fechada &= t[0] != t[1] && t[1] != t[2] && t[2] != t[0];
            for &a in t {
                inicio[a as usize + 1] += 1;
            }
            let (a, b, c) = (m.vertices[t[0] as usize], m.vertices[t[1] as usize], m.vertices[t[2] as usize]);
            volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0;
        }
        for i in 0..nv {
            inicio[i + 1] += inicio[i];
        }
        let mut cursor = inicio.clone();
        let mut destino = vec![0u32; m.indices.len()];
        for t in m.indices.chunks_exact(3) {
            for k in 0..3 {
                destino[cursor[t[k] as usize]] = t[(k + 1) % 3];
                cursor[t[k] as usize] += 1;
            }
        }
        let saidas = |a: usize| &destino[inicio[a]..inicio[a + 1]];
        for a in 0..nv {
            for (k, &b) in saidas(a).iter().enumerate() {
                // (a, b) uma única vez e (b, a) uma única vez.
                fechada &= !saidas(a)[..k].contains(&b) && saidas(b as usize).iter().filter(|&&x| x as usize == a).count() == 1;
            }
        }
    }
    Analise { fechada, volume, finita: m.vertices.iter().all(|p| p.iter().all(|v| v.is_finite())), triangulos: m.indices.len() / 3 }
}

/// Soma das áreas dos triângulos de um grupo (por `papel`), em toda a malha.
pub fn area_do_papel(m: &MalhaMassa, papel: u32) -> f64 {
    let mut area = 0.0;
    for g in m.grupos.iter().filter(|g| g[2] == papel) {
        for t in m.indices[g[3] as usize..(g[3] + g[4]) as usize].chunks_exact(3) {
            let (a, b, c) = (m.vertices[t[0] as usize], m.vertices[t[1] as usize], m.vertices[t[2] as usize]);
            let (u, v) = ([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
            let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            area += (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt() / 2.0;
        }
    }
    area
}
