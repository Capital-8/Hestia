//! Testes da ABI do quantitativo e do retorno (`furo_contorno_quant_abi`): layout das saídas, paridade com o núcleo
//! (`quant_vao`, `retorno_do_vao`, `quantificar_parede`), recuo e validação sem panic. Chamam as funções `*_planos`
//! (o wrapper `extern "C"` só existe em wasm32 para ponteiros e usa o estado global).

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE, OK};
use crate::furo_contorno::{furar_parede, Vao};
use crate::furo_contorno_abi::{Entradas, Estado, LIMITE_PONTOS_POR_VAO};
use crate::furo_contorno_quant::{quant_vao, quantificar_parede};
use crate::furo_contorno_quant_abi::*;
use std::f64::consts::PI;

const CAMADAS_5: [f64; 5] = [0.015, 0.02, 0.09, 0.02, 0.015];

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

fn plano(c: &[[f64; 2]]) -> Vec<f64> {
    c.iter().flat_map(|p| [p[0], p[1]]).collect()
}

fn f64s(s: &Saida) -> &[f64] {
    match s {
        Saida::F64(v) => v,
        _ => panic!("esperava F64"),
    }
}
fn u32s(s: &Saida) -> &[u32] {
    match s {
        Saida::U32(v) => v,
        _ => panic!("esperava U32"),
    }
}

fn quase(a: f64, b: f64, tol: f64, r: &str) {
    assert!((a - b).abs() <= tol, "{r}: obtido {a}, esperado {b}");
}

fn ret(pontos: &[f64], espessura: f64, recuo: f64) -> EntradaRetornoAbi<'_> {
    EntradaRetornoAbi { pontos, x: 1.5, soleira: 0.1, espessura, espessura_acabamento: espessura, recuo, y0: 0.0, y1: 0.02, modo: 0 }
}

#[test]
fn quant_vao_retangulo_e_meia_lua() {
    let r = retangulo(1.2, 2.1);
    let s = quant_vao_planos(&plano(&r)).unwrap();
    assert_eq!(s.len(), 1);
    let v = f64s(&s[0]);
    assert_eq!(v.len(), 5);
    quase(v[0], 1.2, 1e-12, "largura");
    quase(v[1], 2.1, 1e-12, "altura");
    quase(v[2], 2.52, 1e-12, "area");
    quase(v[3], 6.6, 1e-12, "perimetro");
    quase(v[4], 2.52, 1e-12, "envelope");

    let m = meia_lua(1.0, 2.2, 64);
    let q = quant_vao(&m).unwrap();
    let v = f64s(&quant_vao_planos(&plano(&m)).unwrap()[0]).to_vec();
    assert_eq!(v, vec![q.largura, q.altura, q.area, q.perimetro, q.area_envelope]);
    // Área exata da meia-lua: retângulo (h - r) x w + semicírculo; as cordas inscritas ficam por dentro.
    let exata = 1.0 * (2.2 - 0.5) + PI * 0.25 / 2.0;
    assert!(v[2] < exata && exata - v[2] < 1e-3, "area {} vs {}", v[2], exata);
    assert!(v[2] < v[4], "a área real é menor que a do envelope");
}

