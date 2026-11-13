//! Contornos dos perfis da estrutura (docs/estrutura/PLANO.md, A.2; ficha K2): anel externo e furos dos nove `PerfilForma`.
//!
//! Convenções (as mesmas para todas as formas): origem no centro da caixa envolvente do anel externo, X ao longo da largura, Y ao longo da altura do
//! perfil, metros. O anel externo sai anti-horário e os furos horários, sem repetir o primeiro ponto. O personalizado é recentrado na caixa do anel
//! (a A.2 vale para todas as formas) e tem a orientação normalizada. O círculo tem `LADOS_CIRCULO` lados (com vértices em 0°, 90°, 180° e 270°: a caixa
//! do polígono é a do círculo). A validação repete as regras de `validarPerfil` do modelo: violação dá `ENTRADA`, nunca pânico.

use crate::esquema::{ENTRADA, ID_AUSENTE, LIMITE};
use crate::secoes_estr::{
    perfil_valido, PerfilLinha, SecoesEstr, PERFIL_CIRCULAR, PERFIL_I, PERFIL_L, PERFIL_PERSONALIZADO, PERFIL_RETANGULAR, PERFIL_T, PERFIL_TUBO_CIRCULAR,
    PERFIL_TUBO_RETANGULAR, PERFIL_U,
};

pub type P2 = [f64; 2];

/// Lados do círculo da A.2 (contorno exato do perfil; LOD fino).
pub const LADOS_CIRCULO: usize = 96;
/// Área mínima do anel personalizado (A.2).
pub const AREA_MINIMA: f64 = 1e-6;
/// Máximo de vértices de um perfil personalizado (soma dos anéis): acima disso, `LIMITE` (a validação e a triangulação são quadráticas).
pub const MAX_VERTICES: usize = 4096;
/// Tolerância das comparações de orientação (a mesma `EPS` do `perfis.ts`).
const EPS: f64 = 1e-9;

/// Lados do círculo por LOD (0 grosso, 1 médio, 2 fino = contorno da A.2).
pub fn lados_por_lod(lod: u32) -> usize {
    match lod {
        0 => LADOS_CIRCULO / 4,
        1 => LADOS_CIRCULO / 2,
        _ => LADOS_CIRCULO,
    }
}

/// Anel externo (anti-horário) e furos (horários) de um perfil.
#[derive(Clone, Debug, PartialEq)]
pub struct Contorno {
    pub anel: Vec<P2>,
    pub furos: Vec<Vec<P2>>,
}

impl Contorno {
    /// Os anéis na ordem de saída: o externo e depois os furos.
    pub fn aneis(&self) -> impl Iterator<Item = &Vec<P2>> {
        std::iter::once(&self.anel).chain(self.furos.iter())
    }

    /// Área líquida (m²): a do anel menos a dos furos.
    pub fn area(&self) -> f64 {
        area_com_sinal(&self.anel) + self.furos.iter().map(|f| area_com_sinal(f)).sum::<f64>()
    }

    /// Perímetro (m): o do anel mais o dos furos.
    pub fn perimetro(&self) -> f64 {
        self.aneis().map(|a| perimetro(a)).sum()
    }

    /// `[ymin, ymax]` do anel externo (com a origem no centro da caixa, `ymin = -ymax`).
    pub fn faixa_y(&self) -> [f64; 2] {
        self.anel.iter().fold([f64::INFINITY, f64::NEG_INFINITY], |f, p| [f[0].min(p[1]), f[1].max(p[1])])
    }
}

/// Área com sinal pela fórmula de Shoelace (positiva = anti-horário).
pub fn area_com_sinal(pts: &[P2]) -> f64 {
    let n = pts.len();
    let mut s = 0.0;
    for i in 0..n {
        let (a, b) = (pts[i], pts[(i + 1) % n]);
        s += a[0] * b[1] - b[0] * a[1];
    }
    s / 2.0
}

fn perimetro(pts: &[P2]) -> f64 {
    let n = pts.len();
    (0..n).map(|i| crate::geo2d::hipot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1])).sum()
}

fn retangulo(b: f64, h: f64) -> Vec<P2> {
    let (x, y) = (b / 2.0, h / 2.0);
    vec![[-x, -y], [x, -y], [x, y], [-x, y]]
}

