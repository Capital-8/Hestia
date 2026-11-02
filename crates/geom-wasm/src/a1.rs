//! Consulta `quadros_e_juncoes` (sub-etapa A1 da fatia A, decisão 0047): quadros de parede, estado e
//! corte de cada extremidade e grupos de um nível, em arrays tipados (codificação descrita em
//! `schema/cena-v2.json`).

use std::collections::BTreeMap;
use std::rc::Rc;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::geo2d::v;
use crate::grupos::agrupar_paredes;
use crate::juncoes::{calcular_pontas, estado_da_ponta, Corte, Estado, LadoMitra};
use crate::quadro::{construir_quadro, ParedeEntrada, Quadro, TipoCalc};

/// Valor de `id_hospedeira` quando a extremidade não é um T.
pub const SEM_HOSPEDEIRA: u32 = 0xFFFF_FFFF;

/// Códigos de `estado_pontas`.
pub const ESTADO_LIVRE: u32 = 0;
pub const ESTADO_PROIBIDA: u32 = 1;
pub const ESTADO_PAR: u32 = 2;
pub const ESTADO_NO: u32 = 3;
pub const ESTADO_TEE: u32 = 4;

/// Códigos de `pontas_cab`.
pub const CORTE_RETO: u32 = 0;
pub const CORTE_ESQUADRIA: u32 = 1;
pub const CORTE_DEGRAUS: u32 = 2;
pub const CORTE_PLANO: u32 = 3;

/// Quadros do nível, na ordem de `levelFrames` (por `(ordem, id)`).
pub fn quadros_do_nivel(cena: &Cena, nivel: u32) -> Result<Vec<Quadro>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    let mut tipos: BTreeMap<u32, Rc<TipoCalc>> = BTreeMap::new();
    let mut entradas: Vec<ParedeEntrada> = Vec::new();
    for p in cena.paredes.do_nivel(nivel) {
        let q = cena.a1.quadros.get(&p.id).ok_or(ENTRADA)?;
        let tipo = match tipos.get(&q.tipo) {
            Some(t) => Rc::clone(t),
            None => {
                let camadas = cena.a1.camadas_do_tipo(q.tipo)?;
                let t = Rc::new(TipoCalc::novo(&camadas.iter().map(|c| (c.espessura, c.funcao, c.prioridade)).collect::<Vec<_>>()));
                tipos.insert(q.tipo, Rc::clone(&t));
                t
            }
        };
        entradas.push(ParedeEntrada {
            id: p.id,
            a: v(p.ax, p.ay),
            b: v(p.bx, p.by),
            ordem: q.ordem,
            tipo,
            linha_loc: q.linha_loc,
            invertida: q.invertida,
            sag: q.sag,
            sem_junta: q.sem_junta,
            junta: q.junta,
            z0: q.z0,
            topo: q.topo,
        });
    }
    // `wallsOnLevel` ordena por `order` (estável): empate fica na ordem de id.
    entradas.sort_by(|a, b| a.ordem.partial_cmp(&b.ordem).unwrap_or(std::cmp::Ordering::Equal));
    Ok(entradas.iter().filter_map(construir_quadro).collect())
}

fn dados_do_lado(m: &LadoMitra, out: &mut Vec<f64>) {
    out.extend([m.wall_id as f64, m.o.x, m.o.y, m.u.x, m.u.y, m.n.x, m.n.y, m.s_hi, m.s_lo, m.sigma, m.outer_to_core, m.core_end]);
    match &m.arc {
        Some(a) => out.extend([1.0, a.center.x, a.center.y, a.radius, a.k]),
        None => out.extend([0.0, 0.0, 0.0, 0.0, 0.0]),
    }
    out.push(m.bounds.len() as f64);
    out.extend(m.bounds.iter().copied());
}

fn dados_do_corte(c: &Corte, out: &mut Vec<f64>) -> u32 {
    match c {
        Corte::Reto(t) => {
            out.push(*t);
            CORTE_RETO
        }
        Corte::Esquadria(a, b) => {
            dados_do_lado(a, out);
            dados_do_lado(b, out);
            CORTE_ESQUADRIA
        }
        Corte::Degraus(runs) => {
            out.push(runs.len() as f64);
            for r in runs {
                out.extend([
                    r.s,
                    r.s1.unwrap_or(f64::NAN),
                    r.t,
                    r.t1.unwrap_or(f64::NAN),
                    r.on.unwrap_or(f64::NAN),
                    r.host.map(|h| h as f64).unwrap_or(-1.0),
                ]);
            }
            CORTE_DEGRAUS
        }
        Corte::Plano { p, q, pts } => {
            out.extend([p.x, p.y, q.x, q.y, pts.len() as f64]);
            for x in pts {
                out.extend([x.x, x.y]);
            }
            CORTE_PLANO
        }
    }
}

