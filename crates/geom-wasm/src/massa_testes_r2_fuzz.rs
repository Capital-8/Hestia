//! Aceite da ficha R2 do plano de massa: avisos (A.4 regra 12; consulta 145) com um caso positivo e um negativo cada, e o fuzz estendido (A.8 item
//! 2): as quatro consultas da ficha (141, 142, 144 e 145) devolvem saídas finitas e determinísticas para as 200 massas do gerador da R1.

use crate::consultas::{executar, Saida};
use crate::esquema::{CONSULTA_MASSA_AVISOS, CONSULTA_MASSA_FATIAS, CONSULTA_MASSA_PLANTA, CONSULTA_QUANT_MASSA, ENTRADA, LIMITE};
use crate::massa_avisos::{autointersecoes, cruzamento, inclinacao, massa_avisos, sobreposicao, AvisoMassa, AV_ANEL_AUTOINTERSECTA, AV_COPIAS_SOBREPOSTAS, AV_FACE_INCLINADA, AV_LIMITE, LIMITE_ANEIS_COPIA, LIMITE_ANEIS_TRECHO, LIMITE_T};
use crate::massa_fatia::massa_fatias;
use crate::massa_fixture::{analisar, m1, m2, m3, m4, m5, todas};
use crate::massa_malha::massa_malha;
use crate::massa_planta::massa_planta;
use crate::massa_quant::quant_massa;
use crate::massa_testes_fuzz::massa_ao_acaso;
use crate::massa_testes_r2::{cena, f64s, pavimentos, u32s};
use crate::massa_tipos::{validar, Arranjo, Massa, Perfil, Secao};
use crate::teste_util::Xorshift;
use std::f64::consts::{FRAC_PI_2, PI, TAU};

fn do_codigo(avisos: &[AvisoMassa], codigo: u32) -> Vec<&AvisoMassa> {
    avisos.iter().filter(|a| a.codigo == codigo).collect()
}

#[test]
fn aviso_anel_autointersecta() {
    // Positivo: retângulo com um laço cruzado no lado de cima (as arestas (0,5; 2)-(-0,5; 3) e (0,5; 3)-(-0,5; 2) se cruzam em (0; 2,5)).
    let laco = Perfil::Livre { pontos: vec![[-3.0, -2.0], [3.0, -2.0], [3.0, 2.0], [0.5, 2.0], [-0.5, 3.0], [0.5, 3.0], [-0.5, 2.0], [-3.0, 2.0]] };
    let mut m = m1();
    for s in &mut m.secoes {
        s.perfil = laco.clone();
    }
    m.z_base = 2.0;
    assert_eq!(validar(&m), Ok(()));
    let av = massa_avisos(std::slice::from_ref(&m), &[]).expect("avisos");
    // Seção 0, meio do trecho 0 e seção 1, de baixo para cima; a cota distingue a seção do trecho.
    assert_eq!(av.iter().map(|a| (a.massa, a.codigo, a.copia, a.indice, a.z)).collect::<Vec<_>>(), vec![(1, 1, 0, 0, 2.0), (1, 1, 0, 0, 6.5), (1, 1, 0, 1, 11.0)]);
    for a in &av {
        assert_eq!((a.medido, a.limite), (1.0, 0.0));
        assert!(a.x.abs() < 1e-9 && (a.y - 2.5).abs() < 1e-9, "cruzamento em ({}, {})", a.x, a.y);
    }
    // Só no meio do trecho: as duas seções são quadriláteros simples, mas a mistura dos pontos locais de mesmo parâmetro passa por um anel que
    // se cruza (o parâmetro começa em lugares diferentes dos dois perfis).
    let (baixo, cima) = (vec![[1.0, 1.0], [0.0, 1.0], [-3.0, -2.0], [1.0, -4.0]], vec![[3.0, 0.0], [-2.0, 3.0], [-1.0, 0.0], [1.0, -1.0]]);
    assert_eq!((autointersecoes(&baixo).0, autointersecoes(&cima).0), (0, 0));
    let mut mistura = m1();
    mistura.secoes[0].perfil = Perfil::Livre { pontos: baixo };
    mistura.secoes[1].perfil = Perfil::Livre { pontos: cima };
    assert_eq!(validar(&mistura), Ok(()));
    let av = massa_avisos(&[mistura], &[]).expect("avisos");
    assert_eq!(av.iter().map(|a| (a.codigo, a.indice, a.z, a.medido)).collect::<Vec<_>>(), vec![(AV_ANEL_AUTOINTERSECTA, 0, 4.5, 1.0)]);
    // Negativo: nenhuma massa de referência tem anel que se cruza.
    for (nome, massas) in todas() {
        assert!(do_codigo(&massa_avisos(&massas, &pavimentos(30.0)).expect("avisos"), AV_ANEL_AUTOINTERSECTA).is_empty(), "{nome}");
    }
    // As peças: laço em 8 cruza uma vez no centro; quadrado não cruza; tocar na ponta e ficar colinear não contam.
    assert_eq!(autointersecoes(&[[0.0, 0.0], [2.0, 2.0], [2.0, 0.0], [0.0, 2.0]]), (1, Some([1.0, 1.0])));
    assert_eq!(autointersecoes(&[[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]]), (0, None));
    assert_eq!(cruzamento([0.0, 0.0], [2.0, 0.0], [1.0, 0.0], [1.0, 3.0]), None);
    assert_eq!(cruzamento([0.0, 0.0], [2.0, 0.0], [1.0, 0.0], [3.0, 0.0]), None);
    assert_eq!(cruzamento([0.0, 0.0], [2.0, 0.0], [1.0, -1.0], [1.0, 3.0]), Some([1.0, 0.0]));
}

