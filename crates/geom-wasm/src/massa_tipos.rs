//! Tipos da massa de estudo volumétrico (plano de massa, A.2 a A.4): a pilha de seções já lida das seções 140 a 142, os limites e a validação.
//!
//! Metros e radianos. O kernel não conhece o `Project`: tudo o que ele sabe da massa está aqui. A validação repete, do lado do Rust, as regras de
//! A.3 item 5 (o comando TS já recusa massa inválida; aqui a recusa é `ENTRADA`).

use crate::esquema::ENTRADA;

/// Limites do modelo (A.3, `MASSA_LIMITES`).
pub const SECOES_MIN: usize = 2;
pub const SECOES_MAX: usize = 64;
pub const PONTOS_LIVRE_MIN: usize = 3;
pub const PONTOS_LIVRE_MAX: usize = 256;
pub const LADOS_MIN: u32 = 3;
pub const LADOS_MAX: u32 = 64;
pub const RESOLUCAO_MIN: u32 = 16;
pub const RESOLUCAO_MAX: u32 = 128;
pub const COPIAS_MAX: u32 = 64;
pub const PASSO_Z_MIN: f64 = 0.01;
/// Tolerância das comparações de z e de rotação (a mesma do `validateMass.ts`).
pub const EPS: f64 = 1e-9;

/// Limites da geometria (A.4 regras 2 e 5).
pub const FUSAO_T: f64 = 1e-9;
pub const T_MAX: usize = 512;
pub const ANEIS_POR_TRECHO_MAX: usize = 256;
pub const ANEIS_POR_COPIA_MAX: usize = 2048;

/// `papel` dos grupos de `massa_malha`.
pub const PAPEL_LATERAL: u32 = 0;
pub const PAPEL_BASE: u32 = 1;
pub const PAPEL_TOPO: u32 = 2;

/// Passos entre anéis por `lod` (A.4 regra 5): rotação em rad e altura em m. `None` se o `lod` não existe.
pub fn passos_do_lod(lod: u32) -> Option<(f64, f64)> {
    match lod {
        0 => Some((15.0_f64.to_radians(), 3.0)),
        1 => Some((5.0_f64.to_radians(), 1.0)),
        2 => Some((2.5_f64.to_radians(), 0.5)),
        _ => None,
    }
}

/// Perfil de uma seção, em coordenadas locais (origem no centro do perfil).
#[derive(Clone, Debug, PartialEq)]
pub enum Perfil {
    Circulo { raio: f64 },
    Elipse { rx: f64, ry: f64 },
    /// Regular, inscrito em `raio`, com um vértice no ângulo 0 local (+x; emenda E1).
    Poligono { lados: u32, raio: f64 },
    /// Polígono simples, anti-horário, sem repetir o primeiro ponto no fim.
    Livre { pontos: Vec<[f64; 2]> },
}

/// Uma seção horizontal da pilha.
#[derive(Clone, Debug, PartialEq)]
pub struct Secao {
    /// Altura acima da base da massa.
    pub z: f64,
    pub perfil: Perfil,
    pub rot: f64,
    pub escala: f64,
    pub dx: f64,
    pub dy: f64,
}

/// Arranjo polar: `n` cópias (a original conta) em volta de `(cx, cy)`, cobrindo `ang`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Arranjo {
    pub n: u32,
    pub cx: f64,
    pub cy: f64,
    pub ang: f64,
}

/// Uma massa pronta para a geometria.
#[derive(Clone, Debug, PartialEq)]
pub struct Massa {
    pub num: u32,
    pub nivel: u32,
    pub ox: f64,
    pub oy: f64,
    /// Cota absoluta da base (as seções ficam em `z_base + z`).
    pub z_base: f64,
    /// `true` = PCHIP entre seções; `false` = linear.
    pub suave: bool,
    pub resolucao: u32,
    pub arranjo: Option<Arranjo>,
    pub secoes: Vec<Secao>,
}

impl Massa {
    /// Número de cópias (1 sem arranjo).
    pub fn copias(&self) -> u32 {
        self.arranjo.map_or(1, |a| a.n)
    }
}

/// Área com sinal de um polígono (positiva = anti-horário).
pub fn area_com_sinal(p: &[[f64; 2]]) -> f64 {
    let n = p.len();
    let mut s = 0.0;
    for i in 0..n {
        let (a, b) = (p[i], p[(i + 1) % n]);
        s += a[0] * b[1] - b[0] * a[1];
    }
    s / 2.0
}

fn positivo(v: f64) -> bool {
    v.is_finite() && v > 0.0
}

fn validar_perfil(p: &Perfil) -> Result<(), u32> {
    let ok = match p {
        Perfil::Circulo { raio } => positivo(*raio),
        Perfil::Elipse { rx, ry } => positivo(*rx) && positivo(*ry),
        Perfil::Poligono { lados, raio } => positivo(*raio) && (LADOS_MIN..=LADOS_MAX).contains(lados),
        Perfil::Livre { pontos } => {
            (PONTOS_LIVRE_MIN..=PONTOS_LIVRE_MAX).contains(&pontos.len()) && pontos.iter().all(|q| q[0].is_finite() && q[1].is_finite()) && {
                let a = area_com_sinal(pontos);
                a.is_finite() && a > 0.0
            }
        }
    };
    if ok {
        Ok(())
    } else {
        Err(ENTRADA)
    }
}

