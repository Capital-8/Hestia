//! Volume de sobreposição exato entre duas peças com alturas afins. Porta de `packages/engine/src/junctionNet.ts`
//! (`ajustarAfim`, `recortarAnel` e `volumeExatoAfim`), operação por operação, para que o resultado bata com o TS.
//!
//! Método: as retas onde duas alturas se igualam (topo com topo, base com base, topo com base) dividem a região comum em
//! células convexas. Em cada célula a altura é afim, então a integral é a área da célula vezes a altura no centróide dela
//! (fórmula do polígono, com furos). A altura de cada peça é o par `[base, topo]` em cada ponto da planta.

use crate::b3::{caixa_total, caixas_se_tocam, faixa_da_peca, PecaSolida, Span};
use crate::esquema::ENTRADA;
use crate::geo2d::{hipot, v, V};
use crate::ops::interseccao;
use crate::pintor::area_da_forma;
use crate::MultiPoligono;

/// Função afim sobre a planta: `gx·x + gy·y + gc`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Afim {
    pub gx: f64,
    pub gy: f64,
    pub gc: f64,
}

/// Retângulo envolvente de todos os vértices (furos incluídos), como `multiPoints` do TS.
fn envolvente(m: &MultiPoligono) -> Option<(f64, f64, f64, f64)> {
    let mut x0 = f64::INFINITY;
    let mut y0 = f64::INFINITY;
    let mut x1 = f64::NEG_INFINITY;
    let mut y1 = f64::NEG_INFINITY;
    let mut algum = false;
    for poli in m {
        for anel in poli {
            for p in anel {
                algum = true;
                x0 = x0.min(p[0]);
                y0 = y0.min(p[1]);
                x1 = x1.max(p[0]);
                y1 = y1.max(p[1]);
            }
        }
    }
    if algum {
        Some((x0, y0, x1, y1))
    } else {
        None
    }
}

/// Ajusta `f` como função afim sobre a região `m`. Testa a afinidade em cinco pontos (cantos do retângulo envolvente e
/// o centro). Devolve `None` se não for afim (ex.: topo de perfil com quebra) ou se a região estiver vazia.
pub fn ajustar_afim(f: &dyn Fn(V) -> f64, m: &MultiPoligono) -> Option<Afim> {
    let (x0, y0, x1, y1) = envolvente(m)?;
    let s = (x1 - x0).max(y1 - y0).max(1.0);
    let f00 = f(v(x0, y0));
    let f10 = f(v(x0 + s, y0));
    let f01 = f(v(x0, y0 + s));
    let f11 = f(v(x0 + s, y0 + s));
    let gx = (f10 - f00) / s;
    let gy = (f01 - f00) / s;
    let gc = f00 - gx * x0 - gy * y0;
    let cx = x0 + s / 2.0;
    let cy = y0 + s / 2.0;
    let fc = f(v(cx, cy));
    let esc = 1.0f64.max(f00.abs()).max(f11.abs()).max(fc.abs());
    if (f11 - (gx * (x0 + s) + gy * (y0 + s) + gc)).abs() > 1e-9 * esc {
        return None;
    }
    if (fc - (gx * cx + gy * cy + gc)).abs() > 1e-9 * esc {
        return None;
    }
    Some(Afim { gx, gy, gc })
}

/// Recorte de um anel pelo semiplano `s·(gx·x + gy·y + gc) >= 0` (Sutherland–Hodgman). Preserva a área orientada.
/// `s` é `1` ou `-1`.
pub fn recortar_anel(anel: &[V], d: &Afim, s: i8) -> Vec<V> {
    let sinal = s as f64;
    let f = |p: V| sinal * (d.gx * p.x + d.gy * p.y + d.gc);
    let mut out: Vec<V> = Vec::new();
    for k in 0..anel.len() {
        let p = anel[k];
        let q = anel[(k + 1) % anel.len()];
        let fp = f(p);
        let fq = f(q);
        if fp >= 0.0 {
            out.push(p);
        }
        if (fp >= 0.0) != (fq >= 0.0) {
            let t = fp / (fp - fq);
            out.push(v(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t));
        }
    }
    out
}

/// Diferença de duas afins; `None` se forem iguais (reta degenerada, não divide nada).
fn diferenca(f: &Afim, g: &Afim) -> Option<Afim> {
    let d = Afim { gx: f.gx - g.gx, gy: f.gy - g.gy, gc: f.gc - g.gc };
    if hipot(d.gx, d.gy) < 1e-12 {
        None
    } else {
        Some(d)
    }
}

