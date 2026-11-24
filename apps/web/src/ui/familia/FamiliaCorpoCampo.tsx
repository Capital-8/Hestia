import { compilar } from '@hestia/model';
import { useState, type ReactElement } from 'react';

/*
 * Campo de texto dos corpos. O rascunho fica no campo até gravar (Enter ou sair do campo): se o modelo recusa a
 * gravação (fórmula inválida, referência inexistente, medida fora do contrato), a mensagem aparece em vermelho e o texto
 * digitado continua lá para corrigir. O componente é reiniciado quando o valor gravado muda (chave no pai).
 */

interface Props {
  id: string;
  rotulo: string;
  valor: string;
  /** Grava o texto; devolve a recusa em português ou `null`. */
  gravar: (texto: string) => string | null;
  /** Campos de fórmula são compilados ao vivo; texto livre (nome, material) não. */
  formula?: boolean;
  opcional?: boolean;
  /** Só o `input` (célula de tabela): sem rótulo e sem bloco de mensagem; a recusa vai no `title`. */
  celula?: boolean;
}

export function CampoCorpo({ id, rotulo, valor, gravar, formula = true, opcional = false, celula = false }: Props): ReactElement {
  const [rascunho, setRascunho] = useState(valor);
  const [recusa, setRecusa] = useState<string | null>(null);

  const vazioOpcional = opcional && rascunho.trim() === '';
  const compilada = formula && !vazioOpcional ? compilar(rascunho) : null;
  const erroFormula = compilada !== null && 'erro' in compilada ? compilada.erro.message : null;
  const mensagem = recusa ?? erroFormula;

  const confirmar = (): void => {
    if (rascunho === valor) return;
    setRecusa(gravar(rascunho));
  };

  const entrada = (
    <input
      id={id}
      aria-label={celula ? rotulo : undefined}
      className={`fam-f${formula ? ' mono' : ''}${mensagem !== null ? ' bad' : ''}`}
      title={celula && mensagem !== null ? mensagem : undefined}
      value={rascunho}
      aria-invalid={mensagem !== null ? true : undefined}
      onChange={(e) => {
        setRascunho(e.target.value);
        setRecusa(null);
      }}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirmar();
      }}
    />
  );

  if (celula) return entrada;
  return (
    <div className="fam-row">
      <label htmlFor={id}>{rotulo}</label>
      <div className="fam-corpo-campo">
        {entrada}
        {mensagem !== null && <div className="fam-msg erro" role="alert">{mensagem}</div>}
      </div>
    </div>
  );
}
