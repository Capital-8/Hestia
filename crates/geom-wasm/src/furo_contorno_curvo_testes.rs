//! Testes por invariantes do furo em PAREDE CURVA (docs/estudo-esquadrias/33 §4): cortador radial em leque sobre o prisma em
//! planta (setor anular em cordas) e retorno do acabamento no vão curvo. O removido esperado vem de uma integral em planta
//! que não usa o kernel: `removido = integral de W(t) x [integral de rho d(rho) sobre a planta no ângulo de t] / R dt`, com
//! `W(t)` o comprimento em z do contorno em `t` e a planta cortada por raio (interseção exata com as cordas).

use crate::furo_contorno::{ErroFuro, Vao};
use crate::furo_contorno_prisma::*;
use crate::furo_contorno_quant::{EntradaRetorno, ModoRetorno};
use crate::furo_contorno_retorno_ext::*;
use std::f64::consts::PI;

fn quase(a: f64, b: f64, tol: f64, r: &str) {
    assert!((a - b).abs() <= tol, "{r}: obtido {a}, esperado {b} (tol {tol})");
}

/// Ponto (t, s) no referencial local, escrito sem `mapa_curvo` (fórmula independente por sinal do raio).
fn local(raio: f64, t: f64, s: f64) -> [f64; 2] {
    let r = raio.abs();
    if raio > 0.0 {
        let rho = r + s;
        [rho * (t / r).sin(), -r + rho * (t / r).cos()]
    } else {
        let rho = r - s;
        [rho * (t / r).sin(), r - rho * (t / r).cos()]
    }
}

/// Setor anular em cordas: t em [t0, t1], lateral s em [s0, s1], `n` cordas por face.
fn setor(raio: f64, t0: f64, t1: f64, s0: f64, s1: f64, n: usize) -> Vec<[f64; 2]> {
    let mut p = Vec::new();
    for i in 0..=n {
        p.push(local(raio, t0 + (t1 - t0) * i as f64 / n as f64, s0));
    }
    for i in (0..=n).rev() {
        p.push(local(raio, t0 + (t1 - t0) * i as f64 / n as f64, s1));
    }
    p
}

fn camada(raio: f64, l: f64, s0: f64, s1: f64, n: usize, z1: f64) -> CamadaPrisma {
    CamadaPrisma { poligonos: vec![vec![setor(raio, 0.0, l, s0, s1, n)]], z0: 0.0, z1 }
}

fn meia_lua(w: f64, h: f64, n: usize) -> Vec<[f64; 2]> {
    let r = w / 2.0;
    let nasc = h - r;
    let mut p = vec![[r, 0.0]];
    for i in 0..=n {
        let a = PI * i as f64 / n as f64;
        p.push([r * a.cos(), nasc + r * a.sin()]);
    }
    p.push([-r, 0.0]);
    p
}

fn retangulo(w: f64, h: f64) -> Vec<[f64; 2]> {
    vec![[w / 2.0, 0.0], [w / 2.0, h], [-w / 2.0, h], [-w / 2.0, 0.0]]
}

/// Comprimento em z do contorno em x (cruzamentos par-ímpar).
fn largura_z(c: &[[f64; 2]], x: f64) -> f64 {
    let mut zs: Vec<f64> = Vec::new();
    for i in 0..c.len() {
        let (a, b) = (c[i], c[(i + 1) % c.len()]);
        if (a[0] <= x) != (b[0] <= x) {
            zs.push(a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1]));
        }
    }
    zs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    zs.chunks(2).filter(|p| p.len() == 2).map(|p| p[1] - p[0]).sum()
}

/// Integral de rho d(rho) ao longo do raio de ângulo `th` (do centro `(0, -raio)`) dentro do anel de planta.
fn momento_radial(raio: f64, th: f64, anel: &[[f64; 2]]) -> f64 {
    let (c, d) = ([0.0, -raio], [th.cos(), th.sin()]);
    let mut rs: Vec<f64> = Vec::new();
    for i in 0..anel.len() {
        let (a, b) = (anel[i], anel[(i + 1) % anel.len()]);
        let (e, f) = ([b[0] - a[0], b[1] - a[1]], [a[0] - c[0], a[1] - c[1]]);
        let den = d[0] * e[1] - d[1] * e[0];
        if den.abs() < 1e-14 {
            continue;
        }
        let rho = (f[0] * e[1] - f[1] * e[0]) / den;
        let u = (f[0] * d[1] - f[1] * d[0]) / den;
        if rho > 0.0 && (0.0..1.0).contains(&u) {
            rs.push(rho);
        }
    }
    rs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    rs.chunks(2).filter(|p| p.len() == 2).map(|p| 0.5 * (p[1] * p[1] - p[0] * p[0])).sum()
}

