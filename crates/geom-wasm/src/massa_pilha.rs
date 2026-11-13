//! Pilha de seções da massa (plano de massa, A.4 regras 2 a 4): o conjunto comum de parâmetros `T`, o anel de cada seção e o anel interpolado.
//!
//! Entre duas seções interpolam-se EM SEPARADO os pontos locais já escalados (um por `t`), a rotação, o `dx` e o `dy`; só depois entram a rotação e a
//! translação. Nunca se interpolam pontos de mundo (isso encolheria a torre torcida). `linear`: reta em z. `suave`: PCHIP (cúbica monótona de
//! Fritsch-Carlson) em z, por coordenada, com as seções como nós: monótona em cada trecho, então não ultrapassa os valores das seções vizinhas.

use crate::esquema::LIMITE;
use crate::massa_perfil::Curva;
use crate::massa_tipos::{Massa, FUSAO_T, T_MAX};

fn sinal(v: f64) -> i8 {
    if v > 0.0 {
        1
    } else if v < 0.0 {
        -1
    } else {
        0
    }
}

/// Derivada de ponta do PCHIP (fórmula de três pontos, limitada para preservar a forma).
fn derivada_de_ponta(h0: f64, h1: f64, m0: f64, m1: f64) -> f64 {
    let d = ((2.0 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if sinal(d) != sinal(m0) {
        0.0
    } else if sinal(m0) != sinal(m1) && d.abs() > 3.0 * m0.abs() {
        3.0 * m0
    } else {
        d
    }
}

/// Derivadas do PCHIP nos nós `z` (crescentes) para os valores `y`. Com dois nós é a reta.
pub fn derivadas_pchip(z: &[f64], y: &[f64]) -> Vec<f64> {
    let n = z.len();
    let h: Vec<f64> = (0..n - 1).map(|k| z[k + 1] - z[k]).collect();
    let m: Vec<f64> = (0..n - 1).map(|k| (y[k + 1] - y[k]) / h[k]).collect();
    if n == 2 {
        return vec![m[0], m[0]];
    }
    let mut d = vec![0.0; n];
    for k in 1..n - 1 {
        if sinal(m[k - 1]) * sinal(m[k]) > 0 {
            let (w1, w2) = (2.0 * h[k] + h[k - 1], h[k] + 2.0 * h[k - 1]);
            d[k] = (w1 + w2) / (w1 / m[k - 1] + w2 / m[k]);
        }
    }
    d[0] = derivada_de_ponta(h[0], h[1], m[0], m[1]);
    d[n - 1] = derivada_de_ponta(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
    d
}

/// Valor em `u ∈ [0, 1]` do trecho de altura `h` entre `y0` e `y1`. `d = None`: linear; `Some((d0, d1))`: cúbica de Hermite do PCHIP, presa ao
/// intervalo das pontas (a cúbica é monótona no trecho; o limite só tira o resíduo de arredondamento).
pub fn interpolar(y0: f64, y1: f64, d: Option<(f64, f64)>, h: f64, u: f64) -> f64 {
    match d {
        None => y0 + (y1 - y0) * u,
        Some((d0, d1)) => {
            let (u2, u3) = (u * u, u * u * u);
            let v = (2.0 * u3 - 3.0 * u2 + 1.0) * y0 + (u3 - 2.0 * u2 + u) * h * d0 + (3.0 * u2 - 2.0 * u3) * y1 + (u3 - u2) * h * d1;
            v.clamp(y0.min(y1), y0.max(y1))
        }
    }
}

/// Conjunto comum de parâmetros (regra 2): grade uniforme de `resolucao` pontos mais as quinas de todas as curvas, fundindo o que fica a menos de
/// `FUSAO_T` (a quina vence a grade, para o canto ficar vivo). Crescente, começa em 0. Mais de `T_MAX` é `LIMITE`.
pub fn parametros(resolucao: u32, curvas: &[Curva]) -> Result<Vec<f64>, u32> {
    // (t, é grade): com `false < true`, a quina vem antes da grade no empate.
    let mut c: Vec<(f64, bool)> = (0..resolucao).map(|k| (k as f64 / resolucao as f64, true)).collect();
    for curva in curvas {
        // Quina colada em 1 é a mesma que 0 (a curva é fechada).
        c.extend(curva.quinas().into_iter().map(|t| (if t > 1.0 - FUSAO_T { t - 1.0 } else { t }, false)));
    }
    c.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    let mut t: Vec<f64> = Vec::new();
    let mut i = 0;
    while i < c.len() {
        let inicio = c[i].0;
        let mut j = i;
        let mut escolhido = None;
        while j < c.len() && c[j].0 - inicio < FUSAO_T {
            if escolhido.is_none() && !c[j].1 {
                escolhido = Some(c[j].0);
            }
            j += 1;
        }
        t.push(escolhido.unwrap_or(inicio).max(0.0));
        i = j;
    }
    if t.len() > T_MAX {
        return Err(LIMITE);
    }
    Ok(t)
}

/// Um canal interpolado em z: valores nas seções e, se suave, as derivadas do PCHIP.
struct Canal {
    y: Vec<f64>,
    d: Option<Vec<f64>>,
}

impl Canal {
    fn novo(z: &[f64], y: Vec<f64>, suave: bool) -> Canal {
        let d = if suave { Some(derivadas_pchip(z, &y)) } else { None };
        Canal { y, d }
    }

    fn em(&self, k: usize, h: f64, u: f64) -> f64 {
        interpolar(self.y[k], self.y[k + 1], self.d.as_ref().map(|d| (d[k], d[k + 1])), h, u)
    }
}

/// A pilha de uma massa já validada, pronta para devolver anéis (cópia 0, em planta no mundo).
pub struct Pilha {
    /// Parâmetros comuns a todos os anéis.
    pub t: Vec<f64>,
    /// Altura de cada seção acima da base.
    pub z: Vec<f64>,
    /// `true` se os perfis das seções `k` e `k + 1` diferem.
    pub perfil_difere: Vec<bool>,
    pub suave: bool,
    ox: f64,
    oy: f64,
    /// Por `t`: canais x e y do ponto local já escalado.
    pontos: Vec<[Canal; 2]>,
    rot: Canal,
    dx: Canal,
    dy: Canal,
}

impl Pilha {
    pub fn nova(m: &Massa) -> Result<Pilha, u32> {
        let curvas: Vec<Curva> = m.secoes.iter().map(|s| Curva::nova(&s.perfil)).collect();
        let t = parametros(m.resolucao, &curvas)?;
        let z: Vec<f64> = m.secoes.iter().map(|s| s.z).collect();
        let pontos = t
            .iter()
            .map(|&tj| {
                let p: Vec<[f64; 2]> = curvas.iter().zip(&m.secoes).map(|(c, s)| { let q = c.ponto(tj); [q[0] * s.escala, q[1] * s.escala] }).collect();
                [Canal::novo(&z, p.iter().map(|q| q[0]).collect(), m.suave), Canal::novo(&z, p.iter().map(|q| q[1]).collect(), m.suave)]
            })
            .collect();
        let canal = |f: fn(&crate::massa_tipos::Secao) -> f64| Canal::novo(&z, m.secoes.iter().map(f).collect(), m.suave);
        Ok(Pilha {
            perfil_difere: m.secoes.windows(2).map(|w| w[0].perfil != w[1].perfil).collect(),
            suave: m.suave,
            ox: m.ox,
            oy: m.oy,
            pontos,
            rot: canal(|s| s.rot),
            dx: canal(|s| s.dx),
            dy: canal(|s| s.dy),
            t,
            z,
        })
    }

    /// Número de trechos (seções menos 1).
    pub fn trechos(&self) -> usize {
        self.z.len() - 1
    }

    /// Diferença de rotação do trecho `k`, em módulo.
    pub fn delta_rot(&self, k: usize) -> f64 {
        (self.rot.y[k + 1] - self.rot.y[k]).abs()
    }

    /// Anel no trecho `k`, na fração `u ∈ [0, 1]` da altura do trecho (regras 3 e 4). `u = 0` e `u = 1` devolvem as seções exatas.
    pub fn anel(&self, k: usize, u: f64) -> Vec<[f64; 2]> {
        // Nas pontas usa os valores da seção, sem passar pela interpolação.
        let (k, u, exato) = if u <= 0.0 { (k, 0.0, Some(k)) } else if u >= 1.0 { (k, 1.0, Some(k + 1)) } else { (k, u, None) };
        let h = self.z[k + 1] - self.z[k];
        let v = |c: &Canal| exato.map_or_else(|| c.em(k, h, u), |i| c.y[i]);
        let (s, c) = v(&self.rot).sin_cos();
        let (tx, ty) = (self.ox + v(&self.dx), self.oy + v(&self.dy));
        self.pontos.iter().map(|p| { let (x, y) = (v(&p[0]), v(&p[1])); [tx + x * c - y * s, ty + x * s + y * c] }).collect()
    }

    /// Anel na altura `z` acima da base, ou `None` fora da massa. Independe do `lod` e da malha (regra 8).
    pub fn anel_em_z(&self, z: f64) -> Option<Vec<[f64; 2]>> {
        let n = self.z.len();
        if !(z >= self.z[0] && z <= self.z[n - 1]) {
            return None;
        }
        let k = (self.z.partition_point(|&v| v <= z).clamp(1, n - 1)) - 1;
        Some(self.anel(k, (z - self.z[k]) / (self.z[k + 1] - self.z[k])))
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::massa_tipos::{Perfil, Secao};

    #[test]
    fn pchip_passa_pelos_nos_e_nao_ultrapassa() {
        let z = [0.0, 4.0, 8.0, 12.0, 15.0];
        let y = [3.0, 5.0, 6.0, 4.0, 1.5];
        let d = derivadas_pchip(&z, &y);
        // No máximo local (z = 8) a derivada é zero.
        assert_eq!(d[2], 0.0);
        for k in 0..4 {
            let h = z[k + 1] - z[k];
            assert_eq!(interpolar(y[k], y[k + 1], Some((d[k], d[k + 1])), h, 0.0), y[k]);
            assert_eq!(interpolar(y[k], y[k + 1], Some((d[k], d[k + 1])), h, 1.0), y[k + 1]);
            let mut ant = y[k];
            for i in 1..=100 {
                let v = interpolar(y[k], y[k + 1], Some((d[k], d[k + 1])), h, i as f64 / 100.0);
                assert!(v >= y[k].min(y[k + 1]) && v <= y[k].max(y[k + 1]));
                // Monótona no trecho.
                assert!((v - ant) * (y[k + 1] - y[k]) >= -1e-12, "trecho {k}, passo {i}");
                ant = v;
            }
        }
        // Dois nós: reta. Dados constantes: constante.
        assert_eq!(derivadas_pchip(&[0.0, 2.0], &[1.0, 5.0]), vec![2.0, 2.0]);
        assert_eq!(derivadas_pchip(&[0.0, 1.0, 3.0], &[2.0, 2.0, 2.0]), vec![0.0, 0.0, 0.0]);
        assert_eq!(interpolar(1.0, 3.0, None, 9.0, 0.25), 1.5);
    }

    #[test]
    fn parametros_fundem_quinas_com_a_grade() {
        let quadrado = Curva::nova(&Perfil::Poligono { lados: 4, raio: 1.0 });
        // As 4 quinas caem na grade de 16: nada a mais.
        assert_eq!(parametros(16, std::slice::from_ref(&quadrado)).map(|t| t.len()), Ok(16));
        // Pentágono: 0 coincide, as outras 4 são novas.
        let penta = Curva::nova(&Perfil::Poligono { lados: 5, raio: 1.0 });
        let t = parametros(16, &[quadrado, penta]).expect("T");
        assert_eq!(t.len(), 20);
        assert_eq!(t[0], 0.0);
        assert!(t.windows(2).all(|w| w[1] - w[0] >= FUSAO_T));
        assert!(t.iter().any(|v| (v - 0.2).abs() < 1e-12));
        // 64 lados em grade de 128 cabem; livre de 256 pontos irregulares estoura 512.
        let muitos: Vec<[f64; 2]> = (0..256).map(|i| { let a = std::f64::consts::TAU * (i as f64 + 0.3 * ((i * 7 % 5) as f64 / 5.0)) / 256.0; [3.0 * a.cos(), 3.0 * a.sin()] }).collect();
        let a = Curva::nova(&Perfil::Livre { pontos: muitos.clone() });
        let b = Curva::nova(&Perfil::Livre { pontos: muitos.iter().map(|p| [p[0] * 1.5, p[1]]).collect() });
        assert!(parametros(128, std::slice::from_ref(&a)).is_ok());
        assert_eq!(parametros(128, &[a, b]), Err(LIMITE));
    }

    fn torre(suave: bool) -> Massa {
        let s = |z: f64, raio: f64, rot: f64, dx: f64| Secao { z, perfil: Perfil::Poligono { lados: 4, raio }, rot, escala: 1.0, dx, dy: 0.0 };
        Massa { num: 1, nivel: 0, ox: 10.0, oy: 20.0, z_base: 0.0, suave, resolucao: 16, arranjo: None, secoes: vec![s(0.0, 2.0, 0.0, 0.0), s(10.0, 2.0, 1.0, 4.0)] }
    }

    #[test]
    fn anel_aplica_escala_rotacao_e_translacao_nessa_ordem() {
        let p = Pilha::nova(&torre(false)).expect("pilha");
        assert_eq!((p.trechos(), p.t.len()), (1, 16));
        assert!(!p.perfil_difere[0]);
        assert!((p.delta_rot(0) - 1.0).abs() < 1e-15);
        assert_eq!(p.anel(0, 0.0)[0], [12.0, 20.0]);
        // No topo: vértice girado 1 rad e deslocado 4 em x.
        let topo = p.anel(0, 1.0)[0];
        assert!((topo[0] - (14.0 + 2.0 * 1.0_f64.cos())).abs() < 1e-12 && (topo[1] - (20.0 + 2.0 * 1.0_f64.sin())).abs() < 1e-12);
        // No meio: o raio continua 2 (interpola rotação, não pontos de mundo).
        let meio = p.anel(0, 0.5)[0];
        assert!(((meio[0] - 12.0).hypot(meio[1] - 20.0) - 2.0).abs() < 1e-12);
        assert_eq!(p.anel_em_z(5.0), Some(p.anel(0, 0.5)));
        assert_eq!(p.anel_em_z(10.0), Some(p.anel(0, 1.0)));
        assert_eq!(p.anel_em_z(10.5), None);
        assert_eq!(p.anel_em_z(-0.1), None);
        // Com duas seções, suave e linear coincidem.
        let s = Pilha::nova(&torre(true)).expect("pilha");
        for (a, b) in s.anel(0, 0.3).iter().zip(p.anel(0, 0.3)) {
            assert!((a[0] - b[0]).abs() < 1e-12 && (a[1] - b[1]).abs() < 1e-12);
        }
    }
}
