//! Testes por invariantes de `furo_contorno_quant`: contorno real, camadas furadas, retorno e paridade com o
//! caminho retangular atual (`a3::furos_de` + `perfil_quant::volume_faixa`, o que `quantidades_paredes` usa).

use crate::furo_contorno::*;
use crate::furo_contorno_quant::*;
use crate::a3::furos_de;
use crate::perfil_quant::volume_faixa;
use crate::MultiPoligono;
use manifold_rust::linalg::Vec3;
use manifold_rust::manifold::Manifold;
use manifold_rust::types::OpType;
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

/// Retângulo w x h anti-horário, origem no meio da base.
fn retangulo(w: f64, h: f64) -> Vec<[f64; 2]> {
    vec![[w / 2.0, 0.0], [w / 2.0, h], [-w / 2.0, h], [-w / 2.0, 0.0]]
}

fn quase(a: f64, b: f64, tol: f64, rotulo: &str) {
    assert!((a - b).abs() <= tol, "{rotulo}: obtido {a}, esperado {b} (tol {tol})");
}

fn dentro(p: [f64; 2], poli: &[[f64; 2]]) -> bool {
    let mut d = false;
    let n = poli.len();
    for i in 0..n {
        let (a, b) = (poli[i], poli[(i + 1) % n]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] {
            d = !d;
        }
    }
    d
}