fn circulo(d: f64, lados: usize) -> Vec<P2> {
    let r = d / 2.0;
    (0..lados)
        .map(|k| {
            let a = std::f64::consts::TAU * k as f64 / lados as f64;
            [r * a.cos(), r * a.sin()]
        })
        .collect()
}

/// Inverte o anel para horário (furo), mantendo o primeiro ponto.
fn horario(mut a: Vec<P2>) -> Vec<P2> {
    if let Some(resto) = a.get_mut(1..) {
        resto.reverse();
    }
    a
}

/// Contorno de um perfil paramétrico ou personalizado. `personalizado`: os anéis do perfil personalizado (o primeiro é o contorno), ignorados nas
/// demais formas. `lados`: lados dos círculos (`LADOS_CIRCULO` no contorno exato). Perfil inválido: `ENTRADA`.
pub fn contorno(p: &PerfilLinha, personalizado: &[Vec<P2>], lados: usize) -> Result<Contorno, u32> {
    if p.forma == PERFIL_PERSONALIZADO {
        return contorno_personalizado(personalizado);
    }
    if !perfil_valido(p) || !(3..=MAX_VERTICES).contains(&lados) {
        return Err(ENTRADA);
    }
    let [b, h, x2, x3, _, _] = p.p;
    let (x, y) = (b / 2.0, h / 2.0);
    let so = |anel: Vec<P2>| Contorno { anel, furos: Vec::new() };
    Ok(match p.forma {
        PERFIL_RETANGULAR => so(retangulo(b, h)),
        PERFIL_CIRCULAR => so(circulo(b, lados)),
        // Cantoneira: aba de baixo e alma da esquerda, ambas com espessura `tf`.
        PERFIL_L => so(vec![[-x, -y], [x, -y], [x, -y + x2], [-x + x2, -y + x2], [-x + x2, y], [-x, y]]),
        // T: mesa em cima (largura b, espessura tf), alma centrada (tw).
        PERFIL_T => {
            let (w, m) = (x3 / 2.0, y - x2);
            so(vec![[-w, -y], [w, -y], [w, m], [x, m], [x, y], [-x, y], [-x, m], [-w, m]])
        }
        PERFIL_I => {
            let (w, m) = (x3 / 2.0, y - x2);
            so(vec![[-x, -y], [x, -y], [x, -m], [w, -m], [w, m], [x, m], [x, y], [-x, y], [-x, m], [-w, m], [-w, -m], [-x, -m]])
        }
        // U: alma à esquerda (tw), mesas abertas para a direita (tf).
        PERFIL_U => {
            let (w, m) = (-x + x3, y - x2);
            so(vec![[-x, -y], [x, -y], [x, -m], [w, -m], [w, m], [x, m], [x, y], [-x, y]])
        }
        PERFIL_TUBO_RETANGULAR => Contorno { anel: retangulo(b, h), furos: vec![horario(retangulo(b - 2.0 * x2, h - 2.0 * x2))] },
        PERFIL_TUBO_CIRCULAR => Contorno { anel: circulo(b, lados), furos: vec![horario(circulo(b - 2.0 * h, lados))] },
        _ => return Err(ENTRADA),
    })
}

/// Valida, orienta e recentra os anéis de um perfil personalizado (regras de `personalizadoIssue` do modelo).
pub fn contorno_personalizado(aneis: &[Vec<P2>]) -> Result<Contorno, u32> {
    validar_aneis(aneis)?;
    let (mut x0, mut y0, mut x1, mut y1) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    for p in aneis.first().into_iter().flatten() {
        (x0, y0, x1, y1) = (x0.min(p[0]), y0.min(p[1]), x1.max(p[0]), y1.max(p[1]));
    }
    orientados(aneis, [(x0 + x1) / 2.0, (y0 + y1) / 2.0])
}

