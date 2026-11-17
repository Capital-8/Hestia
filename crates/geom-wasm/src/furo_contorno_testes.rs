//! Testes por invariantes do spike `furo_contorno` (volume, malha fechada, camadas).

use crate::furo_contorno::*;
use std::collections::HashMap;
use std::f64::consts::PI;

const CAMADAS_5: [f64; 5] = [0.015, 0.02, 0.09, 0.02, 0.015];

/// Meia-lua: ombreira em z = h - w/2 (0 se h = w/2), arco pleno.
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

/// Arco abatido: w x h, flecha f; nascença em h - f.
fn abatido(w: f64, h: f64, f: f64, n: usize) -> Vec<[f64; 2]> {
    let r = (w * w / 4.0 + f * f) / (2.0 * f);
    let zc = h - r;
    let nasc = h - f;
    let a0 = ((nasc - zc) / (w / 2.0)).atan();
    let a1 = PI - a0;
    let mut p = vec![[w / 2.0, 0.0]];
    for i in 0..=n {
        let a = a0 + (a1 - a0) * i as f64 / n as f64;
        p.push([r * a.cos(), zc + r * a.sin()]);
    }
    p.push([-w / 2.0, 0.0]);
    p
}

/// Meia-lua perfeita: área analítica.
fn area_meia_lua(w: f64, h: f64) -> f64 {
    let r = w / 2.0;
    w * (h - r) + PI * r * r / 2.0
}

fn area_abatido(w: f64, h: f64, f: f64) -> f64 {
    let r = (w * w / 4.0 + f * f) / (2.0 * f);
    let theta = 2.0 * (w / 2.0 / r).asin();
    w * (h - f) + r * r * (theta - theta.sin()) / 2.0
}

/// Fechada = toda aresta orientada tem a oposta exatamente uma vez; volume pela malha = volume do kernel.
fn checar_fechada(c: &MalhaCamada) -> usize {
    assert_eq!(c.indices.len() % 3, 0);
    let nv = c.vertices.len() / 3;
    let mut arestas: HashMap<(u32, u32), u32> = HashMap::new();
    for t in c.indices.chunks(3) {
        assert!(t.iter().all(|&i| (i as usize) < nv));
        assert!(t[0] != t[1] && t[1] != t[2] && t[0] != t[2], "triângulo degenerado por índice");
        for k in 0..3 {
            *arestas.entry((t[k], t[(k + 1) % 3])).or_default() += 1;
        }
    }
    for (&(a, b), &n) in &arestas {
        assert_eq!(n, 1, "aresta orientada repetida");
        assert_eq!(arestas.get(&(b, a)), Some(&1), "aresta sem par oposto: malha aberta");
    }
    // Volume pela divergência.
    let p = |i: u32| &c.vertices[i as usize * 3..i as usize * 3 + 3];
    let mut v6 = 0.0;
    for t in c.indices.chunks(3) {
        let (a, b, d) = (p(t[0]), p(t[1]), p(t[2]));
        v6 += a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    }
    assert!((v6 / 6.0 - c.volume).abs() < 1e-9, "volume da malha {} difere do kernel {}", v6 / 6.0, c.volume);
    // Característica de Euler: V - E + F; E = F*3/2. genus = 1 - chi/2 (um componente).
    let chi = nv as i64 - (c.indices.len() as i64 / 2) + (c.indices.len() as i64 / 3);
    (1 - chi / 2) as usize
}

fn checar_pilha(r: &ResultadoFuro, espessuras: &[f64], area: f64, tol_rel: f64) {
    assert_eq!(r.camadas.len(), espessuras.len());
    let mut y = 0.0;
    for (c, &e) in r.camadas.iter().zip(espessuras) {
        assert!((c.y0 - y).abs() < 1e-12 && (c.y1 - (y + e)).abs() < 1e-12);
        y += e;
        let removido = c.volume_sem_furo - c.volume;
        assert!((removido - area * e).abs() <= tol_rel * area * e, "camada {e}: removido {removido} esperado {}", area * e);
        checar_fechada(c);
        // Caixa da malha dentro da camada: o cortador não vaza para fora de y.
        for v in c.vertices.chunks(3) {
            assert!(v[1] >= c.y0 - 1e-9 && v[1] <= c.y1 + 1e-9);
        }
    }
    let total: f64 = espessuras.iter().sum();
    assert!((r.volume_removido - area * total).abs() <= tol_rel * area * total);
}