/// Altura comum às duas peças num ponto: `max(0, min(topo_a, topo_b) - max(base_a, base_b))`.
fn altura_comum(a: &dyn Fn(V) -> [f64; 2], b: &dyn Fn(V) -> [f64; 2], p: V) -> f64 {
    let [a0, a1] = a(p);
    let [b0, b1] = b(p);
    0.0f64.max(a1.min(b1) - a0.max(b0))
}

/// Volume de sobreposição exato quando as alturas são afins. `a` e `b` dão `[base, topo]` em cada ponto da planta.
/// `common` é a região comum às duas plantas. Devolve `None` se alguma face não for afim (aí quem chama mantém o
/// cálculo antigo).
pub fn volume_exato_afim(common: &MultiPoligono, a: &dyn Fn(V) -> [f64; 2], b: &dyn Fn(V) -> [f64; 2]) -> Option<f64> {
    let fa0 = |p: V| a(p)[0];
    let fa1 = |p: V| a(p)[1];
    let fb0 = |p: V| b(p)[0];
    let fb1 = |p: V| b(p)[1];
    let a0 = ajustar_afim(&fa0, common)?;
    let a1 = ajustar_afim(&fa1, common)?;
    let b0 = ajustar_afim(&fb0, common)?;
    let b1 = ajustar_afim(&fb1, common)?;
    let candidatas = [
        diferenca(&a1, &b0),
        diferenca(&a1, &a0),
        diferenca(&b1, &a0),
        diferenca(&b1, &b0),
        diferenca(&a1, &b1),
        diferenca(&a0, &b0),
    ];
    let retas: Vec<Afim> = candidatas.into_iter().flatten().collect();

    let mut total = 0.0;
    for mascara in 0u32..(1u32 << retas.len()) {
        let mut area = 0.0;
        let mut mx = 0.0;
        let mut my = 0.0;
        for poli in common {
            for anel_original in poli {
                let mut anel: Vec<V> = anel_original.iter().map(|p| v(p[0], p[1])).collect();
                for (k, d) in retas.iter().enumerate() {
                    if anel.len() >= 3 {
                        let s: i8 = if (mascara >> k) & 1 == 1 { 1 } else { -1 };
                        anel = recortar_anel(&anel, d, s);
                    }
                }
                if anel.len() < 3 {
                    continue;
                }
                let mut a2 = 0.0;
                let mut sx = 0.0;
                let mut sy = 0.0;
                for k in 0..anel.len() {
                    let p = anel[k];
                    let q = anel[(k + 1) % anel.len()];
                    let cr = p.x * q.y - q.x * p.y;
                    a2 += cr;
                    sx += (p.x + q.x) * cr;
                    sy += (p.y + q.y) * cr;
                }
                area += a2 / 2.0;
                mx += sx / 6.0;
                my += sy / 6.0;
            }
        }
        if area.abs() < 1e-18 {
            continue;
        }
        total += area * altura_comum(a, b, v(mx / area, my / area));
    }
    Some(total)
}

/// Recorta cada anel do multipolígono pelos semiplanos dados (Sutherland–Hodgman). A área orientada é preservada, então
/// um furo recortado continua subtraindo a parte dele que cai dentro. Anel externo com menos de 3 vértices tira o polígono.
pub(crate) fn recortar_multi(m: &MultiPoligono, cortes: &[(Afim, i8)]) -> MultiPoligono {
    let mut saida: MultiPoligono = Vec::new();
    for poli in m {
        let mut aneis: Vec<Vec<[f64; 2]>> = Vec::new();
        for (i, anel) in poli.iter().enumerate() {
            let mut a: Vec<V> = anel.iter().map(|p| v(p[0], p[1])).collect();
            for (d, s) in cortes {
                if a.len() >= 3 {
                    a = recortar_anel(&a, d, *s);
                }
            }
            if a.len() >= 3 {
                aneis.push(a.iter().map(|p| [p.x, p.y]).collect());
            } else if i == 0 {
                aneis.clear();
                break;
            }
        }
        if !aneis.is_empty() {
            saida.push(aneis);
        }
    }
    saida
}

/// Eixo de um perfil (`o`, `d`) com as quebras `t` das peças que o usam.
struct Familia {
    o: [f64; 2],
    d: [f64; 2],
    quebras: Vec<f64>,
}