/// Anéis válidos (A.2): o primeiro simples com área > `AREA_MINIMA`; os demais simples, dentro dele e sem tocar nele nem entre si; coordenadas finitas.
pub fn validar_aneis(aneis: &[Vec<P2>]) -> Result<(), u32> {
    let total: usize = aneis.iter().map(Vec::len).sum();
    if total > MAX_VERTICES {
        return Err(LIMITE);
    }
    let (anel, furos) = aneis.split_first().ok_or(ENTRADA)?;
    let finitos = |a: &Vec<P2>| a.len() >= 3 && a.iter().all(|p| p[0].is_finite() && p[1].is_finite());
    if !aneis.iter().all(finitos) || !anel_simples(anel) || area_com_sinal(anel).abs() <= AREA_MINIMA {
        return Err(ENTRADA);
    }
    for (i, f) in furos.iter().enumerate() {
        if !anel_simples(f) || aneis_se_tocam(f, anel) || !dentro(f[0], anel) {
            return Err(ENTRADA);
        }
        for g in &furos[..i] {
            if aneis_se_tocam(f, g) || dentro(f[0], g) || dentro(g[0], f) {
                return Err(ENTRADA);
            }
        }
    }
    Ok(())
}

/// Anéis já validados, transladados por `-centro`, o primeiro anti-horário e os demais horários.
pub fn orientados(aneis: &[Vec<P2>], centro: P2) -> Result<Contorno, u32> {
    let orientar = |a: &Vec<P2>, anti: bool| {
        let v: Vec<P2> = a.iter().map(|p| [p[0] - centro[0], p[1] - centro[1]]).collect();
        if (area_com_sinal(&v) > 0.0) == anti {
            v
        } else {
            horario(v)
        }
    };
    let (anel, furos) = aneis.split_first().ok_or(ENTRADA)?;
    Ok(Contorno { anel: orientar(anel, true), furos: furos.iter().map(|f| orientar(f, false)).collect() })
}

/// Os anéis do perfil personalizado `perfil_num` na seção 206, por anel (0 = contorno, k = furo k) e por índice. Índices não contíguos, anel 0
/// ausente ou furos com número faltando: `ENTRADA`.
pub fn aneis_da_secao(estr: &SecoesEstr, perfil_num: u32) -> Result<Vec<Vec<P2>>, u32> {
    if perfil_num == ID_AUSENTE {
        return Err(ENTRADA);
    }
    let mut v: Vec<(u32, u32, P2)> = estr.perfis.values().filter(|l| l.perfil == perfil_num).map(|l| (l.anel, l.indice, l.p)).collect();
    if v.len() > MAX_VERTICES {
        return Err(LIMITE);
    }
    v.sort_by_key(|x| (x.0, x.1));
    let mut aneis: Vec<Vec<P2>> = Vec::new();
    for (anel, indice, p) in v {
        if anel as usize == aneis.len() {
            aneis.push(Vec::new());
        }
        let n = aneis.len();
        match aneis.last_mut() {
            Some(a) if anel as usize + 1 == n && indice as usize == a.len() => a.push(p),
            _ => return Err(ENTRADA),
        }
    }
    Ok(aneis)
}

/// Contorno do perfil de um tipo: paramétrico pelas colunas, personalizado pela seção 206.
pub fn contorno_do_tipo(estr: &SecoesEstr, p: &PerfilLinha, lados: usize) -> Result<Contorno, u32> {
    if p.forma == PERFIL_PERSONALIZADO {
        contorno_personalizado(&aneis_da_secao(estr, p.perfil)?)
    } else {
        contorno(p, &[], lados)
    }
}

/// Inteiro exato não negativo vindo de um argumento `f64`.
fn inteiro(x: f64) -> Result<usize, u32> {
    if x.is_finite() && x.fract() == 0.0 && (0.0..=(u32::MAX as f64)).contains(&x) {
        Ok(x as usize)
    } else {
        Err(ENTRADA)
    }
}

