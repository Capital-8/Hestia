//! Quantidades da parede cortina (decisão 0056, §5.7; consulta `quant_cortina`, id 104). FONTE ÚNICA: as peças são as mesmas que geram a malha e as
//! linhas de planta (`cortina_pecas::resolver`), então quantidade e desenho nunca divergem. Este módulo só agrupa. Colunas por papel (convenção fixada
//! pela referência TS, `cortinaRef/quant.ts`):
//!
//! Linhas `(cortina, papel, tipo, material)` em ordem de chave; números na grade de 1 µm. Papéis: 0 a 5 montante (interior vertical, interior horizontal,
//! borda início, borda fim, borda base, borda topo), 10 painel de vidro, 11 sólido, 12 vazio, 20 sistema.
//! - montante: `n` peças (uma por segmento, já aparadas); `comprimento` soma o comprimento das peças; `area` = `area_liquida` = comprimento × largura vista;
//!   `volume` = comprimento × área do perfil (rect `w·d`; round `πw²/4`; L, trapézio e canto pela fórmula de cada um). Peça com esquadria (fase 3):
//!   `volume` é o da malha, e `comprimento` é o volume ÷ área da seção (comprimento equivalente);
//! - painel: `n` painéis (um por célula, mesmo sem área); `comprimento` 0; `area` = área BRUTA (retângulo livre mais o encaixe nos lados com montante);
//!   `area_liquida` = área VISÍVEL (retângulo livre); `volume` = bruta × espessura; vazio: `area` = `area_liquida` = o vão, `volume` 0;
//! - sistema: `n` 1, `comprimento` L, `area` = `area_liquida` = L × H, `tipo` = `material` = 0, `volume` 0.
//!
//! A massa (volume × densidade do material) fica com o TS, que conhece os materiais.

use std::collections::BTreeMap;

use crate::consultas::Saida;
use crate::cortina_malha::{area_da_secao, secao, solido, volume_malha};
use crate::cortina_pecas::CortinaR;
use crate::cortina_tipos::*;

#[derive(Clone, Debug, PartialEq)]
pub struct LinhaQuant {
    pub cortina: u32,
    pub papel: u32,
    pub tipo: u32,
    pub material: u32,
    pub n: u32,
    pub comprimento: f64,
    pub area: f64,
    pub area_liquida: f64,
    pub volume: f64,
}

fn entrada(g: &mut BTreeMap<(u32, u32, u32), LinhaQuant>, cortina: u32, papel: u32, tipo: u32, material: u32) -> &mut LinhaQuant {
    g.entry((papel, tipo, material)).or_insert(LinhaQuant { cortina, papel, tipo, material, n: 0, comprimento: 0.0, area: 0.0, area_liquida: 0.0, volume: 0.0 })
}

