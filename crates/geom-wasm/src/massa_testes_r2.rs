//! Aceite da ficha R2 do plano de massa: fatias (A.4 regra 8), planta (regra 10), quantidades (regra 11) e as consultas 141, 142 e 144, com as
//! massas de referência de A.10. Os avisos (regra 12) e o fuzz estendido ficam em `massa_testes_r2_fuzz.rs`.

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{CONSULTA_MASSA_FATIAS, CONSULTA_MASSA_MALHA, CONSULTA_MASSA_PLANTA, CONSULTA_QUANT_MASSA, ENTRADA, NIVEL_TODOS};
use crate::massa_fatia::{area, fatia_em, girar, massa_fatias, niveis_da_cena, perimetro, Fatiador};
use crate::massa_fixture::{analisar, area_do_papel, m1, m2, m3, m4, m5, m5_petala, por_na_cena, todas};
use crate::massa_malha::{casca, massa_malha};
use crate::massa_planta::{massa_planta, ESTILO_ACIMA, ESTILO_CORTADO, ESTILO_PROJETADO};
use crate::massa_quant::{quant_da_massa, quant_massa};
use crate::massa_tipos::{Arranjo, Massa, PAPEL_BASE, PAPEL_LATERAL, PAPEL_TOPO};
use std::f64::consts::TAU;

pub(crate) fn u32s(s: &Saida) -> &[u32] {
    match s {
        Saida::U32(v) => v,
        Saida::F64(_) => panic!("esperava u32"),
    }
}

pub(crate) fn f64s(s: &Saida) -> &[f64] {
    match s {
        Saida::F64(v) => v,
        Saida::U32(_) => panic!("esperava f64"),
    }
}

/// Cena com as massas e os níveis `(nivel_num, cota)` gravados na seção `niveis` (chave `nivel_num + 1`, como o app envia).
pub(crate) fn cena(massas: &[Massa], niveis: &[(u32, f64)]) -> Cena {
    let mut c = Cena::novo();
    por_na_cena(&mut c, massas);
    for &(n, cota) in niveis {
        c.b.niveis.insert(n + 1, (n, cota));
    }
    c
}

/// Níveis de 3 em 3 m, de 0 até `topo` (inclusive).
pub(crate) fn pavimentos(topo: f64) -> Vec<(u32, f64)> {
    (0..=(topo / 3.0).floor() as u32).map(|i| (i, i as f64 * 3.0)).collect()
}

#[test]
fn fatia_independe_de_lod() {
    // A fatia não recebe `lod`: o mesmo resultado antes e depois de pedir a malha em cada `lod`, pela consulta.
    let niveis = [(0, 0.0), (1, 1.2), (2, 7.3), (3, 15.0), (4, 29.9)];
    let mut c = cena(&[m3(), m4()], &niveis);
    let antes = executar(&mut c, CONSULTA_MASSA_FATIAS, &[0.0]).expect("fatias");
    for lod in 0..3 {
        executar(&mut c, CONSULTA_MASSA_MALHA, &[0.0, lod as f64]).expect("malha");
        assert_eq!(executar(&mut c, CONSULTA_MASSA_FATIAS, &[0.0]).expect("fatias"), antes, "lod {lod}");
    }
    // Onde a malha tem um anel naquela cota, ele é a fatia, em qualquer `lod` (M3: z = 15 é anel nos três).
    let fatia = fatia_em(&m3(), 0, 15.0).expect("ok").expect("dentro");
    for lod in 0..3 {
        let cs = casca(&m3(), lod).expect("casca");
        let k = cs.z.iter().position(|z| *z == 15.0).expect("anel em z = 15");
        assert_eq!(cs.aneis[k], fatia, "lod {lod}");
    }
    // Entre dois anéis da malha `lod 0` (z = 0 e z = 5), a fatia em z = 1,2 é o anel exato (área 64), não a interpolação dos anéis da malha
    // (que encolheria o quadrado girado).
    let cs = casca(&m3(), 0).expect("casca");
    assert_eq!((cs.z[0], cs.z[1]), (0.0, 5.0));
    let f = fatia_em(&m3(), 0, 1.2).expect("ok").expect("dentro");
    assert!((area(&f) - 64.0).abs() < 1e-6);
    let da_malha: Vec<[f64; 2]> = cs.aneis[0].iter().zip(&cs.aneis[1]).map(|(a, b)| [a[0] + (b[0] - a[0]) * 0.24, a[1] + (b[1] - a[1]) * 0.24]).collect();
    assert!(area(&da_malha) < 64.0 - 1e-3);
    // Fora da massa não há fatia; as pontas são inclusivas.
    assert_eq!(fatia_em(&m3(), 0, 30.01), Ok(None));
    assert_eq!(fatia_em(&m3(), 0, -0.01), Ok(None));
    assert!(fatia_em(&m3(), 0, 30.0).expect("ok").is_some() && fatia_em(&m3(), 0, 0.0).expect("ok").is_some());
}

