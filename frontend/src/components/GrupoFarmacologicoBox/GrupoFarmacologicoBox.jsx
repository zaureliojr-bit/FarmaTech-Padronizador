import "../CmedBox/CmedBox.css";

function dataCurta(iso) {

    if (!iso) return "";

    return new Date(iso).toLocaleDateString("pt-BR");

}

function GrupoFarmacologicoBox({
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
                    ? `Classificação farmacológica carregada: ${resultado.totalLinhas.toLocaleString("pt-BR")} substâncias. Aplicada automaticamente a partir de agora.`
                    : "Classificação carregada, mas não consegui guardá-la no navegador - vai precisar reimportar ao reabrir o padronizador.",
                resultado.guardou ? "sucesso" : "aviso"
            );

        } else {

            mostrarToast?.("Não consegui ler essa planilha de classificação farmacológica.", "erro");

        }

    }

    return (

        <div className="cmed-box">

            <div className="cmed-cabecalho">

                <h2>💊 Grupo farmacológico</h2>

                {indice && (

                    <span className="cmed-fonte">
                        {indice.totalLinhas.toLocaleString("pt-BR")} substâncias · carregada em {dataCurta(indice.importadoEm)}
                    </span>

                )}

            </div>

            {!indice && (

                <p className="cmed-ajuda">
                    Árvore Grupo / Subgrupo / Classe por substância ativa
                    (gerada por mymedfarma-extrator/) - cruzada pela
                    substância que a CMED já extrai de cada medicamento.
                    Some com descrição mais rica na ficha técnica do site,
                    sem mexer em família/categoria.
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

                    {carregando ? "Lendo..." : indice ? "Trocar a planilha" : "Escolher grupos_farmacologicos.xlsx"}

                </label>

            </div>

            {erro && <p className="cmed-erro">{erro}</p>}

        </div>

    );

}

export default GrupoFarmacologicoBox;