#[test]
fn retorno_segue_o_contorno_e_confere_layout() {
    let c = retangulo(1.0, 2.1);
    let p = plano(&c);
    let s = retorno_planos(&ret(&p, 0.02, 0.0)).unwrap();
    assert_eq!(s.len(), 3);
    let m = f64s(&s[0]);
    assert_eq!(m.len(), 8);
    // anel = contorno - contorno recuado 2 cm; volume = anel x profundidade
    let anel = 1.0 * 2.1 - (1.0 - 0.04) * (2.1 - 0.04);
    quase(m[4], anel, 1e-9, "area do anel");
    quase(m[5], 0.96 * 2.06, 1e-9, "area livre");
    quase(m[6], anel * 0.02, 1e-9, "volume");
    quase(m[0], 0.02, 1e-12, "espessura efetiva");
    assert_eq!(m[1], 0.0);
    let v = f64s(&s[1]);
    let idx = u32s(&s[2]);
    assert!(!v.is_empty() && v.len() % 3 == 0 && idx.len() % 3 == 0 && !idx.is_empty());
    let nv = (v.len() / 3) as u32;
    assert!(idx.iter().all(|&i| i < nv));
    // vértices já em coordenadas da parede (x = 1.5 +- 0.5, z = 0.1..2.2, y em [0, 0.02])
    let xs = (0..v.len() / 3).map(|i| v[3 * i]);
    assert!(xs.clone().all(|x| x >= 1.0 - 1e-9 && x <= 2.0 + 1e-9));
    assert!((0..v.len() / 3).all(|i| v[3 * i + 1] >= -1e-9 && v[3 * i + 1] <= 0.02 + 1e-9));
    let zmax = (0..v.len() / 3).map(|i| v[3 * i + 2]).fold(f64::MIN, f64::max);
    quase(zmax, 2.2, 1e-9, "z máximo");
    assert!(m[7] > 0.0, "há área exposta");
}

#[test]
fn retorno_com_recuo_desloca_o_anel_para_dentro() {
    let p = plano(&retangulo(1.0, 2.1));
    let m0 = f64s(&retorno_planos(&ret(&p, 0.02, 0.0)).unwrap()[0]).to_vec();
    let m1 = f64s(&retorno_planos(&ret(&p, 0.02, 0.015)).unwrap()[0]).to_vec();
    // recuo 1,5 cm: contorno interno 0,97 x 2,07; anel = 0,97x2,07 - 0,93x2,03
    quase(m1[4], 0.97 * 2.07 - 0.93 * 2.03, 1e-9, "anel recuado");
    quase(m1[5], 0.93 * 2.03, 1e-9, "livre recuado");
    assert!(m1[4] < m0[4]);
    // mesma conta por offset do contorno no núcleo: retorno do contorno recuado == retorno de um retângulo menor
    let p2 = plano(&retangulo(0.97, 2.07));
    let ref_ = f64s(&retorno_planos(&ret(&p2, 0.02, 0.0)).unwrap()[0]).to_vec();
    quase(m1[4], ref_[4], 1e-9, "paridade com o contorno menor");
}

#[test]
fn retorno_na_meia_lua_acompanha_o_arco() {
    let c = meia_lua(1.0, 2.2, 48);
    let q = quant_vao(&c).unwrap();
    let s = retorno_planos(&ret(&plano(&c), 0.02, 0.0)).unwrap();
    let m = f64s(&s[0]);
    // anel ~ perímetro x espessura (faixa fina que segue o contorno): 1% de tolerância (cantos em miter)
    let aprox = q.perimetro * 0.02;
    assert!((m[4] - aprox).abs() / aprox < 0.03, "anel {} vs perim x t {}", m[4], aprox);
    quase(m[4] + m[5], q.area, 1e-6, "anel + livre = contorno");
    quase(m[6], m[4] * 0.02, 1e-9, "volume");
    // no modo ombreiras o arco não é revestido: anel menor
    let pc = plano(&c);
    let mut e = ret(&pc, 0.02, 0.0);
    e.modo = 1;
    let o = f64s(&retorno_planos(&e).unwrap()[0]).to_vec();
    assert!(o[4] < m[4]);
}

#[test]
fn retorno_limita_a_espessura_ao_acabamento() {
    let p = plano(&retangulo(1.0, 2.1));
    let mut e = ret(&p, 0.05, 0.0);
    e.espessura_acabamento = 0.025;
    let m = f64s(&retorno_planos(&e).unwrap()[0]).to_vec();
    quase(m[0], 0.025, 1e-12, "espessura limitada");
    assert_eq!(m[1], 1.0);
}