fn indice_da_familia(familias: &mut Vec<Familia>, span: &Span) -> Option<usize> {
    let Span::Perfil { o, d, pts, .. } = span else {
        return None;
    };
    let i = match familias.iter().position(|f| f.o == *o && f.d == *d) {
        Some(i) => i,
        None => {
            familias.push(Familia { o: *o, d: *d, quebras: Vec::new() });
            familias.len() - 1
        }
    };
    familias[i].quebras.extend(pts.iter().map(|p| p.0));
    Some(i)
}

/// Volume de `a` dentro de `b` quando alguma altura é um perfil por trechos. `common` é a região comum das plantas.
/// Junta as quebras `t_i` dos dois perfis que caem dentro do intervalo de `t` da região comum, recorta `common` em
/// fatias por semiplanos perpendiculares a `d` (`t = t_i`) e soma `volume_exato_afim` de cada fatia. Em cada fatia a
/// altura de cada peça é a reta do trecho dela. Perfis de eixos diferentes dão fatias nos dois sentidos.
/// Devolve `ENTRADA` se alguma fatia ainda não for afim; nunca aproxima.
pub fn volume_por_trechos(common: &MultiPoligono, a: &PecaSolida, b: &PecaSolida) -> Result<f64, u32> {
    let mut familias: Vec<Familia> = Vec::new();
    let fam_a = indice_da_familia(&mut familias, &a.span);
    let fam_b = indice_da_familia(&mut familias, &b.span);

    // Cada fatia: a forma e o t de referência (meio do intervalo) em cada família.
    let mut fatias: Vec<(MultiPoligono, Vec<f64>)> = vec![(common.clone(), Vec::new())];
    for fam in &familias {
        let ts: Vec<f64> = common
            .iter()
            .flatten()
            .flatten()
            .map(|q| (q[0] - fam.o[0]) * fam.d[0] + (q[1] - fam.o[1]) * fam.d[1])
            .collect();
        let lo = ts.iter().cloned().fold(f64::INFINITY, f64::min);
        let hi = ts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let mut limites: Vec<f64> = fam.quebras.iter().cloned().filter(|t| *t > lo && *t < hi).collect();
        limites.sort_by(|x, y| x.partial_cmp(y).unwrap());
        limites.dedup();
        limites.insert(0, lo);
        limites.push(hi);
        let od = fam.o[0] * fam.d[0] + fam.o[1] * fam.d[1];
        let mut novas = Vec::new();
        for (forma, refs) in fatias {
            let ultimo = limites.len() - 2;
            for k in 0..=ultimo {
                let mut cortes: Vec<(Afim, i8)> = Vec::new();
                if k > 0 {
                    cortes.push((Afim { gx: fam.d[0], gy: fam.d[1], gc: -od - limites[k] }, 1));
                }
                if k < ultimo {
                    cortes.push((Afim { gx: fam.d[0], gy: fam.d[1], gc: -od - limites[k + 1] }, -1));
                }
                let pedaco = if cortes.is_empty() { forma.clone() } else { recortar_multi(&forma, &cortes) };
                if pedaco.is_empty() {
                    continue;
                }
                let mut r = refs.clone();
                r.push((limites[k] + limites[k + 1]) / 2.0);
                novas.push((pedaco, r));
            }
        }
        fatias = novas;
    }

    let mut total = 0.0;
    for (forma, refs) in &fatias {
        let fa = |p: V| {
            let (z0, z1) = a.span.em_no_trecho([p.x, p.y], fam_a.map(|i| refs[i]));
            [z0, z1]
        };
        let fb = |p: V| {
            let (z0, z1) = b.span.em_no_trecho([p.x, p.y], fam_b.map(|i| refs[i]));
            [z0, z1]
        };
        total += volume_exato_afim(forma, &fa, &fb).ok_or(ENTRADA)?;
    }
    Ok(total)
}