/// Executa a consulta `quadros_e_juncoes(nivel_num, tol_juncao)`.
pub fn quadros_e_juncoes(cena: &Cena, nivel: u32, tol: f64) -> Result<Vec<Saida>, u32> {
    let frames = quadros_do_nivel(cena, nivel)?;
    let res = calcular_pontas(&frames, tol);
    let grupos = agrupar_paredes(&frames, &res.pontas);

    let n = frames.len();
    let mut ids = Vec::with_capacity(n);
    let mut quadro = Vec::with_capacity(n * 17);
    let mut arco = Vec::with_capacity(n * 8);
    let mut estado = Vec::with_capacity(n * 8);
    let mut parceiros: Vec<u32> = Vec::new();
    let mut cab = Vec::with_capacity(n * 6);
    let mut dados: Vec<f64> = Vec::new();
    let mut cordas_cab = Vec::with_capacity(n * 2);
    let mut cordas: Vec<f64> = Vec::new();
    for (i, f) in frames.iter().enumerate() {
        ids.push(f.id);
        quadro.extend([
            f.a.x, f.a.y, f.b.x, f.b.y, f.u.x, f.u.y, f.n.x, f.n.y, f.length, f.sign, f.ext_offset, f.thickness, f.s_ext, f.s_int, f.s_hi,
            f.s_lo, f.s_mid,
        ]);
        match &f.arc {
            Some(a) => arco.extend([1.0, a.center.x, a.center.y, a.radius, a.a0, a.sweep, a.length, a.k]),
            None => arco.extend([0.0; 8]),
        }
        for e in 0..2 {
            let est = estado_da_ponta(&frames, i, e, tol);
            let (tipo, host, lista): (u32, u32, &[(usize, usize)]) = match &est {
                Estado::Livre => (ESTADO_LIVRE, SEM_HOSPEDEIRA, &[]),
                Estado::Proibida => (ESTADO_PROIBIDA, SEM_HOSPEDEIRA, &[]),
                Estado::Par(p) => (ESTADO_PAR, SEM_HOSPEDEIRA, p),
                Estado::No(p) => (ESTADO_NO, SEM_HOSPEDEIRA, p),
                Estado::Tee(h) => (ESTADO_TEE, frames.get(*h).map(|x| x.id).unwrap_or(SEM_HOSPEDEIRA), &[]),
            };
            let ini = (parceiros.len() / 2) as u32;
            for &(pi, pe) in lista {
                parceiros.push(frames.get(pi).map(|x| x.id).unwrap_or(SEM_HOSPEDEIRA));
                parceiros.push(pe as u32);
            }
            estado.extend([tipo, host, ini, lista.len() as u32]);

            let ini_d = dados.len();
            let corte = res.pontas.get(i).map(|p| &p.fim[e]);
            let cod = match corte {
                Some(c) => dados_do_corte(c, &mut dados),
                None => CORTE_RETO,
            };
            cab.extend([cod, ini_d as u32, (dados.len() - ini_d) as u32]);
        }
        let ini_c = (cordas.len() / 5) as u32;
        let lista = res.pontas.get(i).map(|p| p.cordas.as_slice()).unwrap_or(&[]);
        for c in lista {
            cordas.extend([c.s, c.p.x, c.p.y, c.q.x, c.q.y]);
        }
        cordas_cab.extend([ini_c, lista.len() as u32]);
    }
    let mut grupo_de = vec![0u32; n];
    for (gi, g) in grupos.iter().enumerate() {
        for &i in g {
            if let Some(x) = grupo_de.get_mut(i) {
                *x = gi as u32;
            }
        }
    }
    Ok(vec![
        Saida::U32(ids),
        Saida::F64(quadro),
        Saida::F64(arco),
        Saida::U32(estado),
        Saida::U32(parceiros),
        Saida::U32(cab),
        Saida::F64(dados),
        Saida::U32(cordas_cab),
        Saida::F64(cordas),
        Saida::U32(grupo_de),
    ])
}

#[cfg(test)]
pub(crate) mod testes_util {
    use super::*;
    use crate::esquema::{SECAO_CAMADAS, SECAO_PAREDES, SECAO_PAREDES_QUADRO, SECAO_TIPOS_PAREDE};

    /// Uma parede de teste (todos os campos do `Wall` que a A1 lê).
    #[derive(Clone, Debug)]
    pub struct Par {
        pub id: u32,
        pub nivel: u32,
        pub a: (f64, f64),
        pub b: (f64, f64),
        pub tipo: u32,
        pub ordem: f64,
        pub loc: u8,
        pub inv: bool,
        pub sem: [bool; 2],
        pub junta: [(bool, bool); 2],
        pub sag: f64,
        pub z0: f64,
        pub topo: f64,
    }

