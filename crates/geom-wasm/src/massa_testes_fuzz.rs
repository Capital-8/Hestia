//! Aceite da ficha R1 do plano de massa: fuzz de 200 massas válidas com semente fixa (A.8 item 2) e os limites (`LIMITE`, `ENTRADA`).

use crate::cena::Cena;
use crate::consultas::executar;
use crate::esquema::{CONSULTA_MASSA_MALHA, ENTRADA, LIMITE};
use crate::massa_fixture::{analisar, m1, m2, m3, m4, por_na_cena};
use crate::massa_malha::{casca, massa_malha, MalhaMassa};
use crate::massa_tipos::{validar, Arranjo, Massa, Perfil, Secao};
use crate::teste_util::Xorshift;
use std::f64::consts::{PI, TAU};

fn inteiro(r: &mut Xorshift, min: u32, max: u32) -> u32 {
    (r.intervalo(min as f64, max as f64 + 1.0) as u32).min(max)
}

/// Perfil válido ao acaso. O livre é estrelado em volta de um centro (ângulos crescentes, vãos menores que π) e, uma vez em quatro, deslocado para a
/// origem local ficar fora dele (exercita o início sem cruzamento com +x).
fn perfil(r: &mut Xorshift) -> Perfil {
    match inteiro(r, 0, 3) {
        0 => Perfil::Circulo { raio: r.intervalo(0.5, 6.0) },
        1 => Perfil::Elipse { rx: r.intervalo(0.5, 6.0), ry: r.intervalo(0.5, 6.0) },
        2 => Perfil::Poligono { lados: inteiro(r, 3, 12), raio: r.intervalo(0.5, 6.0) },
        _ => {
            let n = inteiro(r, 4, 14);
            let desloca = if inteiro(r, 0, 3) == 0 { [r.intervalo(-9.0, 9.0), r.intervalo(-9.0, 9.0)] } else { [0.0, 0.0] };
            let pontos = (0..n)
                .map(|i| {
                    let (a, raio) = (TAU * (i as f64 + r.intervalo(0.0, 0.5)) / n as f64, r.intervalo(1.0, 4.0));
                    [desloca[0] + raio * a.cos(), desloca[1] + raio * a.sin()]
                })
                .collect();
            Perfil::Livre { pontos }
        }
    }
}

/// Massa válida ao acaso (2 a 6 seções, qualquer forma, torção de até 0,9·π por trecho, com ou sem arranjo).
fn massa_ao_acaso(r: &mut Xorshift, num: u32) -> Massa {
    let n = inteiro(r, 2, 6);
    let mesmo_perfil = inteiro(r, 0, 2) == 0;
    let base = perfil(r);
    let (mut z, mut rot) = (0.0, r.intervalo(-PI, PI));
    let mut secoes = Vec::new();
    for i in 0..n {
        if i > 0 {
            z += r.intervalo(0.5, 8.0);
            rot += r.intervalo(-0.9 * PI, 0.9 * PI);
        }
        let p = if mesmo_perfil { base.clone() } else { perfil(r) };
        secoes.push(Secao { z, perfil: p, rot, escala: r.intervalo(0.3, 2.5), dx: r.intervalo(-3.0, 3.0), dy: r.intervalo(-3.0, 3.0) });
    }
    let arranjo = if inteiro(r, 0, 2) == 0 { Some(Arranjo { n: inteiro(r, 2, 6), cx: r.intervalo(-20.0, 20.0), cy: r.intervalo(-20.0, 20.0), ang: r.intervalo(-TAU, TAU) }) } else { None };
    Massa { num, nivel: 0, ox: r.intervalo(-50.0, 50.0), oy: r.intervalo(-50.0, 50.0), z_base: r.intervalo(-10.0, 10.0), suave: inteiro(r, 0, 1) == 1, resolucao: inteiro(r, 16, 128), arranjo, secoes }
}

