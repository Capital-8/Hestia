//! Fuzz e tempo da ficha R1 do terreno (PLANO do terreno A.8 itens 2 e 5), no que se aplica à superfície existente.

use crate::cena::Cena;
use crate::esquema::ID_AUSENTE;
use crate::terreno_fixture::{cena_com, TerrenoFx};
use crate::terreno_testes::{cotas, malha};
use crate::teste_util::Xorshift;

/// Terreno aleatório: 50 a 500 pontos, 0 a 5 curvas e 0 a 3 quebras (que podem se cruzar e passar umas pelas outras).
fn terreno_aleatorio(r: &mut Xorshift) -> TerrenoFx {
    let inteiro = |r: &mut Xorshift, min: u64, max: u64| min + r.proximo() % (max - min + 1);
    let n = inteiro(r, 50, 500);
    let pontos = (0..n).map(|_| [r.intervalo(0.0, 100.0), r.intervalo(0.0, 100.0), r.intervalo(-5.0, 25.0)]).collect();
    let mut fx = TerrenoFx::novo(1, pontos);
    for _ in 0..inteiro(r, 0, 5) {
        let xy = (0..inteiro(r, 2, 8)).map(|_| [r.intervalo(0.0, 100.0), r.intervalo(0.0, 100.0)]).collect();
        fx.curvas.push((r.intervalo(-5.0, 25.0), xy, r.proximo().is_multiple_of(2)));
    }
    for _ in 0..inteiro(r, 0, 3) {
        fx.quebras.push((0..inteiro(r, 2, 6)).map(|_| [r.intervalo(0.0, 100.0), r.intervalo(0.0, 100.0), r.intervalo(-5.0, 25.0)]).collect());
    }
    fx
}

#[test]
fn fuzz_200_existente() {
    let mut r = Xorshift::novo(20_261_113);
    let (mut com_curva, mut com_quebra, mut triangulos) = (0, 0, 0);
    for caso in 0..200 {
        let fx = terreno_aleatorio(&mut r);
        com_curva += usize::from(!fx.curvas.is_empty());
        com_quebra += usize::from(!fx.quebras.is_empty());
        let sondas: Vec<[f64; 2]> = (0..20).map(|_| [r.intervalo(-10.0, 110.0), r.intervalo(-10.0, 110.0)]).collect();
        let rodar = |cena: &mut Cena| (malha(cena, 0, 0), cotas(cena, &sondas, 0));
        let (a, ca) = rodar(&mut cena_com(std::slice::from_ref(&fx)));
        let (b, cb) = rodar(&mut cena_com(std::slice::from_ref(&fx)));
        assert_eq!((&a.grupos, &a.i), (&b.grupos, &b.i), "caso {caso}: mesma saída em duas execuções");
        assert!(a.v.iter().flatten().zip(b.v.iter().flatten()).all(|(x, y)| x.to_bits() == y.to_bits()), "caso {caso}: mesmos bytes");
        assert_eq!(a.v.len(), b.v.len());
        assert_eq!(ca, cb, "caso {caso}");
        // Finitas; área em planta > 0 e normal para cima; cada aresta interna em exatamente 2 triângulos; saia e base coerentes.
        let n = a.conferir(1, fx.espessura_base);
        assert!(n >= fx.pontos.len() - 2, "caso {caso}");
        triangulos += n;
        assert!(ca.iter().all(|c| c.1.is_finite() && c.2.is_finite() && (c.0 == 1 || *c == (ID_AUSENTE, 0.0, 0.0))), "caso {caso}");
        assert!(ca.iter().any(|c| c.0 == 1), "caso {caso}: alguma sonda cai no terreno");
        // Toda cota fica entre a menor e a maior das fontes.
        assert!(ca.iter().filter(|c| c.0 == 1).all(|c| (-5.0 - 1e-9..=25.0 + 1e-9).contains(&c.1)), "caso {caso}");
    }
    assert!(com_curva > 100 && com_quebra > 100 && triangulos > 50_000, "o gerador cobre curvas e quebras: {com_curva}, {com_quebra}, {triangulos}");
}