/// Consulta 205 `estr_perfil`: `args = [nivel_num, forma, p0..p5, n_aneis, (anéis do personalizado)...]` (o `nivel_num` já foi conferido e é
/// ignorado). Saídas: `aneis [papel, n_pontos]` (0 contorno, 1 furo), `pontos [x, y]` e `medidas [area, perimetro]`. Círculos com `LADOS_CIRCULO`.
pub fn consulta_estr_perfil(args: &[f64]) -> Result<Vec<crate::consultas::Saida>, u32> {
    use crate::consultas::Saida;
    let fixos = args.get(..9).ok_or(ENTRADA)?;
    let forma = inteiro(fixos[1])?;
    let forma = u8::try_from(forma).ok().filter(|&f| f <= PERFIL_PERSONALIZADO).ok_or(ENTRADA)?;
    let n_aneis = inteiro(fixos[8])?;
    let mut resto = &args[9..];
    let mut aneis: Vec<Vec<P2>> = Vec::new();
    if forma == PERFIL_PERSONALIZADO {
        for _ in 0..n_aneis {
            let (&n, depois) = resto.split_first().ok_or(ENTRADA)?;
            let n = inteiro(n)?;
            if n > depois.len() / 2 {
                return Err(ENTRADA);
            }
            if aneis.iter().map(Vec::len).sum::<usize>() + n > MAX_VERTICES {
                return Err(LIMITE);
            }
            aneis.push(depois[..2 * n].chunks_exact(2).map(|c| [c[0], c[1]]).collect());
            resto = &depois[2 * n..];
        }
    } else if n_aneis != 0 {
        return Err(ENTRADA);
    }
    if !resto.is_empty() {
        return Err(ENTRADA);
    }
    let mut p = [0.0; 6];
    p.copy_from_slice(&fixos[2..8]);
    let perfil = PerfilLinha { forma, p, perfil: ID_AUSENTE };
    let c = contorno(&perfil, &aneis, LADOS_CIRCULO)?;
    let mut tab = Vec::new();
    let mut pontos = Vec::new();
    for (k, a) in c.aneis().enumerate() {
        tab.extend([u32::from(k > 0), a.len() as u32]);
        pontos.extend(a.iter().flatten());
    }
    Ok(vec![Saida::U32(tab), Saida::F64(pontos), Saida::F64(vec![c.area(), c.perimetro()])])
}

// ───────────── Polígono simples (porte de `perfis.ts`) ─────────────