    impl Par {
        pub fn nova(id: u32, a: (f64, f64), b: (f64, f64)) -> Par {
            Par {
                id,
                nivel: 0,
                a,
                b,
                tipo: 1,
                ordem: id as f64,
                loc: 0,
                inv: false,
                sem: [false; 2],
                junta: [(false, false); 2],
                sag: 0.0,
                z0: 0.0,
                topo: 2.8,
            }
        }
    }

    /// Tipo de teste: `(espessura, funcao, prioridade)` por camada.
    pub type TipoT = (u32, Vec<(f64, u8, Option<f64>)>);

    fn pad(b: &mut Vec<u8>) {
        while b.len() % 8 != 0 {
            b.push(0);
        }
    }
    pub fn c32(v: &[u32]) -> Vec<u8> {
        let mut b: Vec<u8> = v.iter().flat_map(|x| x.to_le_bytes()).collect();
        pad(&mut b);
        b
    }
    pub fn c64(v: &[f64]) -> Vec<u8> {
        let mut b: Vec<u8> = v.iter().flat_map(|x| x.to_le_bytes()).collect();
        pad(&mut b);
        b
    }
    pub fn c8(v: &[u8]) -> Vec<u8> {
        let mut b = v.to_vec();
        pad(&mut b);
        b
    }

    pub fn bytes_paredes(ps: &[Par]) -> Vec<u8> {
        let g = |f: &dyn Fn(&Par) -> f64| -> Vec<f64> { ps.iter().map(f).collect() };
        [
            c32(&ps.iter().map(|p| p.id).collect::<Vec<_>>()),
            c32(&ps.iter().map(|p| p.nivel).collect::<Vec<_>>()),
            c64(&g(&|p| p.a.0)),
            c64(&g(&|p| p.a.1)),
            c64(&g(&|p| p.b.0)),
            c64(&g(&|p| p.b.1)),
            c64(&g(&|_| 0.2)),
        ]
        .concat()
    }

    pub fn bytes_quadros(ps: &[Par]) -> Vec<u8> {
        let u = |f: &dyn Fn(&Par) -> u8| -> Vec<u8> { ps.iter().map(f).collect() };
        [
            c32(&ps.iter().map(|p| p.id).collect::<Vec<_>>()),
            c32(&ps.iter().map(|p| p.tipo).collect::<Vec<_>>()),
            c64(&ps.iter().map(|p| p.ordem).collect::<Vec<_>>()),
            c8(&u(&|p| p.loc)),
            c8(&u(&|p| p.inv as u8)),
            c8(&u(&|p| p.sem[0] as u8)),
            c8(&u(&|p| p.sem[1] as u8)),
            c8(&u(&|p| p.junta[0].0 as u8)),
            c8(&u(&|p| p.junta[0].1 as u8)),
            c8(&u(&|p| p.junta[1].0 as u8)),
            c8(&u(&|p| p.junta[1].1 as u8)),
            c64(&ps.iter().map(|p| p.sag).collect::<Vec<_>>()),
            c64(&ps.iter().map(|p| p.z0).collect::<Vec<_>>()),
            c64(&ps.iter().map(|p| p.topo).collect::<Vec<_>>()),
        ]
        .concat()
    }

    pub fn bytes_tipos(ts: &[TipoT]) -> Vec<u8> {
        [
            c32(&ts.iter().map(|t| t.0).collect::<Vec<_>>()),
            c32(&ts.iter().map(|t| t.1.len() as u32).collect::<Vec<_>>()),
            c8(&ts.iter().map(|_| 0u8).collect::<Vec<_>>()),
            c32(&ts.iter().map(|_| 0u32).collect::<Vec<_>>()),
            c8(&ts.iter().map(|_| 0u8).collect::<Vec<_>>()),
        ]
        .concat()
    }

    /// Linhas de `camadas` de todos os tipos; ids sequenciais.
    pub fn bytes_camadas(ts: &[TipoT]) -> (u32, Vec<u8>) {
        let mut ids = Vec::new();
        let mut tipo = Vec::new();
        let mut ix = Vec::new();
        let mut esp = Vec::new();
        let mut fun = Vec::new();
        let mut tem = Vec::new();
        let mut pri = Vec::new();
        let mut mat = Vec::new();
        for (tn, cs) in ts {
            for (i, (e, f, p)) in cs.iter().enumerate() {
                ids.push(ids.len() as u32 + 1);
                tipo.push(*tn);
                ix.push(i as u32);
                esp.push(*e);
                fun.push(*f);
                tem.push(p.is_some() as u8);
                pri.push(p.unwrap_or(0.0));
                mat.push(*tn * 100 + i as u32);
            }
        }
        let n = ids.len() as u32;
        let env = vec![0u8; ids.len()];
        (n, [c32(&ids), c32(&tipo), c32(&ix), c64(&esp), c8(&fun), c8(&tem), c64(&pri), c32(&mat), c8(&env)].concat())
    }