#[test]
fn aviso_copias_sobrepostas() {
    let niveis = [(0, 0.0), (1, 3.0), (2, 12.0)];
    // Positivo: a caixa M1 em 4 cópias em volta do próprio centro (0°, 90°, 180°, 270°): todos os 6 pares se sobrepõem, nos 2 níveis dentro dela.
    let juntas = Massa { arranjo: Some(Arranjo { n: 4, cx: 0.0, cy: 0.0, ang: TAU }), ..m1() };
    let av = massa_avisos(std::slice::from_ref(&juntas), &niveis).expect("avisos");
    let s = do_codigo(&av, AV_COPIAS_SOBREPOSTAS);
    assert_eq!(s.iter().map(|a| (a.massa, a.copia, a.indice, a.medido, a.limite, a.z)).collect::<Vec<_>>(), vec![(1, 0, 0, 6.0, 0.0, 0.0), (1, 0, 1, 6.0, 0.0, 3.0)]);
    // O ponto comum está dentro da caixa da cópia 0.
    assert!(s.iter().all(|a| a.x.abs() <= 5.0 + 1e-9 && a.y.abs() <= 3.0 + 1e-9));
    // As cópias 0 e 2 (180°) são o mesmo retângulo: contam como sobrepostas mesmo sem cruzamento de arestas. Volta inteira: idem.
    let duas = Massa { arranjo: Some(Arranjo { n: 2, cx: 0.0, cy: 0.0, ang: 2.0 * TAU }), ..m1() };
    let av = massa_avisos(&[duas], &niveis).expect("avisos");
    assert_eq!(do_codigo(&av, AV_COPIAS_SOBREPOSTAS).iter().map(|a| a.medido).collect::<Vec<_>>(), vec![1.0, 1.0]);
    // Negativo: as mesmas cópias em volta de um centro distante não se tocam; sem nível dentro da massa não há o que medir.
    let longe = Massa { arranjo: Some(Arranjo { n: 3, cx: 20.0, cy: 0.0, ang: TAU }), ..m1() };
    assert!(massa_avisos(&[longe], &niveis).expect("avisos").is_empty());
    assert!(do_codigo(&massa_avisos(&[juntas], &[(0, -1.0), (1, 9.5)]).expect("avisos"), AV_COPIAS_SOBREPOSTAS).is_empty());
    assert!(do_codigo(&massa_avisos(&[m1()], &niveis).expect("avisos"), AV_COPIAS_SOBREPOSTAS).is_empty());
    // M5 (A.10: "aviso 2 presente se as pétalas se tocam"): as pétalas da fixture não se tocam em nenhum pavimento.
    assert!(do_codigo(&massa_avisos(&m5(), &pavimentos(15.0)).expect("avisos"), AV_COPIAS_SOBREPOSTAS).is_empty());
    // As peças: quadrados que se cruzam, um dentro do outro e separados.
    let q = |x: f64, y: f64, l: f64| vec![[x, y], [x + l, y], [x + l, y + l], [x, y + l]];
    assert!(sobreposicao(&q(0.0, 0.0, 2.0), &q(1.0, 1.0, 2.0)).is_some());
    assert!(sobreposicao(&q(0.0, 0.0, 4.0), &q(1.0, 1.0, 1.0)).is_some() && sobreposicao(&q(1.0, 1.0, 1.0), &q(0.0, 0.0, 4.0)).is_some());
    // Coincidentes contam; encostados só pela borda não.
    assert!(sobreposicao(&q(0.0, 0.0, 2.0), &q(0.0, 0.0, 2.0)).is_some());
    assert_eq!(sobreposicao(&q(0.0, 0.0, 1.0), &q(1.0, 0.0, 1.0)), None);
    assert_eq!(sobreposicao(&q(0.0, 0.0, 1.0), &q(3.0, 0.0, 1.0)), None);
    // Caixas que se cruzam, mas os anéis não (um "L" e um quadrado no vão dele).
    let l = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 1.0], [1.0, 1.0], [1.0, 4.0], [0.0, 4.0]];
    assert_eq!(sobreposicao(&l, &q(2.0, 2.0, 1.0)), None);
}

