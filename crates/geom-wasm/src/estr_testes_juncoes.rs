//! Testes da ficha K4 (estrutura): junções (consulta 206, fixture E6), avisos (204, um por código da A.4.7), apoio de snap (207), fuzz das consultas
//! 201 a 207 e desempenho da planta.

use crate::a1::testes_util::{cena_com, tipo_simples, Par};
use crate::cena::Cena;
use crate::consultas::executar;
use crate::esquema::{ID_AUSENTE, NIVEL_TODOS};
use crate::estr_apoio::chave;
use crate::estr_avisos::*;
use crate::estr_testes::{cena, perfil, rel};
use crate::estr_testes_planta::*;
use crate::secoes_estr::*;
use crate::teste_util::Xorshift;

/// Cena da E6: viga E5 (0,15 × 0,40, de (0, 0) a (5, 0), topo em 3,00) com um pilar estrutural 0,20 × 0,40 de 3,00 em cada ponta.
fn cena_e6() -> Cena {
    let mut c = cena();
    tipo_pilar(&mut c, 1, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_RETANGULAR, &[0.2, 0.4]));
    tipo_viga(&mut c, 1, perfil(PERFIL_RETANGULAR, &[0.15, 0.4]));
    c.estr.pilares.insert(1, pilar_em(1, [0.0, 0.0], 3.0));
    c.estr.pilares.insert(2, pilar_em(1, [5.0, 0.0], 3.0));
    c.estr.vigas.insert(5, viga_de(1, [0.0, 0.0], [5.0, 0.0], [3.0, 3.0]));
    c
}

#[test]
fn e6_viga_aparada_pelo_pilar() {
    let mut c = cena_e6();
    let s = executar(&mut c, 206, &[NIVEL_TODOS as f64]).expect("206");
    assert_eq!(u32s(&s[3]), vec![5, 0, 1, 5, 1, 2], "aparos: [viga, extremidade, pilar]");
    let recuo = f64s(&s[4]);
    assert!(rel(recuo[0], 0.1) < 1e-12 && rel(recuo[1], 0.1) < 1e-12);
    assert!(rel(5.0 - recuo[0] - recuo[1], 4.8) < 1e-12, "comprimento livre 4,80");
    assert!(u32s(&s[0]).is_empty() && u32s(&s[5]).is_empty(), "sem paredes: sem recortes nem uniões");
    // A planta (acima de tudo) desenha a viga tracejada de 0,10 a 4,90.
    let l = linhas(&executar(&mut c, 201, &[0.0, 3.5, 1.0]).expect("201"));
    let viga: Vec<_> = l.iter().filter(|x| x.1 == 1).collect();
    assert_eq!(viga.len(), 1);
    let xs: Vec<f64> = viga[0].4.iter().map(|p| p[0]).collect();
    let (x0, x1) = (xs.iter().copied().fold(f64::INFINITY, f64::min), xs.iter().copied().fold(f64::NEG_INFINITY, f64::max));
    assert!((x0 - 0.1).abs() < 1e-12 && (x1 - 4.9).abs() < 1e-12 && rel(x1 - x0, 4.8) < 1e-12);
    // Pilar arquitetônico não apara; viga longe dos pilares (cota acima) também não.
    c.estr.tipos_pilar.insert(1, TipoPilarLinha { disciplina: DISCIPLINA_ARQUITETONICO, perfil: perfil(PERFIL_RETANGULAR, &[0.2, 0.4]), material: 7, espessura_camadas: 0.0 });
    assert!(u32s(&executar(&mut c, 206, &[0.0]).expect("206")[3]).is_empty());
    let mut c = cena_e6();
    c.estr.vigas.insert(5, viga_de(1, [0.0, 0.0], [5.0, 0.0], [4.0, 4.0]));
    assert!(u32s(&executar(&mut c, 206, &[0.0]).expect("206")[3]).is_empty());
    // Pilar girado 90°: a ponta recua 0,20 (a altura do perfil fica ao longo da viga).
    let mut c = cena_e6();
    c.estr.pilares.insert(1, PilarLinha { rotacao: std::f64::consts::FRAC_PI_2, ..pilar_em(1, [0.0, 0.0], 3.0) });
    let s = executar(&mut c, 206, &[0.0]).expect("206");
    assert!(rel(f64s(&s[4])[0], 0.2) < 1e-12);
}

