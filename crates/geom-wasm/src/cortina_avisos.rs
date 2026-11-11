//! Avisos da parede cortina (decisão 0056, §5.8; consulta `cortina_avisos`, id 105): as MEDIDAS que o Rust devolve. O TS decide o texto, a severidade
//! e o "Ir para". Os valores numéricos dos códigos estão em `esquema.rs` (`AVISO_CORTINA_*`).
//!
//! `avisos` `[cortina_num, codigo, i, j]` e `valores` `[medido, limite, x, y, z]` (grade de 1 µm). Os índices dependem do código:
//! - `celula-pequena`: célula `(i, j)`; medido = menor lado livre, limite = célula mínima;
//! - `montante-sobreposto`: eixo U: `i` = a aresta da esquerda do par e `j` = `ID_AUSENTE`; eixo V: `i` = `ID_AUSENTE` e `j` = a aresta de baixo; medido = distância
//!   entre os CENTROS dos montantes (o de borda fica embutido), limite = meia soma das larguras dos perfis;
//! - `sobra-fundida` e `posicao-fora`: eixo U: `i` = índice no eixo e `j` = `ID_AUSENTE`; eixo V: o inverso. `sobra-fundida`: índice da célula fundida, medido = a célula
//!   resultante, limite = 1,5 · lado nominal; `posicao-fora`: ordem da posição manual, medido = a posição já com a âncora e o deslocamento, limite = o comprimento do eixo;
//!   a posição do aviso é a do eixo, com a outra coordenada em 0;
//! - `profundidade-menor-que-perfil`: `i` = o `id_num` do tipo de montante; medido = a profundidade do perfil (a largura, no redondo), limite = a do sistema;
//!   posição 0, 0, 0 da cortina;
//! - `arco-nao-suportado` (cortina com `sag` ≠ 0 até a fase 4): `i` e `j` = `ID_AUSENTE`; medido = a flecha.
//!
//! Uma cortina em arco só devolve o seu aviso: não há geometria para medir o resto. Ângulo de grade ≠ 0 é `ENTRADA` (fase 7).

use crate::consultas::Saida;
use crate::cortina_pecas::CortinaR;
use crate::cortina_tipos::na_grade;

/// Saída plana, por cortina em ordem de id e, dentro dela, por `(codigo, i, j)`.
pub fn achatar(cortinas: &[CortinaR]) -> Vec<Saida> {
    let (mut a, mut v) = (Vec::new(), Vec::new());
    for c in cortinas {
        for x in &c.avisos {
            a.extend_from_slice(&[c.id, x.codigo, x.i, x.j]);
            v.extend_from_slice(&[na_grade(x.medido), na_grade(x.limite), na_grade(x.p[0]), na_grade(x.p[1]), na_grade(x.p[2])]);
        }
    }
    vec![Saida::U32(a), Saida::F64(v)]
}

pub fn consulta_cortina_avisos(cena: &crate::cena::Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    Ok(achatar(&crate::cortina_pecas::resolver(cena, nivel)?))
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cortina_pecas::resolver;
    use crate::cortina_pecas::testes::*;
    use crate::cortina_tipos::*;
    use crate::esquema::*;

    #[test]
    fn saida_plana_tem_quatro_inteiros_e_cinco_valores_por_aviso() {
        let e = Espec::novo(EixoEfetivo::manual(&[1.0, 1.03], ANCORA_INICIO), EixoEfetivo::numero(1));
        let s = achatar(&resolver(&cena_simples(&e, 3.0, 2.0), 0).expect("r"));
        let (Saida::U32(a), Saida::F64(v)) = (&s[0], &s[1]) else { panic!() };
        assert_eq!(a.len() / 4, v.len() / 5);
        assert!(a.len() >= 8, "célula pequena e montante sobreposto");
        // Ordenados por código: 1 (célula pequena) antes de 2 (montante sobreposto).
        assert_eq!(&a[0..2], &[1, AVISO_CORTINA_CELULA_PEQUENA]);
        assert_eq!(&a[a.len() - 4..a.len() - 2], &[1, AVISO_CORTINA_MONTANTE_SOBREPOSTO]);
        // Posição: a célula pequena (1,0 a 1,03) tem o centro em s = 1,015 e z = 1.
        assert!((v[2] - 1.015).abs() < 1e-9 && v[3].abs() < 1e-9 && (v[4] - 1.0).abs() < 1e-9);
    }

    #[test]
    fn cada_codigo_da_fase_1_aparece_quando_a_regra_dispara() {
        // sobra fundida: d = 1,0 e limiar de 0,8 sobre 3,7 m => célula de 1,7 > 1,5.
        let mut u = EixoEfetivo::distancia_fixa(1.0, JUSTIF_INICIO);
        u.resto_minimo = 0.8;
        let e = Espec::novo(u, EixoEfetivo::manual(&[5.0], ANCORA_INICIO));
        let r = resolver(&cena_simples(&e, 3.7, 2.0), 0).expect("r");
        let codigos: Vec<u32> = r[0].avisos.iter().map(|a| a.codigo).collect();
        assert!(codigos.contains(&AVISO_CORTINA_SOBRA_FUNDIDA), "{codigos:?}");
        assert!(codigos.contains(&AVISO_CORTINA_POSICAO_FORA), "posição 5,0 fora do eixo V de 2,0 m: {codigos:?}");
        let f = r[0].avisos.iter().find(|a| a.codigo == AVISO_CORTINA_POSICAO_FORA).expect("fora");
        assert_eq!((f.i, f.j), (ID_AUSENTE, 0), "eixo V: j é a ordem da posição manual");
    }

    #[test]
    fn sem_cortina_ou_sem_aviso_a_saida_e_vazia() {
        let s = achatar(&[]);
        assert_eq!((s[0].len(), s[1].len()), (0, 0));
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        let s = achatar(&resolver(&cena_simples(&e, 4.0, 3.0), 0).expect("r"));
        assert_eq!(s[0].len(), 0);
    }
}