#[test]
fn aviso_face_inclinada() {
    // Positivo: a torre torcida M3 (um aviso por pavimento; o nível do topo não abre pavimento). A quina do quadrado anda de lado com a torção.
    let av = massa_avisos(&[m3()], &pavimentos(30.0)).expect("avisos");
    let f = do_codigo(&av, AV_FACE_INCLINADA);
    assert_eq!(f.iter().map(|a| (a.massa, a.copia, a.indice)).collect::<Vec<_>>(), (0..10).map(|i| (3, 0, i)).collect::<Vec<_>>());
    for a in &f {
        // Faixa de 0,75 m, giro de (π/2)·0,75/30: o meio da aresta mais distante do centro do lado (3,75 m) desloca 0,1503 m na normal: 11,3°.
        assert!(a.limite == 5.0 && a.medido > 11.0 && a.medido < 11.7, "medido {}", a.medido);
        assert!(a.z >= a.indice as f64 * 3.0 && a.z < a.indice as f64 * 3.0 + 3.0);
    }
    assert_eq!(av.len(), f.len());
    // Positivo: o bulbo M4 (o raio muda com a altura). Entre z = 0 e z = 3 o raio cresce 0,5 m por metro ou mais em alguma faixa: mais de 26°.
    let av = massa_avisos(&[m4()], &pavimentos(15.0)).expect("avisos");
    let f = do_codigo(&av, AV_FACE_INCLINADA);
    assert_eq!(f.iter().map(|a| a.indice).collect::<Vec<_>>(), vec![0, 1, 2, 3, 4]);
    assert!(f[0].medido > 26.0 && f[0].medido < 60.0);
    // Negativo: caixa e cilindro retos; cilindro torcido (girar o círculo em torno do centro não inclina a face); massa sem nível dentro.
    assert!(massa_avisos(&[m1(), m2()], &pavimentos(30.0)).expect("avisos").is_empty());
    let mut torcido = m2();
    torcido.secoes[1].rot = FRAC_PI_2;
    assert!(massa_avisos(&[torcido], &pavimentos(30.0)).expect("avisos").is_empty());
    assert!(massa_avisos(&[m3()], &[]).expect("avisos").is_empty());
    assert!(massa_avisos(&[m3()], &[(0, 30.0), (1, 45.0)]).expect("avisos").is_empty());
    // Torção fraca (4,5° em 30 m) fica abaixo do limite.
    let mut fraca = m3();
    fraca.secoes[1].rot = PI / 40.0;
    assert!(massa_avisos(&[fraca], &pavimentos(30.0)).expect("avisos").is_empty());
    // A peça: aresta que avança 1 m na normal em 1 m de altura inclina 45°; deslizar ao longo da aresta não inclina.
    let a = [[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]];
    let maior: Vec<[f64; 2]> = a.iter().map(|p| [p[0] * 2.0 - 1.0, p[1] * 2.0 - 1.0]).collect();
    assert!((inclinacao(&a, &maior, 1.0).expect("medida").0 - 45.0).abs() < 1e-9);
    assert_eq!(inclinacao(&a, &a, 1.0).map(|x| x.0), Some(0.0));
}