#[test]
fn m1_fatia_z3() {
    let f = fatia_em(&m1(), 0, 3.0).expect("ok").expect("dentro");
    assert!((area(&f) - 60.0).abs() < 1e-9, "área {}", area(&f));
    assert!((perimetro(&f) - 32.0).abs() < 1e-9, "perímetro {}", perimetro(&f));
    // Pela consulta 142, com um nível na cota 3 (e outros dois fora da massa, que não geram fatia).
    let mut c = cena(&[m1()], &[(0, -3.0), (1, 3.0), (2, 12.0)]);
    let s = executar(&mut c, CONSULTA_MASSA_FATIAS, &[0.0]).expect("fatias");
    assert_eq!(u32s(&s[0]), &[1, 0, 1, 64]);
    assert_eq!(f64s(&s[1]).len(), 128);
    assert_eq!(&f64s(&s[1])[..2], &[5.0, 0.0]);
    let v = f64s(&s[2]);
    assert!((v[0] - 60.0).abs() < 1e-9 && (v[1] - 32.0).abs() < 1e-9 && v[2] == 3.0);
    // A base deslocada desloca a faixa de cotas: com z_base = 2,5 o nível 12 fica fora (topo 11,5) e o nível na cota do topo entra.
    let alta = Massa { z_base: 2.5, ..m1() };
    let f = massa_fatias(&[alta], &[(0, 0.0), (1, 2.5), (2, 11.5), (3, 12.0)]).expect("fatias");
    assert_eq!(f.iter().map(|x| (x.nivel, x.z)).collect::<Vec<_>>(), vec![(1, 2.5), (2, 11.5)]);
    assert!(f.iter().all(|x| (x.area - 60.0).abs() < 1e-9 && (x.perimetro - 32.0).abs() < 1e-9));
}

#[test]
fn m3_fatias_64() {
    let niveis = pavimentos(30.0);
    assert_eq!(niveis.len(), 11);
    let mut c = cena(&[m3()], &niveis);
    let s = executar(&mut c, CONSULTA_MASSA_FATIAS, &[NIVEL_TODOS as f64]).expect("fatias");
    let (f, v) = (u32s(&s[0]), f64s(&s[2]));
    assert_eq!(f.len(), 11 * 4);
    for (i, (linha, valores)) in f.chunks_exact(4).zip(v.chunks_exact(3)).enumerate() {
        assert_eq!((linha[0], linha[1], linha[2]), (3, 0, i as u32));
        assert!((valores[0] - 64.0).abs() < 1e-6, "nível {i}: área {}", valores[0]);
        assert!((valores[1] - 32.0).abs() < 1e-6, "nível {i}: perímetro {}", valores[1]);
        assert_eq!(valores[2], i as f64 * 3.0);
    }
    assert_eq!(f64s(&s[1]).len(), 2 * f.chunks_exact(4).map(|l| l[3] as usize).sum::<usize>());
    // A fatia gira com a altura: no nível de 15 m o vértice de t = 0 está a 45°.
    let meio = massa_fatias(&[m3()], &[(5, 15.0)]).expect("fatias");
    assert!((meio[0].pontos[0][0] - 4.0).abs() < 1e-9 && (meio[0].pontos[0][1] - 4.0).abs() < 1e-9);
    // Sem a seção `niveis` não há fatia; nível de outro projeto não muda a ordem (sai crescente em nivel_num, não em cota).
    assert!(executar(&mut cena(&[m3()], &[]), CONSULTA_MASSA_FATIAS, &[0.0]).expect("fatias").iter().all(Saida::is_empty));
    let troca = massa_fatias(&[m3()], &niveis_da_cena(&cena(&[m3()], &[(7, 3.0), (2, 9.0)]))).expect("fatias");
    assert_eq!(troca.iter().map(|x| (x.nivel, x.z)).collect::<Vec<_>>(), vec![(2, 9.0), (7, 3.0)]);
}

