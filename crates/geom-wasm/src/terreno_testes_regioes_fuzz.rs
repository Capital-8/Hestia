//! Testes da ficha R3 do terreno: avisos 3, 4 e 6 (PLANO do terreno A.4 regra 14), fuzz completo (A.8 item 2) e tempos (A.8 item 5) com regiões.

use crate::cena::Cena;
use crate::consultas::executar;
use crate::esquema::{CONSULTA_TERRENO_CORTE_ATERRO, ID_AUSENTE};
use crate::terreno_fixture::{cena_com, t1, t5, t6, RegiaoFx, TerrenoFx};
use crate::terreno_testes::{cotas, malha};
use crate::terreno_testes_curvas::{avisos, curvas, planta, quant};
use crate::terreno_testes_regioes::{area_tri, conferir_proposta, corte_todos, mapa, quant_regioes, regioes_prontas};
use crate::terreno_tipos::{AVISO_PRECISAO_REDUZIDA, AVISO_REGIAO_FORA, AVISO_REGIOES_SOBREPOSTAS};
use crate::teste_util::Xorshift;

/// Códigos dos avisos de um terreno com a região e o índice: `(codigo, regiao, indice)`.
fn codigos(cena: &mut Cena) -> Vec<(u32, u32, u32)> {
    avisos(cena, 0).iter().map(|a| (a.0[1], a.0[2], a.0[3])).collect()
}

fn com_regioes(base: TerrenoFx, regioes: Vec<RegiaoFx>) -> Cena {
    cena_com(&[TerrenoFx { regioes, ..base }])
}

#[test]
fn aviso_regioes_sobrepostas() {
    // Positivo: duas plataformas que se cruzam (5..15 e 10..20).
    let mut cena = com_regioes(t1(1), vec![RegiaoFx::quadrado(1, 1, 5.0, 5.0, 10.0, 8.0), RegiaoFx::quadrado(2, 1, 10.0, 10.0, 9.0, 9.0)]);
    let a = avisos(&mut cena, 0);
    let a3: Vec<_> = a.iter().filter(|x| x.0[1] == AVISO_REGIOES_SOBREPOSTAS).collect();
    assert_eq!(a3.len(), 1, "uma vez por par: {a:?}");
    assert_eq!((a3[0].0[0], a3[0].0[2], a3[0].0[3]), (1, 2, 1), "região de maior ordem e a outra");
    let (x, y) = (a3[0].1[2], a3[0].1[3]);
    assert!((10.0..=15.0).contains(&x) && (10.0..=15.0).contains(&y), "ponto na sobreposição: ({x}, {y})");
    conferir_proposta(&malha(&mut cena, 0, 1), 1);
    // Duas plataformas idênticas também se sobrepõem.
    let mut cena = com_regioes(t1(1), vec![RegiaoFx::quadrado(1, 1, 5.0, 5.0, 10.0, 8.0), RegiaoFx::quadrado(2, 2, 5.0, 5.0, 10.0, 9.0)]);
    assert_eq!(codigos(&mut cena).iter().filter(|c| c.0 == AVISO_REGIOES_SOBREPOSTAS).count(), 1);
    // Negativo: separadas, só se tocando num lado, e plataforma com subdivisão por cima (subdivisão não conta).
    for regioes in [
        vec![RegiaoFx::quadrado(1, 1, 1.0, 1.0, 5.0, 8.0), RegiaoFx::quadrado(2, 1, 10.0, 10.0, 5.0, 9.0)],
        vec![RegiaoFx::quadrado(1, 1, 1.0, 1.0, 5.0, 8.0), RegiaoFx::quadrado(2, 1, 6.0, 1.0, 5.0, 9.0)],
        vec![RegiaoFx::quadrado(1, 1, 5.0, 5.0, 10.0, 8.0), RegiaoFx::quadrado(2, 0, 8.0, 8.0, 4.0, 0.0)],
    ] {
        let mut cena = com_regioes(t1(1), regioes);
        assert!(codigos(&mut cena).iter().all(|c| c.0 != AVISO_REGIOES_SOBREPOSTAS), "{:?}", codigos(&mut cena));
    }
}