fn cruz(o: P2, a: P2, b: P2) -> f64 {
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

fn sinal(v: f64) -> i8 {
    if v > EPS {
        1
    } else if v < -EPS {
        -1
    } else {
        0
    }
}

fn na_caixa(a: P2, b: P2, p: P2) -> bool {
    a[0].min(b[0]) - EPS <= p[0] && p[0] <= a[0].max(b[0]) + EPS && a[1].min(b[1]) - EPS <= p[1] && p[1] <= a[1].max(b[1]) + EPS
}

/// Os segmentos [a,b] e [c,d] se tocam (cruzamento, toque em ponta ou sobreposição colinear).
pub fn segmentos_se_tocam(a: P2, b: P2, c: P2, d: P2) -> bool {
    let (d1, d2, d3, d4) = (sinal(cruz(a, b, c)), sinal(cruz(a, b, d)), sinal(cruz(c, d, a)), sinal(cruz(c, d, b)));
    if d1 != d2 && d3 != d4 {
        return true;
    }
    (d1 == 0 && na_caixa(a, b, c)) || (d2 == 0 && na_caixa(a, b, d)) || (d3 == 0 && na_caixa(c, d, a)) || (d4 == 0 && na_caixa(c, d, b))
}

/// Polígono simples: ao menos 3 vértices, área não nula, arestas não nulas, sem espinho e nenhuma aresta tocando outra não adjacente.
pub fn anel_simples(pts: &[P2]) -> bool {
    let n = pts.len();
    if n < 3 || area_com_sinal(pts).abs() <= EPS {
        return false;
    }
    for i in 0..n {
        let (a, b, c) = (pts[i], pts[(i + 1) % n], pts[(i + 2) % n]);
        if crate::geo2d::hipot(b[0] - a[0], b[1] - a[1]) <= EPS {
            return false;
        }
        if sinal(cruz(a, b, c)) == 0 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0.0 {
            return false;
        }
        for j in i + 2..n {
            if i == 0 && j == n - 1 {
                continue;
            }
            if segmentos_se_tocam(a, b, pts[j], pts[(j + 1) % n]) {
                return false;
            }
        }
    }
    true
}

fn aneis_se_tocam(r: &[P2], s: &[P2]) -> bool {
    (0..r.len()).any(|i| (0..s.len()).any(|j| segmentos_se_tocam(r[i], r[(i + 1) % r.len()], s[j], s[(j + 1) % s.len()])))
}

/// Ponto dentro do polígono (par-ímpar); só usado com anéis que não se tocam.
pub fn dentro(p: P2, anel: &[P2]) -> bool {
    let mut d = false;
    let n = anel.len();
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + n - 1) % n]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] {
            d = !d;
        }
    }
    d
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cena::Cena;
    use crate::consultas::{executar, Saida};
    use crate::esquema::NIVEL_TODOS;

    const NAN: f64 = f64::NAN;

    fn rel(a: f64, b: f64) -> f64 {
        (a - b).abs() / b.abs().max(1e-300)
    }

    fn u32s(s: &Saida) -> Vec<u32> {
        match s {
            Saida::U32(v) => v.clone(),
            Saida::F64(_) => Vec::new(),
        }
    }

    fn f64s(s: &Saida) -> Vec<f64> {
        match s {
            Saida::F64(v) => v.clone(),
            Saida::U32(_) => Vec::new(),
        }
    }

    fn anel_l() -> Vec<P2> {
        vec![[1.0, 1.0], [1.3, 1.0], [1.3, 1.05], [1.05, 1.05], [1.05, 1.4], [1.0, 1.4]]
    }

    #[test]
    fn consulta_205_parametrico_e_personalizado() {
        let mut c = Cena::novo();
        let mut args = vec![NIVEL_TODOS as f64, PERFIL_TUBO_RETANGULAR as f64, 0.1, 0.1, 0.005, NAN, NAN, NAN, 0.0];
        let s = executar(&mut c, 205, &args).expect("tubo");
        assert_eq!(u32s(&s[0]), vec![0, 4, 1, 4]);
        assert_eq!(f64s(&s[1]).len(), 16);
        let m = f64s(&s[2]);
        assert!(rel(m[0], 0.0019) < 1e-12 && rel(m[1], 0.4 + 0.36) < 1e-12);
        args[8] = 1.0;
        assert_eq!(executar(&mut c, 205, &args), Err(ENTRADA), "n_aneis só no personalizado");
        args[8] = 0.0;
        args[4] = 0.05;
        assert_eq!(executar(&mut c, 205, &args), Err(ENTRADA), "2t >= min(b, h)");
        let s = executar(&mut c, 205, &[0.0, 1.0, 0.3, NAN, NAN, NAN, NAN, NAN, 0.0]).expect("círculo");
        assert_eq!(u32s(&s[0]), vec![0, 96]);
        // Personalizado: L horário de 6 vértices.
        let l = anel_l();
        let mut p = vec![0.0, 8.0, NAN, NAN, NAN, NAN, NAN, NAN, 1.0, 6.0];
        p.extend(l.iter().rev().flatten());
        let s = executar(&mut c, 205, &p).expect("L");
        assert_eq!(u32s(&s[0]), vec![0, 6]);
        assert!(rel(f64s(&s[2])[0], area_com_sinal(&l)) < 1e-12);
        let pts = f64s(&s[1]);
        assert!(area_com_sinal(&pts.chunks_exact(2).map(|q| [q[0], q[1]]).collect::<Vec<_>>()) > 0.0, "anti-horário na saída");
        for ruim in [&p[..p.len() - 1], &[p.as_slice(), &[1.0]].concat()[..], &[0.0, 8.0, NAN, NAN, NAN, NAN, NAN, NAN, 0.0][..], &[0.0, 8.0, NAN, NAN, NAN, NAN, NAN, NAN, 1.0, 1e12][..]] {
            assert_eq!(executar(&mut c, 205, ruim), Err(ENTRADA), "{ruim:?}");
        }
        assert_eq!(executar(&mut c, 205, &[0.0, 9.0, 0.3, 0.3, NAN, NAN, NAN, NAN, 0.0]), Err(ENTRADA), "forma fora");
        assert_eq!(executar(&mut c, 205, &[0.0, 0.5, 0.3, 0.3, NAN, NAN, NAN, NAN, 0.0]), Err(ENTRADA), "forma fracionária");
    }
}