#[test]
fn m4_raio_em_z8() {
    let f = fatia_em(&m4(), 0, 8.0).expect("ok").expect("dentro");
    assert_eq!(f.len(), 64);
    assert!(f.iter().all(|q| (q[0].hypot(q[1]) - 6.0).abs() < 1e-9));
    // Pela consulta: área do polígono inscrito de 64 pontos e raio 6; nas outras cotas o raio fica entre os das seções vizinhas.
    let mut c = cena(&[m4()], &[(0, 0.0), (1, 2.0), (2, 8.0), (3, 14.0)]);
    let s = executar(&mut c, CONSULTA_MASSA_FATIAS, &[0.0]).expect("fatias");
    let v = f64s(&s[2]);
    assert!((v[6] - 0.5 * 64.0 * 36.0 * (TAU / 64.0).sin()).abs() < 1e-9 && v[8] == 8.0);
    let raio = |i: usize| f64s(&s[1])[i * 128].hypot(f64s(&s[1])[i * 128 + 1]);
    assert!((raio(0) - 3.0).abs() < 1e-9 && raio(1) > 3.0 && raio(1) < 5.0 && (raio(2) - 6.0).abs() < 1e-9 && raio(3) > 1.5 && raio(3) < 4.0);
}

#[test]
fn fatias_por_copia_sao_rotacoes() {
    let niveis = [(0, 0.0), (1, 4.0)];
    let f = massa_fatias(&m5(), &niveis).expect("fatias");
    // Bulbo: 2 fatias; pétala: 12 cópias × 2 níveis, na ordem cópia e nível.
    assert_eq!(f.len(), 2 + 24);
    assert_eq!(f[2..].iter().map(|x| (x.copia, x.nivel)).collect::<Vec<_>>(), (0..12).flat_map(|c| [(c, 0), (c, 1)]).collect::<Vec<_>>());
    for x in &f[2..] {
        let (s, c) = (x.copia as f64 * 30.0_f64.to_radians()).sin_cos();
        let zero = &f[2 + x.nivel as usize];
        for (a, b) in zero.pontos.iter().zip(&x.pontos) {
            assert!((a[0] * c - a[1] * s - b[0]).abs() < 1e-9 && (a[0] * s + a[1] * c - b[1]).abs() < 1e-9);
        }
        assert!((x.area - zero.area).abs() < 1e-9 && (x.perimetro - zero.perimetro).abs() < 1e-9);
    }
    // A cópia 0 é o anel sem girar; massa sem arranjo ignora o índice da cópia.
    let petala = m5_petala();
    let anel = Fatiador::novo(&petala).expect("pilha").anel(4.0).expect("dentro");
    assert_eq!(f[3].pontos, anel);
    assert_eq!(girar(&anel, None, 5), anel);
    let giro = girar(&[[3.0, 0.0]], Some(Arranjo { n: 4, cx: 1.0, cy: 0.0, ang: TAU }), 1);
    assert!((giro[0][0] - 1.0).abs() < 1e-12 && (giro[0][1] - 2.0).abs() < 1e-12);
}