/// Removido esperado de um vão sobre uma planta (um anel), por integração em t.
fn removido_integral(raio: f64, anel: &[[f64; 2]], c: &[[f64; 2]], x: f64) -> f64 {
    let (x0, x1) = c.iter().fold((f64::MAX, f64::MIN), |(a, b), p| (a.min(p[0]), b.max(p[0])));
    let n = 40_000;
    let mut soma = 0.0;
    for i in 0..n {
        let dx = x0 + (x1 - x0) * (i as f64 + 0.5) / n as f64;
        let th = if raio > 0.0 { PI / 2.0 - (x + dx) / raio } else { -PI / 2.0 - (x + dx) / raio };
        soma += largura_z(c, dx) * momento_radial(raio, th, anel) / raio.abs();
    }
    soma * (x1 - x0) / n as f64
}

fn area(c: &[[f64; 2]]) -> f64 {
    (0..c.len()).map(|i| c[i][0] * c[(i + 1) % c.len()][1] - c[(i + 1) % c.len()][0] * c[i][1]).sum::<f64>() / 2.0
}

fn fura(raio: f64, cam: &CamadaPrisma, vaos: &[Vao]) -> Result<ResultadoPrisma, ErroPrisma> {
    furar_prisma_cur(std::slice::from_ref(cam), &[], vaos, ForaDoEnvelope::Recusar, Some(raio))
}

fn vao(c: Vec<[f64; 2]>, x: f64, soleira: f64) -> Vao {
    Vao { contorno: c, x, soleira }
}

#[test]
fn mapa_curvo_confere_com_a_formula_independente_e_o_inverso() {
    for raio in [3.0, -3.0, 0.8, -12.5] {
        for (t, s) in [(0.0, 0.0), (1.3, 0.1), (2.0, -0.15)] {
            let p = mapa_curvo(raio, t, s);
            let q = local(raio, t, s);
            quase(p[0], q[0], 1e-12, "x");
            quase(p[1], q[1], 1e-12, "y");
            let (ti, si) = mapa_curvo_inverso(raio, p, t + 0.01);
            quase(ti, t, 1e-9, "t inverso");
            quase(si, s, 1e-9, "s inverso");
        }
    }
}

#[test]
fn meia_lua_em_parede_curva_remove_a_integral_em_planta_nos_dois_sentidos() {
    let c = meia_lua(1.2, 2.1, 90);
    for raio in [3.0, -3.0] {
        // Camada que não é a do eixo: o fator rho_medio / R entra no removido.
        let cam = camada(raio, 5.0, 0.05, 0.35, 200, 2.8);
        let v = vao(c.clone(), 2.5, 0.0);
        let r = fura(raio, &cam, &[v]).unwrap();
        let esp = removido_integral(raio, &cam.poligonos[0][0], &c, 2.5);
        quase(r.volume_removido, esp, 2e-4 * esp, "removido x integral independente");
        // Fórmula fechada com as faces em círculo: A x e x rho_medio / R (as cordas tiram ~0,2 %).
        let rho_m = 3.0 + 0.2 * if raio > 0.0 { 1.0 } else { -1.0 };
        let fechada = area(&c) * 0.30 * (rho_m / 3.0);
        quase(r.volume_removido, fechada, 4e-3 * fechada, "removido x A e rho/R");
        // Malha em z cabe na camada e o volume líquido fecha.
        quase(r.camadas[0].volume + r.volume_removido, r.camadas[0].volume_sem_furo, 1e-9, "volume líquido");
    }
}

