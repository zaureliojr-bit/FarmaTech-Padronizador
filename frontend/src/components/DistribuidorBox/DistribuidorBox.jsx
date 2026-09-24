import "../CmedBox/CmedBox.css";

function dataCurta(iso) {

    if (!iso) return "";

    return new Date(iso).toLocaleDateString("pt-BR");

}

function DistribuidorBox({
    indice,
    carregando,
    erro,
    carregarLista,
    mostrarToast
}) {

    async function selecionarArquivo(event) {

        const arquivo = event.target.files[0];

        // deixa escolher o mesmo arquivo de novo depois de um erro
        event.target.value = "";

        if (!arquivo) return;

        const resultado = await carregarLista(arquivo);

        if (resultado.sucesso) {

            mostrarToast?.(
                resultado.guardou
                    ? `Lista da distribuidora carregada: ${resultado.totalLinhas.toLocaleString("pt-BR")} produtos. Aplicada automaticamente a partir de agora.`
                    : "Lista carregada, mas não consegui guardá-la no navegador - vai precisar reimportar ao reabrir o padronizador.",
                resultado.guardou ? "sucesso" : "aviso"
            );

        } else {

            mostrarToast?.("Não consegui ler essa planilha da distribuidora.", "erro");

        }

    }

    return (

        <div className="cmed-box">

            <div className="cmed-cabecalho">

                <h2>🚚 Lista da distribuidora</h2>

                {indice && (

                    <span className="cmed-fonte">
                        {indice.totalLinhas.toLocaleString("pt-BR")} produtos · carregada em {dataCurta(indice.importadoEm)}
                    </span>

                )}

            </div>

            {!indice && (

                <p className="cmed-ajuda">
                    Relatório de produtos de uma distribuidora (código, EAN,
                    descrição, laboratório, categoria) - vira mais uma fonte de
                    descrição na busca automática, cruzada pelo EAN antes de
                    tentar Cosmos/Open Facts/CMED. Sem cota diária e sem regra
                    de preço/tarja nenhuma - só descrição.
                </p>

            )}

            <div className="cmed-acoes">

                <label className="btn btn-outline cmed-arquivo">

                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        disabled={carregando}
                        onChange={selecionarArquivo}
                    />

                    {carregando ? "Lendo..." : indice ? "Trocar a lista" : "Escolher a lista da distribuidora"}

                </label>

            </div>

            {erro && <p className="cmed-erro">{erro}</p>}

        </div>

    );

}

export default DistribuidorBox;
