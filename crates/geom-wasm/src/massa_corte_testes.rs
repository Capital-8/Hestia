//! Aceite da ficha R3 do plano de massa: corte e elevação (A.4 regra 9, consulta 143 `massa_corte`).

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{CONSULTA_MASSA_CORTE, ENTRADA};
use crate::massa_corte::{achatar, lacos_da_massa, massa_corte, LinhaCorteMassa, ESTILO_FEICAO};
use crate::massa_fixture::{m1, m2, m3, m5, por_na_cena};
use crate::massa_planta::{ESTILO_CORTADO, ESTILO_PROJETADO};
use crate::massa_testes_fuzz::massa_ao_acaso;
use crate::massa_tipos::{area_com_sinal, Arranjo, Massa};
use crate::teste_util::Xorshift;
use std::f64::consts::TAU;

fn corte(m: &[Massa], ox: f64, oy: f64, dx: f64, dy: f64, prof: f64) -> Vec<LinhaCorteMassa> {
    massa_corte(m, ox, oy, dx, dy, prof).expect("corte")
}

fn do_estilo(l: &[LinhaCorteMassa], estilo: u32) -> Vec<&LinhaCorteMassa> {
    l.iter().filter(|x| x.estilo == estilo).collect()
}

fn area(l: &LinhaCorteMassa) -> f64 {
    area_com_sinal(&l.pontos.iter().map(|p| [p.0, p.1]).collect::<Vec<_>>())
}

/// `(s_min, s_max, z_min, z_max)` dos pontos de uma linha.
fn caixa(l: &LinhaCorteMassa) -> (f64, f64, f64, f64) {
    l.pontos.iter().fold((f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY), |a, p| (a.0.min(p.0), a.1.max(p.0), a.2.min(p.1), a.3.max(p.1)))
}

fn bits(l: &[LinhaCorteMassa]) -> Vec<(u32, u32, u32, Vec<(u64, u64)>)> {
    l.iter().map(|x| (x.massa, x.copia, x.estilo, x.pontos.iter().map(|p| (p.0.to_bits(), p.1.to_bits())).collect())).collect()
}

#[test]
fn m1_corte_pelo_meio() {
    // Plano por (0, 0) ao longo de x: corta a caixa 10 × 6 ao meio, retângulo 10 × 9. Passa por vértices da malha (regra do lado positivo).
    let l = corte(&[m1()], 0.0, 0.0, 1.0, 0.0, 50.0);
    let c = do_estilo(&l, ESTILO_CORTADO);
    assert_eq!(c.len(), 1, "um polígono cortado");
    assert_eq!(c[0].pontos.len(), 4);
    let (s0, s1, z0, z1) = caixa(c[0]);
    assert!((s1 - s0 - 10.0).abs() < 1e-9 && z0.abs() < 1e-12 && (z1 - 9.0).abs() < 1e-12);
    assert!((area(c[0]) - 90.0).abs() < 1e-9, "anti-horário e de área exata");
    // Ao longo de y: 6 × 9. A direção (-y) olha para o outro lado, mas o cortado é o mesmo, em s invertido.
    let c = corte(&[m1()], 0.0, 0.0, 0.0, 1.0, 50.0);
    assert!((area(do_estilo(&c, ESTILO_CORTADO)[0]) - 54.0).abs() < 1e-9);
    // Plano fora dos vértices (y = 1,3): ainda 10 × 9. Fora da massa (y = 4): nada cortado.
    let c = corte(&[m1()], 0.0, 1.3, 1.0, 0.0, 50.0);
    assert!((area(do_estilo(&c, ESTILO_CORTADO)[0]) - 90.0).abs() < 1e-9);
    assert!(do_estilo(&corte(&[m1()], 0.0, 4.0, 1.0, 0.0, 50.0), ESTILO_CORTADO).is_empty());
    // A parte projetada é a metade de trás (y >= 0): s de -5 a 5, z de 0 a 9.
    let p = do_estilo(&l, ESTILO_PROJETADO);
    assert_eq!(p.len(), 1);
    let (s0, s1, z0, z1) = caixa(p[0]);
    assert!((s0 + 5.0).abs() < 1e-9 && (s1 - 5.0).abs() < 1e-9 && z0.abs() < 1e-12 && (z1 - 9.0).abs() < 1e-12);
}