#[test]
fn furo_contorno_meia_lua_volume_igual_area_vezes_espessura() {
    for n in [24usize, 64] {
        let ring = meia_lua(0.9, 1.4, n);
        let area_poli = area_com_sinal(&ring);
        let r = furar_parede(&[Vao { contorno: ring, x: 1.5, soleira: 0.0 }], &[0.16], 3.0, 2.8).unwrap();
        // Contra a área do polígono: exato (limite de ponto flutuante).
        checar_pilha(&r, &[0.16], area_poli, 1e-9);
        // Contra a curva exata: o polígono inscrito perde área (sagita), erro < 0,1 % com 24 cordas.
        let exato = area_meia_lua(0.9, 1.4) * 0.16;
        assert!((r.volume_removido - exato).abs() / exato < 1e-3, "n={n}: {} x {exato}", r.volume_removido);
    }
}

#[test]
fn furo_contorno_arco_abatido_volume_igual_area_vezes_espessura() {
    let ring = abatido(1.2, 1.5, 0.2, 48);
    let area_poli = area_com_sinal(&ring);
    let r = furar_parede(&[Vao { contorno: ring, x: 2.0, soleira: 0.0 }], &[0.16], 4.0, 2.8).unwrap();
    checar_pilha(&r, &[0.16], area_poli, 1e-9);
    let exato = area_abatido(1.2, 1.5, 0.2) * 0.16;
    assert!((r.volume_removido - exato).abs() / exato < 1e-3);
}

#[test]
fn furo_contorno_parede_de_5_camadas() {
    let ring = meia_lua(0.9, 1.4, 24);
    let area_poli = area_com_sinal(&ring);
    let r = furar_parede(&[Vao { contorno: ring, x: 1.5, soleira: 0.0 }], &CAMADAS_5, 3.0, 2.8).unwrap();
    checar_pilha(&r, &CAMADAS_5, area_poli, 1e-9);
    // Cada camada tem a mesma silhueta: removido proporcional à espessura.
    let k = (r.camadas[2].volume_sem_furo - r.camadas[2].volume) / 0.09;
    for (c, e) in r.camadas.iter().zip(CAMADAS_5) {
        assert!(((c.volume_sem_furo - c.volume) / e - k).abs() < 1e-9);
    }
    // Furo na borda (meia-lua tocando só o piso): cada camada continua sendo um sólido de genus 0.
    for c in &r.camadas {
        assert_eq!(checar_fechada(c), 0);
    }
}

#[test]
fn furo_contorno_janela_fechada_tem_um_furo_passante() {
    // Janela em arco abatido com peitoril 0,9: o contorno fica no meio da parede, cada camada ganha um furo (genus 1).
    let ring = abatido(1.2, 1.2, 0.2, 48);
    let area_poli = area_com_sinal(&ring);
    let r = furar_parede(&[Vao { contorno: ring, x: 1.5, soleira: 0.9 }], &CAMADAS_5, 3.0, 2.8).unwrap();
    checar_pilha(&r, &CAMADAS_5, area_poli, 1e-9);
    for c in &r.camadas {
        assert_eq!(checar_fechada(c), 1);
    }
}

#[test]
fn furo_contorno_dois_vaos_unidos() {
    let a = meia_lua(0.9, 1.4, 24);
    let b = abatido(1.2, 1.5, 0.2, 24);
    let area = area_com_sinal(&a) + area_com_sinal(&b);
    let vaos = [Vao { contorno: a, x: 1.0, soleira: 0.0 }, Vao { contorno: b, x: 3.0, soleira: 0.0 }];
    let r = furar_parede(&vaos, &CAMADAS_5, 4.5, 2.8).unwrap();
    checar_pilha(&r, &CAMADAS_5, area, 1e-9);
}