#[test]
fn juncao_do_pilar_com_parede() {
    // Parede 1 de (0, 0) a (6, 0), 0,20 de espessura, de 0 a 2,8; parede 2 no nível 1.
    let mut c = cena_com(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0)), Par { nivel: 1, z0: 3.0, topo: 5.8, ..Par::nova(2, (0.0, 5.0), (6.0, 5.0)) }], &[tipo_simples()]);
    c.b.niveis.insert(1, (0, 0.0));
    c.b.niveis.insert(2, (1, 3.0));
    tipo_pilar(&mut c, 1, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_RETANGULAR, &[0.3, 0.3]));
    tipo_pilar(&mut c, 2, DISCIPLINA_ARQUITETONICO, perfil(PERFIL_RETANGULAR, &[0.3, 0.3]));
    c.estr.pilares.insert(10, pilar_em(1, [3.0, 0.0], 3.5));
    c.estr.pilares.insert(11, pilar_em(1, [3.0, 2.0], 3.5)); // longe da parede
    c.estr.pilares.insert(12, PilarLinha { disciplina: 0, hosp: 1, ..pilar_em(2, [4.0, 0.0], 2.0) });
    c.estr.pilares.insert(13, PilarLinha { nivel: 1, ..pilar_em(1, [1.0, 5.0], 1.0) });
    let s = executar(&mut c, 206, &[NIVEL_TODOS as f64]).expect("206");
    assert_eq!(u32s(&s[0]), vec![1, 10, 4, 2, 13, 4], "[parede, pilar, n_pontos]");
    assert_eq!(f64s(&s[1]), vec![0.0, 2.8, 3.0, 4.0], "trecho vertical comum");
    let p = f64s(&s[2]);
    assert_eq!(p.len(), 16);
    assert!(rel(crate::estr_perfil::area_com_sinal(&p[..8].chunks_exact(2).map(|c| [c[0], c[1]]).collect::<Vec<_>>()), 0.09) < 1e-12, "o anel do pilar, anti-horário");
    assert_eq!(u32s(&s[5]), vec![12, 1], "pilar arquitetônico une com a hospedeira");
    // Filtro de nível: as paredes (e as uniões) do nível 0.
    let s0 = executar(&mut c, 206, &[0.0]).expect("206");
    assert_eq!(u32s(&s0[0]), vec![1, 10, 4]);
    // Pilar que só encosta na face da parede (y de 0,1 a 0,4): sem recorte.
    c.estr.pilares.insert(10, pilar_em(1, [3.0, 0.25], 3.5));
    c.estr.pilares.remove(&13);
    assert!(u32s(&executar(&mut c, 206, &[0.0]).expect("206")[0]).is_empty());
    // Hospedeira que não existe: sem união.
    c.estr.pilares.insert(12, PilarLinha { disciplina: 0, hosp: 99, ..pilar_em(2, [4.0, 0.0], 2.0) });
    assert!(u32s(&executar(&mut c, 206, &[0.0]).expect("206")[5]).is_empty());
}

/// Avisos `(elemento, categoria, codigo, ref)` e valores.
fn avisos(c: &mut Cena) -> (Vec<[u32; 4]>, Vec<[f64; 5]>) {
    let s = executar(c, 204, &[NIVEL_TODOS as f64]).expect("204");
    let a = u32s(&s[0]).chunks_exact(4).map(|x| [x[0], x[1], x[2], x[3]]).collect();
    let v = f64s(&s[1]).chunks_exact(5).map(|x| [x[0], x[1], x[2], x[3], x[4]]).collect();
    (a, v)
}

