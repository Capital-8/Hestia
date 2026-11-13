//! Testes da ficha K2 (estrutura): perfis, prismas, malha de pilar e viga e as consultas 200 e 205. Fixtures da A.10 (E1 a E5, E9, E10).

use std::collections::BTreeMap;

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{ENTRADA, ID_AUSENTE, LIMITE, NIVEL_TODOS};
use crate::estr_malha::*;
use crate::estr_perfil::*;
use crate::estr_prisma::*;
use crate::gc_malha::PecaMalha;
use crate::secoes_estr::*;
use crate::teste_util::Xorshift;

const NAN: f64 = f64::NAN;

fn perfil(forma: u8, x: &[f64]) -> PerfilLinha {
    let mut p = [NAN; 6];
    p[..x.len()].copy_from_slice(x);
    PerfilLinha { forma, p, perfil: ID_AUSENTE }
}

fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs().max(1e-300)
}

/// Fechada e orientada: cada aresta dirigida aparece uma vez e a inversa também (cada aresta em exatamente dois triângulos, sentidos opostos).
fn fechada(p: &PecaMalha) -> bool {
    let mut d: BTreeMap<(u32, u32), u32> = BTreeMap::new();
    for t in &p.triangulos {
        for k in 0..3 {
            *d.entry((t[k], t[(k + 1) % 3])).or_insert(0) += 1;
        }
    }
    !d.is_empty() && d.iter().all(|(&(a, b), &n)| n == 1 && d.get(&(b, a)) == Some(&1))
}

