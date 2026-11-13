//! Perfil da massa como curva fechada parametrizada (plano de massa, A.4 regra 1).
//!
//! `t ∈ [0, 1)` é o comprimento de arco normalizado, no sentido anti-horário, a partir do ponto em que a semirreta +x local (saindo do centro do
//! perfil, a origem local) cruza o perfil. Círculo: fórmula fechada. Elipse: tabela de comprimento de arco (Gauss-Legendre) invertida por Newton.
//! Polígono regular e livre: poligonal com comprimento acumulado; os parâmetros dos vértices são as quinas que entram no conjunto `T` (regra 2).
//!
//! Perfil livre e a semirreta +x: quando ela cruza o perfil mais de uma vez (perfil não estrelado em relação à origem), vale o cruzamento mais
//! distante (o do contorno externo). Quando não cruza (origem fora do perfil), o início é o vértice de maior x (o de menor índice no empate).

use crate::massa_tipos::Perfil;
use std::f64::consts::TAU;

/// Intervalos da tabela de comprimento de arco da elipse.
const N_ELIPSE: usize = 256;
/// Gauss-Legendre de 5 pontos em [-1, 1]: abscissas e pesos.
const GL_X: [f64; 5] = [-0.906_179_845_938_664, -0.538_469_310_105_683_1, 0.0, 0.538_469_310_105_683_1, 0.906_179_845_938_664];
const GL_W: [f64; 5] = [0.236_926_885_056_189_08, 0.478_628_670_499_366_47, 0.568_888_888_888_888_9, 0.478_628_670_499_366_47, 0.236_926_885_056_189_08];
/// Folga relativa para devolver o vértice exato da poligonal.
const FOLGA_VERTICE: f64 = 1e-15;

/// Curva fechada de um perfil, pronta para amostrar por `t`.
#[derive(Clone, Debug, PartialEq)]
pub enum Curva {
    Circulo { raio: f64 },
    /// `acum[i]` = comprimento de arco de 0 até o ângulo `i · 2π / N_ELIPSE`.
    Elipse { rx: f64, ry: f64, acum: Vec<f64> },
    /// `pts[0]` é o ponto de início; `acum[i]` = comprimento até `pts[i]`, `acum[n]` = perímetro.
    Poligonal { pts: Vec<[f64; 2]>, acum: Vec<f64> },
}

fn velocidade(rx: f64, ry: f64, a: f64) -> f64 {
    let (s, c) = a.sin_cos();
    (rx * rx * s * s + ry * ry * c * c).sqrt()
}

/// Comprimento de arco da elipse entre os ângulos `a` e `b`.
fn arco_elipse(rx: f64, ry: f64, a: f64, b: f64) -> f64 {
    let (m, h) = ((a + b) / 2.0, (b - a) / 2.0);
    let mut s = 0.0;
    for k in 0..5 {
        s += GL_W[k] * velocidade(rx, ry, m + h * GL_X[k]);
    }
    s * h
}

fn poligonal(pts: Vec<[f64; 2]>) -> Curva {
    let n = pts.len();
    let mut acum = Vec::with_capacity(n + 1);
    let mut s = 0.0;
    acum.push(0.0);
    for i in 0..n {
        let (a, b) = (pts[i], pts[(i + 1) % n]);
        s += (b[0] - a[0]).hypot(b[1] - a[1]);
        acum.push(s);
    }
    Curva::Poligonal { pts, acum }
}

/// Poligonal do perfil livre começando no cruzamento com a semirreta +x (ver o cabeçalho do módulo).
fn livre(p: &[[f64; 2]]) -> Curva {
    let n = p.len();
    // (x do cruzamento, aresta, fração na aresta)
    let mut melhor: Option<(f64, usize, f64)> = None;
    for i in 0..n {
        let (a, b) = (p[i], p[(i + 1) % n]);
        let cruza = (a[1] <= 0.0 && b[1] > 0.0) || (b[1] <= 0.0 && a[1] > 0.0);
        if !cruza {
            continue;
        }
        let u = (0.0 - a[1]) / (b[1] - a[1]);
        let x = a[0] + u * (b[0] - a[0]);
        if x > 0.0 && melhor.is_none_or(|m| x > m.0) {
            melhor = Some((x, i, u));
        }
    }
    let mut pts = Vec::with_capacity(n + 1);
    let primeiro = match melhor {
        Some((_, i, u)) if u <= 0.0 => i,
        Some((_, i, u)) if u >= 1.0 => (i + 1) % n,
        Some((x, i, _)) => {
            pts.push([x, 0.0]);
            (i + 1) % n
        }
        None => {
            let mut k = 0;
            for i in 1..n {
                if p[i][0] > p[k][0] {
                    k = i;
                }
            }
            k
        }
    };
    for j in 0..n {
        pts.push(p[(primeiro + j) % n]);
    }
    poligonal(pts)
}