#[test]
fn retorno_recusa_entradas_ruins_sem_panic() {
    let ok = plano(&retangulo(1.0, 2.1));
    let casos: Vec<(&str, Vec<f64>, Box<dyn Fn(&mut EntradaRetornoAbi)>)> = vec![
        ("recuo que consome o contorno", ok.clone(), Box::new(|e| e.recuo = 0.6)),
        ("espessura que não cabe", ok.clone(), Box::new(|e| {
            e.espessura = 0.6;
            e.espessura_acabamento = 0.6;
        })),
        ("espessura zero", ok.clone(), Box::new(|e| e.espessura = 0.0)),
        ("espessura NaN", ok.clone(), Box::new(|e| e.espessura = f64::NAN)),
        ("recuo negativo", ok.clone(), Box::new(|e| e.recuo = -0.01)),
        ("y1 <= y0", ok.clone(), Box::new(|e| e.y1 = e.y0)),
        ("y infinito", ok.clone(), Box::new(|e| e.y1 = f64::INFINITY)),
        ("x NaN", ok.clone(), Box::new(|e| e.x = f64::NAN)),
        ("escalar absurdo", ok.clone(), Box::new(|e| e.soleira = 1e300)),
        ("modo inválido", ok.clone(), Box::new(|e| e.modo = 7)),
        ("contorno horário", plano(&retangulo(1.0, 2.1).into_iter().rev().collect::<Vec<_>>()), Box::new(|_| {})),
        ("contorno com 2 pontos", vec![0.0, 0.0, 1.0, 1.0], Box::new(|_| {})),
        ("contorno vazio", vec![], Box::new(|_| {})),
        ("contorno com NaN", vec![0.0, 0.0, 1.0, 0.0, f64::NAN, 1.0], Box::new(|_| {})),
        ("tamanho ímpar", vec![0.0, 0.0, 1.0, 0.0, 1.0], Box::new(|_| {})),
        ("gravata borboleta", vec![0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0], Box::new(|_| {})),
        ("ponto repetido", vec![0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0], Box::new(|_| {})),
    ];
    for (nome, pontos, f) in &casos {
        let mut e = ret(pontos, 0.02, 0.0);
        f(&mut e);
        let r = retorno_planos(&e);
        assert!(matches!(r, Err((c, _)) if c == ENTRADA), "{nome}: esperava ENTRADA, veio {:?}", r.map(|_| ()));
    }
}

#[test]
fn limites_de_pontos_dao_limite() {
    let n = (LIMITE_PONTOS_POR_VAO + 1) as usize;
    let c: Vec<f64> = (0..n).flat_map(|i| [i as f64, 0.0]).collect();
    assert!(matches!(quant_vao_planos(&c), Err((l, _)) if l == LIMITE));
    assert!(matches!(retorno_planos(&ret(&c, 0.02, 0.0)), Err((l, _)) if l == LIMITE));
}

#[test]
fn quant_vao_recusa_contornos_invalidos() {
    for p in [vec![], vec![0.0, 0.0, 1.0, 1.0], plano(&retangulo(1.0, 2.0).into_iter().rev().collect::<Vec<_>>()), vec![0.0, 0.0, 1.0, 0.0, 2.0, 0.0], vec![0.0, 0.0, 1.0, 0.0, f64::INFINITY, 1.0]] {
        assert!(matches!(quant_vao_planos(&p), Err((c, _)) if c == ENTRADA), "{p:?}");
    }
}

fn buffers(vaos: &[(Vec<[f64; 2]>, f64, f64)]) -> (Vec<f64>, Vec<u32>, Vec<f64>, Vec<f64>) {
    let (mut pts, mut idx, mut x, mut s) = (vec![], vec![0u32], vec![], vec![]);
    for (c, vx, vz) in vaos {
        pts.extend(plano(c));
        idx.push((pts.len() / 2) as u32);
        x.push(*vx);
        s.push(*vz);
    }
    (pts, idx, x, s)
}