#[test]
fn dois_vaos_largos_e_vao_que_sai_do_inicio_da_parede() {
    let raio = 2.5;
    let cam = camada(raio, 4.0, -0.15, 0.15, 240, 2.6);
    let c1 = retangulo(1.6, 1.5);
    let c2 = meia_lua(1.0, 1.9, 60);
    let vaos = [vao(c1.clone(), 1.0, 0.8), vao(c2.clone(), 3.0, 0.0)];
    let r = fura(raio, &cam, &vaos).unwrap();
    // O primeiro tem soleira 0,8: a integral usa o contorno deslocado em z, o que não muda W(t).
    let esp = removido_integral(raio, &cam.poligonos[0][0], &c1, 1.0) + removido_integral(raio, &cam.poligonos[0][0], &c2, 3.0);
    quase(r.volume_removido, esp, 3e-4 * esp, "dois vãos");
    // Vão que começa antes de t = 0: só a parte que cabe sai (recorte, sem erro).
    let cam2 = camada(raio, 4.0, -0.15, 0.15, 240, 2.6);
    let v = vao(retangulo(1.2, 2.0), 0.3, 0.0);
    let r2 = fura(raio, &cam2, &[v]).unwrap();
    let esp2 = removido_integral(raio, &cam2.poligonos[0][0], &retangulo(1.2, 2.0), 0.3);
    quase(r2.volume_removido, esp2, 3e-4 * esp2, "vão cortado pelo início");
    assert!(r2.volume_removido < area(&retangulo(1.2, 2.0)) * 0.30);
}

#[test]
fn parede_reta_pelo_caminho_curvo_com_raio_enorme_coincide_com_o_reto() {
    // Raio grande: o leque degenera em cortador paralelo; o removido tende a A x e.
    let raio = 5000.0;
    let cam = camada(raio, 5.0, -0.1, 0.1, 4, 2.8);
    let c = meia_lua(1.2, 2.1, 90);
    let r = fura(raio, &cam, &[vao(c.clone(), 2.5, 0.0)]).unwrap();
    quase(r.volume_removido, area(&c) * 0.2, 1e-3 * area(&c) * 0.2, "A x e");
}

#[test]
fn validacao_da_parede_curva_nao_entra_em_panic() {
    let cam = camada(3.0, 5.0, -0.15, 0.15, 100, 2.8);
    let v = vao(retangulo(1.0, 2.0), 2.0, 0.0);
    for raio in [0.0, f64::NAN, f64::INFINITY, 0.01] {
        assert!(matches!(fura(raio, &cam, &[v.clone()]), Err(ErroPrisma::Curva(_))), "raio {raio}");
    }
    // Vão com mais de 2,4 rad de abertura.
    let largo = vao(retangulo(8.0, 2.0), 2.0, 0.0);
    assert!(matches!(fura(3.0, &cam, &[largo]), Err(ErroPrisma::Curva(_))));
    // Topo inclinado não vale em parede curva.
    let topo = TopoInclinado { t0: 0.0, t1: 5.0, h0: 2.0, h1: 2.8 };
    assert!(matches!(furar_prisma_cur(std::slice::from_ref(&cam), &[Some(topo)], &[v.clone()], ForaDoEnvelope::Recusar, Some(3.0)), Err(ErroPrisma::Curva(_))));
    // Contorno inválido segue recusado como no caminho reto.
    let horario = vao(vec![[0.5, 0.0], [-0.5, 0.0], [-0.5, 1.0], [0.5, 1.0]], 2.0, 0.0);
    assert!(matches!(fura(3.0, &cam, &[horario]), Err(ErroPrisma::Vao(ErroFuro::ContornoInvalido(_)))));
}

#[test]
fn abi_curva_devolve_entrada_para_raio_invalido_e_o_mesmo_volume_do_nucleo() {
    use crate::consultas::Saida;
    use crate::esquema::ENTRADA;
    let cam = camada(3.0, 5.0, -0.15, 0.15, 100, 2.8);
    let pontos: Vec<f64> = cam.poligonos[0][0].iter().flat_map(|p| [p[0], p[1]]).collect();
    let c = retangulo(1.0, 2.0);
    let pv: Vec<f64> = c.iter().flat_map(|p| [p[0], p[1]]).collect();
    let (aneis, pols, cams) = ([0u32, cam.poligonos[0][0].len() as u32], [0u32, 1], [0u32, 1]);
    let (vaos, x, sol, z) = ([0u32, 4], [2.0], [0.0], [0.0, 2.8]);
    let e = EntradasPrisma { pontos_planta: &pontos, aneis: &aneis, poligonos: &pols, camadas: &cams, z: &z, pontos: &pv, vaos: &vaos, x: &x, soleira: &sol };
    let ok = furar_prisma_planos_cur(&e, &[], ForaDoEnvelope::Recortar, Some(3.0)).unwrap();
    let Saida::F64(tot) = &ok[4] else { panic!() };
    let direto = fura(3.0, &cam, &[vao(c, 2.0, 0.0)]).unwrap();
    quase(tot[1], direto.volume_removido, 1e-12, "mesmo removido");
    assert_eq!(furar_prisma_planos_cur(&e, &[], ForaDoEnvelope::Recortar, Some(0.0)).unwrap_err().0, ENTRADA);
}