#[test]
fn m2_corte_pelo_eixo() {
    // Círculo de raio 5 com 64 pontos (sem quinas): o polígono inscrito tem vértices a cada 5,625°, e o diâmetro entre vértices opostos é 10.
    for (dx, dy) in [(1.0, 0.0), (0.0, 1.0), (1.0, 1.0), (-1.0, 1.0)] {
        let l = corte(&[m2()], 0.0, 0.0, dx, dy, 50.0);
        let c = do_estilo(&l, ESTILO_CORTADO);
        assert_eq!(c.len(), 1);
        let (s0, s1, z0, z1) = caixa(c[0]);
        assert!((s1 - s0 - 10.0).abs() < 1e-9, "largura {} na direção ({dx}, {dy})", s1 - s0);
        assert!(z0.abs() < 1e-12 && (z1 - 12.0).abs() < 1e-12);
        assert!(area(c[0]) > 0.0);
    }
    // O mesmo com a largura medida na malha do polígono inscrito: o corte nunca passa de 10.
    let c = corte(&[m2()], 0.7, -0.4, 0.3, 1.0, 50.0);
    let (s0, s1, _, _) = caixa(do_estilo(&c, ESTILO_CORTADO)[0]);
    assert!(s1 - s0 <= 10.0 + 1e-9 && s1 - s0 > 9.5);
}

#[test]
fn lacos_fechados_fuzz() {
    let mut r = Xorshift::novo(20_261_114);
    let (mut total, mut feicoes, mut projetados) = (0, 0, 0);
    for i in 0..200u32 {
        let m = massa_ao_acaso(&mut r, i + 1);
        for _ in 0..4 {
            let (a, d) = (r.intervalo(0.0, TAU), r.intervalo(2.0, 12.0));
            let (ox, oy) = (m.ox + r.intervalo(-3.0, 3.0), m.oy + r.intervalo(-3.0, 3.0));
            let (dx, dy) = (a.cos(), a.sin());
            for (copia, l) in lacos_da_massa(&m, ox, oy, dx, dy).unwrap_or_else(|e| panic!("massa {i}: erro {e}")) {
                assert!(l.fechado, "massa {i} cópia {copia}: laço aberto");
                assert!(l.valido() && l.area() > 0.0, "massa {i} cópia {copia}: laço degenerado, área {}", l.area());
                total += 1;
            }
            let linhas = corte(std::slice::from_ref(&m), ox, oy, dx, dy, d * 5.0);
            let de_novo = corte(std::slice::from_ref(&m), ox, oy, dx, dy, d * 5.0);
            assert_eq!(bits(&linhas), bits(&de_novo), "massa {i}: duas execuções diferem");
            assert!(linhas.iter().all(|x| x.pontos.iter().all(|p| p.0.is_finite() && p.1.is_finite()) && x.pontos.len() >= 2), "massa {i}: ponto não finito");
            assert!(linhas.iter().all(|x| x.copia < m.copias()));
            feicoes += do_estilo(&linhas, ESTILO_FEICAO).len();
            projetados += do_estilo(&linhas, ESTILO_PROJETADO).len();
        }
    }
    // O gerador não pode ter passado ao largo das massas: o fuzz tem de cortar de verdade.
    assert!(total >= 200, "só {total} laços cortados");
    assert!(feicoes > 0 && projetados > 0);
}