#[test]
fn planta_estilos() {
    // M3 com corte a 1,20 m: um anel cortado, o da base projetado e o do topo acima.
    let l = massa_planta(&[m3()], 1.2, -1.0, 1.2).expect("planta");
    assert_eq!(l.iter().map(|x| (x.massa, x.copia, x.estilo)).collect::<Vec<_>>(), vec![(3, 0, ESTILO_CORTADO), (3, 0, ESTILO_PROJETADO), (3, 0, ESTILO_ACIMA)]);
    assert!(l.iter().all(|x| (area(&x.pontos) - 64.0).abs() < 1e-6));
    assert_eq!(l[0].pontos, fatia_em(&m3(), 0, 1.2).expect("ok").expect("dentro"));
    let torre = m3();
    let pilha = Fatiador::novo(&torre).expect("pilha");
    assert_eq!((&l[1].pontos, &l[2].pontos), (&pilha.anel_da_secao(0), &pilha.anel_da_secao(1)));
    // O cortado está girado 1,2 / 30 de π/2 em relação à base.
    let ang = l[0].pontos[0][1].atan2(l[0].pontos[0][0]);
    assert!((ang - 1.2 / 30.0 * std::f64::consts::FRAC_PI_2).abs() < 1e-12);
    // M4 com corte a 5 m: seções em 0 e 4 abaixo (projetadas), 8, 12 e 15 acima.
    let est = |corte: f64, z_min: f64, z_max: f64| massa_planta(&[m4()], corte, z_min, z_max).expect("planta").iter().map(|x| x.estilo).collect::<Vec<_>>();
    assert_eq!(est(5.0, 0.0, 5.0), vec![0, 1, 1, 2, 2, 2]);
    // A faixa de vista só limita os projetados: com z_min = 2 a seção da cota 0 sai; faixa vazia tira todos os projetados.
    assert_eq!(est(5.0, 2.0, 5.0), vec![0, 1, 2, 2, 2]);
    assert_eq!(est(5.0, 6.0, 2.0), vec![0, 2, 2, 2]);
    // Corte na cota de uma seção: ela é o anel cortado e não se repete. Corte abaixo da massa: tudo acima. Corte acima: só os projetados da faixa.
    assert_eq!(est(8.0, 0.0, 8.0), vec![0, 1, 1, 2, 2]);
    assert_eq!(est(-1.0, -5.0, -1.0), vec![2, 2, 2, 2, 2]);
    assert_eq!(est(20.0, 10.0, 20.0), vec![1, 1]);
    assert_eq!(massa_planta(&[m4()], f64::NAN, 0.0, 1.0), Err(ENTRADA));
    // Pela consulta 141, com arranjo: 12 cópias da pétala, cada uma com os mesmos estilos; anel fechado sem repetir o primeiro ponto.
    let mut c = cena(&m5(), &[]);
    let s = executar(&mut c, CONSULTA_MASSA_PLANTA, &[0.0, 1.2, 0.0, 1.2]).expect("planta");
    let linhas: Vec<&[u32]> = u32s(&s[0]).chunks_exact(4).collect();
    assert_eq!(linhas.iter().filter(|x| x[0] == 5).map(|x| x[2]).collect::<Vec<_>>(), vec![0, 1, 2, 2, 2, 2]);
    let petala: Vec<&&[u32]> = linhas.iter().filter(|x| x[0] == 6).collect();
    assert_eq!(petala.len(), 12 * 5);
    for (i, x) in petala.iter().enumerate() {
        assert_eq!((x[1], x[2]), ((i / 5) as u32, [0, 1, 2, 2, 2][i % 5]));
    }
    let pontos = f64s(&s[1]);
    assert_eq!(pontos.len(), 2 * linhas.iter().map(|x| x[3] as usize).sum::<usize>());
    let primeiro = linhas[0][3] as usize;
    assert_ne!(&pontos[..2], &pontos[2 * (primeiro - 1)..2 * primeiro]);
    assert_eq!(executar(&mut c, CONSULTA_MASSA_PLANTA, &[0.0, f64::INFINITY, 0.0, 1.2]), Err(ENTRADA));
    assert!(executar(&mut c, CONSULTA_MASSA_PLANTA, &[9.0, 1.2, 0.0, 1.2]).expect("planta").iter().all(Saida::is_empty));
}