/// Tempo da triangulação de 50 000 pontos aleatórios (A.8 item 5: alvo, não bloqueio). Imprime os tempos; rode com `--release -- --nocapture` para medir.
#[test]
fn tempo_50_mil_pontos() {
    let mut r = Xorshift::novo(50_000);
    let pontos = (0..50_000).map(|_| [r.intervalo(0.0, 1000.0), r.intervalo(0.0, 1000.0), r.intervalo(0.0, 50.0)]).collect();
    let mut cena = cena_com(&[TerrenoFx::novo(1, pontos)]);
    let t = std::time::Instant::now();
    let m = malha(&mut cena, 0, 0);
    let primeira = t.elapsed();
    let t = std::time::Instant::now();
    let de_novo = malha(&mut cena, 0, 0);
    let com_cache = t.elapsed();
    let t = std::time::Instant::now();
    let c = cotas(&mut cena, &[[500.0, 500.0]], 0);
    let uma_sonda = t.elapsed();
    println!("terreno de 50 000 pontos: primeira terreno_malha {primeira:?}; com cache {com_cache:?}; terreno_cotas com 1 sonda {uma_sonda:?}");
    assert_eq!(m.i, de_novo.i);
    assert_eq!(c[0].0, 1);
    assert_eq!(cena.cache_terreno.borrow().triangulacoes, 1);
    let n = m.triangulos(1, 0).len();
    assert!((99_000..100_000).contains(&n), "{n} triângulos");
}

/// Casos degenerados de propósito: pontos numa grade inteira (muitos colineares e cocirculares) e linhas entre nós da grade, que se sobrepõem, passam por
/// vértices e se cruzam em vértices. É onde uma restrição mal testada derrubaria a biblioteca.
#[test]
fn fuzz_grade_inteira_com_linhas_sobrepostas() {
    let mut r = Xorshift::novo(77);
    let no = |r: &mut Xorshift| [(r.proximo() % 9) as f64, (r.proximo() % 9) as f64];
    for caso in 0..300 {
        let n = 3 + r.proximo() % 40;
        let pontos = (0..n).map(|_| no(&mut r)).map(|p| [p[0], p[1], p[0] + 2.0 * p[1]]).collect();
        let mut fx = TerrenoFx::novo(1, pontos);
        for _ in 0..r.proximo() % 6 {
            let xy = (0..2 + r.proximo() % 4).map(|_| no(&mut r)).collect();
            fx.curvas.push((r.intervalo(0.0, 30.0), xy, r.proximo().is_multiple_of(2)));
        }
        for _ in 0..r.proximo() % 4 {
            fx.quebras.push((0..2 + r.proximo() % 4).map(|_| (no(&mut r), r.intervalo(0.0, 30.0))).map(|(p, z)| [p[0], p[1], z]).collect());
        }
        let mut cena = cena_com(std::slice::from_ref(&fx));
        let m = malha(&mut cena, 0, 0);
        if !m.grupos.is_empty() {
            m.conferir(1, fx.espessura_base);
        }
        let outra = malha(&mut cena_com(std::slice::from_ref(&fx)), 0, 0);
        assert_eq!((m.grupos, m.v, m.i), (outra.grupos, outra.v, outra.i), "caso {caso}");
    }
}

/// Bordas aleatórias (polígonos estrelados, em geral não convexos, às vezes maiores que o terreno) sobre terrenos aleatórios.
#[test]
fn fuzz_borda() {
    let mut r = Xorshift::novo(4242);
    for caso in 0..80 {
        let mut fx = terreno_aleatorio(&mut r);
        let (cx, cy) = (r.intervalo(30.0, 70.0), r.intervalo(30.0, 70.0));
        let lados = 3 + r.proximo() % 12;
        let borda: Vec<[f64; 2]> = (0..lados)
            .map(|k| {
                let (a, raio) = (std::f64::consts::TAU * k as f64 / lados as f64, r.intervalo(8.0, 75.0));
                [cx + raio * a.cos(), cy + raio * a.sin()]
            })
            .collect();
        let area: f64 = (0..borda.len()).map(|k| (borda[k], borda[(k + 1) % borda.len()])).map(|(a, b)| (a[0] * b[1] - a[1] * b[0]) / 2.0).sum();
        fx.borda = Some(borda);
        let mut cena = cena_com(std::slice::from_ref(&fx));
        let m = malha(&mut cena, 0, 0);
        m.conferir(1, fx.espessura_base);
        assert!((m.area_planta(1) - area).abs() < 1e-6 * area, "caso {caso}: a área em planta é a da borda ({} x {area})", m.area_planta(1));
        let c = cotas(&mut cena, &[[cx, cy]], 0);
        assert_eq!(c[0].0, 1, "caso {caso}: o centro da borda está no terreno");
        let outra = malha(&mut cena_com(std::slice::from_ref(&fx)), 0, 0);
        assert_eq!((m.grupos, m.v, m.i), (outra.grupos, outra.v, outra.i), "caso {caso}");
    }
}