#[test]
fn plano_no_vertice() {
    // Planos exatamente sobre vértices e arestas da caixa (10 × 6, vértices de anel a cada 0,5 m do perímetro): diagonal pelos cantos, pela
    // face y = 3 e y = -3 (esta olhando para -x), por x = -5, por um vértice do meio de uma aresta a 45°.
    let planos = [
        (5.0, 3.0, 10.0, 6.0),
        (-5.0, 3.0, 10.0, -6.0),
        (0.0, 3.0, 1.0, 0.0),
        (0.0, -3.0, -1.0, 0.0),
        (-5.0, 0.0, 0.0, 1.0),
        (0.0, 3.0, 1.0, 1.0),
        (0.0, 0.0, 1.0, 0.0),
    ];
    for (ox, oy, dx, dy) in planos {
        let ls = lacos_da_massa(&m1(), ox, oy, dx, dy).expect("laços");
        assert_eq!(ls.len(), 1, "plano ({ox}, {oy}) ({dx}, {dy})");
        assert!(ls[0].1.fechado && ls[0].1.valido(), "plano ({ox}, {oy}) ({dx}, {dy}): laço aberto ou degenerado");
        let l = corte(&[m1()], ox, oy, dx, dy, 50.0);
        let c = do_estilo(&l, ESTILO_CORTADO);
        assert_eq!(c.len(), 1);
        // O comprimento da corda vezes 9 m de altura.
        assert!(area(c[0]) > 0.0);
    }
    // Diagonal pelos cantos: corda de √136, área √136 · 9.
    let c = corte(&[m1()], 5.0, 3.0, 10.0, 6.0, 50.0);
    assert!((area(do_estilo(&c, ESTILO_CORTADO)[0]) - 136.0_f64.sqrt() * 9.0).abs() < 1e-9);
    // A face da frente (y = 3) cortada de dentro: o contorno da própria face, 10 × 9.
    let c = corte(&[m1()], 0.0, 3.0, 1.0, 0.0, 50.0);
    assert!((area(do_estilo(&c, ESTILO_CORTADO)[0]) - 90.0).abs() < 1e-9);
    // Todos os vértices do anel da base, em várias direções que entram na caixa: sempre um laço fechado.
    let anel = crate::massa_pilha::Pilha::nova(&m1()).expect("pilha").anel(0, 0.0);
    assert_eq!(anel.len(), 64);
    for q in &anel {
        for k in 0..8 {
            // Direção para dentro da caixa (até 20° do centro): plano que só encosta no canto não corta e fica de fora.
            let a = (-q[1]).atan2(-q[0]) + (k as f64 - 3.5) * 0.1;
            let ls = lacos_da_massa(&m1(), q[0], q[1], a.cos(), a.sin()).expect("laços");
            assert!(!ls.is_empty() && ls.iter().all(|(_, l)| l.fechado && l.valido()), "vértice {q:?} direção {a}");
        }
    }
    // Plano que só encosta na face por fora (x = 5 olhando para -x): nada no lado negativo, nenhum laço.
    assert!(lacos_da_massa(&m1(), 5.0, 0.0, 0.0, 1.0).expect("laços").is_empty());
}

#[test]
fn elevacao_m1() {
    // Plano em y = -20 ao longo de x, olhando para +y, profundidade grande: nada cortado; o contorno projetado é a fachada 10 × 9.
    let l = corte(&[m1()], 0.0, -20.0, 1.0, 0.0, 100.0);
    assert!(do_estilo(&l, ESTILO_CORTADO).is_empty());
    let p = do_estilo(&l, ESTILO_PROJETADO);
    assert_eq!(p.len(), 1);
    assert_eq!(p[0].pontos.len(), 4);
    let (s0, s1, z0, z1) = caixa(p[0]);
    assert!((s0 + 5.0).abs() < 1e-9 && (s1 - 5.0).abs() < 1e-9 && z0.abs() < 1e-12 && (z1 - 9.0).abs() < 1e-12);
    assert!((area(p[0]) - 90.0).abs() < 1e-9);
    // Profundidade que só alcança a face da frente (t = 17) ainda dá a fachada; a que não alcança nada, não dá nada.
    assert_eq!(do_estilo(&corte(&[m1()], 0.0, -20.0, 1.0, 0.0, 18.0), ESTILO_PROJETADO).len(), 1);
    assert!(corte(&[m1()], 0.0, -20.0, 1.0, 0.0, 5.0).is_empty());
    // De costas (a massa fica no lado não visível): nada.
    assert!(corte(&[m1()], 0.0, -20.0, -1.0, 0.0, 100.0).is_empty());
    // Elevação lateral (olhando para +x: plano em x = -20 com direção -y, cuja normal esquerda é +x): fachada de 6 × 9.
    let p = corte(&[m1()], -20.0, 0.0, 0.0, -1.0, 100.0);
    let (s0, s1, _, _) = caixa(do_estilo(&p, ESTILO_PROJETADO)[0]);
    assert!((s0 + 3.0).abs() < 1e-9 && (s1 - 3.0).abs() < 1e-9);
}