/// Os bytes exatos da saída (para comparar duas execuções bit a bit).
fn bits(m: &MalhaMassa) -> (Vec<[u32; 5]>, Vec<u64>, Vec<u32>) {
    (m.grupos.clone(), m.vertices.iter().flat_map(|p| p.iter().map(|v| v.to_bits())).collect(), m.indices.clone())
}

#[test]
fn fuzz_200() {
    let mut r = Xorshift::novo(20_261_113);
    let massas: Vec<Massa> = (0..200).map(|i| massa_ao_acaso(&mut r, i + 1)).collect();
    let (mut com_livre, mut com_arranjo, mut suaves) = (0, 0, 0);
    for (i, m) in massas.iter().enumerate() {
        assert_eq!(validar(m), Ok(()), "massa {i} do gerador é inválida");
        com_livre += usize::from(m.secoes.iter().any(|s| matches!(s.perfil, Perfil::Livre { .. })));
        com_arranjo += usize::from(m.arranjo.is_some());
        suaves += usize::from(m.suave);
        let lod = (i % 3) as u32;
        let a = massa_malha(std::slice::from_ref(m), lod).unwrap_or_else(|e| panic!("massa {i} lod {lod}: erro {e}"));
        let b = massa_malha(std::slice::from_ref(m), lod).expect("segunda execução");
        assert_eq!(bits(&a), bits(&b), "massa {i}: duas execuções diferem");
        let an = analisar(&a);
        assert!(an.fechada, "massa {i} lod {lod}: malha aberta");
        assert!(an.finita && an.volume.is_finite(), "massa {i} lod {lod}: saída não finita");
        assert!(an.volume > 0.0, "massa {i} lod {lod}: volume {}", an.volume);
        assert_eq!(a.grupos.len(), 3 * m.copias() as usize);
        // Todos os anéis têm o mesmo número de pontos e a casca tem um anel por seção, no mínimo.
        let c = casca(m, lod).expect("casca");
        assert!(c.aneis.len() >= m.secoes.len() && c.aneis.iter().all(|x| x.len() == c.aneis[0].len()));
        assert!(c.z.windows(2).all(|w| w[1] > w[0]));
    }
    // O gerador cobre os casos que interessam.
    assert!(com_livre > 40 && com_arranjo > 40 && suaves > 60, "cobertura: {com_livre} livres, {com_arranjo} arranjos, {suaves} suaves");
    // Pela cena e pela consulta 140, todas de uma vez, duas vezes: mesma saída.
    let mut c = Cena::novo();
    por_na_cena(&mut c, &massas);
    let x = executar(&mut c, CONSULTA_MASSA_MALHA, &[0.0, 1.0]).expect("consulta");
    let y = executar(&mut c, CONSULTA_MASSA_MALHA, &[0.0, 1.0]).expect("consulta");
    assert_eq!(x, y);
    assert_eq!(x[2], crate::consultas::Saida::U32(massa_malha(&massas, 1).expect("malha").indices));
}