    /// Tipo padrão dos testes: uma camada de estrutura de 0,2 m.
    pub fn tipo_simples() -> TipoT {
        (1, vec![(0.2, 0, None)])
    }

    pub fn cena_com(ps: &[Par], ts: &[TipoT]) -> Cena {
        let mut c = Cena::novo();
        let n = ps.len() as u32;
        c.definir_secao(SECAO_PAREDES, n, &bytes_paredes(ps)).expect("paredes");
        c.definir_secao(SECAO_PAREDES_QUADRO, n, &bytes_quadros(ps)).expect("quadros");
        c.definir_secao(SECAO_TIPOS_PAREDE, ts.len() as u32, &bytes_tipos(ts)).expect("tipos");
        let (nc, bc) = bytes_camadas(ts);
        c.definir_secao(SECAO_CAMADAS, nc, &bc).expect("camadas");
        c
    }

    pub fn u32s(s: &Saida) -> &[u32] {
        match s {
            Saida::U32(v) => v,
            Saida::F64(_) => &[],
        }
    }
    pub fn f64s(s: &Saida) -> &[f64] {
        match s {
            Saida::F64(v) => v,
            Saida::U32(_) => &[],
        }
    }
}

#[cfg(test)]
mod testes {
    use super::testes_util::*;
    use super::*;
    use crate::esquema::{SECAO_CAMADAS, SECAO_PAREDES_QUADRO, SECAO_TIPOS_PAREDE};
    use crate::grupos::ponto_da_ponta;
    use crate::teste_util::Xorshift;

    fn consulta(c: &Cena, tol: f64) -> Vec<Saida> {
        quadros_e_juncoes(c, 0, tol).expect("consulta")
    }

    fn perto(p: crate::geo2d::V, x: f64, y: f64) -> bool {
        (p.x - x).abs() < 1e-9 && (p.y - y).abs() < 1e-9
    }

    #[test]
    fn canto_em_l_com_esquadria() {
        let mut a = Par::nova(1, (0.0, 0.0), (4.0, 0.0));
        let mut b = Par::nova(2, (4.0, 0.0), (4.0, 4.0));
        a.junta = [(true, false); 2];
        b.junta = [(true, false); 2];
        let c = cena_com(&[a, b], &[tipo_simples()]);
        let frames = quadros_do_nivel(&c, 0).expect("quadros");
        let res = calcular_pontas(&frames, 0.02);
        // A termina em b: face externa (s = -0.1) no canto externo, face interna (s = +0.1) no canto interno.
        assert!(matches!(res.pontas[0].fim[1], Corte::Esquadria(..)));
        assert!(perto(ponto_da_ponta(&frames[0], 1, &res.pontas[0].fim[1], -0.1), 4.1, -0.1));
        assert!(perto(ponto_da_ponta(&frames[0], 1, &res.pontas[0].fim[1], 0.1), 3.9, 0.1));
        // B começa em a: as mesmas duas pontas, vistas da outra parede.
        assert!(matches!(res.pontas[1].fim[0], Corte::Esquadria(..)));
        assert!(perto(ponto_da_ponta(&frames[1], 0, &res.pontas[1].fim[0], 0.1), 3.9, 0.1));
        // Extremidades livres continuam retas.
        assert_eq!(res.pontas[0].fim[0], Corte::Reto(0.0));
        assert_eq!(res.pontas[1].fim[1], Corte::Reto(4.0));
        // Estados e grupo
        assert_eq!(estado_da_ponta(&frames, 0, 1, 0.02), Estado::Par(vec![(1, 0)]));
        assert_eq!(estado_da_ponta(&frames, 0, 0, 0.02), Estado::Livre);
        let s = consulta(&c, 0.02);
        assert_eq!(u32s(&s[9]), &[0, 0]);
    }

    #[test]
    fn tee_encosta_na_face_da_hospedeira() {
        let host = Par::nova(1, (0.0, 0.0), (6.0, 0.0));
        let ramal = Par::nova(2, (3.0, 3.0), (3.0, 0.0));
        let c = cena_com(&[host, ramal], &[tipo_simples()]);
        let s = consulta(&c, 0.02);
        let est = u32s(&s[3]);
        // ramal (índice 1), ponta b (e = 1): tee com a hospedeira id 1
        assert_eq!(&est[8 + 4..8 + 8], &[ESTADO_TEE, 1, 0, 0]);
        let frames = quadros_do_nivel(&c, 0).expect("quadros");
        let res = calcular_pontas(&frames, 0.02);
        match &res.pontas[1].fim[1] {
            Corte::Degraus(runs) => {
                assert_eq!(runs.len(), 1);
                // ramal de 3 m termina na face da hospedeira: t = 3 - 0,1
                assert!((runs[0].t - 2.9).abs() < 1e-12, "t = {}", runs[0].t);
                assert_eq!(runs[0].host, Some(1));
            }
            outro => panic!("esperava degraus, veio {outro:?}"),
        }
    }