fn dist_a_borda(p: [f64; 2], poli: &[[f64; 2]]) -> f64 {
    let n = poli.len();
    (0..n)
        .map(|i| {
            let (a, b) = (poli[i], poli[(i + 1) % n]);
            let (vx, vy) = (b[0] - a[0], b[1] - a[1]);
            let t = (((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)).clamp(0.0, 1.0);
            ((a[0] + t * vx - p[0]).powi(2) + (a[1] + t * vy - p[1]).powi(2)).sqrt()
        })
        .fold(f64::MAX, f64::min)
}

/// Malha fechada e volume por divergência igual ao do kernel.
fn checar_retorno_fechado(r: &Retorno) {
    use std::collections::HashMap;
    let mut arestas: HashMap<(u32, u32), u32> = HashMap::new();
    for t in r.indices.chunks(3) {
        for k in 0..3 {
            *arestas.entry((t[k], t[(k + 1) % 3])).or_default() += 1;
        }
    }
    for (&(a, b), &n) in &arestas {
        assert_eq!(n, 1);
        assert_eq!(arestas.get(&(b, a)), Some(&1), "malha do retorno aberta");
    }
    let p = |i: u32| &r.vertices[i as usize * 3..i as usize * 3 + 3];
    let mut v6 = 0.0;
    for t in r.indices.chunks(3) {
        let (a, b, d) = (p(t[0]), p(t[1]), p(t[2]));
        v6 += a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    }
    quase(v6 / 6.0, r.volume, 1e-9, "volume da malha do retorno");
}

// 1. Contorno real -------------------------------------------------------------------------------------------

#[test]
fn furo_contorno_quant_retangulo_area_e_perimetro() {
    let q = quant_vao(&retangulo(0.9, 2.1)).unwrap();
    quase(q.area, 1.89, 1e-12, "área");
    quase(q.perimetro, 6.0, 1e-12, "perímetro");
    quase(q.largura, 0.9, 1e-12, "largura");
    quase(q.altura, 2.1, 1e-12, "altura");
    quase(q.area, q.area_envelope, 1e-12, "retângulo: área real = W x H");
}

#[test]
fn furo_contorno_quant_meia_lua_area_menor_que_o_retangulo() {
    let (w, h) = (0.9, 1.4);
    let q = quant_vao(&meia_lua(w, h, 96)).unwrap();
    let r = w / 2.0;
    let area_exata = w * (h - r) + PI * r * r / 2.0;
    let per_exato = w + 2.0 * (h - r) + PI * r;
    assert!((q.area - area_exata).abs() / area_exata < 1e-3);
    assert!((q.perimetro - per_exato).abs() / per_exato < 1e-3);
    assert!(q.area < q.area_envelope - 0.05, "o contorno real é menor que W x H: {} x {}", q.area, q.area_envelope);
    quase(q.largura, w, 1e-9, "largura");
    quase(q.altura, h, 1e-9, "altura");
}

#[test]
fn furo_contorno_quant_contorno_invalido() {
    assert_eq!(quant_vao(&[[0.0, 0.0], [1.0, 0.0]]).unwrap_err(), ErroQuant::ContornoInvalido);
    let mut h = retangulo(1.0, 1.0);
    h.reverse();
    assert_eq!(quant_vao(&h).unwrap_err(), ErroQuant::ContornoInvalido);
    assert_eq!(quant_vao(&[[0.0, 0.0], [f64::NAN, 0.0], [1.0, 1.0]]).unwrap_err(), ErroQuant::ContornoInvalido);
}

// 2. Parede furada ---------------------------------------------------------------------------------------------

#[test]
fn furo_contorno_quant_camadas_area_liquida_e_volume_removido() {
    let (l, h) = (3.0, 2.8);
    let ring = meia_lua(0.9, 1.4, 48);
    let a = quant_vao(&ring).unwrap().area;
    let res = furar_parede(&[Vao { contorno: ring, x: 1.5, soleira: 0.0 }], &CAMADAS_5, l, h).unwrap();
    let q = quantificar_parede(&res, l, h).unwrap();
    assert_eq!(q.camadas.len(), 5);
    for (c, e) in q.camadas.iter().zip(CAMADAS_5) {
        quase(c.espessura, e, 1e-12, "espessura");
        quase(c.area_face_liquida, l * h - a, 1e-9, "área líquida de face");
        quase(c.area_face_oposta, c.area_face_liquida, 1e-9, "as duas faces têm a mesma área");
        quase(c.area_furo_na_face, a, 1e-9, "furo na face = área do contorno");
        quase(c.volume_removido, a * e, 1e-9, "volume removido = área do contorno x espessura");
        quase(c.volume_liquido, (l * h - a) * e, 1e-9, "volume líquido");
    }
    quase(q.volume_removido, a * 0.16, 1e-9, "total removido");
    quase(q.volume_liquido, (l * h - a) * 0.16, 1e-9, "total líquido");
    quase(q.volume_liquido, res.volume, 1e-9, "contra o kernel");
}

#[test]
fn furo_contorno_quant_janela_com_peitoril_e_dois_vaos() {
    let (l, h) = (4.5, 2.8);
    let a = retangulo(1.2, 1.0);
    let b = meia_lua(0.9, 1.4, 24);
    let area = quant_vao(&a).unwrap().area + quant_vao(&b).unwrap().area;
    let vaos = [Vao { contorno: a, x: 1.0, soleira: 0.9 }, Vao { contorno: b, x: 3.2, soleira: 0.0 }];
    let res = furar_parede(&vaos, &CAMADAS_5, l, h).unwrap();
    let q = quantificar_parede(&res, l, h).unwrap();
    for c in &q.camadas {
        quase(c.area_furo_na_face, area, 1e-9, "dois vãos somados");
    }
}

// 3. Retorno ---------------------------------------------------------------------------------------------------

fn entrada(pedida: f64, acab: f64, y0: f64, y1: f64, modo: ModoRetorno) -> EntradaRetorno {
    EntradaRetorno { espessura_pedida: pedida, espessura_acabamento: acab, y0, y1, modo }
}

#[test]
fn furo_contorno_quant_retorno_espessura_limitada_a_camada_de_acabamento() {
    let vao = Vao { contorno: meia_lua(0.9, 1.4, 48), x: 1.5, soleira: 0.0 };
    let r = retorno_do_vao(&vao, &entrada(0.025, 0.015, 0.0, 0.16, ModoRetorno::Contorno)).unwrap();
    assert!(r.limitada);
    quase(r.espessura, 0.015, 1e-15, "limitada ao acabamento");
    let r2 = retorno_do_vao(&vao, &entrada(0.01, 0.015, 0.0, 0.16, ModoRetorno::Contorno)).unwrap();
    assert!(!r2.limitada);
    quase(r2.espessura, 0.01, 1e-15, "abaixo do teto: vale a pedida");
    // Mais fino, menos volume.
    assert!(r2.volume < r.volume);
}

#[test]
fn furo_contorno_quant_retorno_segue_o_contorno_e_fica_dentro_do_furo() {
    let contorno = meia_lua(0.9, 1.4, 48);
    let vao = Vao { contorno: contorno.clone(), x: 1.5, soleira: 0.0 };
    let d = 0.16;
    let r = retorno_do_vao(&vao, &entrada(0.02, 0.02, 0.0, d, ModoRetorno::Contorno)).unwrap();
    checar_retorno_fechado(&r);
    // volume = área da faixa x profundidade
    quase(r.volume, r.area_anel * d, 1e-9, "volume = área do anel x profundidade");
    // retorno + vão livre = contorno
    let a = quant_vao(&contorno).unwrap();
    quase(r.area_anel + r.area_livre, a.area, 1e-12, "anel + livre = contorno");
    assert!(r.area_livre > 0.0 && r.area_anel > 0.0);
    // a faixa tem a espessura pedida em toda a volta: área ~ perímetro x t (menos os cantos)
    assert!(r.area_anel < a.perimetro * 0.02 && r.area_anel > a.perimetro * 0.02 * 0.9, "anel {} perímetro x t {}", r.area_anel, a.perimetro * 0.02);
    // todo vértice do retorno cai dentro (ou na borda) do contorno do vão, na origem do vão
    for v in r.vertices.chunks(3) {
        let p = [v[0] - 1.5, v[2]];
        assert!(dentro(p, &contorno) || dist_a_borda(p, &contorno) < 1e-6, "vértice fora do furo: {:?}", p);
        assert!(v[1] >= -1e-9 && v[1] <= d + 1e-9);
    }
    // área exposta = perímetro do contorno recuado x profundidade (face voltada ao vão livre)
    assert!(r.area_exposta > 0.0 && r.area_exposta < a.perimetro * d);
}

#[test]
fn furo_contorno_quant_retorno_mais_furo_consistentes() {
    // O retorno ocupa a faixa de y da camada: camada furada + retorno = camada com o vão livre; sem sobreposição.
    let (l, h, e) = (3.0, 2.8, 0.02);
    let contorno = meia_lua(0.9, 1.4, 48);
    let vao = Vao { contorno: contorno.clone(), x: 1.5, soleira: 0.0 };
    let res = furar_parede(&[vao.clone()], &[e], l, h).unwrap();
    let q = quantificar_parede(&res, l, h).unwrap();
    let r = retorno_do_vao(&vao, &entrada(0.015, 0.015, 0.0, e, ModoRetorno::Contorno)).unwrap();
    // O que a camada perde e o retorno devolve: sobra só o vão livre.
    quase(volume_removido_liquido(&q.camadas[0], &r), r.area_livre * e, 1e-9, "removido líquido = área livre x espessura");
    quase(volume_com_retorno(&q.camadas[0], &r), (l * h - r.area_livre) * e, 1e-9, "camada com retorno");
    // Sem sobreposição: interseção entre o retorno e a camada furada tem volume zero.
    let placa = Manifold::cube(Vec3::new(l, e, h), false);
    let cortador = {
        let m: MultiPoligono = vec![vec![contorno.clone()]];
        // cortador com folga em y, como o de `furar_parede`
        crate::furo_contorno_quant::extrudar_regiao(&m, 1.5, 0.0, -0.05, e + 0.05)
    };
    let furada = placa.boolean(&cortador, OpType::Subtract);
    let solido_retorno = crate::furo_contorno_quant::extrudar_regiao(&regiao_de_teste(&r, &contorno), 1.5, 0.0, 0.0, e);
    let inter = furada.boolean(&solido_retorno, OpType::Intersect);
    // Tolerância 1e-7 m3: as booleanas 2D de `ops` quantizam a 1 um (erro de borda ~ perímetro x 0,5 um x e, da ordem de 4e-8).
    assert!(inter.volume().abs() < 1e-7, "retorno sobrepõe a camada: {}", inter.volume());
    // União = camada com o vão livre.
    let uniao = furada.boolean(&solido_retorno, OpType::Add);
    quase(uniao.volume(), (l * h - r.area_livre) * e, 1e-7, "união");
}

/// Reconstrói a região do retorno (contorno menos o contorno recuado) a partir da área, para a interseção do teste.
fn regiao_de_teste(r: &Retorno, contorno: &[[f64; 2]]) -> MultiPoligono {
    let c: MultiPoligono = vec![vec![contorno.to_vec()]];
    let miolo = crate::ops::offset(&c, -r.espessura).unwrap();
    crate::ops::diferenca(&[c, miolo]).unwrap()
}

#[test]
fn furo_contorno_quant_retorno_nao_cabe_e_entradas_invalidas() {
    let vao = Vao { contorno: retangulo(0.9, 2.1), x: 1.5, soleira: 0.0 };
    // 2 t >= largura: não cabe (o teto da camada de acabamento não protege se a camada for grossa).
    assert_eq!(retorno_do_vao(&vao, &entrada(0.5, 0.5, 0.0, 0.16, ModoRetorno::Contorno)).unwrap_err(), ErroQuant::RetornoNaoCabe);
    assert_eq!(retorno_do_vao(&vao, &entrada(0.0, 0.015, 0.0, 0.16, ModoRetorno::Contorno)).unwrap_err(), ErroQuant::EspessuraInvalida);
    assert_eq!(retorno_do_vao(&vao, &entrada(0.02, 0.0, 0.0, 0.16, ModoRetorno::Contorno)).unwrap_err(), ErroQuant::EspessuraInvalida);
    assert_eq!(retorno_do_vao(&vao, &entrada(0.02, 0.02, 0.1, 0.1, ModoRetorno::Contorno)).unwrap_err(), ErroQuant::ProfundidadeInvalida);
    let mut h = vao.clone();
    h.contorno.reverse();
    assert_eq!(retorno_do_vao(&h, &entrada(0.02, 0.02, 0.0, 0.16, ModoRetorno::Contorno)).unwrap_err(), ErroQuant::ContornoInvalido);
}

// 4. Paridade com o caminho retangular atual ----------------------------------------------------------------------

fn rect_multi(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
    vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
}

/// O cálculo atual, remontado com as funções reais: faixas verticais (abaixo do vão, no vão, acima); na faixa do vão
/// a planta da camada perde o retângulo do vão (`furos_de`) e ganha as duas ombreiras do retorno (`poly.extend`);
/// volume = soma de `volume_faixa` (`quantidades_paredes`).
fn volume_atual(l: f64, h: f64, y0: f64, y1: f64, x: f64, soleira: f64, w: f64, hv: f64, ret: Option<(f64, f64, f64)>) -> f64 {
    let planta = rect_multi(0.0, y0, l, y1);
    // O vão fura mais fundo que a parede (como `retangulo_do_vao`).
    let furo = rect_multi(x - w / 2.0, y0 - 0.1, x + w / 2.0, y1 + 0.1);
    let com_furo = furos_de(&planta, &[furo]).unwrap();
    let mut no_vao = com_furo;
    if let Some((t, s0, s1)) = ret {
        no_vao.extend(rect_multi(x - w / 2.0, s0, x - w / 2.0 + t, s1));
        no_vao.extend(rect_multi(x + w / 2.0 - t, s0, x + w / 2.0, s1));
    }
    volume_faixa(&planta, 0.0, soleira, None) + volume_faixa(&no_vao, soleira, soleira + hv, None) + volume_faixa(&planta, soleira + hv, h, None)
}

#[test]
fn furo_contorno_quant_paridade_volume_liquido_vao_retangular() {
    let (l, h) = (4.0, 2.8);
    let casos = [(1.5, 0.0, 0.9, 2.1), (2.0, 0.9, 1.2, 1.2), (3.1, 0.0, 1.6, 2.4)];
    let mut y = 0.0;
    for &e in &CAMADAS_5 {
        let (y0, y1) = (y, y + e);
        y = y1;
        for &(x, s, w, hv) in &casos {
            let vao = Vao { contorno: retangulo(w, hv), x, soleira: s };
            let res = furar_parede(&[vao], &[e], l, h).unwrap();
            let q = quantificar_parede(&res, l, h).unwrap();
            // espessuras empilhadas: a camada é só deslocada em y; o volume não depende disso
            let atual = volume_atual(l, h, y0, y1, x, s, w, hv, None);
            quase(q.camadas[0].volume_liquido, atual, 1e-9, "volume líquido: Rust novo x caminho atual");
            quase(q.camadas[0].volume_removido, w * hv * e, 1e-9, "removido = W x H x e");
        }
    }
}

#[test]
fn furo_contorno_quant_paridade_retorno_ombreiras_vao_retangular() {
    // Camada de acabamento de 15 mm, retorno pedido 25 mm: o teto limita a 15 mm. Profundidade = parede toda (0,16).
    let (l, h, e_acab, prof) = (4.0, 2.8, 0.015, 0.16);
    let (x, s, w, hv) = (1.5, 0.0, 0.9, 2.1);
    let vao = Vao { contorno: retangulo(w, hv), x, soleira: s };
    let r = retorno_do_vao(&vao, &entrada(0.025, e_acab, 0.0, prof, ModoRetorno::Ombreiras)).unwrap();
    quase(r.espessura, 0.015, 1e-15, "teto");
    // Volume do retorno: 2 t D H (o que o caminho atual soma).
    quase(r.volume, 2.0 * 0.015 * prof * hv, 1e-9, "2 t D H");
    // Camada de acabamento (y em [0, 0,015]) mais o retorno (que cobre a profundidade toda) contra o caminho atual.
    let res = furar_parede(&[vao], &[e_acab], l, h).unwrap();
    let q = quantificar_parede(&res, l, h).unwrap();
    let atual_sem = volume_atual(l, h, 0.0, e_acab, x, s, w, hv, None);
    let atual_com = volume_atual(l, h, 0.0, e_acab, x, s, w, hv, Some((0.015, 0.0, prof)));
    quase(q.camadas[0].volume_liquido, atual_sem, 1e-9, "camada sem retorno");
    quase(volume_com_retorno(&q.camadas[0], &r), atual_com, 1e-9, "camada com retorno: novo x atual");
    // área exposta: duas ombreiras, H x D cada
    quase(r.area_exposta, 2.0 * hv * prof, 1e-9, "área exposta das ombreiras");
    checar_retorno_fechado(&r);
}

#[test]
fn furo_contorno_quant_modo_contorno_do_retangulo_soma_ombreiras_verga_e_soleira() {
    // Retângulo: anel = 2 t H + 2 t (W - 2 t) = ombreiras + (verga + soleira).
    let (w, hv, t) = (0.9, 2.1, 0.015);
    let vao = Vao { contorno: retangulo(w, hv), x: 1.5, soleira: 0.0 };
    let c = retorno_do_vao(&vao, &entrada(t, t, 0.0, 0.16, ModoRetorno::Contorno)).unwrap();
    let o = retorno_do_vao(&vao, &entrada(t, t, 0.0, 0.16, ModoRetorno::Ombreiras)).unwrap();
    quase(o.area_anel, 2.0 * t * hv, 1e-9, "ombreiras");
    quase(c.area_anel, o.area_anel + 2.0 * t * (w - 2.0 * t), 1e-9, "anel = ombreiras + verga + soleira");
    // O livre do modo Contorno é o retângulo recuado nos quatro lados.
    quase(c.area_livre, (w - 2.0 * t) * (hv - 2.0 * t), 1e-9, "livre");
    quase(c.area_exposta, 2.0 * ((w - 2.0 * t) + (hv - 2.0 * t)) * 0.16, 1e-9, "exposta = perímetro recuado x profundidade");
}