/// Confere a massa contra A.3 item 5. Qualquer regra quebrada (inclusive valor não finito) é `ENTRADA`.
pub fn validar(m: &Massa) -> Result<(), u32> {
    let finitos = [m.ox, m.oy, m.z_base].iter().all(|v| v.is_finite());
    if !finitos || !(RESOLUCAO_MIN..=RESOLUCAO_MAX).contains(&m.resolucao) || !(SECOES_MIN..=SECOES_MAX).contains(&m.secoes.len()) {
        return Err(ENTRADA);
    }
    if let Some(a) = m.arranjo {
        if !(2..=COPIAS_MAX).contains(&a.n) || !a.cx.is_finite() || !a.cy.is_finite() || !a.ang.is_finite() {
            return Err(ENTRADA);
        }
    }
    for (i, s) in m.secoes.iter().enumerate() {
        if !s.z.is_finite() || !s.rot.is_finite() || !s.dx.is_finite() || !s.dy.is_finite() || !positivo(s.escala) {
            return Err(ENTRADA);
        }
        if i == 0 {
            if s.z.abs() > EPS {
                return Err(ENTRADA);
            }
        } else {
            let ant = &m.secoes[i - 1];
            if s.z - ant.z < PASSO_Z_MIN - EPS || (s.rot - ant.rot).abs() > std::f64::consts::PI + EPS {
                return Err(ENTRADA);
            }
        }
        validar_perfil(&s.perfil)?;
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    fn caixa() -> Massa {
        let perfil = Perfil::Livre { pontos: vec![[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]] };
        let s = |z: f64| Secao { z, perfil: perfil.clone(), rot: 0.0, escala: 1.0, dx: 0.0, dy: 0.0 };
        Massa { num: 1, nivel: 0, ox: 0.0, oy: 0.0, z_base: 0.0, suave: false, resolucao: 64, arranjo: None, secoes: vec![s(0.0), s(3.0)] }
    }

    fn com(f: impl Fn(&mut Massa)) -> Result<(), u32> {
        let mut m = caixa();
        f(&mut m);
        validar(&m)
    }

    #[test]
    fn valida_uma_regra_por_vez() {
        assert_eq!(validar(&caixa()), Ok(()));
        assert_eq!(com(|m| m.resolucao = 15), Err(ENTRADA));
        assert_eq!(com(|m| m.resolucao = 129), Err(ENTRADA));
        assert_eq!(com(|m| m.secoes.truncate(1)), Err(ENTRADA));
        assert_eq!(com(|m| m.secoes[0].z = 0.5), Err(ENTRADA));
        assert_eq!(com(|m| m.secoes[1].z = 0.005), Err(ENTRADA));
        assert_eq!(com(|m| m.secoes[1].rot = 3.2), Err(ENTRADA));
        assert_eq!(com(|m| m.secoes[1].rot = std::f64::consts::PI), Ok(()));
        assert_eq!(com(|m| m.secoes[1].escala = 0.0), Err(ENTRADA));
        assert_eq!(com(|m| m.secoes[1].dx = f64::NAN), Err(ENTRADA));
        assert_eq!(com(|m| m.ox = f64::INFINITY), Err(ENTRADA));
        assert_eq!(com(|m| m.arranjo = Some(Arranjo { n: 1, cx: 0.0, cy: 0.0, ang: 1.0 })), Err(ENTRADA));
        assert_eq!(com(|m| m.arranjo = Some(Arranjo { n: 65, cx: 0.0, cy: 0.0, ang: 1.0 })), Err(ENTRADA));
        assert_eq!(com(|m| m.arranjo = Some(Arranjo { n: 12, cx: 0.0, cy: 0.0, ang: 6.0 })), Ok(()));
    }

    #[test]
    fn valida_os_perfis() {
        let p = |perfil: Perfil| com(move |m| m.secoes[1].perfil = perfil.clone());
        assert_eq!(p(Perfil::Circulo { raio: 2.0 }), Ok(()));
        assert_eq!(p(Perfil::Circulo { raio: 0.0 }), Err(ENTRADA));
        assert_eq!(p(Perfil::Elipse { rx: 2.0, ry: -1.0 }), Err(ENTRADA));
        assert_eq!(p(Perfil::Poligono { lados: 2, raio: 1.0 }), Err(ENTRADA));
        assert_eq!(p(Perfil::Poligono { lados: 65, raio: 1.0 }), Err(ENTRADA));
        assert_eq!(p(Perfil::Poligono { lados: 5, raio: 1.0 }), Ok(()));
        // Horário (área com sinal negativa) e degenerado.
        assert_eq!(p(Perfil::Livre { pontos: vec![[0.0, 0.0], [0.0, 1.0], [1.0, 0.0]] }), Err(ENTRADA));
        assert_eq!(p(Perfil::Livre { pontos: vec![[0.0, 0.0], [1.0, 0.0]] }), Err(ENTRADA));
        assert_eq!(p(Perfil::Livre { pontos: vec![[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]] }), Err(ENTRADA));
        assert_eq!(p(Perfil::Livre { pontos: vec![[0.0, 0.0], [1.0, 0.0], [f64::NAN, 1.0]] }), Err(ENTRADA));
        assert_eq!(p(Perfil::Livre { pontos: vec![[0.0, 0.0]; 257] }), Err(ENTRADA));
    }

    #[test]
    fn passos_por_lod_e_area() {
        assert_eq!(passos_do_lod(0).map(|p| p.1), Some(3.0));
        assert_eq!(passos_do_lod(2).map(|p| p.1), Some(0.5));
        assert!((passos_do_lod(1).expect("lod 1").0 - 5.0_f64.to_radians()).abs() < 1e-15);
        assert_eq!(passos_do_lod(3), None);
        assert_eq!(area_com_sinal(&[[0.0, 0.0], [2.0, 0.0], [2.0, 3.0], [0.0, 3.0]]), 6.0);
        assert_eq!(caixa().copias(), 1);
    }
}