pub fn quant_cortina(cortinas: &[CortinaR]) -> Vec<LinhaQuant> {
    let mut out = Vec::new();
    for c in cortinas {
        let Some(g) = &c.g else { continue };
        let mut grupos: BTreeMap<(u32, u32, u32), LinhaQuant> = BTreeMap::new();
        for p in &g.pecas {
            let l = entrada(&mut grupos, c.id, p.papel, p.m.tipo, p.m.material);
            let len = p.comprimento();
            l.n += 1;
            l.comprimento += len;
            l.area += len * p.m.largura;
            l.area_liquida += len * p.m.largura;
            l.volume += len * p.m.area_secao();
        }
        // Montante de canto entre cortinas (fase 3): uma peça de altura total; o volume é a área em planta do encontro × altura.
        for k in &g.cantos {
            let l = entrada(&mut grupos, c.id, PAPEL_CANTO, k.m.tipo, k.m.material);
            let len = k.z1 - k.z0;
            l.n += 1;
            l.comprimento += len;
            l.area += len * k.m.largura;
            l.area_liquida += len * k.m.largura;
            l.volume += k.area_planta() * len;
        }
        // Esquadria: o volume é o da malha (a ponta não é plana); o comprimento é o equivalente, volume ÷ área da seção discretizada.
        for p in &g.pecas_esq {
            let sec = secao(&p.m, 2);
            let vol = volume_malha(&solido(&sec, &p.lo, &p.hi));
            let comp = vol / area_da_secao(&sec);
            let l = entrada(&mut grupos, c.id, p.papel, p.m.tipo, p.m.material);
            l.n += 1;
            l.comprimento += comp;
            l.area += comp * p.m.largura;
            l.area_liquida += comp * p.m.largura;
            l.volume += vol;
        }
        for p in &g.paineis {
            let papel = match p.p.kind {
                PAINEL_VIDRO => PAPEL_PAINEL_VIDRO,
                PAINEL_SOLIDO => PAPEL_PAINEL_SOLIDO,
                _ => PAPEL_PAINEL_VAZIO,
            };
            let l = entrada(&mut grupos, c.id, papel, p.p.tipo, p.p.material);
            l.n += 1;
            l.area += p.area_bruta();
            l.area_liquida += p.area_visivel();
            if p.p.kind != PAINEL_VAZIO {
                l.volume += p.area_bruta() * p.p.espessura;
            }
        }
        // Esquadrias nas células (fase 5), à parte do vidro de fachada: o vão (n e área), a folha e o batente (volume) e o vidro da esquadria (área e volume).
        for e in &g.esquadrias {
            let cs = crate::cortina_porta::caixas(e, g.d);
            let l = entrada(&mut grupos, c.id, PAPEL_ESQUADRIA, e.tipo_num, 0);
            l.n += 1;
            l.area += e.largura() * e.altura();
            l.area_liquida += e.largura() * e.altura();
            let l = entrada(&mut grupos, c.id, PAPEL_ESQUADRIA_FOLHA, e.tipo_num, e.mat_folha);
            l.n += 1;
            l.volume += cs.iter().filter(|x| !x.vidro).map(|x| x.volume()).sum::<f64>();
            let l = entrada(&mut grupos, c.id, PAPEL_ESQUADRIA_VIDRO, e.tipo_num, e.mat_vidro);
            l.n += 1;
            let a = crate::cortina_porta::area_vidro(&cs);
            l.area += a;
            l.area_liquida += a;
            l.volume += cs.iter().filter(|x| x.vidro).map(|x| x.volume()).sum::<f64>();
        }
        let l = entrada(&mut grupos, c.id, PAPEL_SISTEMA, 0, 0);
        l.n = 1;
        l.comprimento = g.l;
        l.area = g.l * g.h;
        l.area_liquida = g.l * g.h;
        for mut l in grupos.into_values() {
            l.comprimento = na_grade(l.comprimento);
            l.area = na_grade(l.area);
            l.area_liquida = na_grade(l.area_liquida);
            l.volume = na_grade(l.volume);
            out.push(l);
        }
    }
    out
}

/// Saída plana: `linhas` `[cortina_num, papel, tipo_num, material_num, n]`, `valores` `[comprimento, area, area_liquida, volume]`.
pub fn achatar(l: &[LinhaQuant]) -> Vec<Saida> {
    let (mut a, mut v) = (Vec::new(), Vec::new());
    for x in l {
        a.extend_from_slice(&[x.cortina, x.papel, x.tipo, x.material, x.n]);
        v.extend_from_slice(&[x.comprimento, x.area, x.area_liquida, x.volume]);
    }
    vec![Saida::U32(a), Saida::F64(v)]
}

