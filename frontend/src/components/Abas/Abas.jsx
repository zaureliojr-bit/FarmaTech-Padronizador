/* A troca de telas do padronizador.

   Até aqui o aplicativo era uma página só, rolada de cima a baixo. A
   barra lateral existia como componente, mas não era renderizada em
   lugar nenhum e os botões dela não faziam nada — então "ir para outra
   parte" não existia.

   Abas em vez de recuperar a barra lateral: são duas telas, e uma barra
   lateral inteira para duas entradas come largura que a tabela de
   produtos usa melhor. Se um dia forem seis, a barra volta. */

import "./Abas.css";

function Abas({ vista, setVista, abas }) {

    return (

        <nav className="abas" aria-label="Seções do padronizador">

            {
                abas.map((aba) => (

                    <button
                        key={aba.chave}
                        className={vista === aba.chave ? "aba aba-ativa" : "aba"}
                        onClick={() => setVista(aba.chave)}
                        aria-current={vista === aba.chave ? "page" : undefined}
                    >
                        {aba.rotulo}
                    </button>

                ))
            }

        </nav>

    );

}

export default Abas;