fn codigos(c: &mut Cena) -> Vec<[u32; 4]> {
    avisos(c).0
}

#[test]
fn aviso_1_perfil_invalido() {
    let mut c = cena_e6();
    // Personalizado sem anéis na seção 206 e tipo ausente: o aviso 1 aponta o tipo.
    let mut pf = perfil(PERFIL_PERSONALIZADO, &[]);
    pf.perfil = 9;
    tipo_pilar(&mut c, 2, DISCIPLINA_ESTRUTURAL, pf);
    c.estr.pilares.insert(2, pilar_em(2, [5.0, 0.0], 3.0));
    c.estr.vigas.insert(6, viga_de(8, [0.0, 0.0], [0.0, 5.0], [3.0, 3.0]));
    let a = codigos(&mut c);
    assert!(a.contains(&[2, 0, AVISO_PERFIL_INVALIDO, 2]) && a.contains(&[6, 1, AVISO_PERFIL_INVALIDO, 8]), "{a:?}");
    // Fundação cujo modo não bate com a linha (isolada com eixo).
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    c.estr.fundacoes.insert(3, FundacaoLinha { pos: None, eixo: Some(([0.0, 0.0], [1.0, 0.0])), ..isolada_em(1, [0.0, 0.0], -0.1) });
    assert!(codigos(&mut c).contains(&[3, 2, AVISO_PERFIL_INVALIDO, 1]));
    // As outras consultas omitem o elemento (sem ENTRADA).
    for id in [201, 202, 203, 206, 207] {
        let n = crate::esquema::consulta(id).map_or(0, |d| d.args.len());
        let mut args = vec![0.0; n];
        if id == 202 {
            args[3] = 1.0;
        }
        assert!(executar(&mut c, id, &args).is_ok(), "consulta {id}");
    }
}

#[test]
fn aviso_2_pilar_sem_altura() {
    let mut c = cena_e6();
    c.estr.pilares.insert(2, PilarLinha { nivel_topo: 0, altura: f64::NAN, ..pilar_em(1, [5.0, 0.0], 3.0) });
    let (a, v) = avisos(&mut c);
    let k = a.iter().position(|x| *x == [2, 0, AVISO_PILAR_SEM_ALTURA, ID_AUSENTE]).expect("aviso 2");
    assert_eq!(v[k], [0.0, 0.001, 5.0, 0.0, 0.0]);
    assert!(!a.iter().any(|x| x[0] == 1 && x[2] == AVISO_PILAR_SEM_ALTURA));
}

#[test]
fn aviso_3_viga_curta() {
    let mut c = cena_e6();
    c.estr.vigas.insert(7, viga_de(1, [5.0, 0.0], [5.03, 0.0], [3.0, 3.0]));
    let (a, v) = avisos(&mut c);
    let k = a.iter().position(|x| *x == [7, 1, AVISO_VIGA_CURTA, ID_AUSENTE]).expect("aviso 3");
    assert!(rel(v[k][0], 0.03) < 1e-9 && v[k][1] == 0.05);
    assert!(!a.iter().any(|x| x[0] == 5 && x[1] == 1 && x[2] == AVISO_VIGA_CURTA));
}