fn retorno_curvo(c: Vec<[f64; 2]>, raio: f64, y0: f64, y1: f64, t: f64, x: f64, soleira: f64) -> crate::furo_contorno_quant::Retorno {
    let e = EntradaRetorno { espessura_pedida: t, espessura_acabamento: t, y0, y1, modo: ModoRetorno::Contorno };
    retorno_do_vao_curvo(&Vao { contorno: c, x, soleira }, &e, 0.0, false, &[], Some(raio)).unwrap()
}

#[test]
fn retorno_no_vao_curvo_tem_volume_do_anel_vezes_rho_sobre_r_e_malha_fechada() {
    let (w, h, t) = (1.2, 2.0, 0.02);
    for raio in [3.0, -3.0] {
        let (y0, y1) = (-0.15, 0.15);
        let r = retorno_curvo(retangulo(w, h), raio, y0, y1, t, 2.5, 0.0);
        let anel = w * h - (w - 2.0 * t) * (h - 2.0 * t);
        let rho_m = 3.0 + (y0 + y1) / 2.0 * raio.signum();
        let esp = anel * (y1 - y0) * rho_m / 3.0;
        // As cordas do tampo (aresta de 5 cm) deixam ~1e-4 m de flecha em 0,3 m de profundidade.
        quase(r.volume, esp, 1.5e-3 * esp, "volume do retorno curvo");
        // Faces expostas: ombreiras radiais (2 h D) e verga/soleira (2 w D rho_m / R) sobre o vão livre.
        let exp = 2.0 * (h - 2.0 * t) * (y1 - y0) + 2.0 * (w - 2.0 * t) * (y1 - y0) * rho_m / 3.0;
        quase(r.area_exposta, exp, 3e-3 * exp, "área exposta");
        // Malha fechada (cada aresta aparece uma vez em cada sentido).
        use std::collections::HashMap;
        let mut a: HashMap<(u32, u32), u32> = HashMap::new();
        for tri in r.indices.chunks(3) {
            for k in 0..3 {
                *a.entry((tri[k], tri[(k + 1) % 3])).or_default() += 1;
            }
        }
        assert!(a.iter().all(|(&(p, q), &n)| n == 1 && a.get(&(q, p)) == Some(&1)), "malha aberta");
        // Os vértices ficam entre os raios das duas faces.
        let (rho_lo, rho_hi) = (3.0 + y0.min(y1) * raio.signum().max(-1.0), 3.0 + y1.max(y0));
        let _ = (rho_lo, rho_hi);
        for p in r.vertices.chunks(3) {
            let rho = p[0].hypot(p[1] + raio);
            assert!(rho > 3.0 - 0.15 - 1e-6 && rho < 3.0 + 0.15 + 1e-6, "rho {rho}");
        }
    }
}

#[test]
fn retorno_curvo_recusa_raio_e_vao_invalidos() {
    let e = EntradaRetorno { espessura_pedida: 0.02, espessura_acabamento: 0.02, y0: -0.1, y1: 0.1, modo: ModoRetorno::Contorno };
    let v = Vao { contorno: retangulo(1.0, 2.0), x: 2.0, soleira: 0.0 };
    for raio in [0.0, f64::NAN, 0.01] {
        assert!(retorno_do_vao_curvo(&v, &e, 0.0, false, &[], Some(raio)).is_err(), "raio {raio}");
    }
    let largo = Vao { contorno: retangulo(9.0, 2.0), x: 2.0, soleira: 0.0 };
    assert!(retorno_do_vao_curvo(&largo, &e, 0.0, false, &[], Some(3.0)).is_err());
}