#[test]
fn quant_bate_com_malha() {
    for (nome, massas) in todas() {
        let mut c = cena(&massas, &[]);
        let s = executar(&mut c, CONSULTA_QUANT_MASSA, &[0.0]).expect("quant");
        let (linhas, v) = (u32s(&s[0]), f64s(&s[1]));
        assert_eq!(linhas, massas.iter().map(|m| m.num).collect::<Vec<_>>());
        assert_eq!(v.len(), 5 * linhas.len());
        for (m, q) in massas.iter().zip(v.chunks_exact(5)) {
            let malha = massa_malha(std::slice::from_ref(m), 2).expect("malha");
            let a = analisar(&malha);
            assert!(a.fechada);
            // O volume é o da malha lod 2 (a consulta soma em relação ao primeiro vértice de cada casca; a conferência, em relação à origem).
            assert!((q[0] - a.volume).abs() <= 1e-9 * a.volume.max(1.0), "{nome}: volume {} e malha {}", q[0], a.volume);
            for (k, papel) in [PAPEL_LATERAL, PAPEL_BASE, PAPEL_TOPO].into_iter().enumerate() {
                let area = area_do_papel(&malha, papel);
                assert!((q[1 + k] - area).abs() <= 1e-9 * area.max(1.0), "{nome}: área do papel {papel}");
            }
            assert_eq!(q[4], m.secoes[m.secoes.len() - 1].z);
        }
    }
    // Valores de referência: M1 (540; lateral 32 × 9; tampas 60; altura 9) e M3 (1920 ± 0,5%, tampas 64, altura 30).
    let q = quant_da_massa(&m1()).expect("quant");
    assert!((q.volume - 540.0).abs() < 1e-9 && (q.area_lateral - 288.0).abs() < 1e-9 && (q.area_base - 60.0).abs() < 1e-9 && (q.area_topo - 60.0).abs() < 1e-9);
    assert_eq!(q.altura, 9.0);
    let q = quant_da_massa(&m3()).expect("quant");
    assert!((q.volume - 1920.0).abs() <= 1920.0 * 0.005 && (q.area_base - 64.0).abs() < 1e-6 && (q.area_topo - 64.0).abs() < 1e-6 && q.altura == 30.0);
    // Somado sobre as cópias: a pétala em arranjo de 12 vale 12 vezes a pétala sozinha.
    let (doze, uma) = (quant_da_massa(&m5_petala()).expect("quant"), quant_da_massa(&Massa { arranjo: None, ..m5_petala() }).expect("quant"));
    assert!((doze.volume - 12.0 * uma.volume).abs() < 1e-6 && (doze.area_lateral - 12.0 * uma.area_lateral).abs() < 1e-6 && (doze.area_base - 12.0 * uma.area_base).abs() < 1e-6);
    // Longe da origem do mundo e com a base deslocada, o volume é o mesmo (a referência da soma é local).
    let longe = quant_da_massa(&Massa { ox: 4.0e5, oy: -7.0e5, z_base: 850.0, ..m1() }).expect("quant");
    assert!((longe.volume - 540.0).abs() < 1e-6, "volume longe da origem: {}", longe.volume);
    assert_eq!(quant_massa(&[m2(), m1()]).expect("quant").iter().map(|x| x.massa).collect::<Vec<_>>(), vec![2, 1]);
    // Massa inválida é ENTRADA também aqui.
    assert_eq!(quant_da_massa(&Massa { resolucao: 8, ..m1() }), Err(ENTRADA));
}