    #[test]
    fn continuacao_colinear_mantem_corte_reto() {
        let a = Par::nova(1, (0.0, 0.0), (3.0, 0.0));
        let b = Par::nova(2, (3.0, 0.0), (6.0, 0.0));
        let c = cena_com(&[a, b], &[tipo_simples()]);
        let frames = quadros_do_nivel(&c, 0).expect("quadros");
        let res = calcular_pontas(&frames, 0.02);
        assert_eq!(res.pontas[0].fim[1], Corte::Reto(3.0));
        assert_eq!(res.pontas[1].fim[0], Corte::Reto(0.0));
        assert_eq!(estado_da_ponta(&frames, 0, 1, 0.02), Estado::Par(vec![(1, 0)]));
    }

    #[test]
    fn sem_junta_vira_proibida_e_nao_une() {
        let mut a = Par::nova(1, (0.0, 0.0), (4.0, 0.0));
        a.sem = [false, true];
        let b = Par::nova(2, (4.0, 0.0), (4.0, 4.0));
        let c = cena_com(&[a, b], &[tipo_simples()]);
        let s = consulta(&c, 0.02);
        let est = u32s(&s[3]);
        assert_eq!(est[4], ESTADO_PROIBIDA);
        // a ponta a de B não tem parceiro (a ponta de A está fora das refs), mas cai no corpo de A: tee
        assert_eq!(est[8], ESTADO_TEE);
    }

    #[test]
    fn grupos_por_caixas_sobrepostas() {
        let longe = Par::nova(1, (0.0, 0.0), (2.0, 0.0));
        let perto_ = Par::nova(2, (2.0, 0.0), (2.0, 2.0));
        let isolada = Par::nova(3, (20.0, 20.0), (22.0, 20.0));
        let c = cena_com(&[longe, perto_, isolada], &[tipo_simples()]);
        let s = consulta(&c, 0.02);
        assert_eq!(u32s(&s[9]), &[0, 0, 1]);
    }

    #[test]
    fn ordem_do_nivel_vem_de_ordem_e_depois_de_id() {
        let mut a = Par::nova(10, (0.0, 0.0), (2.0, 0.0));
        let mut b = Par::nova(5, (0.0, 5.0), (2.0, 5.0));
        let mut c3 = Par::nova(7, (0.0, 9.0), (2.0, 9.0));
        a.ordem = 1.0;
        b.ordem = 1.0; // empate com `a`: id 5 vem antes de 10
        c3.ordem = 0.0;
        let c = cena_com(&[a, b, c3], &[tipo_simples()]);
        let s = consulta(&c, 0.02);
        assert_eq!(u32s(&s[0]), &[7, 5, 10]);
    }

    #[test]
    fn corda_curta_nao_gera_quadro() {
        let a = Par::nova(1, (0.0, 0.0), (0.00005, 0.0));
        let b = Par::nova(2, (0.0, 1.0), (3.0, 1.0));
        let c = cena_com(&[a, b], &[tipo_simples()]);
        let s = consulta(&c, 0.02);
        assert_eq!(u32s(&s[0]), &[2]);
    }

    #[test]
    fn parede_curva_tem_arco_no_quadro() {
        let mut a = Par::nova(1, (0.0, 0.0), (2.0, 0.0));
        a.sag = 1.0;
        let c = cena_com(&[a], &[tipo_simples()]);
        let s = consulta(&c, 0.02);
        let arco = f64s(&s[2]);
        assert_eq!(arco[0], 1.0);
        assert!((arco[3] - 1.0).abs() < 1e-12, "raio");
        assert!((f64s(&s[1])[8] - std::f64::consts::PI).abs() < 1e-12, "comprimento do arco");
    }

    #[test]
    fn niveis_diferentes_nao_se_misturam() {
        let a = Par::nova(1, (0.0, 0.0), (4.0, 0.0));
        let mut b = Par::nova(2, (4.0, 0.0), (4.0, 4.0));
        b.nivel = 1;
        let c = cena_com(&[a, b], &[tipo_simples()]);
        assert_eq!(u32s(&quadros_e_juncoes(&c, 0, 0.02).expect("n0")[0]), &[1]);
        assert_eq!(u32s(&quadros_e_juncoes(&c, 1, 0.02).expect("n1")[0]), &[2]);
        assert_eq!(quadros_e_juncoes(&c, NIVEL_TODOS, 0.02).err(), Some(ENTRADA));
        assert!(u32s(&quadros_e_juncoes(&c, 9, 0.02).expect("vazio")[0]).is_empty());
    }

