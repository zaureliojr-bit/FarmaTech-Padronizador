import { useState } from "react";

import "../BuscaLoteImagensBox/BuscaLoteImagensBox.css";
import { buscarDescricoesEmLote } from "../../services/buscaLoteDescricoesService";

function BuscaLoteDescricoesBox({ produtos, atualizarProduto, mostrarToast }) {

    const [rodando, setRodando] = useState(false);
    const [progresso, setProgresso] = useState(null);
    const [resultado, setResultado] = useState(null);

    const semDescricaoRevisada = produtos.filter(
        (produto) => produto.ean && !produto.descricaoManual
    ).length;

    async function iniciar() {

        setRodando(true);
        setResultado(null);
        setProgresso({ total: 0, concluidos: 0, sucesso: 0, semResultado: 0, falha: 0 });

        try {

            const relatorio = await buscarDescricoesEmLote(produtos, {

                onProgresso: setProgresso,

                onProdutoResolvido: ({ ean, descricaoManual }) => {
                    atualizarProduto({ ean, descricaoManual });
                }

            });

            setResultado(relatorio);

            mostrarToast?.(

                relatorio.total
                    ? `Busca em lote concluída: ${relatorio.sucesso} de ${relatorio.total} descrições atualizadas.`
                    : "Nenhum produto pendente de descrição nesta lista filtrada.",

                relatorio.falha ? "aviso" : "sucesso"

            );

        } catch (erro) {

            mostrarToast?.(erro.message || "Erro na busca em lote.", "erro");

        } finally {

            setRodando(false);

        }

    }

    const percentual = progresso?.total
        ? Math.round((progresso.concluidos / progresso.total) * 100)
        : 0;

    return (

        <div className="busca-lote-box">

            <div className="busca-lote-cabecalho">

                <h2>📝 Buscar descrições em lote</h2>

                <span className="busca-lote-ajuda">
                    Busca automaticamente (Cosmos + Open Beauty/Food Facts + CMED)
                    e usa a primeira descrição encontrada pra cada produto sem
                    correção manual ainda <strong>na lista filtrada abaixo</strong>
                    {" "}({semDescricaoRevisada.toLocaleString("pt-BR")} produtos).
                    Sem revisão manual - confira depois os que parecerem
                    estranhos (o botão ↺ reverte pra descrição automática). Use
                    os filtros de categoria/classe da barra acima pra restringir
                    antes de rodar.
                </span>

            </div>

            <button
                className="btn btn-outline"
                onClick={iniciar}
                disabled={rodando || !semDescricaoRevisada}
            >
                {rodando ? "Buscando..." : `Buscar descrições em lote (${semDescricaoRevisada})`}
            </button>

            {

                rodando && progresso && (

                    <div className="busca-lote-progresso">

                        <div className="busca-lote-barra">
                            <div
                                className="busca-lote-barra-preenchida"
                                style={{ width: `${percentual}%` }}
                            />
                        </div>

                        <span>
                            {progresso.concluidos} de {progresso.total}
                            {" "}({progresso.sucesso} ok, {progresso.semResultado} sem resultado, {progresso.falha} falharam)
                        </span>

                    </div>

                )

            }

            {

                !rodando && resultado && (

                    <p className="busca-lote-resultado">
                        {resultado.sucesso.toLocaleString("pt-BR")} descrições atualizadas
                        {" · "}{resultado.semResultado.toLocaleString("pt-BR")} sem resultado nas buscas
                        {resultado.falha ? ` · ${resultado.falha.toLocaleString("pt-BR")} falharam` : ""}
                    </p>

                )

            }

        </div>

    );

}

export default BuscaLoteDescricoesBox;