#[test]
fn feicoes_m3() {
    // Torre torcida vista de y = -20 (olhando para +y): duas linhas horizontais (as seções z = 0 e z = 30) e as curvas das quinas voltadas ao
    // observador. Os cantos giram de 0 a 90°; ficam de frente (seno negativo) o que começa em 180° e o que começa em 270°.
    let de_frente = corte(&[m3()], 0.0, -20.0, 1.0, 0.0, 100.0);
    let f = do_estilo(&de_frente, ESTILO_FEICAO);
    let horizontais: Vec<_> = f.iter().filter(|l| l.pontos.len() == 2 && l.pontos[0].1 == l.pontos[1].1).collect();
    assert_eq!(horizontais.len(), 2);
    assert!(horizontais.iter().any(|l| l.pontos[0].1.abs() < 1e-12) && horizontais.iter().any(|l| (l.pontos[0].1 - 30.0).abs() < 1e-12));
    let curvas: Vec<_> = f.iter().filter(|l| l.pontos.len() > 2).collect();
    assert_eq!(curvas.len(), 2, "duas quinas de frente");
    assert!(curvas.iter().all(|l| l.pontos.windows(2).all(|w| w[1].1 > w[0].1)), "as curvas sobem");
    assert!(curvas.iter().any(|l| (l.pontos[l.pontos.len() - 1].1 - 30.0).abs() < 1e-12));
    // De costas (y = +20 olhando para -y) aparecem as outras duas: cada quina é vista de um lado só.
    let de_costas = corte(&[m3()], 0.0, 20.0, -1.0, 0.0, 100.0);
    let c2 = do_estilo(&de_costas, ESTILO_FEICAO).iter().filter(|l| l.pontos.len() > 2).count();
    assert_eq!(c2, 2);
    // Sem o projetado e o cortado ausentes aqui: a elevação tem o contorno projetado e nenhum cortado.
    assert!(do_estilo(&de_frente, ESTILO_CORTADO).is_empty() && do_estilo(&de_frente, ESTILO_PROJETADO).len() == 1);
    // O cilindro (círculo, sem quinas) só tem as horizontais.
    let c = corte(&[m2()], 0.0, -20.0, 1.0, 0.0, 100.0);
    assert!(do_estilo(&c, ESTILO_FEICAO).iter().all(|l| l.pontos.len() == 2) && do_estilo(&c, ESTILO_FEICAO).len() == 2);
    // A caixa vista de frente: 2 horizontais e as quinas voltadas ao observador (as duas da frente, y = -3, verticais).
    let b = corte(&[m1()], 0.0, -20.0, 1.0, 0.0, 100.0);
    let quinas: Vec<_> = do_estilo(&b, ESTILO_FEICAO).into_iter().filter(|l| l.pontos.len() > 2 || l.pontos[0].1 != l.pontos[1].1).collect();
    assert!(quinas.iter().all(|l| l.pontos.iter().all(|p| p.0 == l.pontos[0].0)), "quina de prisma é vertical");
}

#[test]
fn uma_serie_de_linhas_por_copia() {
    // M5 (bulbo + 12 pétalas): linhas por cópia, na ordem massa, cópia.
    let massas = m5();
    let l = corte(&massas, 0.0, -40.0, 1.0, 0.0, 200.0);
    let copias: Vec<u32> = l.iter().filter(|x| x.massa == 6).map(|x| x.copia).collect();
    assert!((0..12).all(|c| copias.contains(&c)), "toda cópia tem linhas");
    assert!(copias.windows(2).all(|w| w[0] <= w[1]), "ordem por cópia");
    assert!(l.windows(2).all(|w| (w[0].massa, w[0].copia) <= (w[1].massa, w[1].copia)));
    let m = Massa { arranjo: Some(Arranjo { n: 4, cx: 0.0, cy: 0.0, ang: TAU }), ..m1() };
    let l = corte(std::slice::from_ref(&m), 0.0, 0.0, 1.0, 0.0, 50.0);
    // Cópias 0 e 2 (giro de 180°) cortam o mesmo plano pelo meio; 1 e 3 (90° e 270°) cortam a caixa girada, 6 × 9 de largura.
    let areas: Vec<f64> = l.iter().filter(|x| x.estilo == ESTILO_CORTADO).map(|x| area(x).abs()).collect();
    assert_eq!(areas.len(), 4);
    assert!((areas[0] - 90.0).abs() < 1e-6 && (areas[2] - 90.0).abs() < 1e-6 && (areas[1] - 54.0).abs() < 1e-6 && (areas[3] - 54.0).abs() < 1e-6, "{areas:?}");
}