#[test]
fn limites() {
    // |T| > 512: grade de 128 mais dois perfis livres de 256 pontos com parâmetros diferentes.
    let anel = |fx: f64| Perfil::Livre { pontos: (0..256).map(|i| { let a = TAU * (i as f64 + 0.3 * ((i * 7 % 5) as f64 / 5.0)) / 256.0; [3.0 * fx * a.cos(), 3.0 * a.sin()] }).collect() };
    let mut muitos_t = m1();
    muitos_t.resolucao = 128;
    muitos_t.secoes[0].perfil = anel(1.0);
    muitos_t.secoes[1].perfil = anel(1.0);
    assert!(massa_malha(std::slice::from_ref(&muitos_t), 1).is_ok(), "um perfil de 256 pontos cabe em 512");
    muitos_t.secoes[1].perfil = anel(1.5);
    for lod in 0..3 {
        assert_eq!(massa_malha(std::slice::from_ref(&muitos_t), lod), Err(LIMITE));
    }
    // Mais de 256 anéis num trecho: bulbo suave com um trecho de 200 m (400 divisões de 0,5 m no lod 2; 67 no lod 0).
    let mut alto = m4();
    for (s, z) in alto.secoes.iter_mut().zip([0.0, 200.0, 204.0, 208.0, 211.0]) {
        s.z = z;
    }
    assert_eq!(massa_malha(std::slice::from_ref(&alto), 2), Err(LIMITE));
    assert!(massa_malha(std::slice::from_ref(&alto), 1).is_ok());
    assert_eq!(casca(&alto, 0).map(|c| c.aneis.len()), Ok(1 + 67 + 2 + 2 + 1));
    assert_eq!(casca(&alto, 1).map(|c| c.aneis.len()), Ok(1 + 200 + 4 + 4 + 3));
    // Mais de 2048 anéis na cópia, sem nenhum trecho passar de 256: 40 seções com 178,2° de torção cada (72 divisões por trecho no lod 2).
    let mut torcida = m3();
    let q = torcida.secoes[0].clone();
    torcida.secoes = (0..40).map(|i| Secao { z: i as f64 * 3.0, rot: i as f64 * 0.99 * PI, ..q.clone() }).collect();
    assert_eq!(massa_malha(std::slice::from_ref(&torcida), 2), Err(LIMITE));
    assert_eq!(casca(&torcida, 1).map(|c| c.aneis.len()), Ok(1 + 39 * 36));
    assert_eq!(casca(&torcida, 0).map(|c| c.aneis.len()), Ok(1 + 39 * 12));
    // No limite exato cabe: 2047 divisões + 1 = 2048 anéis.
    let mut justo = m2();
    justo.suave = true;
    justo.secoes = (0..10).map(|i| Secao { z: i as f64 * 113.5, ..justo.secoes[0].clone() }).collect();
    justo.secoes[9].z = 8.0 * 113.5 + 115.5;
    assert_eq!(casca(&justo, 2).map(|c| c.aneis.len()), Ok(2048));
    justo.secoes[9].z += 0.5;
    assert_eq!(casca(&justo, 2).map(|c| c.aneis.len()), Err(LIMITE));
    // NaN e infinito na entrada: ENTRADA, em qualquer campo.
    let ruins: [fn(&mut Massa); 8] = [
        |m| m.ox = f64::NAN,
        |m| m.z_base = f64::INFINITY,
        |m| m.secoes[1].z = f64::NAN,
        |m| m.secoes[0].rot = f64::NAN,
        |m| m.secoes[1].escala = f64::NAN,
        |m| m.secoes[1].dy = f64::NEG_INFINITY,
        |m| m.secoes[0].perfil = Perfil::Circulo { raio: f64::NAN },
        |m| m.arranjo = Some(Arranjo { n: 3, cx: 0.0, cy: f64::NAN, ang: 1.0 }),
    ];
    for (i, f) in ruins.iter().enumerate() {
        let mut m = m2();
        f(&mut m);
        assert_eq!(massa_malha(&[m], 1), Err(ENTRADA), "caso {i}");
    }
    let mut livre = m1();
    if let Perfil::Livre { pontos } = &mut livre.secoes[1].perfil {
        pontos[2][0] = f64::NAN;
    }
    assert_eq!(massa_malha(&[livre], 1), Err(ENTRADA));
    // Pela consulta: linha com NaN gravada direto na cena e argumento NaN.
    let mut c = Cena::novo();
    por_na_cena(&mut c, &[m2()]);
    assert!(executar(&mut c, CONSULTA_MASSA_MALHA, &[0.0, 1.0]).is_ok());
    assert_eq!(executar(&mut c, CONSULTA_MASSA_MALHA, &[f64::NAN, 1.0]), Err(ENTRADA));
    c.massa.massas.get_mut(&2).expect("massa").arr_cx = f64::NAN;
    c.massa.massas.get_mut(&2).expect("massa").arr_n = 4;
    assert_eq!(executar(&mut c, CONSULTA_MASSA_MALHA, &[0.0, 1.0]), Err(ENTRADA));
}