#[test]
fn aviso_regiao_fora() {
    // Positivo: plataforma que passa da borda do terreno (15..25 num terreno de 0..20) e subdivisão totalmente fora.
    let mut cena = com_regioes(t1(1), vec![RegiaoFx::quadrado(1, 1, 15.0, 15.0, 10.0, 8.0), RegiaoFx::quadrado(2, 0, 30.0, 30.0, 5.0, 0.0)]);
    let a = avisos(&mut cena, 0);
    let a6: Vec<_> = a.iter().filter(|x| x.0[1] == AVISO_REGIAO_FORA).collect();
    assert_eq!(a6.iter().map(|x| (x.0[0], x.0[2], x.0[3])).collect::<Vec<_>>(), vec![(1, 1, ID_AUSENTE), (1, 2, ID_AUSENTE)], "uma por região, em ordem");
    assert!(a6[0].1[0] > 0.0 && a6[0].1[0] < 1.0, "parcialmente fora: fração {}", a6[0].1[0]);
    assert_eq!(a6[1].1[0], 1.0, "totalmente fora");
    assert!(a6[0].1[2] > 20.0 || a6[0].1[3] > 20.0, "o ponto avisado está fora do terreno");
    // A malha continua válida e as consultas não derrubam nada.
    conferir_proposta(&malha(&mut cena, 0, 1), 1);
    quant(&mut cena, 0);
    quant_regioes(&mut cena, 0);
    // Negativo: regiões dentro (inclusive encostando na borda).
    let mut cena = com_regioes(t1(1), vec![RegiaoFx::quadrado(1, 1, 5.0, 5.0, 10.0, 8.0), RegiaoFx::quadrado(2, 0, 0.0, 0.0, 5.0, 0.0)]);
    assert!(codigos(&mut cena).iter().all(|c| c.0 != AVISO_REGIAO_FORA), "{:?}", codigos(&mut cena));
}

#[test]
fn aviso_precisao_reduzida() {
    // Positivo: terreno de 200 x 200 e nivelada 10 x 10 muito abaixo, com talude 2: Hmax = 40, D = 50, e a grade de passo 0,25 passa de 40 000.
    let cantos: Vec<[f64; 3]> = [[0.0, 0.0], [200.0, 0.0], [200.0, 200.0], [0.0, 200.0]].iter().map(|p| [p[0], p[1], 10.0]).collect();
    let fundo = RegiaoFx { talude_corte: 2.0, ..RegiaoFx::quadrado(1, 2, 95.0, 95.0, 10.0, -30.0) };
    let mut cena = com_regioes(TerrenoFx::novo(1, cantos), vec![fundo]);
    let a = avisos(&mut cena, 0);
    let a4: Vec<_> = a.iter().filter(|x| x.0[1] == AVISO_PRECISAO_REDUZIDA).collect();
    assert_eq!(a4.len(), 1);
    assert_eq!((a4[0].0[0], a4[0].0[2]), (1, 1));
    assert_eq!((a4[0].1[0], a4[0].1[1]), (0.5, 0.25), "passo dobrado uma vez: 0,25 → 0,5");
    let m = malha(&mut cena, 0, 1);
    conferir_proposta(&m, 1);
    assert!(m.v.len() < 2 * (40_000 + 2000), "a grade respeitou o teto: {} vértices", m.v.len());
    let z = cotas(&mut cena, &[[100.0, 100.0], [100.0, 90.0]], 1);
    assert!((z[0].1 + 30.0).abs() < 1e-9, "dentro da região: o plano");
    assert!((z[1].1 - (-30.0 + 5.0 / 2.0)).abs() < 0.2, "no talude de corte 2 a 5 m da borda: {}", z[1].1);
    // Negativo: as fixtures comuns.
    for fx in [t5(1), t6(1)] {
        assert!(codigos(&mut cena_com(&[fx])).iter().all(|c| c.0 != AVISO_PRECISAO_REDUZIDA));
    }
}