#[test]
fn furo_contorno_vaos_sobrepostos_nao_contam_duas_vezes() {
    // Dois cortadores iguais no mesmo lugar: a união é idempotente.
    let a = meia_lua(0.9, 1.4, 24);
    let area = area_com_sinal(&a);
    let vaos = [Vao { contorno: a.clone(), x: 1.5, soleira: 0.0 }, Vao { contorno: a, x: 1.5, soleira: 0.0 }];
    let r = furar_parede(&vaos, &CAMADAS_5, 3.0, 2.8).unwrap();
    checar_pilha(&r, &CAMADAS_5, area, 1e-9);
}

#[test]
fn furo_contorno_sem_vao_devolve_a_placa() {
    let r = furar_parede(&[], &CAMADAS_5, 3.0, 2.8).unwrap();
    assert!(r.volume_removido.abs() < 1e-12);
    for c in &r.camadas {
        assert_eq!(c.indices.len(), 36);
    }
}

#[test]
fn furo_contorno_entradas_invalidas() {
    let ok = meia_lua(0.9, 1.4, 24);
    let v = |c: Vec<[f64; 2]>, x: f64| Vao { contorno: c, x, soleira: 0.0 };
    assert_eq!(furar_parede(&[], &[0.1], 0.0, 2.8).unwrap_err(), ErroFuro::ParedeInvalida);
    assert_eq!(furar_parede(&[], &[0.1, 0.0], 3.0, 2.8).unwrap_err(), ErroFuro::EspessuraInvalida(1));
    assert_eq!(furar_parede(&[v(vec![[0.0, 0.0], [1.0, 0.0]], 1.0)], &[0.1], 3.0, 2.8).unwrap_err(), ErroFuro::ContornoInvalido(0));
    let mut horario = ok.clone();
    horario.reverse();
    assert_eq!(furar_parede(&[v(horario, 1.5)], &[0.1], 3.0, 2.8).unwrap_err(), ErroFuro::ContornoInvalido(0));
    assert_eq!(furar_parede(&[v(ok.clone(), 0.2)], &[0.1], 3.0, 2.8).unwrap_err(), ErroFuro::VaoForaDaParede(0));
    assert_eq!(furar_parede(&[v(ok, 1.5)], &[0.1], 3.0, 1.0).unwrap_err(), ErroFuro::VaoForaDaParede(0));
}

/// Vão de teste na parede 3 x 2,8 (origem em x = 1,5, soleira 0,5); o contorno é recusado antes da booleana.
fn furar_um_vao(contorno: Vec<[f64; 2]>) -> Result<ResultadoFuro, ErroFuro> {
    furar_parede(&[Vao { contorno, x: 1.5, soleira: 0.5 }], &[0.1], 3.0, 2.8)
}

#[test]
fn furo_contorno_gravata_borboleta_e_recusada() {
    // Gravata borboleta simétrica: as arestas 0 e 2 se cruzam em (0,5; 0,5) e a área com sinal é zero.
    let simetrica = vec![[0.0, 0.0], [1.0, 1.0], [1.0, 0.0], [0.0, 1.0]];
    assert_eq!(furar_um_vao(simetrica).unwrap_err(), ErroFuro::AutoInterseccao(0));
    // Gravata assimétrica (área positiva): também cruza, então também é recusada.
    let assimetrica = vec![[0.0, 0.0], [1.0, 1.0], [1.0, 0.0], [0.0, 2.0]];
    assert!(area_com_sinal(&assimetrica) > 0.0);
    assert_eq!(furar_um_vao(assimetrica).unwrap_err(), ErroFuro::AutoInterseccao(0));
}

#[test]
fn furo_contorno_pontos_repetidos_consecutivos_sao_recusados() {
    let ok = meia_lua(0.9, 1.4, 24);
    // repetido no meio
    let mut meio = ok.clone();
    meio.insert(5, meio[5]);
    assert_eq!(furar_um_vao(meio).unwrap_err(), ErroFuro::PontoRepetido(0));
    // o último igual ao primeiro (anel aberto, mas fechado de fato)
    let mut fechado = ok.clone();
    fechado.push(ok[0]);
    assert_eq!(furar_um_vao(fechado).unwrap_err(), ErroFuro::PontoRepetido(0));
    // quase repetido (abaixo de 1 nm) também conta
    let mut quase = ok.clone();
    quase.insert(3, [quase[3][0] + 1e-12, quase[3][1]]);
    assert_eq!(furar_um_vao(quase).unwrap_err(), ErroFuro::PontoRepetido(0));
}