pub fn consulta_quant_cortina(cena: &crate::cena::Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    Ok(achatar(&quant_cortina(&crate::cortina_pecas::resolver(cena, nivel)?)))
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cortina_pecas::resolver;
    use crate::cortina_pecas::testes::*;
    use crate::esquema::ID_AUSENTE;

    fn linhas(e: &Espec, l: f64, h: f64) -> Vec<LinhaQuant> {
        quant_cortina(&resolver(&cena_simples(e, l, h), 0).expect("r"))
    }

    fn acha(v: &[LinhaQuant], papel: u32) -> &LinhaQuant {
        v.iter().find(|x| x.papel == papel).unwrap_or_else(|| panic!("papel {papel}"))
    }

    fn igual(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-6, "{a} != {b}");
    }

    #[test]
    fn grade_de_4_por_3_confere_peca_a_peca() {
        let e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(3));
        let v = linhas(&e, 6.0, 3.0);
        // Interior vertical: 3 linhas x 3 segmentos de 1 m (contínuo, centro a centro); 50 x 100 mm.
        let iv = acha(&v, PAPEL_INT_V);
        assert_eq!((iv.n, iv.tipo, iv.material), (9, M_RET, 11));
        igual(iv.comprimento, 9.0);
        igual(iv.area, 0.05 * 9.0);
        igual(iv.area_liquida, 0.05 * 9.0);
        igual(iv.volume, 0.005 * 9.0);
        // Bordas verticais: 3 segmentos cada.
        assert_eq!(acha(&v, PAPEL_BORDA_INI).n, 3);
        assert_eq!(acha(&v, PAPEL_BORDA_FIM).n, 3);
        // Horizontais quebrados: 4 segmentos na base (da face da borda à face do interior).
        let base = acha(&v, PAPEL_BORDA_BASE);
        assert_eq!(base.n, 4);
        igual(base.comprimento, 2.0 * (1.5 - 0.05 - 0.025) + 2.0 * (1.5 - 0.05));
        assert_eq!(acha(&v, PAPEL_INT_H).n, 8);
        // Vidro: 12 painéis; bruta com o encaixe de 12 mm nos lados com montante; comprimento 0.
        let vidro = acha(&v, PAPEL_PAINEL_VIDRO);
        assert_eq!((vidro.n, vidro.tipo, vidro.material), (12, P_VIDRO, 21));
        igual(vidro.comprimento, 0.0);
        assert!(vidro.area > vidro.area_liquida);
        igual(vidro.volume, vidro.area * 0.01);
        // Os montantes mais as áreas visíveis cobrem L x H sem fresta.
        let area_montantes: f64 = v.iter().filter(|x| x.papel <= PAPEL_BORDA_TOPO).map(|x| x.area).sum();
        igual(area_montantes + vidro.area_liquida, 18.0);
        // Sistema.
        let s = acha(&v, PAPEL_SISTEMA);
        assert_eq!((s.n, s.tipo, s.material), (1, 0, 0));
        igual(s.comprimento, 6.0);
        igual(s.area, 18.0);
        igual(s.area_liquida, 18.0);
        igual(s.volume, 0.0);
    }

    #[test]
    fn painel_solido_e_vazio_saem_em_linhas_proprias() {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        e.painel = P_SOLIDO;
        let v = linhas(&e, 4.0, 3.0);
        let s = acha(&v, PAPEL_PAINEL_SOLIDO);
        assert_eq!((s.n, s.material), (2, 22));
        // Encaixe do sólido: 10 mm. Painéis de 1,925 x 2,9 de área livre.
        igual(s.area_liquida, 2.0 * 1.925 * 2.9);
        igual(s.area, 2.0 * (1.925 + 0.02) * (2.9 + 0.02));
        assert!(v.iter().all(|x| x.papel != PAPEL_PAINEL_VIDRO));
        e.painel = P_VAZIO;
        let v = linhas(&e, 4.0, 3.0);
        let z = acha(&v, PAPEL_PAINEL_VAZIO);
        assert_eq!((z.n, z.volume), (2, 0.0));
        igual(z.area, z.area_liquida);
        igual(z.area, 2.0 * 1.925 * 2.9);
    }

    #[test]
    fn papel_sem_montante_nao_gera_linha_de_montante() {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        e.mont = [M_RET, ID_AUSENTE, ID_AUSENTE, ID_AUSENTE, ID_AUSENTE, ID_AUSENTE];
        let v = linhas(&e, 4.0, 3.0);
        assert!(v.iter().all(|x| x.papel == PAPEL_INT_V || x.papel >= PAPEL_PAINEL_VIDRO));
        // Sem bordas e horizontais, só a vertical do meio (meia largura de cada lado) desconta: 4 x ((2 - 0,025) x 1,5).
        igual(acha(&v, PAPEL_PAINEL_VIDRO).area_liquida, 4.0 * (2.0 - 0.025) * 1.5);
    }

    #[test]
    fn as_duas_prioridades_dao_os_mesmos_paineis_e_so_o_comprimento_dos_montantes_muda() {
        let mut e = Espec::novo(EixoEfetivo::numero(3), EixoEfetivo::numero(3));
        let a = linhas(&e, 6.0, 3.0);
        e.prioridade = PRIORIDADE_HORIZONTAL;
        let b = linhas(&e, 6.0, 3.0);
        igual(acha(&a, PAPEL_PAINEL_VIDRO).area, acha(&b, PAPEL_PAINEL_VIDRO).area);
        // Vertical contínuo: interior vertical = 2 linhas x 3 m; com o horizontal contínuo ele é quebrado (menor).
        igual(acha(&a, PAPEL_INT_V).comprimento, 6.0);
        assert!(acha(&b, PAPEL_INT_V).comprimento < 6.0);
        igual(acha(&b, PAPEL_INT_H).comprimento, 2.0 * 6.0);
        assert!(acha(&a, PAPEL_INT_H).comprimento < 12.0);
    }

    #[test]
    fn varias_cortinas_saem_em_ordem_de_id_e_a_em_arco_nao_sai() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        c = com_cortina(c, 5, 2.0, 3.0);
        c = com_cortina(c, 3, 2.0, 3.0);
        c.cortina.cortinas.get_mut(&3).expect("c").sag = 0.2;
        let v = quant_cortina(&resolver(&c, 0).expect("r"));
        let ids: Vec<u32> = v.iter().map(|x| x.cortina).collect();
        assert!(ids.windows(2).all(|w| w[0] <= w[1]));
        assert!(ids.contains(&1) && ids.contains(&5) && !ids.contains(&3));
        let Saida::U32(a) = &achatar(&v)[0] else { panic!() };
        assert_eq!(a.len(), 5 * v.len());
    }
}