/// `overlapVolume` de `junctionNet.ts`: volume (m³) de `a` que está dentro de `b`. Envelope de cota e caixas descartam
/// o que não se toca; a interseção em planta vem do recorte na grade de 1 µm; se as duas peças forem planas vale
/// área × altura; senão o cálculo exato afim (sem perfil) ou por trechos (com perfil). Nunca devolve aproximação:
/// onde o TS integrava por triangulação, aqui a resposta é exata (ou `ENTRADA`).
pub fn overlap_volume(a: &PecaSolida, b: &PecaSolida) -> Result<f64, u32> {
    let (Some((a0, a1)), Some((b0, b1))) = (faixa_da_peca(a), faixa_da_peca(b)) else {
        return Ok(0.0);
    };
    if a1.min(b1) - a0.max(b0) <= 0.0 {
        return Ok(0.0);
    }
    if !caixas_se_tocam(&caixa_total(&a.poly), &caixa_total(&b.poly)) {
        return Ok(0.0);
    }
    let common = interseccao(&a.poly, &b.poly)?;
    if common.is_empty() {
        return Ok(0.0);
    }
    if a.plana && b.plana {
        let (p0, p1) = a.span.em([0.0, 0.0]);
        let (q0, q1) = b.span.em([0.0, 0.0]);
        return Ok(area_da_forma(&common) * 0.0f64.max(p1.min(q1) - p0.max(q0)));
    }
    let com_perfil = matches!(a.span, Span::Perfil { .. }) || matches!(b.span, Span::Perfil { .. });
    if !com_perfil {
        let fa = |p: V| {
            let (z0, z1) = a.span.em([p.x, p.y]);
            [z0, z1]
        };
        let fb = |p: V| {
            let (z0, z1) = b.span.em([p.x, p.y]);
            [z0, z1]
        };
        if let Some(vol) = volume_exato_afim(&common, &fa, &fb) {
            return Ok(vol);
        }
    }
    volume_por_trechos(&common, a, b)
}

#[cfg(test)]
mod testes {
    use super::*;

    /// Retângulo [x0,x1]×[y0,y1] como multipolígono (um anel, anti-horário).
    fn retangulo(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    fn lf(p: V) -> f64 {
        p.x
    }

    #[test]
    fn ajusta_afim_linear_e_recusa_quebra() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let f = |p: V| 1.0 + 2.0 * p.x - 0.5 * p.y;
        let r = ajustar_afim(&f, &m).expect("afim");
        assert!((r.gx - 2.0).abs() < 1e-12 && (r.gy + 0.5).abs() < 1e-12 && (r.gc - 1.0).abs() < 1e-12);
        // Quebra em x = 1: o centro não cai no plano dos cantos.
        let quebra = |p: V| 1.0 + (p.x - 1.0).abs();
        assert!(ajustar_afim(&quebra, &m).is_none());
        assert!(ajustar_afim(&lf, &Vec::new()).is_none());
    }

    #[test]
    fn recorte_por_semiplano_preserva_area() {
        // Quadrado [0,2]² cortado por x >= 1 (f = x - 1): sobra [1,2]x[0,2], área 2.
        let quadrado: Vec<V> = vec![v(0.0, 0.0), v(2.0, 0.0), v(2.0, 2.0), v(0.0, 2.0)];
        let d = Afim { gx: 1.0, gy: 0.0, gc: -1.0 };
        let r = recortar_anel(&quadrado, &d, 1);
        let area: f64 = (0..r.len()).map(|k| r[k].x * r[(k + 1) % r.len()].y - r[(k + 1) % r.len()].x * r[k].y).sum::<f64>() / 2.0;
        assert_eq!(r.len(), 4);
        assert!((area - 2.0).abs() < 1e-12);
    }