#[test]
fn aviso_4_pilar_sem_fundacao() {
    let mut c = cena_e6();
    let a = codigos(&mut c);
    assert!(a.contains(&[1, 0, AVISO_PILAR_SEM_FUNDACAO, ID_AUSENTE]) && a.contains(&[2, 0, AVISO_PILAR_SEM_FUNDACAO, ID_AUSENTE]));
    // Sapata sob o pilar 1 (4 cm fora do centro ainda vale), baldrame sob o pilar 2.
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    c.estr.tipos_fundacao.insert(2, baldrame_e8());
    c.estr.fundacoes.insert(1, isolada_em(1, [0.04, 0.0], -0.1));
    c.estr.fundacoes.insert(2, corrida_de(2, [4.0, 0.0], [6.0, 0.0], -0.1));
    assert!(!codigos(&mut c).iter().any(|x| x[2] == AVISO_PILAR_SEM_FUNDACAO));
    // Pilar arquitetônico: nunca.
    tipo_pilar(&mut c, 3, DISCIPLINA_ARQUITETONICO, perfil(PERFIL_RETANGULAR, &[0.2, 0.2]));
    c.estr.pilares.insert(3, PilarLinha { disciplina: 0, ..pilar_em(3, [9.0, 9.0], 3.0) });
    assert!(!codigos(&mut c).iter().any(|x| x[2] == AVISO_PILAR_SEM_FUNDACAO));
}

#[test]
fn aviso_5_viga_solta() {
    let mut c = cena_e6();
    c.estr.vigas.insert(8, viga_de(1, [10.0, 0.0], [14.0, 0.0], [3.0, 3.0]));
    c.estr.vigas.insert(9, viga_de(1, [5.0, 0.0], [5.0, 4.0], [3.0, 3.0])); // balanço: uma ponta no pilar 2
    c.estr.vigas.insert(10, viga_de(1, [2.0, 0.0], [2.0, -3.0], [3.0, 3.0])); // apoiada na viga 5
    let (a, v) = avisos(&mut c);
    let soltas: Vec<u32> = a.iter().filter(|x| x[2] == AVISO_VIGA_SOLTA).map(|x| x[0]).collect();
    assert_eq!(soltas, vec![8]);
    let k = a.iter().position(|x| x[0] == 8 && x[2] == AVISO_VIGA_SOLTA).expect("aviso 5");
    assert_eq!(v[k], [0.0, 1.0, 12.0, 0.0, 3.0]);
    // Uma parede sob a ponta da viga 8 resolve.
    let mut c2 = cena_com(&[Par { z0: 0.0, topo: 3.0, ..Par::nova(1, (14.0, -2.0), (14.0, 2.0)) }], &[tipo_simples()]);
    c2.b.niveis.insert(1, (0, 0.0));
    c2.estr = std::mem::take(&mut c.estr);
    assert!(!codigos(&mut c2).iter().any(|x| x[2] == AVISO_VIGA_SOLTA));
}

#[test]
fn aviso_6_fundacao_alta() {
    let mut c = cena_e6();
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    c.estr.fundacoes.insert(4, isolada_em(1, [0.0, 0.0], 0.2));
    c.estr.fundacoes.insert(5, isolada_em(1, [5.0, 0.0], -0.1));
    let (a, v) = avisos(&mut c);
    let k = a.iter().position(|x| x[0] == 4 && x[1] == 2 && x[2] == AVISO_FUNDACAO_ALTA).expect("aviso 6");
    assert_eq!(a[k][3], 1, "ref: o pilar");
    assert!(rel(v[k][0], 0.2) < 1e-12 && v[k][1] == 0.0);
    assert!(!a.iter().any(|x| x[0] == 5 && x[1] == 2 && x[2] == AVISO_FUNDACAO_ALTA));
    // Ordem: categoria, elemento, código.
    let ordem: Vec<(u32, u32, u32)> = a.iter().map(|x| (x[1], x[0], x[2])).collect();
    let mut ordenada = ordem.clone();
    ordenada.sort();
    assert_eq!(ordem, ordenada);
}

/// Apoio: `[(elemento, categoria, tipo, chave)]` e as posições.
type Apoio = (Vec<[u32; 4]>, Vec<[f64; 2]>, Vec<[u32; 4]>);