    #[test]
    fn altura_separa_paredes_que_nao_se_encontram() {
        let a = Par::nova(1, (0.0, 0.0), (4.0, 0.0));
        let mut b = Par::nova(2, (4.0, 0.0), (4.0, 4.0));
        b.z0 = 2.8; // começa onde A termina: não se encontram em altura
        b.topo = 3.5;
        let c = cena_com(&[a, b], &[tipo_simples()]);
        let frames = quadros_do_nivel(&c, 0).expect("quadros");
        assert_eq!(estado_da_ponta(&frames, 0, 1, 0.02), Estado::Livre);
    }

    #[test]
    fn validacoes_de_entrada() {
        let ps = [Par::nova(1, (0.0, 0.0), (4.0, 0.0))];
        // sem linha em paredes_quadro
        let mut c = cena_com(&ps, &[tipo_simples()]);
        c.remover(SECAO_PAREDES_QUADRO, &[1]).expect("remover");
        assert_eq!(quadros_e_juncoes(&c, 0, 0.02).err(), Some(ENTRADA));
        // tipo inexistente
        let mut c = cena_com(&ps, &[tipo_simples()]);
        c.remover(SECAO_TIPOS_PAREDE, &[1]).expect("remover");
        assert_eq!(quadros_e_juncoes(&c, 0, 0.02).err(), Some(ENTRADA));
        // n_camadas incoerente
        let mut c = cena_com(&ps, &[tipo_simples()]);
        let (_, bc) = bytes_camadas(&[tipo_simples()]);
        c.remover(SECAO_CAMADAS, &[1]).expect("remover");
        assert_eq!(quadros_e_juncoes(&c, 0, 0.02).err(), Some(ENTRADA));
        // reinserir a camada corrige
        c.upsert(SECAO_CAMADAS, 1, &bc).expect("upsert");
        assert!(quadros_e_juncoes(&c, 0, 0.02).is_ok());
        // índice de camada fora de 0..n
        let ruim = [c32(&[1]), c32(&[1]), c32(&[3]), c64(&[0.2]), c8(&[0]), c8(&[0]), c64(&[0.0]), c32(&[1]), c8(&[0])].concat();
        c.upsert(SECAO_CAMADAS, 1, &ruim).expect("upsert");
        assert_eq!(quadros_e_juncoes(&c, 0, 0.02).err(), Some(ENTRADA));
        // enums e flags fora do domínio, não finitos e chave duplicada
        let mut m = Cena::novo();
        let mut p = Par::nova(1, (0.0, 0.0), (1.0, 0.0));
        p.loc = 6;
        assert_eq!(m.definir_secao(SECAO_PAREDES_QUADRO, 1, &bytes_quadros(&[p])), Err(ENTRADA));
        let mut p = Par::nova(1, (0.0, 0.0), (1.0, 0.0));
        p.sag = f64::NAN;
        assert_eq!(m.definir_secao(SECAO_PAREDES_QUADRO, 1, &bytes_quadros(&[p])), Err(ENTRADA));
        let p = Par::nova(1, (0.0, 0.0), (1.0, 0.0));
        assert_eq!(m.definir_secao(SECAO_PAREDES_QUADRO, 2, &bytes_quadros(&[p.clone(), p])), Err(ENTRADA));
        let mut raw = bytes_quadros(&[Par::nova(1, (0.0, 0.0), (1.0, 0.0))]);
        // 2ª coluna u8 (invertida) = 2
        let off_invertida = 8 + 8 + 8 + 8;
        raw[off_invertida] = 2;
        assert_eq!(m.definir_secao(SECAO_PAREDES_QUADRO, 1, &raw), Err(ENTRADA));
        let ruim_camada = [c32(&[1]), c32(&[1]), c32(&[0]), c64(&[-0.1]), c8(&[0]), c8(&[0]), c64(&[0.0]), c32(&[1]), c8(&[0])].concat();
        assert_eq!(m.definir_secao(SECAO_CAMADAS, 1, &ruim_camada), Err(ENTRADA));
        let ruim_funcao = [c32(&[1]), c32(&[1]), c32(&[0]), c64(&[0.1]), c8(&[6]), c8(&[0]), c64(&[0.0]), c32(&[1]), c8(&[0])].concat();
        assert_eq!(m.definir_secao(SECAO_CAMADAS, 1, &ruim_funcao), Err(ENTRADA));
        // falha não altera a cena (atômico)
        assert_eq!(m.a1.quadros.len(), 0);
    }