#[test]
fn entradas_invalidas_e_vazias() {
    for v in [f64::NAN, f64::INFINITY] {
        assert_eq!(massa_corte(&[m1()], v, 0.0, 1.0, 0.0, 1.0), Err(ENTRADA));
        assert_eq!(massa_corte(&[m1()], 0.0, 0.0, 1.0, v, 1.0), Err(ENTRADA));
        assert_eq!(massa_corte(&[m1()], 0.0, 0.0, 1.0, 0.0, v), Err(ENTRADA));
    }
    // Direção nula e profundidade negativa: nada, sem erro (como o guarda_corte).
    assert_eq!(massa_corte(&[m1()], 0.0, 0.0, 0.0, 0.0, 1.0), Ok(Vec::new()));
    assert_eq!(massa_corte(&[m1()], 0.0, 0.0, 1.0, 0.0, -1.0), Ok(Vec::new()));
    // Massa inválida: ENTRADA.
    let mut ruim = m1();
    ruim.resolucao = 8;
    assert_eq!(massa_corte(&[ruim], 0.0, 0.0, 1.0, 0.0, 1.0), Err(ENTRADA));
    assert_eq!(massa_corte(&[], 0.0, 0.0, 1.0, 0.0, 1.0), Ok(Vec::new()));
}

#[test]
fn consulta_143_pela_cena() {
    let mut c = Cena::novo();
    por_na_cena(&mut c, &[m1(), m3()]);
    let s = executar(&mut c, CONSULTA_MASSA_CORTE, &[0.0, 0.0, -20.0, 1.0, 0.0, 100.0]).expect("143");
    let (Saida::U32(linhas), Saida::F64(pontos)) = (&s[0], &s[1]) else { panic!("tipos das saídas") };
    assert_eq!(linhas.len() % 4, 0);
    let n: u32 = linhas.chunks_exact(4).map(|l| l[3]).sum();
    assert_eq!(pontos.len(), 2 * n as usize);
    assert!(pontos.iter().all(|v| v.is_finite()));
    // M1: o contorno projetado fecha (primeiro ponto repetido, 4 + 1); as feições não repetem.
    let m1_proj = linhas.chunks_exact(4).find(|l| l[0] == 1 && l[2] == ESTILO_PROJETADO).expect("projetado da M1");
    assert_eq!(m1_proj[3], 5);
    let ini: usize = linhas.chunks_exact(4).take_while(|l| !(l[0] == 1 && l[2] == ESTILO_PROJETADO)).map(|l| 2 * l[3] as usize).sum();
    assert_eq!(pontos[ini..ini + 2], pontos[ini + 8..ini + 10]);
    // Determinismo: os mesmos bytes.
    let t = executar(&mut c, CONSULTA_MASSA_CORTE, &[0.0, 0.0, -20.0, 1.0, 0.0, 100.0]).expect("143");
    assert_eq!(s, t);
    // Nível sem massa: vazio.
    let v = executar(&mut c, CONSULTA_MASSA_CORTE, &[7.0, 0.0, -20.0, 1.0, 0.0, 100.0]).expect("143");
    assert!(v.iter().all(|x| x.len() == 0));
    // Achatar: laço fechado repete o primeiro ponto, na grade de 1 µm.
    let (l, p) = achatar(&[LinhaCorteMassa { massa: 1, copia: 0, estilo: ESTILO_CORTADO, pontos: vec![(0.0, 0.0), (1.0000004, 0.0), (1.0, 1.0)] }]);
    assert_eq!(l, vec![1, 0, 0, 4]);
    assert_eq!(p, vec![0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0]);
}

#[test]
fn tempo_da_flor_cabe_no_limite() {
    // M5 (12 pétalas): o corte pelo meio da flor. Folga larga para máquina lenta e build de depuração; a medida em release vai no relatório.
    let massas = m5();
    let t = std::time::Instant::now();
    let l = corte(&massas, 0.0, 0.0, 1.0, 0.3, 200.0);
    assert!(!l.is_empty());
    assert!(t.elapsed().as_millis() < 5_000, "corte da flor em {:?}", t.elapsed());
}