#[test]
fn furo_contorno_menos_de_3_pontos_e_recusado() {
    assert_eq!(furar_um_vao(vec![]).unwrap_err(), ErroFuro::ContornoInvalido(0));
    assert_eq!(furar_um_vao(vec![[0.0, 0.0]]).unwrap_err(), ErroFuro::ContornoInvalido(0));
    assert_eq!(furar_um_vao(vec![[0.0, 0.0], [0.5, 0.0]]).unwrap_err(), ErroFuro::ContornoInvalido(0));
}

#[test]
fn furo_contorno_nan_e_inf_sao_recusados() {
    let ok = meia_lua(0.9, 1.4, 24);
    for (nome, p) in [("x NaN", [f64::NAN, 0.5]), ("z inf", [0.5, f64::INFINITY]), ("x -inf", [f64::NEG_INFINITY, 0.5])] {
        let mut c = ok.clone();
        c[4] = p;
        assert_eq!(furar_um_vao(c).unwrap_err(), ErroFuro::ContornoInvalido(0), "caso: {nome}");
    }
    // origem do vão (x ou soleira) não finita
    let v = |x: f64, s: f64| Vao { contorno: ok.clone(), x, soleira: s };
    assert_eq!(furar_parede(&[v(f64::NAN, 0.0)], &[0.1], 3.0, 2.8).unwrap_err(), ErroFuro::ContornoInvalido(0));
    assert_eq!(furar_parede(&[v(1.5, f64::INFINITY)], &[0.1], 3.0, 2.8).unwrap_err(), ErroFuro::ContornoInvalido(0));
}

#[test]
fn furo_contorno_area_zero_e_recusada() {
    // três pontos colineares: área nula, sem cruzamento
    assert_eq!(furar_um_vao(vec![[0.0, 0.0], [0.5, 0.0], [1.0, 0.0]]).unwrap_err(), ErroFuro::ContornoInvalido(0));
    // quadrado de 0,5 µm de lado: área 2,5e-13 m2, abaixo do mínimo de 1e-12 m2 (não cruza: é só pequeno)
    let minusculo = vec![[0.0, 0.0], [5e-7, 0.0], [5e-7, 5e-7], [0.0, 5e-7]];
    assert_eq!(furar_um_vao(minusculo).unwrap_err(), ErroFuro::ContornoInvalido(0));
}

#[test]
fn furo_contorno_espicula_de_ida_e_volta_e_recusada() {
    // a aresta 1 volta sobre a aresta 0 (sobreposição de arestas consecutivas, no vértice (1,0))
    let espicula = vec![[0.0, 0.0], [1.0, 0.0], [0.5, 0.0], [0.5, 1.0]];
    assert_eq!(furar_um_vao(espicula).unwrap_err(), ErroFuro::AutoInterseccao(0));
}

#[test]
fn furo_contorno_vertice_sobre_aresta_nao_consecutiva_e_recusado() {
    // o vértice (1,0) cai sobre a aresta (0,0)-(2,0), que não é vizinha dela: toque entre arestas não consecutivas
    let toque = vec![[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [1.0, 0.0], [0.0, 2.0]];
    assert_eq!(furar_um_vao(toque).unwrap_err(), ErroFuro::AutoInterseccao(0));
}

#[test]
fn furo_contorno_concavo_simples_e_aceito() {
    // L: côncavo, sem cruzamento. Área 0,75 m2. O furo atravessa a parede inteira (genus 1 por camada).
    let l = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 0.5], [0.5, 0.5], [0.5, 1.0], [0.0, 1.0]];
    let area = area_com_sinal(&l);
    assert!((area - 0.75).abs() < 1e-12);
    let r = furar_parede(&[Vao { contorno: l, x: 1.0, soleira: 0.3 }], &CAMADAS_5, 3.0, 2.8).unwrap();
    checar_pilha(&r, &CAMADAS_5, area, 1e-9);
}