impl Curva {
    /// Monta a curva de um perfil já validado.
    pub fn nova(p: &Perfil) -> Curva {
        match p {
            Perfil::Circulo { raio } => Curva::Circulo { raio: *raio },
            Perfil::Elipse { rx, ry } => {
                let h = TAU / N_ELIPSE as f64;
                let mut acum = Vec::with_capacity(N_ELIPSE + 1);
                let mut s = 0.0;
                acum.push(0.0);
                for i in 0..N_ELIPSE {
                    s += arco_elipse(*rx, *ry, i as f64 * h, (i + 1) as f64 * h);
                    acum.push(s);
                }
                Curva::Elipse { rx: *rx, ry: *ry, acum }
            }
            Perfil::Poligono { lados, raio } => {
                let n = *lados as usize;
                poligonal((0..n).map(|k| if k == 0 { [*raio, 0.0] } else { let a = TAU * k as f64 / n as f64; [raio * a.cos(), raio * a.sin()] }).collect())
            }
            Perfil::Livre { pontos } => livre(pontos),
        }
    }

    /// Ponto local (sem escala) no parâmetro `t ∈ [0, 1)`.
    pub fn ponto(&self, t: f64) -> [f64; 2] {
        match self {
            Curva::Circulo { raio } => {
                if t == 0.0 {
                    return [*raio, 0.0];
                }
                let (s, c) = (TAU * t).sin_cos();
                [raio * c, raio * s]
            }
            Curva::Elipse { rx, ry, acum } => {
                if t == 0.0 {
                    return [*rx, 0.0];
                }
                let alvo = t * acum[N_ELIPSE];
                let i = acum.partition_point(|&v| v <= alvo).clamp(1, N_ELIPSE) - 1;
                let h = TAU / N_ELIPSE as f64;
                let (a0, a1) = (i as f64 * h, (i + 1) as f64 * h);
                let mut a = a0 + h * (alvo - acum[i]) / (acum[i + 1] - acum[i]);
                for _ in 0..4 {
                    let f = acum[i] + arco_elipse(*rx, *ry, a0, a) - alvo;
                    a = (a - f / velocidade(*rx, *ry, a)).clamp(a0, a1);
                }
                let (s, c) = a.sin_cos();
                [rx * c, ry * s]
            }
            Curva::Poligonal { pts, acum } => {
                let n = pts.len();
                let total = acum[n];
                let alvo = t * total;
                let i = acum.partition_point(|&v| v <= alvo).clamp(1, n) - 1;
                let folga = total * FOLGA_VERTICE;
                if alvo - acum[i] <= folga {
                    return pts[i];
                }
                if acum[i + 1] - alvo <= folga {
                    return pts[(i + 1) % n];
                }
                let u = (alvo - acum[i]) / (acum[i + 1] - acum[i]);
                let (a, b) = (pts[i], pts[(i + 1) % n]);
                [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]
            }
        }
    }