    /// (a) retângulo [0,2]x[0,1], altura a = [0, 1+x], b = [0.3y, 1-x]. Analítico: 0.365.
    #[test]
    fn caso_a_retangulo_analitico() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let a = |p: V| [0.0, 1.0 + p.x];
        let b = |p: V| [0.3 * p.y, 1.0 - p.x];
        let vol = volume_exato_afim(&m, &a, &b).expect("afim");
        assert!((vol - 0.365).abs() < 1e-9, "volume {vol}");
    }

    /// (b) L = [0,2]x[0,1] menos [0,1]x[0,0.5], mesmas alturas de (a). Analítico: 0.365 - 0.214375 = 0.150625.
    #[test]
    fn caso_b_forma_nao_convexa_analitico() {
        let forma: MultiPoligono = vec![vec![vec![[1.0, 0.0], [2.0, 0.0], [2.0, 1.0], [0.0, 1.0], [0.0, 0.5], [1.0, 0.5]]]];
        let a = |p: V| [0.0, 1.0 + p.x];
        let b = |p: V| [0.3 * p.y, 1.0 - p.x];
        let vol = volume_exato_afim(&forma, &a, &b).expect("afim");
        assert!((vol - 0.150625).abs() < 1e-9, "volume {vol}");
    }

    /// (c) retângulo [0,2]x[0,1], a = [0, 2-x], b = [0.5, 1+0.5x]. Altura = max(0, min(2-x, 1+0.5x) - 0.5), independe de y.
    /// Analítico: ∫₀^{2/3}(0.5+0.5x)dx + ∫_{2/3}^{1.5}(1.5-x)dx = 4/9 + 25/72 = 19/24.
    #[test]
    fn caso_c_retangulo_com_topos_cruzados() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let a = |p: V| [0.0, 2.0 - p.x];
        let b = |p: V| [0.5, 1.0 + 0.5 * p.x];
        let vol = volume_exato_afim(&m, &a, &b).expect("afim");
        assert!((vol - 19.0 / 24.0).abs() < 1e-9, "volume {vol}");
    }

    #[test]
    fn face_nao_afim_devolve_none() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let a = |p: V| [0.0, 1.0 + (p.x - 1.0).abs()];
        let b = |_p: V| [0.0, 1.0];
        assert!(volume_exato_afim(&m, &a, &b).is_none());
    }

    // ---- overlap_volume / volume_por_trechos ----

    fn peca(poly: MultiPoligono, span: Span) -> PecaSolida {
        PecaSolida { poly, span, plana: false, meta: None, externa: false }
    }

    /// Perfil ao longo de x, base em z = 0.
    fn perfil_x(poly: MultiPoligono, pts: &[(f64, f64)]) -> PecaSolida {
        peca(poly, Span::Perfil { base_z: 0.0, z0: 0.0, o: [0.0, 0.0], d: [1.0, 0.0], pts: pts.to_vec() })
    }

    /// Cortador plano (peça plana) com faixa `[z0, z1]`.
    fn cortador(poly: MultiPoligono, z0: f64, z1: f64) -> PecaSolida {
        PecaSolida { poly, span: Span::Constante { z0, z1 }, plana: true, meta: None, externa: false }
    }

    fn confere(nome: &str, esperado: f64, obtido: f64, tol: f64) {
        println!("{nome}: esperado {esperado:.12} obtido {obtido:.12} diferenca {:.3e}", (obtido - esperado).abs());
        assert!((obtido - esperado).abs() < tol, "{nome}: esperado {esperado}, obtido {obtido}");
    }

    /// Rampa 0 -> 2 em t in [0,4], largura 1: V = integral de t/2 = 4.
    #[test]
    fn rampa_4x1() {
        let r = perfil_x(retangulo(0.0, 0.0, 4.0, 1.0), &[(0.0, 0.0), (4.0, 2.0)]);
        let c = cortador(retangulo(-1.0, -1.0, 5.0, 2.0), -1.0, 5.0);
        confere("rampa", 4.0, overlap_volume(&r, &c).unwrap(), 1e-9);
        confere("rampa (invertido)", 4.0, overlap_volume(&c, &r).unwrap(), 1e-9);
    }

    /// Mesma rampa sob cortador plano z in [0,1]: integral de min(t/2, 1) = 1 + 2 = 3.
    #[test]
    fn rampa_sob_cortador_plano() {
        let r = perfil_x(retangulo(0.0, 0.0, 4.0, 1.0), &[(0.0, 0.0), (4.0, 2.0)]);
        let c = cortador(retangulo(-1.0, -1.0, 5.0, 2.0), 0.0, 1.0);
        confere("rampa sob plano", 3.0, overlap_volume(&r, &c).unwrap(), 1e-9);
    }

    /// Telhado 0 -> 2 -> 0 (pico em t = 2): V = 4; acima de z = 1: triangulo de base 2 e altura 1, V = 1;
    /// faixa [1.5, 2]: triangulo de base 1 e altura 0.5, V = 0.25 (o pico nao esta em nenhum vertice da planta).
    #[test]
    fn telhado_e_parte_acima() {
        let r = perfil_x(retangulo(0.0, 0.0, 4.0, 1.0), &[(0.0, 0.0), (2.0, 2.0), (4.0, 0.0)]);
        let tudo = cortador(retangulo(-1.0, -1.0, 5.0, 2.0), -1.0, 5.0);
        let acima = cortador(retangulo(-1.0, -1.0, 5.0, 2.0), 1.0, 5.0);
        let pico = cortador(retangulo(-1.0, -1.0, 5.0, 2.0), 1.5, 2.0);
        confere("telhado", 4.0, overlap_volume(&r, &tudo).unwrap(), 1e-9);
        confere("telhado acima de z=1", 1.0, overlap_volume(&r, &acima).unwrap(), 1e-9);
        confere("telhado, so o pico", 0.25, overlap_volume(&r, &pico).unwrap(), 1e-9);
    }

    /// Degrau 1 -> 3 em t = 2: V = 2*1 + 2*3 = 8.
    #[test]
    fn degrau_1_3() {
        let r = perfil_x(retangulo(0.0, 0.0, 4.0, 1.0), &[(0.0, 1.0), (2.0, 1.0), (2.0, 3.0), (4.0, 3.0)]);
        let c = cortador(retangulo(-1.0, -1.0, 5.0, 2.0), -1.0, 5.0);
        confere("degrau", 8.0, overlap_volume(&r, &c).unwrap(), 1e-9);
    }

    /// Telhado (h = t ate 2, 4 - t depois) em [0,4]x[0,2] com furo [1.5,2.5]x[0.5,1.5] sobre o pico.
    /// Cheio: 2*4 = 8. O furo tira (integral de 1.5 a 2 de t) + (integral de 2 a 2.5 de 4 - t) = 0.875 + 0.875 = 1.75. V = 6.25.
    #[test]
    fn peca_com_furo() {
        let forma: MultiPoligono = vec![vec![
            vec![[0.0, 0.0], [4.0, 0.0], [4.0, 2.0], [0.0, 2.0]],
            vec![[1.5, 0.5], [1.5, 1.5], [2.5, 1.5], [2.5, 0.5]],
        ]];
        let r = perfil_x(forma, &[(0.0, 0.0), (2.0, 2.0), (4.0, 0.0)]);
        let c = cortador(retangulo(-1.0, -1.0, 5.0, 3.0), -1.0, 5.0);
        confere("furo", 6.25, overlap_volume(&r, &c).unwrap(), 1e-9);
    }

    /// Integral de min(ha(x), hb(y)) em [0,4]x[0,3]: em y exata (min de constante e reta, por trecho de hb);
    /// em x, Simpson com 40000 subintervalos por trecho de ha.
    fn oraculo_cruzado(ha: &[(f64, f64)], hb: &[(f64, f64)]) -> f64 {
        let h = |pts: &[(f64, f64)], t: f64| -> f64 {
            if t <= pts[0].0 {
                return pts[0].1;
            }
            for w in pts.windows(2) {
                if t <= w[1].0 {
                    return w[0].1 + (w[1].1 - w[0].1) * (t - w[0].0) / (w[1].0 - w[0].0);
                }
            }
            pts[pts.len() - 1].1
        };
        // Integral em y de min(c, hb(y)) por trecho linear de hb.
        let f = |c: f64| -> f64 {
            let mut s = 0.0;
            for w in hb.windows(2) {
                let (y0, g0, y1, g1) = (w[0].0, w[0].1, w[1].0, w[1].1);
                let dy = y1 - y0;
                if g0 <= c && g1 <= c {
                    s += dy * (g0 + g1) / 2.0;
                } else if g0 >= c && g1 >= c {
                    s += dy * c;
                } else {
                    let yc = y0 + dy * (c - g0) / (g1 - g0);
                    if g0 < c {
                        s += (yc - y0) * (g0 + c) / 2.0 + (y1 - yc) * c;
                    } else {
                        s += (yc - y0) * c + (y1 - yc) * (c + g1) / 2.0;
                    }
                }
            }
            s
        };
        let n = 40000usize;
        let mut total = 0.0;
        for w in ha.windows(2) {
            let (x0, x1) = (w[0].0, w[1].0);
            let dx = (x1 - x0) / n as f64;
            let mut acc = f(h(ha, x0)) + f(h(ha, x1));
            for i in 1..n {
                let x = x0 + dx * i as f64;
                acc += f(h(ha, x)) * if i % 2 == 1 { 4.0 } else { 2.0 };
            }
            total += acc * dx / 3.0;
        }
        total
    }

    /// Dois perfis cruzados: a varia em x, b varia em y, mesma planta [0,4]x[0,3], ambos com base em z = 0.
    #[test]
    fn dois_perfis_cruzados_contra_simpson() {
        let ha = [(0.0, 0.0), (2.0, 2.0), (4.0, 1.0)];
        let hb = [(0.0, 3.0), (1.0, 0.5), (3.0, 2.0)];
        let a = perfil_x(retangulo(0.0, 0.0, 4.0, 3.0), &ha);
        let b = peca(
            retangulo(0.0, 0.0, 4.0, 3.0),
            Span::Perfil { base_z: 0.0, z0: 0.0, o: [0.0, 0.0], d: [0.0, 1.0], pts: hb.to_vec() },
        );
        let esperado = oraculo_cruzado(&ha, &hb);
        confere("perfis cruzados (Simpson)", esperado, overlap_volume(&a, &b).unwrap(), 1e-7);
        confere("perfis cruzados, ordem inversa", esperado, overlap_volume(&b, &a).unwrap(), 1e-7);
    }

    /// Perfis paralelos de quebras diferentes: h1 = 0 -> 2 -> 0 e h2 = 2 -> 0 em t in [0,4].
    /// h1 = t (t<=2), 4 - t depois; h2 = 2 - t/2. Cruzam em t = 4/3: integral de t em [0,4/3] = 8/9;
    /// integral de 2 - t/2 em [4/3,4] = (8 - 4) - (8/3 - 4/9) = 16/9. Total 24/9 = 8/3.
    #[test]
    fn perfis_paralelos_de_quebras_diferentes() {
        let a = perfil_x(retangulo(0.0, 0.0, 4.0, 1.0), &[(0.0, 0.0), (2.0, 2.0), (4.0, 0.0)]);
        let b = perfil_x(retangulo(0.0, 0.0, 4.0, 1.0), &[(0.0, 2.0), (4.0, 0.0)]);
        confere("paralelos", 8.0 / 3.0, overlap_volume(&a, &b).unwrap(), 1e-9);
    }

    /// Dividir a peca em duas nao muda o volume total (1e-12).
    #[test]
    fn invariancia_por_divisao_da_peca() {
        let pts = [(0.0, 0.0), (1.0, 1.5), (2.5, 0.5), (4.0, 2.0)];
        let c = cortador(retangulo(-1.0, -1.0, 5.0, 2.0), 0.4, 1.2);
        let inteira = overlap_volume(&perfil_x(retangulo(0.0, 0.0, 4.0, 1.0), &pts), &c).unwrap();
        for corte in [1.0, 1.3, 2.5, 3.1] {
            let p1 = overlap_volume(&perfil_x(retangulo(0.0, 0.0, corte, 1.0), &pts), &c).unwrap();
            let p2 = overlap_volume(&perfil_x(retangulo(corte, 0.0, 4.0, 1.0), &pts), &c).unwrap();
            confere(&format!("divisao em x = {corte}"), inteira, p1 + p2, 1e-12);
        }
        let q1 = overlap_volume(&perfil_x(retangulo(0.0, 0.0, 4.0, 0.37), &pts), &c).unwrap();
        let q2 = overlap_volume(&perfil_x(retangulo(0.0, 0.37, 4.0, 1.0), &pts), &c).unwrap();
        confere("divisao em y = 0.37", inteira, q1 + q2, 1e-12);
    }

    /// Sem perfil: afim exato; planas: area x altura; sem toque em cota: zero.
    #[test]
    fn overlap_sem_perfil() {
        // Laje [0,1] subindo 100% ao longo de x, sob o plano z in [0,1]: altura = min(1 + x, 1) - max(x, 0) = 1 - x em x<=1.
        let a = peca(retangulo(0.0, 0.0, 2.0, 1.0), Span::Laje { z0: 0.0, z1: 1.0, origem: [0.0, 0.0], direcao: [1.0, 0.0], percentual: 100.0 });
        let b = cortador(retangulo(0.0, 0.0, 2.0, 1.0), 0.0, 1.0);
        confere("laje inclinada sob plano", 0.5, overlap_volume(&a, &b).unwrap(), 1e-9);
        let c = cortador(retangulo(1.0, 0.0, 3.0, 1.0), 0.5, 2.0);
        confere("planas", 0.5, overlap_volume(&b, &c).unwrap(), 1e-12);
        let alto = cortador(retangulo(0.0, 0.0, 2.0, 1.0), 5.0, 6.0);
        confere("sem toque", 0.0, overlap_volume(&b, &alto).unwrap(), 1e-300);
    }
}