fn apoio(c: &mut Cena) -> Apoio {
    let s = executar(c, 207, &[NIVEL_TODOS as f64]).expect("207");
    let p = u32s(&s[0]).chunks_exact(4).map(|x| [x[0], x[1], x[2], x[3]]).collect();
    let xy = f64s(&s[1]).chunks_exact(2).map(|x| [x[0], x[1]]).collect();
    let g = u32s(&s[2]).chunks_exact(4).map(|x| [x[0], x[1], x[2], x[3]]).collect();
    assert_eq!(f64s(&s[3]).len(), 4 * u32s(&s[2]).len() / 4);
    (p, xy, g)
}

#[test]
fn apoio_com_chaves_estaveis() {
    let mut c = cena_e6();
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    c.estr.fundacoes.insert(3, isolada_em(1, [0.0, 0.0], -0.1));
    let (p, xy, g) = apoio(&mut c);
    let do_pilar: Vec<[u32; 2]> = p.iter().filter(|x| x[0] == 1 && x[1] == 0).map(|x| [x[2], x[3]]).collect();
    assert_eq!(do_pilar, vec![[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0]], "4 vértices, 4 meios e o centro");
    let k = p.iter().position(|x| *x == [1, 0, 0, 0]).expect("vértice 0");
    assert_eq!(xy[k], [-0.1, -0.2]);
    let da_viga: Vec<[u32; 2]> = p.iter().filter(|x| x[1] == 1).map(|x| [x[2], x[3]]).collect();
    assert_eq!(da_viga, vec![[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [3, 0], [3, 1], [4, 0]]);
    let k = p.iter().position(|x| *x == [5, 1, 0, 0]).expect("vértice 0 da viga");
    assert!((xy[k][0] - 0.1).abs() < 1e-12 && (xy[k][1] + 0.075).abs() < 1e-12, "canto do início, à direita, já aparado no pilar: {:?}", xy[k]);
    let k = p.iter().position(|x| *x == [5, 1, 3, 1]).expect("ponta b");
    assert_eq!(xy[k], [5.0, 0.0], "eixo do modelo, sem aparo");
    let sapata: Vec<u32> = p.iter().filter(|x| x[1] == 2 && x[2] == 0).map(|x| x[3]).collect();
    assert_eq!(sapata, vec![chave(1, 0, 0), chave(1, 0, 1), chave(1, 0, 2), chave(1, 0, 3), chave(2, 0, 0), chave(2, 0, 1), chave(2, 0, 2), chave(2, 0, 3)]);
    assert!(g.contains(&[5, 1, 1, 0]) && g.contains(&[1, 0, 0, 3]));
    // Mesmas chaves entre chamadas; mover e girar o elemento mantém as chaves.
    assert_eq!(apoio(&mut c), (p.clone(), xy.clone(), g.clone()));
    c.estr.pilares.insert(1, PilarLinha { rotacao: 0.9, ..pilar_em(1, [0.3, -0.2], 3.0) });
    c.estr.vigas.insert(5, viga_de(1, [0.0, 0.0], [-3.0, 4.0], [3.0, 3.0]));
    let (p2, xy2, g2) = apoio(&mut c);
    assert_eq!((p2.clone(), g2), (p.clone(), g));
    assert_ne!(xy2, xy);
    let k = p2.iter().position(|x| *x == [5, 1, 0, 0]).expect("vértice 0 da viga girada");
    let (a, d) = ([0.0, 0.0], [-0.6, 0.8]);
    let (ao_longo, esquerda) = ((xy2[k][0] - a[0]) * d[0] + (xy2[k][1] - a[1]) * d[1], -(xy2[k][0] - a[0]) * d[1] + (xy2[k][1] - a[1]) * d[0]);
    assert!(ao_longo.abs() < 0.3 && (esquerda + 0.075).abs() < 1e-12, "{ao_longo} {esquerda}");
}

/// Uma cena aleatória da estrutura (com dados ruins de propósito) e às vezes paredes.
fn cena_aleatoria(r: &mut Xorshift) -> Cena {
    let ruim = [f64::NAN, 0.0, -0.2, 1e-9, 1e7, f64::INFINITY];
    let x = |r: &mut Xorshift, a: f64, b: f64| if r.proximo().is_multiple_of(25) { ruim[(r.proximo() % 6) as usize] } else { r.intervalo(a, b) };
    let mut c = if r.proximo().is_multiple_of(3) {
        let n = 1 + (r.proximo() % 4) as u32;
        let ps: Vec<Par> = (1..=n).map(|k| Par::nova(k, (r.intervalo(-5.0, 5.0), r.intervalo(-5.0, 5.0)), (r.intervalo(-5.0, 5.0), r.intervalo(-5.0, 5.0)))).collect();
        cena_com(&ps, &[tipo_simples()])
    } else {
        Cena::novo()
    };
    c.b.niveis.insert(1, (0, 0.0));
    c.b.niveis.insert(2, (1, 3.0));
    for t in 1..=3u32 {
        let forma = (r.proximo() % 9) as u8;
        let mut p = perfil(forma, &[x(r, 0.05, 0.5), x(r, 0.05, 0.5), x(r, 0.001, 0.02), x(r, 0.001, 0.02)]);
        if forma == PERFIL_TUBO_CIRCULAR {
            p.p[1] = x(r, 0.001, 0.02);
        }
        if forma == PERFIL_PERSONALIZADO {
            p.perfil = 1;
        }
        let disc = (r.proximo() % 2) as u8;
        c.estr.tipos_pilar.insert(t, TipoPilarLinha { disciplina: disc, perfil: p, material: t, espessura_camadas: if disc == 0 { x(r, 0.0, 0.03) } else { 0.0 } });
        c.estr.tipos_viga.insert(t, TipoVigaLinha { perfil: p, material: t });
    }
    for (k, q) in [[0.0, 0.0], [0.4, 0.0], [0.4, 0.3], [0.0, 0.3]].iter().enumerate() {
        c.estr.perfis.insert(k as u32, VerticePerfilLinha { perfil: 1, anel: 0, indice: k as u32, p: *q });
    }
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    c.estr.tipos_fundacao.insert(2, baldrame_e8());
    let n = (r.proximo() % 12) as u32;
    for k in 0..n {
        let tipo = 1 + (r.proximo() % 4) as u32;
        let pos = [x(r, -5.0, 5.0), x(r, -5.0, 5.0)];
        match r.proximo() % 3 {
            0 => {
                let nivel_topo = if r.proximo().is_multiple_of(2) { ID_AUSENTE } else { (r.proximo() % 3) as u32 };
                let hosp = if r.proximo().is_multiple_of(4) { 1 } else { ID_AUSENTE };
                c.estr.pilares.insert(k, PilarLinha { rotacao: x(r, 0.0, 6.0), nivel_topo, nivel: (r.proximo() % 3) as u32, hosp, ..pilar_em(tipo, pos, x(r, -1.0, 4.0)) });
            }
            1 => {
                let b = [x(r, -5.0, 5.0), x(r, -5.0, 5.0)];
                c.estr.vigas.insert(k, VigaLinha { rotacao: x(r, 0.0, 3.0), alinhamento: (r.proximo() % 3) as u8, ..viga_de(tipo, pos, b, [x(r, 0.0, 3.0), x(r, 0.0, 3.0)]) });
            }
            _ => {
                let f = if r.proximo().is_multiple_of(2) { isolada_em(1 + (tipo % 2), pos, x(r, -1.0, 0.5)) } else { corrida_de(1 + (tipo % 2), pos, [x(r, -5.0, 5.0), x(r, -5.0, 5.0)], x(r, -1.0, 0.5)) };
                c.estr.fundacoes.insert(k, f);
            }
        }
    }
    c
}

#[test]
fn fuzz_200_cenas_nas_consultas_201_a_207() {
    let mut r = Xorshift::novo(4242);
    let mut com_saida = 0;
    for _ in 0..200 {
        let mut c = cena_aleatoria(&mut r);
        let nivel = if r.proximo().is_multiple_of(2) { NIVEL_TODOS as f64 } else { (r.proximo() % 3) as f64 };
        let (corte, d) = (r.intervalo(-2.0, 4.0), [r.intervalo(-1.0, 1.0), r.intervalo(-1.0, 1.0)]);
        let casos: [(u32, Vec<f64>); 6] = [
            (201, vec![nivel, corte, (r.proximo() % 4) as f64]),
            (202, vec![nivel, r.intervalo(-5.0, 5.0), r.intervalo(-5.0, 5.0), d[0], d[1], r.intervalo(-1.0, 10.0)]),
            (203, vec![nivel]),
            (204, vec![nivel]),
            (206, vec![nivel]),
            (207, vec![nivel]),
        ];
        for (id, args) in casos {
            let s = executar(&mut c, id, &args);
            assert!(s.is_ok(), "consulta {id}: {s:?}");
            com_saida += usize::from(s.is_ok_and(|s| !s[0].is_empty()));
        }
        // 205 não lê a cena: argumentos aleatórios, Ok ou ENTRADA, nunca pânico.
        let forma = (r.proximo() % 10) as f64;
        let mut args = vec![nivel, forma];
        args.extend((0..6).map(|_| r.intervalo(-0.1, 0.5)));
        args.push((r.proximo() % 2) as f64);
        args.extend((0..(r.proximo() % 12)).map(|_| r.intervalo(0.0, 4.0).floor()));
        let s = executar(&mut c, 205, &args);
        assert!(s.is_ok() || s == Err(crate::esquema::ENTRADA) || s == Err(crate::esquema::LIMITE), "205: {s:?}");
    }
    assert!(com_saida > 300, "o fuzz também gera geometria: {com_saida}");
}

#[test]
fn desempenho_planta_2000_elementos() {
    let mut c = cena();
    tipo_pilar(&mut c, 1, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_RETANGULAR, &[0.2, 0.4]));
    tipo_pilar(&mut c, 2, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_CIRCULAR, &[0.3]));
    tipo_viga(&mut c, 1, perfil(PERFIL_RETANGULAR, &[0.15, 0.4]));
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    // Grade 25 × 20 de pilares com vigas nas duas direções e sapatas: 500 + 500 + 500 + 500 = 2000 elementos.
    let mut k = 0u32;
    for i in 0..25 {
        for j in 0..20 {
            let (x, y) = (i as f64 * 5.0, j as f64 * 5.0);
            c.estr.pilares.insert(k, PilarLinha { rotacao: 0.1 * j as f64, ..pilar_em(1 + (i + j) % 2, [x, y], 3.0) });
            c.estr.vigas.insert(k, viga_de(1, [x, y], [x + 5.0, y], [3.0, 3.0]));
            c.estr.vigas.insert(100_000 + k, viga_de(1, [x, y], [x, y + 5.0], [if j % 2 == 0 { 0.5 } else { 1.4 }; 2]));
            c.estr.fundacoes.insert(k, isolada_em(1, [x, y], -0.1));
            k += 1;
        }
    }
    let total = c.estr.pilares.len() + c.estr.vigas.len() + c.estr.fundacoes.len();
    assert_eq!(total, 2000);
    let _ = executar(&mut c, 201, &[0.0, 1.2, 1.0]);
    let inicio = std::time::Instant::now();
    let s = executar(&mut c, 201, &[0.0, 1.2, 1.0]).expect("201");
    let dt = inicio.elapsed();
    assert!(linhas(&s).len() >= 2000);
    let limite_ms = if cfg!(debug_assertions) { 2000 } else { 50 };
    println!("estr_planta: {total} elementos em {dt:?} (limite {limite_ms} ms)");
    assert!(dt.as_millis() < limite_ms, "{dt:?}");
}