    /// Parâmetros dos vértices (as quinas), em `[0, 1)`. Vazio nas curvas lisas.
    pub fn quinas(&self) -> Vec<f64> {
        match self {
            Curva::Poligonal { pts, acum } => {
                let total = acum[pts.len()];
                (0..pts.len()).map(|i| acum[i] / total).filter(|t| *t < 1.0).collect()
            }
            _ => Vec::new(),
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn perto(a: [f64; 2], b: [f64; 2], tol: f64) -> bool {
        (a[0] - b[0]).abs() <= tol && (a[1] - b[1]).abs() <= tol
    }

    #[test]
    fn circulo_comeca_em_x_e_gira_anti_horario() {
        let c = Curva::nova(&Perfil::Circulo { raio: 5.0 });
        assert_eq!(c.ponto(0.0), [5.0, 0.0]);
        assert!(perto(c.ponto(0.25), [0.0, 5.0], 1e-12));
        assert!(perto(c.ponto(0.5), [-5.0, 0.0], 1e-12));
        assert!(c.quinas().is_empty());
    }

    #[test]
    fn elipse_por_comprimento_de_arco() {
        let c = Curva::nova(&Perfil::Elipse { rx: 4.0, ry: 2.0 });
        assert_eq!(c.ponto(0.0), [4.0, 0.0]);
        // Simetria: um quarto do perímetro cai no topo, metade no lado oposto.
        assert!(perto(c.ponto(0.25), [0.0, 2.0], 1e-9));
        assert!(perto(c.ponto(0.5), [-4.0, 0.0], 1e-9));
        assert!(perto(c.ponto(0.75), [0.0, -2.0], 1e-9));
        // Passos iguais de t dão cordas de comprimento quase igual (parâmetro é o arco, não o ângulo).
        let n = 400;
        let cordas: Vec<f64> = (0..n).map(|k| { let (a, b) = (c.ponto(k as f64 / n as f64), c.ponto(((k + 1) % n) as f64 / n as f64)); (b[0] - a[0]).hypot(b[1] - a[1]) }).collect();
        let (min, max) = cordas.iter().fold((f64::MAX, 0.0_f64), |(mn, mx), &v| (mn.min(v), mx.max(v)));
        assert!(max - min < 1e-4 * max, "cordas de {min} a {max}");
        // Elipse com rx = ry é o círculo.
        let e = Curva::nova(&Perfil::Elipse { rx: 3.0, ry: 3.0 });
        let k = Curva::nova(&Perfil::Circulo { raio: 3.0 });
        for i in 0..64 {
            assert!(perto(e.ponto(i as f64 / 64.0), k.ponto(i as f64 / 64.0), 1e-12));
        }
    }

    #[test]
    fn poligono_regular_tem_vertice_em_x() {
        let c = Curva::nova(&Perfil::Poligono { lados: 4, raio: 2.0 });
        assert_eq!(c.ponto(0.0), [2.0, 0.0]);
        assert!(perto(c.ponto(0.25), [0.0, 2.0], 1e-12));
        assert!(perto(c.ponto(0.125), [1.0, 1.0], 1e-12));
        let q = c.quinas();
        assert_eq!(q.len(), 4);
        for (i, t) in q.iter().enumerate() {
            assert!((t - i as f64 / 4.0).abs() < 1e-12);
        }
    }

    #[test]
    fn livre_comeca_no_cruzamento_com_x() {
        // Retângulo 10 × 6 centrado: começa em (5, 0), no meio do lado direito.
        let ret = vec![[-5.0, -3.0], [5.0, -3.0], [5.0, 3.0], [-5.0, 3.0]];
        let c = Curva::nova(&Perfil::Livre { pontos: ret.clone() });
        assert_eq!(c.ponto(0.0), [5.0, 0.0]);
        assert_eq!(c.ponto(3.0 / 32.0), [5.0, 3.0]);
        assert_eq!(c.ponto(13.0 / 32.0), [-5.0, 3.0]);
        assert!(perto(c.ponto(0.5), [-5.0, 0.0], 1e-12));
        let q = c.quinas();
        assert_eq!(q.len(), 5);
        assert!((q[1] - 3.0 / 32.0).abs() < 1e-15 && (q[4] - 29.0 / 32.0).abs() < 1e-15);
        // Começar a lista por outro ponto não muda a curva.
        let girado = vec![ret[2], ret[3], ret[0], ret[1]];
        let d = Curva::nova(&Perfil::Livre { pontos: girado });
        for i in 0..32 {
            assert!(perto(c.ponto(i as f64 / 32.0), d.ponto(i as f64 / 32.0), 1e-12));
        }
    }

    #[test]
    fn livre_com_vertice_no_eixo_origem_fora_e_varios_cruzamentos() {
        // Losango: o cruzamento é o próprio vértice (2, 0); não entra ponto a mais.
        let c = Curva::nova(&Perfil::Livre { pontos: vec![[0.0, -1.0], [2.0, 0.0], [0.0, 1.0], [-2.0, 0.0]] });
        assert_eq!(c.ponto(0.0), [2.0, 0.0]);
        assert_eq!(c.quinas().len(), 4);
        // Origem fora do perfil (tudo à esquerda): começa no vértice de maior x.
        let f = Curva::nova(&Perfil::Livre { pontos: vec![[-5.0, 1.0], [-3.0, 1.0], [-3.0, 2.0], [-5.0, 2.0]] });
        assert_eq!(f.ponto(0.0), [-3.0, 1.0]);
        // "C" aberto para a direita: +x cruza em x = 1, 2 e 4; vale o mais distante.
        let u = vec![[-1.0, -3.0], [4.0, -3.0], [4.0, 3.0], [-1.0, 3.0], [-1.0, 2.0], [2.0, 2.0], [2.0, -2.0], [1.0, -2.0], [1.0, 1.0], [-1.0, 1.0]];
        assert_eq!(Curva::nova(&Perfil::Livre { pontos: u }).ponto(0.0), [4.0, 0.0]);
    }
}