/// Terreno aleatório com regiões inteiras dentro de `[5, 95]²`: 50 a 500 pontos, 0 a 5 curvas, 0 a 3 quebras (que podem se cruzar), às vezes borda, e 0 a 3
/// regiões de papéis variados, polígonos estrelados de 3 a 10 lados.
fn terreno_aleatorio(r: &mut Xorshift) -> TerrenoFx {
    let inteiro = |r: &mut Xorshift, min: u64, max: u64| min + r.proximo() % (max - min + 1);
    let n = inteiro(r, 50, 500);
    let pontos = (0..n).map(|_| [r.intervalo(0.0, 100.0), r.intervalo(0.0, 100.0), r.intervalo(-5.0, 25.0)]).collect();
    let mut fx = TerrenoFx::novo(1, pontos);
    fx.intervalo = r.intervalo(0.5, 2.0);
    for _ in 0..inteiro(r, 0, 5) {
        let xy = (0..inteiro(r, 2, 8)).map(|_| [r.intervalo(0.0, 100.0), r.intervalo(0.0, 100.0)]).collect();
        fx.curvas.push((r.intervalo(-5.0, 25.0), xy, r.proximo().is_multiple_of(2)));
    }
    for _ in 0..inteiro(r, 0, 3) {
        fx.quebras.push((0..inteiro(r, 2, 6)).map(|_| [r.intervalo(0.0, 100.0), r.intervalo(0.0, 100.0), r.intervalo(-5.0, 25.0)]).collect());
    }
    if r.proximo().is_multiple_of(4) {
        fx.borda = Some(vec![[3.0, 3.0], [97.0, 3.0], [97.0, 97.0], [3.0, 97.0]]);
    }
    for id in 1..=inteiro(r, 0, 3) as u32 {
        let (cx, cy, lados) = (r.intervalo(30.0, 70.0), r.intervalo(30.0, 70.0), inteiro(r, 3, 10));
        let contorno = (0..lados)
            .map(|k| {
                let (a, raio) = (std::f64::consts::TAU * k as f64 / lados as f64, r.intervalo(5.0, 25.0));
                [cx + raio * a.cos(), cy + raio * a.sin()]
            })
            .collect();
        let papel = (r.proximo() % 3) as u8;
        let mut reg = RegiaoFx::nova(id, papel, contorno, r.intervalo(-5.0, 25.0));
        reg.ordem = inteiro(r, 0, 5) as u32;
        reg.inclinacao = if r.proximo().is_multiple_of(2) { r.intervalo(0.0, 0.3) } else { 0.0 };
        reg.direcao = r.intervalo(0.0, std::f64::consts::TAU);
        // Talude em poucas regiões e com cota perto da do terreno: o alcance D (e com ele a grade de pontos) cresce com a diferença de cota e com o talude, e o
        // fuzz em modo de depuração fica lento.
        if r.proximo().is_multiple_of(8) {
            reg.cota = r.intervalo(5.0, 15.0);
            reg.talude_corte = r.intervalo(0.3, 1.0);
            reg.talude_aterro = if r.proximo().is_multiple_of(2) { r.intervalo(0.3, 1.0) } else { 0.0 };
        }
        fx.regioes.push(reg);
    }
    fx
}

type Bits = Vec<u64>;

fn bits(x: &[f64]) -> Bits {
    x.iter().map(|v| v.to_bits()).collect()
}

/// Tudo o que as consultas devolvem para a superfície proposta, em bits, para comparar duas execuções.
fn impressao(cena: &mut Cena, plano: [f64; 4], profundidade: f64) -> Vec<Bits> {
    let m = malha(cena, 0, 1);
    let mut out = vec![m.grupos.iter().flatten().map(|&x| u64::from(x)).collect(), m.i.iter().map(|&x| u64::from(x)).collect(), bits(&m.v.iter().flatten().copied().collect::<Vec<_>>())];
    for l in curvas(cena, 0, 1).iter().chain(&planta(cena, 0, 1)).chain(&corte_todos(cena, plano, profundidade)) {
        out.push(bits(&l.pontos.iter().flatten().copied().chain([l.z, f64::from(l.marca)]).collect::<Vec<_>>()));
    }
    out.push(bits(&quant(cena, 0).iter().flat_map(|q| q.1).collect::<Vec<_>>()));
    out.push(bits(&quant_regioes(cena, 0).iter().flat_map(|q| q.2).collect::<Vec<_>>()));
    out.push(mapa(cena, 0).iter().flat_map(|g| g.2.iter().flatten().flatten()).map(|x| x.to_bits()).collect());
    out.push(avisos(cena, 0).iter().flat_map(|a| a.1).map(|x| x.to_bits()).collect());
    out
}