    #[test]
    fn argumentos_da_consulta_sao_validados() {
        let c0 = cena_com(&[Par::nova(1, (0.0, 0.0), (4.0, 0.0))], &[tipo_simples()]);
        let mut c = c0;
        use crate::esquema::CONSULTA_QUADROS_E_JUNCOES as Q;
        assert!(crate::consultas::executar(&mut c, Q, &[0.0, 0.02]).is_ok());
        assert_eq!(crate::consultas::executar(&mut c, Q, &[0.0]).err(), Some(ENTRADA));
        assert_eq!(crate::consultas::executar(&mut c, Q, &[0.0, -1.0]).err(), Some(ENTRADA));
        assert_eq!(crate::consultas::executar(&mut c, Q, &[0.0, f64::NAN]).err(), Some(ENTRADA));
        assert_eq!(crate::consultas::executar(&mut c, Q, &[0.5, 0.02]).err(), Some(ENTRADA));
        assert_eq!(crate::consultas::executar(&mut c, Q, &[f64::INFINITY, 0.02]).err(), Some(ENTRADA));
    }

    fn cena_aleatoria(sem: u64, n: usize, escala: f64, degenerado: bool) -> (Vec<Par>, Vec<TipoT>) {
        let mut r = Xorshift::novo(sem);
        let ts: Vec<TipoT> = vec![
            (1, vec![(0.2, 0, None)]),
            (2, vec![(0.01, 4, None), (0.12, 0, None), (0.03, 1, Some(1.0)), (0.005, 5, None)]),
            (3, vec![(0.02, 4, None), (0.06, 2, None), (0.02, 5, None)]),
            (4, vec![(0.002, 5, None), (0.0, 3, None), (0.2, 0, None)]),
            (5, vec![]),
        ];
        let passos: [(f64, f64); 8] = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0), (1.0, 1.0), (1.0, -1.0), (2.0, 1.0), (-1.0, 2.0)];
        let mut ps = Vec::new();
        for i in 0..n {
            let gx = (r.intervalo(0.0, 8.0)).floor();
            let gy = (r.intervalo(0.0, 8.0)).floor();
            let (dx, dy) = passos[(r.intervalo(0.0, 8.0)) as usize % 8];
            let k = 1.0 + (r.intervalo(0.0, 3.0)).floor();
            let mut p = Par::nova(i as u32 + 1, (gx * escala, gy * escala), ((gx + dx * k) * escala, (gy + dy * k) * escala));
            p.tipo = 1 + (r.intervalo(0.0, 5.0)) as u32 % if degenerado { 5 } else { 4 };
            p.loc = (r.intervalo(0.0, 6.0)) as u8 % 6;
            p.inv = r.intervalo(0.0, 1.0) < 0.2;
            p.sem = [r.intervalo(0.0, 1.0) < 0.05, r.intervalo(0.0, 1.0) < 0.05];
            p.junta = [(r.intervalo(0.0, 1.0) < 0.4, r.intervalo(0.0, 1.0) < 0.25), (r.intervalo(0.0, 1.0) < 0.4, r.intervalo(0.0, 1.0) < 0.25)];
            p.sag = if r.intervalo(0.0, 1.0) < 0.15 { r.intervalo(-1.5, 1.5) } else { 0.0 };
            if degenerado && r.intervalo(0.0, 1.0) < 0.1 {
                p.b = p.a; // corda zero
            }
            if degenerado && r.intervalo(0.0, 1.0) < 0.05 {
                p.sag = 1e9; // flecha absurda
            }
            if r.intervalo(0.0, 1.0) < 0.1 {
                p.z0 = 2.0;
                p.topo = 2.5;
            }
            p.ordem = (r.intervalo(0.0, 4.0)).floor();
            ps.push(p);
        }
        (ps, ts)
    }

    fn assinatura(s: &[Saida]) -> Vec<Vec<u64>> {
        s.iter()
            .map(|x| match x {
                Saida::U32(v) => v.iter().map(|&a| a as u64).collect(),
                Saida::F64(v) => v.iter().map(|a| a.to_bits()).collect(),
            })
            .collect()
    }

    /// Propriedade: nunca entra em pânico (inclusive com entrada degenerada) e as saídas são coerentes.
    #[test]
    fn propriedade_saidas_coerentes_e_sem_panico() {
        for sem in 1..=60u64 {
            let (ps, ts) = cena_aleatoria(sem, 40, 1.5, sem % 3 == 0);
            let c = cena_com(&ps, &ts);
            let s = quadros_e_juncoes(&c, 0, 0.02).expect("consulta");
            assert_eq!(s.len(), 10);
            let ids = u32s(&s[0]);
            let n = ids.len();
            assert_eq!(f64s(&s[1]).len(), 17 * n);
            assert_eq!(f64s(&s[2]).len(), 8 * n);
            assert_eq!(u32s(&s[3]).len(), 8 * n);
            assert_eq!(u32s(&s[5]).len(), 6 * n);
            assert_eq!(u32s(&s[7]).len(), 2 * n);
            assert_eq!(u32s(&s[9]).len(), n);
            // grupos numerados pela primeira parede: não decrescem o primeiro aparecimento
            let mut max_visto: i64 = -1;
            for &g in u32s(&s[9]) {
                assert!(g as i64 <= max_visto + 1, "grupo {g} antes de {}", max_visto + 1);
                max_visto = max_visto.max(g as i64);
            }
            // parceiros e hospedeiras apontam para paredes do nível
            let est = u32s(&s[3]);
            let parc = u32s(&s[4]);
            for e in est.chunks(4) {
                if e[0] == ESTADO_TEE {
                    assert!(ids.contains(&e[1]));
                } else {
                    assert_eq!(e[1], SEM_HOSPEDEIRA);
                }
                for k in 0..e[3] as usize {
                    assert!(ids.contains(&parc[(e[2] as usize + k) * 2]));
                }
            }
            // os cabeçalhos de corte cobrem exatamente o pool de dados
            let cab = u32s(&s[5]);
            let mut fim = 0usize;
            for c3 in cab.chunks(3) {
                assert_eq!(c3[1] as usize, fim);
                fim += c3[2] as usize;
            }
            assert_eq!(fim, f64s(&s[6]).len());
            // ids em ordem (ordem, id) e todos finitos nos quadros
            assert!(f64s(&s[1]).iter().all(|v| v.is_finite()));
        }
    }

    /// Propriedade: a ordem das linhas na entrada não muda nada (a ordem canônica vem das chaves).
    #[test]
    fn propriedade_independe_da_ordem_das_linhas() {
        for sem in 1..=20u64 {
            let (ps, ts) = cena_aleatoria(sem, 30, 1.5, false);
            let a = assinatura(&consulta(&cena_com(&ps, &ts), 0.02));
            let mut rev = ps.clone();
            rev.reverse();
            let mut r = Xorshift::novo(sem + 1000);
            let n = rev.len();
            for i in (1..n).rev() {
                let j = (r.intervalo(0.0, (i + 1) as f64)) as usize % (i + 1);
                rev.swap(i, j);
            }
            let b = assinatura(&consulta(&cena_com(&rev, &ts), 0.02));
            assert_eq!(a, b, "semente {sem}");
        }
    }

    /// Propriedade: translação por múltiplo exato da grade preserva a topologia (estados, cortes, grupos).
    #[test]
    fn propriedade_translacao_preserva_topologia() {
        for sem in 1..=20u64 {
            let (ps, ts) = cena_aleatoria(sem, 30, 1.5, false);
            let mut movidas = ps.clone();
            for p in &mut movidas {
                p.a = (p.a.0 + 96.0, p.a.1 - 48.0);
                p.b = (p.b.0 + 96.0, p.b.1 - 48.0);
            }
            let a = consulta(&cena_com(&ps, &ts), 0.02);
            let b = consulta(&cena_com(&movidas, &ts), 0.02);
            for i in [0usize, 3, 4, 5, 7, 9] {
                assert_eq!(u32s(&a[i]), u32s(&b[i]), "semente {sem}, saída {i}");
            }
            // comprimentos e medidas do quadro (não dependem da posição) iguais a 1 µm
            for (k, (x, y)) in f64s(&a[1]).iter().zip(f64s(&b[1])).enumerate() {
                if k % 17 < 4 {
                    continue; // a e b mudam de lugar
                }
                assert!((x - y).abs() < 1e-6, "semente {sem}, quadro[{k}]: {x} x {y}");
            }
        }
    }

    #[test]
    fn determinismo_byte_a_byte() {
        let (ps, ts) = cena_aleatoria(5, 40, 1.5, false);
        let a = assinatura(&consulta(&cena_com(&ps, &ts), 0.02));
        let b = assinatura(&consulta(&cena_com(&ps, &ts), 0.02));
        assert_eq!(a, b);
    }

    /// Propriedade: refazer a consulta depois de upsert idêntico dá o mesmo resultado, e a remoção
    /// da parede a tira da saída.
    #[test]
    fn propriedade_upsert_e_remocao() {
        let (ps, ts) = cena_aleatoria(9, 30, 1.5, false);
        let mut c = cena_com(&ps, &ts);
        let antes = assinatura(&consulta(&c, 0.02));
        c.upsert(crate::esquema::SECAO_PAREDES_QUADRO, ps.len() as u32, &bytes_quadros(&ps)).expect("upsert");
        assert_eq!(antes, assinatura(&consulta(&c, 0.02)));
        let ids_antes = u32s(&consulta(&c, 0.02)[0]).to_vec();
        let alvo = ps.first().map(|p| p.id).unwrap_or(0);
        c.remover(crate::esquema::SECAO_PAREDES, &[alvo]).expect("remover");
        let ids_depois = u32s(&consulta(&c, 0.02)[0]).to_vec();
        assert_eq!(ids_depois.len() + usize::from(ids_antes.contains(&alvo)), ids_antes.len());
        assert!(!ids_depois.contains(&alvo));
    }
}