#[cfg(test)]
mod testes_f3 {
    use super::*;
    use crate::cortina_pecas::resolver;
    use crate::cortina_pecas::testes::*;

    /// Grade 4 × 3 de 6 × 3 m: as três verticais interiores, contínuas, somam 9 m; o volume é 9 m × a área da seção pela fórmula do TS.
    #[test]
    fn volume_de_cada_perfil_novo_e_comprimento_vezes_a_formula_do_ts() {
        let casos = [
            // L: w·d − (w − t)(d − t) = 0,08·0,12 − 0,07·0,11.
            (M_L, 0.08 * 0.12 - 0.07 * 0.11),
            // Trapézio: (w + wb)/2 · d = (0,08 + 0,04)/2 · 0,12.
            (M_TRAP, (0.08 + 0.04) / 2.0 * 0.12),
            // Canto: w·d − (w − 2t)(d − 2t) = 0,06·0,12 − 0,052·0,112.
            (M_CANTO, 0.06 * 0.12 - 0.052 * 0.112),
        ];
        for (forma, area) in casos {
            let mut e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(3));
            e.mont = [forma, M_RET, M_RET, M_RET, M_RET, M_RET];
            let v = quant_cortina(&resolver(&cena_simples(&e, 6.0, 3.0), 0).expect("r"));
            let iv = v.iter().find(|x| x.papel == PAPEL_INT_V).expect("interior vertical");
            assert!((iv.comprimento - 9.0).abs() < 1e-6, "forma {forma}: comprimento {}", iv.comprimento);
            assert!((iv.volume - 9.0 * area).abs() < 1e-9, "forma {forma}: volume {} vs {}", iv.volume, 9.0 * area);
        }
    }
}