#[test]
fn fuzz_200_completo() {
    let mut r = Xorshift::novo(20_261_115);
    let (mut com_plana, mut com_sub, mut triangulos, mut com_volume, mut n_curvas) = (0, 0, 0, 0, 0);
    for caso in 0..200 {
        let fx = terreno_aleatorio(&mut r);
        let planas = fx.regioes.iter().filter(|g| g.papel != 0).count();
        com_plana += usize::from(planas > 0);
        com_sub += usize::from(fx.regioes.iter().any(|g| g.papel == 0));
        let a = r.intervalo(0.0, std::f64::consts::TAU);
        let plano = [r.intervalo(20.0, 80.0), r.intervalo(20.0, 80.0), a.cos(), a.sin()];
        let profundidade = r.intervalo(0.0, 120.0);
        let mut cena = cena_com(std::slice::from_ref(&fx));
        let primeira = impressao(&mut cena, plano, profundidade);
        let segunda = impressao(&mut cena_com(std::slice::from_ref(&fx)), plano, profundidade);
        assert!(primeira == segunda, "caso {caso}: mesmos bytes em duas execuções");
        // Malha: finita, área > 0, normal para cima, arestas em 1 ou 2 triângulos, saia e base.
        let m = malha(&mut cena, 0, 1);
        triangulos += conferir_proposta(&m, 1);
        // Área em planta: sem aviso 6, P cobre o mesmo domínio de E.
        let av = avisos(&mut cena, 0);
        let q = quant(&mut cena, 0)[0].1;
        let area_p: f64 = m.grupos.iter().filter(|g| g[2] == 0).flat_map(|g| m.i[g[3] as usize..(g[3] + g[4]) as usize].chunks_exact(3)).map(|t| {
            let (p, s, u) = (m.v[t[0] as usize], m.v[t[1] as usize], m.v[t[2] as usize]);
            ((s[0] - p[0]) * (u[1] - p[1]) - (s[1] - p[1]) * (u[0] - p[0])) / 2.0
        }).sum();
        if av.iter().all(|x| x.0[1] != AVISO_REGIAO_FORA) {
            assert!((area_p - q[0]).abs() < 1e-6 * q[0], "caso {caso}: P cobre o domínio de E ({area_p} x {})", q[0]);
        }
        // Volumes finitos e não negativos; sem região plana, nada de corte nem aterro.
        assert!(q.iter().all(|x| x.is_finite()) && q[5] >= 0.0 && q[6] >= 0.0, "caso {caso}: {q:?}");
        let rq = quant_regioes(&mut cena, 0);
        assert_eq!(rq.len(), fx.regioes.len(), "caso {caso}");
        let (soma_c, soma_a) = rq.iter().fold((0.0, 0.0), |s, x| (s.0 + x.2[2], s.1 + x.2[3]));
        assert!(rq.iter().all(|x| x.2.iter().all(|v| v.is_finite() && *v >= 0.0)), "caso {caso}");
        assert!((soma_c - q[5]).abs() <= 1e-6 * (1.0 + q[5]) && (soma_a - q[6]).abs() <= 1e-6 * (1.0 + q[6]), "caso {caso}: volumes das regiões somam o do terreno");
        if planas == 0 {
            assert_eq!((q[5], q[6]), (0.0, 0.0), "caso {caso}");
            assert!(mapa(&mut cena, 0).is_empty(), "caso {caso}");
        } else {
            com_volume += usize::from(q[5] + q[6] > 0.0);
        }
        for g in mapa(&mut cena, 0) {
            assert!(g.2.iter().all(|t| area_tri(t) > 0.0 && t.iter().flatten().all(|x| x.is_finite())), "caso {caso}: subtriângulos anti-horários");
        }
        // Curvas da superfície proposta: cada ponto na cota da curva e dentro do domínio (pela consulta 163 da mesma superfície).
        for l in curvas(&mut cena, 0, 1) {
            for (pt, c) in l.pontos.iter().zip(cotas(&mut cena, &l.pontos, 1)) {
                assert_eq!(c.0, 1, "caso {caso}: ponto {pt:?} da curva {} fora do domínio", l.z);
                assert!((c.1 - l.z).abs() < 1e-9, "caso {caso}: ponto {pt:?} na cota {} e não em {}", c.1, l.z);
            }
            n_curvas += 1;
        }
        // Região plana única, sem sobreposição e dentro do terreno: o centro está no plano da região.
        if planas == 1 && fx.regioes.len() == 1 && av.iter().all(|x| !matches!(x.0[1], 3 | 4 | 6)) {
            let reg = &regioes_prontas(&cena, 1)[0];
            let c = [fx.regioes[0].contorno.iter().map(|p| p[0]).sum::<f64>() / reg.contorno.len() as f64, fx.regioes[0].contorno.iter().map(|p| p[1]).sum::<f64>() / reg.contorno.len() as f64];
            if reg.dentro(crate::geo2d::v(c[0], c[1])) {
                let z = cotas(&mut cena, &[c], 1)[0];
                assert_eq!(z.0, 1, "caso {caso}");
                assert!((z.1 - reg.zr(crate::geo2d::v(c[0], c[1]))).abs() < 1e-9, "caso {caso}: dentro da região vale o plano dela");
            }
        }
    }
    assert!(com_plana > 100 && com_sub > 50 && com_volume > 50 && triangulos > 50_000 && n_curvas > 200, "o gerador cobre o que importa: {com_plana}, {com_sub}, {com_volume}, {triangulos}, {n_curvas}");
}