#[test]
fn quant_parede_confere_com_o_nucleo_e_o_removido_e_area_x_espessura() {
    let c = meia_lua(1.0, 2.2, 64);
    let area = quant_vao(&c).unwrap().area;
    let (pts, idx, x, s) = buffers(&[(c.clone(), 2.0, 0.0), (retangulo(1.2, 1.2), 4.0, 0.9)]);
    let e = Entradas { pontos: &pts, vaos: &idx, x: &x, soleira: &s, espessuras: &CAMADAS_5, comprimento: 6.0, altura: 3.0 };
    let r = quant_parede_planos(&e).unwrap();
    assert_eq!(r.len(), 2);
    let meta = f64s(&r[0]);
    assert_eq!(meta.len(), 50);
    let tot = f64s(&r[1]);
    // contra o núcleo
    let vaos: Vec<Vao> = vec![Vao { contorno: c, x: 2.0, soleira: 0.0 }, Vao { contorno: retangulo(1.2, 1.2), x: 4.0, soleira: 0.9 }];
    let furo = furar_parede(&vaos, &CAMADAS_5, 6.0, 3.0).unwrap();
    let q = quantificar_parede(&furo, 6.0, 3.0).unwrap();
    quase(tot[0], q.volume_liquido, 1e-12, "volume líquido");
    quase(tot[1], q.volume_removido, 1e-12, "volume removido");
    // removido = (área da meia-lua + janela) x espessura total
    let esp: f64 = CAMADAS_5.iter().sum();
    quase(tot[1], (area + 1.44) * esp, 1e-9, "removido = área x espessura");
    for (k, cam) in q.camadas.iter().enumerate() {
        let b = &meta[10 * k..10 * k + 10];
        quase(b[2], cam.espessura, 1e-12, "espessura");
        quase(b[3], cam.volume_liquido, 1e-12, "líquido");
        quase(b[5], cam.volume_removido, 1e-12, "removido da camada");
        quase(b[9], area + 1.44, 1e-9, "área do furo na face");
    }
}

#[test]
fn quant_parede_valida_sem_panic() {
    let c = retangulo(1.0, 2.0);
    let (pts, idx, x, s) = buffers(&[(c, 1.0, 0.0)]);
    let base = |esp: &'static [f64], comp: f64, alt: f64| Entradas { pontos: &[], vaos: &[0], x: &[], soleira: &[], espessuras: esp, comprimento: comp, altura: alt };
    assert!(matches!(quant_parede_planos(&base(&[], 3.0, 3.0)), Err((c, _)) if c == ENTRADA));
    assert!(matches!(quant_parede_planos(&base(&[0.1], f64::NAN, 3.0)), Err((c, _)) if c == ENTRADA));
    assert!(matches!(quant_parede_planos(&base(&[0.1], 3.0, 1e300)), Err((c, _)) if c == ENTRADA));
    assert!(matches!(quant_parede_planos(&base(&[0.0], 3.0, 3.0)), Err((c, _)) if c == ENTRADA));
    // vão fora da parede
    let e = Entradas { pontos: &pts, vaos: &idx, x: &x, soleira: &s, espessuras: &[0.1], comprimento: 1.2, altura: 3.0 };
    assert!(matches!(quant_parede_planos(&e), Err((c, _)) if c == ENTRADA));
    // offsets incoerentes
    let ruim = vec![0u32, 99];
    let e = Entradas { pontos: &pts, vaos: &ruim, x: &x, soleira: &s, espessuras: &[0.1], comprimento: 3.0, altura: 3.0 };
    assert!(matches!(quant_parede_planos(&e), Err((c, _)) if c == ENTRADA));
}

#[test]
fn estado_guarda_saidas_e_erro() {
    let mut st = Estado::novo();
    assert_eq!(st.guardar(quant_vao_planos(&plano(&retangulo(1.0, 2.0)))), OK);
    assert_eq!(st.saida_n(), 1);
    assert_eq!(st.guardar(quant_vao_planos(&[])), ENTRADA);
    assert_eq!(st.saida_n(), 0, "falha apaga as saídas");
    assert!(st.erro().contains("contorno"));
    assert_eq!(VERSAO_ABI_QUANT, 1);
}
