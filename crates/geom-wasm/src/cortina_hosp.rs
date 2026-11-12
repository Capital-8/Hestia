//! Cortina embutida numa parede comum (decisão 0056, fase 5; ADR §8; seção 113 `cortina_hospedes` e consulta `cortina_recorte_hospedeiro`, id 106).
//!
//! O vão da cortina recorta o hospedeiro em TODAS as camadas, como uma abertura sem esquadria e sem retorno de acabamento (`wrapInserts` não volta na
//! cortina: ela é um sistema fechado, ADR §8.2). O recorte é derivado a cada resolução, nunca gravado: o resolvedor de camadas das paredes (`a3c`) soma
//! este vão aos das aberturas do grupo (`vaos_dos_hospedes`); paredes sem linha na seção 113 não mudam. O vão é limitado ao hospedeiro (as pontas e o topo).
//!
//! Colisões (§8.2): uma abertura do mesmo hospedeiro cujo retângulo `[t, z]` cruza o da cortina é uma colisão; parcial quando sobra parte dela fora do
//! recorte, total quando a cortina a cobre por inteiro (o comando do modelo recusa a total). O TS compara só `t`; aqui compara `t` e `z`, como diz o ADR.
//!
//! Cortina embutida em hospedeiro curvo não é suportada (§8.1): sem recorte e com o bit 3 do diagnóstico.

use crate::a1::quadros_do_nivel;
use crate::a3::{aberturas_do_nivel, retangulo_orientado};
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::cortina_tipos::na_grade;
use crate::esquema::ENTRADA;
use crate::quadro::{ponto_em, Quadro};
use crate::secoes_cortina::HospedeLinha;
use crate::MultiPoligono;

/// Folga do furo além das faces (m): a mesma de uma abertura (`CUT_MARGIN`).
const FOLGA_DO_FURO: f64 = 0.02;
const EPS: f64 = 1e-9;
/// Bit alto do id de um vão de cortina embutida no resolvedor de camadas (não colide com ids de aberturas, que cabem em 31 bits).
pub const BIT_HOSPEDE: u32 = 0x8000_0000;

/// Bits de `recortes[2]` (`diag`).
pub const DIAG_FORA: u32 = 1;
pub const DIAG_COLIDE_EM_PARTE: u32 = 2;
pub const DIAG_COBRE_ABERTURA: u32 = 4;
pub const DIAG_HOSPEDEIRO_CURVO: u32 = 8;

/// O retângulo do vão no referencial do hospedeiro: `t` ao longo de a para b, `z` acima da base do hospedeiro. Já limitado ao hospedeiro; `fora` diz se
/// foi preciso limitar.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VaoNoHospedeiro {
    pub t0: f64,
    pub t1: f64,
    pub z0: f64,
    pub z1: f64,
    pub fora: bool,
}

/// O vão limitado ao hospedeiro de comprimento `comprimento` e altura `altura`.
pub fn limitar(h: &HospedeLinha, comprimento: f64, altura: f64) -> VaoNoHospedeiro {
    let (a0, a1) = (h.deslocamento - h.largura / 2.0, h.deslocamento + h.largura / 2.0);
    let (b0, b1) = (h.peitoril, h.peitoril + h.altura);
    let (t0, t1) = (a0.max(0.0), a1.min(comprimento));
    let (z0, z1) = (b0.max(0.0), b1.min(altura));
    let fora = a0 < -EPS || a1 > comprimento + EPS || b0 < -EPS || b1 > altura + EPS;
    VaoNoHospedeiro { t0, t1: t1.max(t0), z0, z1: z1.max(z0), fora }
}