/// Tempos de A.8 item 5 com regiões (alvo, não bloqueio): terreno de 50 000 pontos em 1000 x 1000 m com duas plataformas, uma região nivelada com talude e uma
/// subdivisão. Imprime os tempos; rode com `--release -- --nocapture` para medir.
#[test]
fn tempo_50_mil_pontos_com_regioes() {
    let mut r = Xorshift::novo(50_001);
    // Relevo suave (colinas de 15 m), como um levantamento de verdade: com cotas sorteadas cada triângulo cruzaria dezenas de curvas.
    let pontos = (0..50_000).map(|_| (r.intervalo(0.0, 1000.0), r.intervalo(0.0, 1000.0))).map(|(x, y)| [x, y, 25.0 + 15.0 * (x / 80.0).sin() * (y / 60.0).cos()]).collect();
    let regioes = vec![
        RegiaoFx::quadrado(1, 1, 200.0, 200.0, 80.0, 20.0),
        RegiaoFx::quadrado(2, 1, 600.0, 300.0, 60.0, 30.0),
        RegiaoFx { talude_corte: 1.5, talude_aterro: 2.0, ..RegiaoFx::quadrado(3, 2, 400.0, 600.0, 100.0, 25.0) },
        RegiaoFx::quadrado(4, 0, 100.0, 700.0, 150.0, 0.0),
    ];
    let mut cena = cena_com(&[TerrenoFx { regioes, ..TerrenoFx::novo(1, pontos) }]);
    let t = std::time::Instant::now();
    let m = malha(&mut cena, 0, 1);
    let primeira = t.elapsed();
    let t = std::time::Instant::now();
    let de_novo = malha(&mut cena, 0, 1);
    let com_cache = t.elapsed();
    let t = std::time::Instant::now();
    let c = curvas(&mut cena, 0, 1);
    let tempo_curvas = t.elapsed();
    let t = std::time::Instant::now();
    let c_existente = curvas(&mut cena, 0, 0);
    let tempo_curvas_e = t.elapsed();
    let t = std::time::Instant::now();
    let k = corte_todos(&mut cena, [0.0, 500.0, 1.0, 0.0], 0.0);
    let tempo_corte = t.elapsed();
    let t = std::time::Instant::now();
    let z = cotas(&mut cena, &[[250.0, 250.0]], 1);
    let uma_sonda = t.elapsed();
    let t = std::time::Instant::now();
    let q = quant(&mut cena, 0);
    let tempo_volumes = t.elapsed();
    let t = std::time::Instant::now();
    let mapa_ca = executar(&mut cena, CONSULTA_TERRENO_CORTE_ATERRO, &[0.0]).expect("mapa");
    let tempo_mapa = t.elapsed();
    println!(
        "terreno de 50 000 pontos com 4 regiões: primeira terreno_malha (E e P) {primeira:?}; com cache {com_cache:?}; terreno_curvas {tempo_curvas:?} (existente {tempo_curvas_e:?}); terreno_corte {tempo_corte:?}; \
         terreno_cotas com 1 sonda {uma_sonda:?}; quant_terreno (volumes) {tempo_volumes:?}; terreno_corte_aterro {tempo_mapa:?}"
    );
    assert_eq!(m.i, de_novo.i);
    assert!(!c.is_empty() && !c_existente.is_empty() && !k.is_empty() && mapa_ca.len() == 2);
    assert!((z[0].1 - 20.0).abs() < 1e-9, "dentro da plataforma 1");
    assert!(q[0].1[5] + q[0].1[6] > 0.0);
    assert_eq!(cena.cache_terreno.borrow().propostas_calculadas, 1);
}