#[test]
fn aviso_limite_atingido() {
    // |T| > 512 (grade de 128 mais dois perfis livres de 256 pontos com parâmetros diferentes): só o aviso 3, índice 0; a consulta não falha.
    let anel = |fx: f64| Perfil::Livre { pontos: (0..256).map(|i| { let a = TAU * (i as f64 + 0.3 * ((i * 7 % 5) as f64 / 5.0)) / 256.0; [3.0 * fx * a.cos(), 3.0 * a.sin()] }).collect() };
    let mut muitos_t = m1();
    muitos_t.resolucao = 128;
    muitos_t.secoes[0].perfil = anel(1.0);
    muitos_t.secoes[1].perfil = anel(1.5);
    assert_eq!(massa_malha(std::slice::from_ref(&muitos_t), 2), Err(LIMITE));
    let av = massa_avisos(std::slice::from_ref(&muitos_t), &pavimentos(9.0)).expect("avisos");
    assert_eq!(av.iter().map(|a| (a.massa, a.codigo, a.copia, a.indice, a.limite)).collect::<Vec<_>>(), vec![(1, AV_LIMITE, 0, LIMITE_T, 512.0)]);
    assert!(av[0].medido > 512.0 && av[0].medido <= 128.0 + 512.0);
    // Mais de 256 anéis num trecho (bulbo com um trecho de 200 m: 400 divisões de 0,5 m no lod 2).
    let mut alto = m4();
    for (s, z) in alto.secoes.iter_mut().zip([0.0, 200.0, 204.0, 208.0, 211.0]) {
        s.z = z;
    }
    let av = massa_avisos(&[alto], &[]).expect("avisos");
    assert_eq!(av.iter().map(|a| (a.codigo, a.indice, a.medido, a.limite, a.z)).collect::<Vec<_>>(), vec![(AV_LIMITE, LIMITE_ANEIS_TRECHO, 400.0, 256.0, 0.0)]);
    // Mais de 2048 anéis na cópia sem nenhum trecho passar de 256 (40 seções com 178,2° de torção cada: 72 divisões por trecho).
    let mut torcida = m3();
    let q = torcida.secoes[0].clone();
    torcida.secoes = (0..40).map(|i| Secao { z: i as f64 * 3.0, rot: i as f64 * 0.99 * PI, ..q.clone() }).collect();
    let av = massa_avisos(&[torcida.clone()], &[]).expect("avisos");
    assert_eq!(av.iter().map(|a| (a.codigo, a.indice, a.medido, a.limite)).collect::<Vec<_>>(), vec![(AV_LIMITE, LIMITE_ANEIS_COPIA, (1 + 39 * 72) as f64, 2048.0)]);
    // Pela consulta 145: os avisos saem (limite e, com níveis, face inclinada); as consultas que dependem da malha lod 2 devolvem LIMITE.
    let mut c = cena(&[torcida, m1()], &pavimentos(6.0));
    let s = executar(&mut c, CONSULTA_MASSA_AVISOS, &[0.0]).expect("avisos");
    let codigos: Vec<(u32, u32)> = u32s(&s[0]).chunks_exact(4).map(|a| (a[0], a[1])).collect();
    assert_eq!(codigos, vec![(3, AV_LIMITE), (3, AV_FACE_INCLINADA), (3, AV_FACE_INCLINADA), (3, AV_FACE_INCLINADA)]);
    assert_eq!(f64s(&s[1]).len(), 5 * codigos.len());
    assert_eq!(executar(&mut c, CONSULTA_QUANT_MASSA, &[0.0]), Err(LIMITE));
    assert!(executar(&mut c, CONSULTA_MASSA_FATIAS, &[0.0]).is_ok());
    // Massa inválida não é aviso: ENTRADA.
    assert_eq!(massa_avisos(&[Massa { resolucao: 8, ..m1() }], &[]), Err(ENTRADA));
}