/// Vão de cada cortina embutida num hospedeiro do grupo, no formato do resolvedor de camadas: o retângulo em planta (atravessa toda a espessura) e a faixa
/// de cotas relativas à base do hospedeiro. `(id, parede, peitoril, altura, retangulo)`.
pub fn vaos_dos_hospedes(cena: &Cena, quadros: &[&Quadro]) -> Vec<(u32, u32, f64, f64, MultiPoligono)> {
    let mut out = Vec::new();
    for (&k, h) in &cena.cortina.hospedes {
        let Some(q) = quadros.iter().find(|q| q.id == h.hospedeiro) else { continue };
        let Some(z) = cena.parede_z(q.id) else { continue };
        if q.arc.is_some() {
            continue;
        }
        let v = limitar(h, q.length, z.altura);
        if v.t1 - v.t0 <= EPS || v.z1 - v.z0 <= EPS {
            continue;
        }
        let centro = ponto_em(q, (v.t0 + v.t1) / 2.0, q.s_mid);
        let poli = vec![vec![retangulo_orientado(centro, q.u, (v.t1 - v.t0) / 2.0, q.thickness / 2.0 + FOLGA_DO_FURO)]];
        out.push((BIT_HOSPEDE | k, q.id, v.z0, v.z1 - v.z0, poli));
    }
    out
}