fn area_superficie(p: &PecaMalha) -> f64 {
    p.triangulos
        .iter()
        .map(|t| {
            let (a, b, c) = (p.vertices[t[0] as usize], p.vertices[t[1] as usize], p.vertices[t[2] as usize]);
            let (u, v) = ([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
            let w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            (w[0] * w[0] + w[1] * w[1] + w[2] * w[2]).sqrt() / 2.0
        })
        .sum()
}

/// Cena com os níveis 0 (cota 0) e 1 (cota 3).
fn cena() -> Cena {
    let mut c = Cena::novo();
    c.b.niveis.insert(1, (0, 0.0));
    c.b.niveis.insert(2, (1, 3.0));
    c
}

fn pilar(tipo: u32, altura: f64) -> PilarLinha {
    PilarLinha { nivel: 0, tipo, disciplina: 1, pos: [1.0, 2.0], rotacao: 0.3, deslocamento_base: 0.0, nivel_topo: ID_AUSENTE, deslocamento_topo: 0.0, altura, hosp: ID_AUSENTE }
}

fn viga(tipo: u32, a: [f64; 2], b: [f64; 2], z: [f64; 2], alinhamento: u8) -> VigaLinha {
    VigaLinha { nivel: 0, tipo, a, b, deslocamento_z: z, alinhamento, rotacao: 0.0, extremidades: [0, 0] }
}

/// Malha de um pilar só (lod fino), com o tipo dado.
fn malha_pilar(p: PerfilLinha, altura: f64) -> (MalhaEstr, PecaMalha) {
    let mut c = cena();
    c.estr.tipos_pilar.insert(1, TipoPilarLinha { disciplina: 1, perfil: p, material: 7, espessura_camadas: 0.0 });
    c.estr.pilares.insert(10, pilar(1, altura));
    let m = montar(&c, 0, 2).expect("malha");
    let g = m.grupos[0];
    let peca = m.peca(&g);
    (m, peca)
}

fn confere_volume(p: PerfilLinha, altura: f64, area: f64) -> f64 {
    let (_, peca) = malha_pilar(p, altura);
    assert!(fechada(&peca), "malha fechada");
    let v = volume(&peca);
    assert!(rel(v, area * altura) < 1e-9, "volume {v} contra {}", area * altura);
    v
}

#[test]
fn e1_pilar_retangular() {
    let v = confere_volume(perfil(PERFIL_RETANGULAR, &[0.2, 0.4]), 3.0, 0.08);
    assert!(rel(v, 0.24) < 1e-12);
    let (_, peca) = malha_pilar(perfil(PERFIL_RETANGULAR, &[0.2, 0.4]), 3.0);
    // Forma lateral 3,60 m² mais as duas tampas.
    assert!(rel(area_superficie(&peca), 3.6 + 2.0 * 0.08) < 1e-12);
}

#[test]
fn e2_pilar_circular() {
    let c = contorno(&perfil(PERFIL_CIRCULAR, &[0.3]), &[], LADOS_CIRCULO).expect("círculo");
    assert_eq!(c.anel.len(), 96);
    let poligono = 96.0 / 2.0 * 0.15f64.powi(2) * (std::f64::consts::TAU / 96.0).sin();
    assert!(rel(c.area(), poligono) < 1e-12);
    let v = confere_volume(perfil(PERFIL_CIRCULAR, &[0.3]), 3.0, poligono);
    assert!(rel(v, 0.2121) < 1e-3, "{v}");
    assert!(rel(v, std::f64::consts::PI * 0.15f64.powi(2) * 3.0) < 1e-3);
}

#[test]
fn e3_perfil_i() {
    let p = perfil(PERFIL_I, &[0.1, 0.2, 0.008, 0.005]);
    let c = contorno(&p, &[], LADOS_CIRCULO).expect("I");
    assert!(rel(c.area(), 0.00252) < 1e-12);
    assert!(rel(confere_volume(p, 3.0, 0.00252), 0.00756) < 1e-9);
}

#[test]
fn e4_tubo_retangular() {
    let p = perfil(PERFIL_TUBO_RETANGULAR, &[0.1, 0.1, 0.005]);
    let c = contorno(&p, &[], LADOS_CIRCULO).expect("tubo");
    assert!(rel(c.area(), 0.0019) < 1e-12);
    assert_eq!(c.furos.len(), 1);
    assert!(rel(confere_volume(p, 3.0, 0.0019), 0.0057) < 1e-9);
}

#[test]
fn e5_viga_retangular_alinhada_no_topo() {
    let mut c = cena();
    c.estr.tipos_viga.insert(2, TipoVigaLinha { perfil: perfil(PERFIL_RETANGULAR, &[0.15, 0.4]), material: 3 });
    c.estr.vigas.insert(5, viga(2, [0.0, 0.0], [5.0, 0.0], [3.0, 3.0], ALINHA_TOPO));
    let m = montar(&c, 0, 1).expect("malha");
    assert_eq!(m.grupos.len(), 1);
    let g = m.grupos[0];
    assert_eq!((g.elemento, g.categoria, g.parte, g.material), (5, CATEGORIA_VIGA, PARTE_CORPO, 3));
    let peca = m.peca(&g);
    assert!(fechada(&peca));
    assert!(rel(volume(&peca), 0.30) < 1e-12);
    let zs: Vec<f64> = m.vertices.iter().map(|p| p[2]).collect();
    let (z0, z1) = (zs.iter().copied().fold(f64::INFINITY, f64::min), zs.iter().copied().fold(f64::NEG_INFINITY, f64::max));
    assert!((z1 - 3.0).abs() < 1e-12 && (z0 - 2.6).abs() < 1e-12, "topo no eixo: {z0} {z1}");
    let xs: Vec<f64> = m.vertices.iter().map(|p| p[0]).collect();
    assert!(xs.iter().all(|&x| x == 0.0 || x == 5.0), "comprimento 5,00");
}

#[test]
fn viga_alinhamento_giro_e_inclinacao() {
    let mut c = cena();
    c.estr.tipos_viga.insert(2, TipoVigaLinha { perfil: perfil(PERFIL_RETANGULAR, &[0.2, 0.5]), material: 3 });
    for (al, z0, z1) in [(ALINHA_CENTRO, 0.75, 1.25), (ALINHA_BASE, 1.0, 1.5)] {
        c.estr.vigas.insert(1, viga(2, [1.0, 1.0], [1.0, 4.0], [1.0, 1.0], al));
        let m = montar(&c, NIVEL_TODOS, 0).expect("malha");
        let zs = m.vertices.iter().map(|p| p[2]);
        let (lo, hi) = zs.fold((f64::INFINITY, f64::NEG_INFINITY), |a, z| (a.0.min(z), a.1.max(z)));
        assert!((lo - z0).abs() < 1e-12 && (hi - z1).abs() < 1e-12, "alinhamento {al}: {lo} {hi}");
    }
    // Inclinada e girada: volume = área × comprimento do eixo 3D, malha fechada.
    let mut v = viga(2, [0.0, 0.0], [3.0, 4.0], [0.0, 1.2], ALINHA_TOPO);
    v.rotacao = 0.7;
    c.estr.vigas.insert(1, v);
    let m = montar(&c, 0, 2).expect("malha");
    let peca = m.peca(&m.grupos[0]);
    assert!(fechada(&peca));
    let l = (25.0f64 + 1.44).sqrt();
    assert!(rel(volume(&peca), 0.1 * l) < 1e-9);
    // Eixo com menos de 1 mm: ENTRADA.
    c.estr.vigas.insert(1, viga(2, [0.0, 0.0], [0.0005, 0.0], [0.0, 0.0], 0));
    assert_eq!(montar(&c, 0, 2), Err(ENTRADA));
    // Viga vertical (eixo sem componente em planta): ainda um prisma fechado.
    c.estr.vigas.insert(1, viga(2, [0.0, 0.0], [0.0, 0.0], [0.0, 2.0], 1));
    let m = montar(&c, 0, 2).expect("vertical");
    assert!(rel(volume(&m.peca(&m.grupos[0])), 0.2) < 1e-9);
}

/// Anel L de 6 vértices (E9), em coordenadas fora da origem.
fn anel_l() -> Vec<P2> {
    vec![[1.0, 1.0], [1.3, 1.0], [1.3, 1.05], [1.05, 1.05], [1.05, 1.4], [1.0, 1.4]]
}

#[test]
fn e9_personalizado_l() {
    let a = anel_l();
    let shoelace = area_com_sinal(&a);
    assert!(rel(shoelace, 0.3 * 0.05 + 0.35 * 0.05) < 1e-12);
    let c = contorno_personalizado(std::slice::from_ref(&a)).expect("L");
    assert!(rel(c.area(), shoelace) < 1e-12);
    let [y0, y1] = c.faixa_y();
    assert!((y0 + 0.2).abs() < 1e-12 && (y1 - 0.2).abs() < 1e-12, "recentrado na caixa");
    // Pela seção 206, com o anel horário (a orientação é normalizada).
    let mut cn = cena();
    for (k, p) in a.iter().rev().enumerate() {
        cn.estr.perfis.insert(100 + k as u32, VerticePerfilLinha { perfil: 4, anel: 0, indice: k as u32, p: *p });
    }
    let mut pf = perfil(PERFIL_PERSONALIZADO, &[]);
    pf.perfil = 4;
    cn.estr.tipos_pilar.insert(1, TipoPilarLinha { disciplina: 1, perfil: pf, material: 7, espessura_camadas: 0.0 });
    cn.estr.pilares.insert(10, pilar(1, 3.0));
    let m = montar(&cn, 0, 2).expect("malha");
    let peca = m.peca(&m.grupos[0]);
    assert!(fechada(&peca));
    assert!(rel(volume(&peca), shoelace * 3.0) < 1e-9);
    // Furo no índice: ENTRADA.
    cn.estr.perfis.remove(&102);
    assert_eq!(montar(&cn, 0, 2), Err(ENTRADA));
}

#[test]
fn e10_perfis_invalidos_dao_entrada() {
    let invalidos = [
        perfil(PERFIL_I, &[0.1, 0.2, 0.1, 0.005]),
        perfil(PERFIL_RETANGULAR, &[0.2, NAN]),
        perfil(PERFIL_TUBO_CIRCULAR, &[0.2, 0.1]),
        perfil(9, &[0.2, 0.2]),
    ];
    for p in invalidos {
        assert_eq!(contorno(&p, &[], 96), Err(ENTRADA), "{p:?}");
    }
    let cruzado = vec![[0.0, 0.0], [1.0, 1.0], [1.0, 0.0], [0.0, 1.0]];
    assert_eq!(contorno_personalizado(&[cruzado]), Err(ENTRADA), "anel com cruzamento");
    assert_eq!(contorno_personalizado(&[vec![[0.0, 0.0], [1e-4, 0.0], [0.0, 1e-4]]]), Err(ENTRADA), "área < 1e-6");
    let quadrado = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
    let fora = vec![[2.0, 2.0], [3.0, 2.0], [3.0, 3.0]];
    assert_eq!(contorno_personalizado(&[quadrado.clone(), fora]), Err(ENTRADA), "furo fora");
    let a = vec![[0.2, 0.2], [0.6, 0.2], [0.6, 0.6]];
    let b = vec![[0.3, 0.25], [0.7, 0.25], [0.7, 0.7]];
    assert_eq!(contorno_personalizado(&[quadrado.clone(), a, b]), Err(ENTRADA), "furos se cruzam");
    assert_eq!(contorno_personalizado(&[]), Err(ENTRADA));
    assert_eq!(contorno_personalizado(&[vec![[0.0, 0.0]; MAX_VERTICES + 1]]), Err(LIMITE));
    // Na consulta 200: o pilar de perfil inválido derruba a consulta com ENTRADA, sem pânico.
    let mut c = cena();
    let mut pf = perfil(PERFIL_PERSONALIZADO, &[]);
    pf.perfil = 9;
    c.estr.tipos_pilar.insert(1, TipoPilarLinha { disciplina: 1, perfil: pf, material: 7, espessura_camadas: 0.0 });
    c.estr.pilares.insert(10, pilar(1, 3.0));
    assert_eq!(executar(&mut c, 200, &[0.0, 1.0]), Err(ENTRADA));
}

#[test]
fn contornos_dos_nove_perfis() {
    let casos = [
        (perfil(PERFIL_RETANGULAR, &[0.2, 0.4]), 0.08),
        (perfil(PERFIL_L, &[0.1, 0.15, 0.01]), 0.1 * 0.01 + 0.14 * 0.01),
        (perfil(PERFIL_T, &[0.2, 0.3, 0.02, 0.01]), 0.2 * 0.02 + 0.28 * 0.01),
        (perfil(PERFIL_I, &[0.1, 0.2, 0.008, 0.005]), 0.00252),
        (perfil(PERFIL_U, &[0.08, 0.2, 0.011, 0.006]), 2.0 * 0.08 * 0.011 + 0.178 * 0.006),
        (perfil(PERFIL_TUBO_RETANGULAR, &[0.2, 0.1, 0.01]), 0.02 - 0.18 * 0.08),
    ];
    for (p, area) in casos {
        let c = contorno(&p, &[], 96).expect("perfil");
        assert!(rel(c.area(), area) < 1e-12, "{p:?}: {} contra {area}", c.area());
        assert!(area_com_sinal(&c.anel) > 0.0 && c.furos.iter().all(|f| area_com_sinal(f) < 0.0));
        let (x0, x1) = c.anel.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |a, q| (a.0.min(q[0]), a.1.max(q[0])));
        let [y0, y1] = c.faixa_y();
        assert!((x0 + x1).abs() < 1e-15 && (y0 + y1).abs() < 1e-15 && rel(x1 - x0, p.p[0]) < 1e-12 && rel(y1 - y0, p.p[1]) < 1e-12);
        confere_volume(p, 2.5, area);
    }
    let t = contorno(&perfil(PERFIL_TUBO_CIRCULAR, &[0.2, 0.01]), &[], 96).expect("tubo");
    assert_eq!((t.anel.len(), t.furos[0].len()), (96, 96));
    assert_eq!(lados_por_lod(0), 24);
    assert_eq!(lados_por_lod(1), 48);
    assert_eq!(lados_por_lod(2), 96);
    assert!(rel(contorno(&perfil(PERFIL_RETANGULAR, &[1.0, 2.0]), &[], 96).expect("r").perimetro(), 6.0) < 1e-15);
}

#[test]
fn malha_valida() {
    let formas = [
        perfil(PERFIL_RETANGULAR, &[0.2, 0.4]),
        perfil(PERFIL_CIRCULAR, &[0.3]),
        perfil(PERFIL_L, &[0.1, 0.15, 0.01]),
        perfil(PERFIL_T, &[0.2, 0.3, 0.02, 0.01]),
        perfil(PERFIL_I, &[0.1, 0.2, 0.008, 0.005]),
        perfil(PERFIL_U, &[0.08, 0.2, 0.011, 0.006]),
        perfil(PERFIL_TUBO_RETANGULAR, &[0.1, 0.1, 0.005]),
        perfil(PERFIL_TUBO_CIRCULAR, &[0.3, 0.02]),
    ];
    for lod in 0..3 {
        for p in formas {
            let pm = PerfilMalha::de(contorno(&p, &[], lados_por_lod(lod)).expect("perfil")).expect("tampas");
            let area = pm.contorno.area();
            // Pilar girado, viga inclinada e extrusão para baixo (orientação negativa do quadro).
            let quadros = [
                quadro_pilar(&pilar(1, 3.0), 0.5, 3.5),
                Quadro3 { origem: [0.0, 0.0, 0.0], ex: [0.0, 1.0, 0.0], ey: [0.6, 0.0, 0.8], eixo: [4.0, 0.0, -3.0] },
                Quadro3 { origem: [1.0, 1.0, 0.0], ex: [1.0, 0.0, 0.0], ey: [0.0, 1.0, 0.0], eixo: [0.0, 0.0, -0.7] },
            ];
            for (q, l) in quadros.iter().zip([3.0, 5.0, 0.7]) {
                let peca = pm.extrudar(q).expect("prisma");
                assert!(fechada(&peca), "{p:?} lod {lod}");
                let v = volume(&peca);
                assert!(v > 0.0 && rel(v, area * l) < 1e-9, "{p:?} lod {lod}: {v} contra {}", area * l);
            }
        }
    }
    let q = Quadro3 { origem: [0.0; 3], ex: [1.0, 0.0, 0.0], ey: [0.0, 1.0, 0.0], eixo: [1.0, 0.0, 0.0] };
    assert_eq!(extrudar(&[anel_l()], &[], &q), Err(ENTRADA), "eixo no plano do perfil");
}

#[test]
fn perfil_com_furo_area() {
    let tubo = contorno(&perfil(PERFIL_TUBO_RETANGULAR, &[0.1, 0.1, 0.005]), &[], 96).expect("tubo");
    let tubo_c = contorno(&perfil(PERFIL_TUBO_CIRCULAR, &[0.3, 0.02]), &[], 96).expect("tubo circular");
    let poligono = |r: f64| 48.0 * r * r * (std::f64::consts::TAU / 96.0).sin();
    let quadrado = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
    let f1 = vec![[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4]];
    let f2 = vec![[0.6, 0.6], [0.9, 0.6], [0.75, 0.9]];
    let f3 = vec![[0.6, 0.1], [0.9, 0.1], [0.9, 0.3], [0.7, 0.3], [0.7, 0.5], [0.6, 0.5]];
    let dois = contorno_personalizado(&[quadrado, f1, f2, f3]).expect("três furos");
    let casos = [(tubo, 0.0019), (tubo_c, poligono(0.15) - poligono(0.13)), (dois, 1.0 - 0.09 - 0.045 - 0.08)];
    for (c, analitica) in casos {
        let pm = PerfilMalha::de(c).expect("tampas");
        assert!(rel(area_triangulada(&pm.aneis, &pm.tampas), analitica) < 1e-9, "tampa: {}", area_triangulada(&pm.aneis, &pm.tampas));
        let q = quadro_pilar(&pilar(1, 2.0), 0.0, 2.0);
        let peca = pm.extrudar(&q).expect("prisma");
        assert!(fechada(&peca));
        assert!(rel(volume(&peca) / 2.0, analitica) < 1e-9, "seção da malha");
    }
}

#[test]
fn camadas_do_pilar_arquitetonico() {
    let mut c = cena();
    c.estr.tipos_pilar.insert(1, TipoPilarLinha { disciplina: DISCIPLINA_ARQUITETONICO, perfil: perfil(PERFIL_RETANGULAR, &[0.2, 0.2]), material: 7, espessura_camadas: 0.02 });
    c.estr.pilares.insert(10, PilarLinha { disciplina: 0, nivel_topo: 1, altura: NAN, deslocamento_topo: -0.5, ..pilar(1, NAN) });
    let m = montar(&c, 0, 1).expect("malha");
    assert_eq!(m.grupos.iter().map(|g| g.parte).collect::<Vec<_>>(), vec![PARTE_CORPO, PARTE_CAMADAS]);
    let casca = m.peca(&m.grupos[1]);
    assert!(fechada(&casca));
    assert!(rel(volume(&casca), (0.24 * 0.24 - 0.04) * 2.5) < 1e-6, "{}", volume(&casca));
    assert!(rel(volume(&m.peca(&m.grupos[0])), 0.04 * 2.5) < 1e-12, "topo pelo nível 1 menos 0,5");
    // Topo abaixo da base: ENTRADA (A.4.1).
    c.estr.pilares.insert(10, PilarLinha { nivel_topo: 0, altura: NAN, ..pilar(1, NAN) });
    assert_eq!(montar(&c, 0, 1), Err(ENTRADA));
}

fn u32s(s: &Saida) -> Vec<u32> {
    if let Saida::U32(v) = s { v.clone() } else { panic!("esperava u32") }
}

fn f64s(s: &Saida) -> Vec<f64> {
    if let Saida::F64(v) = s { v.clone() } else { panic!("esperava f64") }
}

#[test]
fn consulta_200_ordem_filtro_e_referencias() {
    let mut c = cena();
    c.estr.tipos_pilar.insert(1, TipoPilarLinha { disciplina: 1, perfil: perfil(PERFIL_RETANGULAR, &[0.2, 0.4]), material: 7, espessura_camadas: 0.0 });
    c.estr.tipos_viga.insert(2, TipoVigaLinha { perfil: perfil(PERFIL_I, &[0.1, 0.2, 0.008, 0.005]), material: 8 });
    c.estr.pilares.insert(30, pilar(1, 3.0));
    c.estr.pilares.insert(20, PilarLinha { nivel: 1, ..pilar(1, 3.0) });
    c.estr.vigas.insert(4, viga(2, [0.0, 0.0], [5.0, 0.0], [3.0, 3.0], 0));
    let s = executar(&mut c, 200, &[NIVEL_TODOS as f64, 2.0]).expect("200");
    let g = u32s(&s[0]);
    assert_eq!(g.len(), 18);
    let chaves: Vec<[u32; 4]> = g.chunks_exact(6).map(|x| [x[0], x[1], x[2], x[3]]).collect();
    assert_eq!(chaves, vec![[20, 0, 0, 7], [30, 0, 0, 7], [4, 1, 0, 8]]);
    let (v, idx) = (f64s(&s[1]), u32s(&s[2]));
    assert_eq!(g[4], 0);
    assert_eq!(g[10], g[4] + g[5]);
    assert_eq!(idx.len() as u32, g[16] + g[17]);
    assert!(idx.iter().all(|&k| (k as usize) < v.len() / 3));
    // O pilar 20 está no nível 1 (cota 3): base em z = 3.
    let z20 = idx[g[4] as usize..(g[4] + g[5]) as usize].iter().map(|&k| v[3 * k as usize + 2]).fold(f64::INFINITY, f64::min);
    assert_eq!(z20, 3.0);
    let s0 = executar(&mut c, 200, &[0.0, 1.0]).expect("nível 0");
    assert_eq!(u32s(&s0[0]).chunks_exact(6).map(|x| x[0]).collect::<Vec<_>>(), vec![30, 4]);
    assert_eq!(executar(&mut c, 200, &[0.0, 3.0]), Err(ENTRADA), "lod fora");
    assert_eq!(executar(&mut c, 200, &[0.5, 1.0]), Err(ENTRADA));
    assert!(u32s(&executar(&mut c, 200, &[7.0, 1.0]).expect("vazio")[0]).is_empty());
    // Determinismo.
    assert_eq!(executar(&mut c, 200, &[NIVEL_TODOS as f64, 2.0]), Ok(s));
    // Tipo ausente e nível fora da seção 19: ENTRADA.
    c.estr.vigas.insert(4, viga(9, [0.0, 0.0], [5.0, 0.0], [3.0, 3.0], 0));
    assert_eq!(executar(&mut c, 200, &[0.0, 1.0]), Err(ENTRADA));
    c.estr.vigas.clear();
    c.b.niveis.remove(&2);
    assert_eq!(executar(&mut c, 200, &[NIVEL_TODOS as f64, 1.0]), Err(ENTRADA));
    assert!(executar(&mut c, 200, &[0.0, 1.0]).is_ok());
}

#[test]
fn fuzz_perfis_200() {
    let mut r = Xorshift::novo(2026);
    let valores = [NAN, 0.0, -0.1, f64::INFINITY, 1e-12, 1e9, 0.005, 0.02, 0.1, 0.3];
    let mut validos = 0;
    for rodada in 0..200 {
        let forma = (r.proximo() % 10) as u8;
        let mut p = [0.0; 6];
        for x in p.iter_mut() {
            *x = if r.proximo().is_multiple_of(3) { valores[(r.proximo() % valores.len() as u64) as usize] } else { r.intervalo(0.001, 0.5) };
        }
        let mut aneis = Vec::new();
        for k in 0..1 + r.proximo() % 3 {
            let n = (r.proximo() % 9) as usize;
            let escala = if k == 0 { 1.0 } else { 0.2 };
            aneis.push((0..n).map(|_| [r.intervalo(0.0, escala), if r.proximo().is_multiple_of(40) { NAN } else { r.intervalo(0.0, escala) }]).collect::<Vec<P2>>());
        }
        let pl = PerfilLinha { forma, p, perfil: ID_AUSENTE };
        let resultado = contorno(&pl, &aneis, lados_por_lod(rodada % 3));
        if let Ok(c) = resultado {
            validos += 1;
            let pm = PerfilMalha::de(c).expect("válido triangula");
            let peca = pm.extrudar(&quadro_pilar(&pilar(1, 1.0), 0.0, 1.5)).expect("prisma");
            assert!(fechada(&peca), "rodada {rodada}");
            // Perfis de 1e-12 m de espessura: o erro de arredondamento é absoluto (a peça está fora da origem); acima de 1 km a conferência do volume
            // perde o sentido (só a malha fechada vale).
            let esperado = pm.contorno.area() * 1.5;
            let grande = pm.contorno.anel.iter().flatten().any(|x| x.abs() > 1e3);
            assert!(grande || (volume(&peca) - esperado).abs() <= 1e-9 * esperado.max(1e-3), "rodada {rodada}: {pl:?} {} {}", volume(&peca), pm.contorno.area() * 1.5);
        }
        // Os mesmos dados pela consulta 205: nunca pânico.
        let mut args = vec![0.0, forma as f64];
        args.extend(p);
        args.push(aneis.len() as f64);
        for a in &aneis {
            args.push(a.len() as f64);
            args.extend(a.iter().flatten());
        }
        let _ = executar(&mut Cena::novo(), 205, &args);
        let _ = triangular(&aneis);
    }
    assert!(validos > 20, "o fuzz também exercita perfis válidos: {validos}");
}