/// Todos os f64 de uma saída são finitos.
fn finita(s: &[Saida]) -> bool {
    s.iter().all(|x| match x {
        Saida::F64(v) => v.iter().all(|a| a.is_finite()),
        Saida::U32(_) => true,
    })
}

/// Os bits exatos da saída (para comparar duas execuções).
fn bits(s: &[Saida]) -> Vec<Vec<u64>> {
    s.iter().map(|x| match x {
        Saida::F64(v) => v.iter().map(|a| a.to_bits()).collect(),
        Saida::U32(v) => v.iter().map(|a| u64::from(*a)).collect(),
    }).collect()
}

#[test]
fn fuzz_200_fatias_planta_quant_avisos() {
    // O mesmo gerador e a mesma semente do `fuzz_200` da R1: as mesmas 200 massas.
    let mut r = Xorshift::novo(20_261_113);
    let massas: Vec<Massa> = (0..200).map(|i| massa_ao_acaso(&mut r, i + 1)).collect();
    // Níveis de 3 em 3 m de -12 a 45: cobrem a base (z_base de -10 a 10) e o topo de todas.
    let niveis: Vec<(u32, f64)> = (0..20).map(|i| (i, -12.0 + 3.0 * i as f64)).collect();
    let (mut fatias, mut com_aviso) = (0usize, [0usize; 5]);
    for (i, m) in massas.iter().enumerate() {
        let um = std::slice::from_ref(m);
        let topo = m.z_base + m.secoes[m.secoes.len() - 1].z;
        // Fatias: uma por cópia e por nível dentro da massa, com área e perímetro positivos.
        let f = massa_fatias(um, &niveis).unwrap_or_else(|e| panic!("massa {i}: fatias, erro {e}"));
        let dentro = niveis.iter().filter(|n| n.1 >= m.z_base && n.1 <= topo).count();
        assert_eq!(f.len(), dentro * m.copias() as usize, "massa {i}");
        assert!(f.iter().all(|x| x.area.is_finite() && x.perimetro.is_finite() && x.perimetro > 0.0 && x.pontos.iter().all(|p| p[0].is_finite() && p[1].is_finite())), "massa {i}");
        assert!(f.windows(2).all(|w| (w[0].copia, w[0].nivel) < (w[1].copia, w[1].nivel)), "massa {i}: ordem das fatias");
        fatias += f.len();
        // Planta com o corte no meio da massa: um cortado por cópia e todas as seções do usuário (a faixa cobre a massa inteira).
        let corte = m.z_base + (topo - m.z_base) * 0.37;
        let p = massa_planta(um, corte, m.z_base, topo).unwrap_or_else(|e| panic!("massa {i}: planta, erro {e}"));
        assert_eq!(p.iter().filter(|x| x.estilo == 0).count(), m.copias() as usize, "massa {i}");
        assert_eq!(p.len(), (1 + m.secoes.len()) * m.copias() as usize, "massa {i}");
        assert!(p.iter().all(|x| x.pontos.len() == p[0].pontos.len() && x.pontos.iter().all(|q| q[0].is_finite() && q[1].is_finite())), "massa {i}");
        // Quantidades: o volume é o da malha lod 2, positivo; áreas positivas.
        let q = quant_massa(um).unwrap_or_else(|e| panic!("massa {i}: quant, erro {e}"))[0];
        let a = analisar(&massa_malha(um, 2).expect("malha"));
        assert!((q.volume - a.volume).abs() <= 1e-9 * a.volume.max(1.0) && q.volume > 0.0, "massa {i}: volume {} e malha {}", q.volume, a.volume);
        assert!(q.area_lateral > 0.0 && q.area_base > 0.0 && q.area_topo > 0.0 && q.altura > 0.0 && [q.area_lateral, q.area_base, q.area_topo].iter().all(|v| v.is_finite()), "massa {i}");
        // Avisos: finitos, só códigos conhecidos, em ordem de código.
        let av = massa_avisos(um, &niveis).unwrap_or_else(|e| panic!("massa {i}: avisos, erro {e}"));
        assert!(av.iter().all(|x| (1..=4).contains(&x.codigo) && x.massa == m.num && [x.medido, x.limite, x.x, x.y, x.z].iter().all(|v| v.is_finite())), "massa {i}");
        assert!(av.windows(2).all(|w| w[0].codigo <= w[1].codigo), "massa {i}: ordem dos avisos");
        assert!(av.iter().all(|x| x.codigo != AV_COPIAS_SOBREPOSTAS || m.arranjo.is_some()), "massa {i}");
        for x in &av {
            com_aviso[x.codigo as usize] += 1;
        }
        assert_eq!(av, massa_avisos(um, &niveis).expect("segunda execução"), "massa {i}: avisos diferem");
    }
    // O fuzz exercita as fatias e os avisos de anel, de cópias e de face.
    assert!(fatias > 500 && com_aviso[1] > 0 && com_aviso[2] > 0 && com_aviso[4] > 0, "cobertura: {fatias} fatias, avisos {com_aviso:?}");
    // Pela cena, as quatro consultas, todas as massas de uma vez, duas vezes: saídas finitas e idênticas bit a bit.
    let mut c = cena(&massas, &niveis);
    let consultas: [(u32, &[f64]); 4] = [(CONSULTA_MASSA_PLANTA, &[0.0, 1.2, -4.0, 1.2]), (CONSULTA_MASSA_FATIAS, &[0.0]), (CONSULTA_QUANT_MASSA, &[0.0]), (CONSULTA_MASSA_AVISOS, &[0.0])];
    for (id, args) in consultas {
        let x = executar(&mut c, id, args).unwrap_or_else(|e| panic!("consulta {id}: erro {e}"));
        let y = executar(&mut c, id, args).expect("segunda execução");
        assert!(finita(&x), "consulta {id}: saída não finita");
        assert_eq!(bits(&x), bits(&y), "consulta {id}: duas execuções diferem");
        assert!(!x[0].is_empty(), "consulta {id}: saída vazia");
        // Ordem: massa_num crescente (primeira coluna de cada linha da primeira saída).
        let largura = if id == CONSULTA_QUANT_MASSA { 1 } else { 4 };
        assert!(u32s(&x[0]).chunks_exact(largura).map(|l| l[0]).collect::<Vec<_>>().windows(2).all(|w| w[0] <= w[1]), "consulta {id}: ordem");
    }
    // A fatia pela consulta é a mesma do cálculo direto.
    let s = executar(&mut c, CONSULTA_MASSA_FATIAS, &[0.0]).expect("fatias");
    let direto = massa_fatias(&massas, &niveis).expect("fatias");
    assert_eq!(f64s(&s[2]), direto.iter().flat_map(|f| [f.area, f.perimetro, f.z]).collect::<Vec<_>>());
}