/// Consulta `cortina_recorte_hospedeiro`: ver o JSON do contrato.
pub fn consulta_cortina_recorte_hospedeiro(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let quadros = quadros_do_nivel(cena, nivel)?; // `NIVEL_TODOS` é ENTRADA
    let aberturas = if cena.cortina.hospedes.is_empty() { Vec::new() } else { aberturas_do_nivel(cena, nivel)? };
    let (mut recortes, mut retangulos, mut colisoes, mut colisoes_ret) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut linhas: Vec<(u32, u32, &HospedeLinha)> = cena.cortina.hospedes.iter().map(|(&k, h)| (h.cortina, k, h)).collect();
    linhas.sort_by_key(|x| (x.0, x.1));
    for (_, _, h) in linhas {
        let Some(q) = quadros.iter().find(|q| q.id == h.hospedeiro) else { continue };
        if q.arc.is_some() {
            recortes.extend_from_slice(&[h.cortina, h.hospedeiro, DIAG_HOSPEDEIRO_CURVO, 0]);
            retangulos.extend_from_slice(&[0.0; 4]);
            continue;
        }
        let altura = cena.parede_z(q.id).ok_or(ENTRADA)?.altura;
        let v = limitar(h, q.length, altura);
        let mut diag = if v.fora { DIAG_FORA } else { 0 };
        let mut n = 0u32;
        let mut deste: Vec<(u32, u32, [f64; 4])> = Vec::new();
        for (id, a, t, g) in &aberturas {
            if a.parede != q.id {
                continue;
            }
            let _ = t;
            let (o0, o1) = (g.deslocamento - g.largura / 2.0, g.deslocamento + g.largura / 2.0);
            let (p0, p1) = (g.peitoril, g.peitoril + g.altura);
            let (i0, i1, j0, j1) = (o0.max(v.t0), o1.min(v.t1), p0.max(v.z0), p1.min(v.z1));
            if i1 - i0 <= EPS || j1 - j0 <= EPS {
                continue;
            }
            let total = o0 >= v.t0 - 1e-6 && o1 <= v.t1 + 1e-6 && p0 >= v.z0 - 1e-6 && p1 <= v.z1 + 1e-6;
            diag |= if total { DIAG_COBRE_ABERTURA } else { DIAG_COLIDE_EM_PARTE };
            deste.push((*id, u32::from(total), [i0, i1, j0, j1]));
            n += 1;
        }
        recortes.extend_from_slice(&[h.cortina, h.hospedeiro, diag, n]);
        retangulos.extend_from_slice(&[na_grade(v.t0), na_grade(v.t1), na_grade(v.z0), na_grade(v.z1)]);
        deste.sort_by_key(|x| x.0);
        for (id, total, r) in deste {
            colisoes.extend_from_slice(&[h.cortina, id, total]);
            colisoes_ret.extend(r.iter().map(|&x| na_grade(x)));
        }
    }
    Ok(vec![Saida::U32(recortes), Saida::F64(retangulos), Saida::U32(colisoes), Saida::F64(colisoes_ret)])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::a1::testes_util::{c32, c64, c8, cena_com, f64s, tipo_simples, u32s, Par};
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_CLUSTER_RESOLVIDO, CONSULTA_CORTINA_RECORTE_HOSPEDEIRO as Q, SECAO_ABERTURAS, SECAO_PAREDES_Z, SECAO_TIPOS_ABERTURA};
    use crate::pintor::area_da_forma;

    /// Parede 1 de (0,0) a (6,0), 0,2 m de espessura (tipo simples), de 0 a 2,8 m, com uma cortina embutida (id 1): centro em 3, 2 m de largura, peitoril 0,1,
    /// altura 2,0, isto é, o retângulo `t` de 2 a 4 e `z` de 0,1 a 2,1.
    fn cena(h: HospedeLinha) -> Cena {
        let mut c = cena_com(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[tipo_simples()]);
        c.definir_secao(SECAO_PAREDES_Z, 1, &[c32(&[1]), c64(&[0.0]), c64(&[2.8])].concat()).expect("paredes_z");
        c.cortina.hospedes.insert(1, h);
        c
    }

    fn hosp(deslocamento: f64, largura: f64) -> HospedeLinha {
        HospedeLinha { cortina: 1, hospedeiro: 1, deslocamento, largura, peitoril: 0.1, altura: 2.0 }
    }

    /// Abertura de teste no hospedeiro 1 (tipo 1 e abertura `id`).
    fn com_abertura(c: &mut Cena, id: u32, desloc: f64, largura: f64, altura: f64, peitoril: f64, janela: bool) {
        let tipo = [
            c32(&[1]),
            c64(&[largura]),
            c64(&[altura]),
            c64(&[peitoril]),
            c64(&[0.0]),
            c64(&[0.0]),
            c8(&[1]),
            c8(&[0]),
            c8(&[u8::from(janela)]),
            c8(&[4]),
            c8(&[0]),
            c8(&[0]),
            c8(&[0]),
            c64(&[0.09]),
            c64(&[0.04]),
            c64(&[0.035]),
        ]
        .concat();
        c.definir_secao(SECAO_TIPOS_ABERTURA, 1, &tipo).expect("tipos_abertura");
        let ab = [c32(&[id]), c32(&[1]), c32(&[1]), c8(&[u8::from(janela)]), c64(&[desloc]), c8(&[0]), c8(&[0]), c8(&[1]), c64(&[peitoril]), c8(&[0]), c64(&[0.0])].concat();
        c.definir_secao(SECAO_ABERTURAS, 1, &ab).expect("aberturas");
    }

    fn consulta(c: &mut Cena) -> (Vec<u32>, Vec<f64>, Vec<u32>, Vec<f64>) {
        let s = executar(c, Q, &[0.0]).expect("106");
        (u32s(&s[0]).to_vec(), f64s(&s[1]).to_vec(), u32s(&s[2]).to_vec(), f64s(&s[3]).to_vec())
    }

    #[test]
    fn recorte_e_o_retangulo_do_vao_no_referencial_do_hospedeiro() {
        let (r, ret, col, _) = consulta(&mut cena(hosp(3.0, 2.0)));
        // [cortina, hospedeiro, diag, n_colisoes]; t de 2 a 4, z de 0,1 a 2,1 (peitoril 0,1 e altura 2,0).
        assert_eq!(r, vec![1, 1, 0, 0]);
        assert_eq!(ret, vec![2.0, 4.0, 0.1, 2.1]);
        assert!(col.is_empty());
    }

    #[test]
    fn vao_que_passa_das_pontas_ou_do_topo_e_limitado_e_marca_o_diagnostico() {
        // Centro em 5,5 e 2 m de largura: de 4,5 a 6,5, limitado a 6 (o hospedeiro tem 6 m).
        let (r, ret, _, _) = consulta(&mut cena(hosp(5.5, 2.0)));
        assert_eq!(r[2], DIAG_FORA);
        assert_eq!(ret, vec![4.5, 6.0, 0.1, 2.1]);
        // Altura que passa do topo (2,8): de 0,1 a 3,1, limitada a 2,8.
        let (r, ret, _, _) = consulta(&mut cena(HospedeLinha { altura: 3.0, ..hosp(3.0, 2.0) }));
        assert_eq!(r[2], DIAG_FORA);
        assert_eq!(ret, vec![2.0, 4.0, 0.1, 2.8]);
    }

    #[test]
    fn colisao_parcial_com_uma_abertura_do_hospedeiro() {
        // Porta de 0,8 x 2,1 centrada em 2,2 (t de 1,8 a 2,6, z de 0 a 2,1): cruza o vão em t de 2 a 2,6 e z de 0,1 a 2,1; sobra parte fora.
        let mut c = cena(hosp(3.0, 2.0));
        com_abertura(&mut c, 7, 2.2, 0.8, 2.1, 0.0, false);
        let (r, _, col, colret) = consulta(&mut c);
        assert_eq!(r, vec![1, 1, DIAG_COLIDE_EM_PARTE, 1]);
        assert_eq!(col, vec![1, 7, 0]);
        assert_eq!(colret, vec![2.0, 2.6, 0.1, 2.1]);
    }

    #[test]
    fn cobrir_uma_abertura_por_inteiro_marca_o_bit_de_bloqueio() {
        // Janela de 1,0 x 1,0 com peitoril 0,5 centrada em 3: t de 2,5 a 3,5, z de 0,5 a 1,5: dentro do vão inteira.
        let mut c = cena(hosp(3.0, 2.0));
        com_abertura(&mut c, 8, 3.0, 1.0, 1.0, 0.5, true);
        let (r, _, col, colret) = consulta(&mut c);
        assert_eq!(r, vec![1, 1, DIAG_COBRE_ABERTURA, 1]);
        assert_eq!(col, vec![1, 8, 1]);
        assert_eq!(colret, vec![2.5, 3.5, 0.5, 1.5]);
        // Uma abertura fora do vão em t (de 4,6 a 5,4) não colide.
        let mut c = cena(hosp(3.0, 2.0));
        com_abertura(&mut c, 9, 5.0, 0.8, 2.1, 0.0, false);
        let (r, _, col, _) = consulta(&mut c);
        assert_eq!((r[2], r[3], col.len()), (0, 0, 0));
    }

    #[test]
    fn hospedeiro_de_outro_nivel_ou_ausente_nao_sai_e_o_nivel_todos_e_entrada() {
        let mut c = cena(HospedeLinha { hospedeiro: 99, ..hosp(3.0, 2.0) });
        assert_eq!(consulta(&mut c).0, Vec::<u32>::new());
        assert_eq!(executar(&mut c, Q, &[f64::from(crate::esquema::NIVEL_TODOS)]).err(), Some(ENTRADA));
    }

    /// Área da silhueta em planta (a união das regiões das camadas, com os vãos que furam a planta) e o número de faixas verticais da primeira camada.
    fn silhueta_e_faixas(c: &mut Cena) -> (f64, u32) {
        let s = executar(c, CONSULTA_CLUSTER_RESOLVIDO, &[0.0, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0]).expect("cluster");
        let sil = u32s(&s[6]);
        let (pol, an, pt) = (u32s(&s[7]), u32s(&s[8]), f64s(&s[9]));
        let mut forma = Vec::new();
        for k in sil[1]..sil[1] + sil[2] {
            let (ia, na) = (pol[2 * k as usize], pol[2 * k as usize + 1]);
            let mut p: Vec<Vec<[f64; 2]>> = Vec::new();
            for a in ia..ia + na {
                let (ip, np) = (an[2 * a as usize], an[2 * a as usize + 1]);
                p.push((ip..ip + np).map(|q| [pt[2 * q as usize], pt[2 * q as usize + 1]]).collect());
            }
            forma.push(p);
        }
        (area_da_forma(&forma), u32s(&s[2])[7])
    }

    #[test]
    fn o_hospedeiro_e_recortado_em_todas_as_camadas_e_a_parede_sem_cortina_nao_muda() {
        // Sem a linha da seção 113: uma faixa, silhueta de 6 x 0,2 = 1,2.
        let mut sem = cena(hosp(3.0, 2.0));
        sem.cortina.hospedes.clear();
        let (area, faixas) = silhueta_e_faixas(&mut sem);
        assert!((area - 1.2).abs() < 1e-4, "{area}");
        assert_eq!(faixas, 1);
        // Com o vão de 2 m a 0,1 e 2,1: a planta perde 2 x 0,2 = 0,4 (o vão fura a planta) e a camada ganha três faixas (abaixo, com o furo, acima).
        let (area, faixas) = silhueta_e_faixas(&mut cena(hosp(3.0, 2.0)));
        assert!((area - 0.8).abs() < 1e-4, "{area}");
        assert_eq!(faixas, 3);
    }
}
