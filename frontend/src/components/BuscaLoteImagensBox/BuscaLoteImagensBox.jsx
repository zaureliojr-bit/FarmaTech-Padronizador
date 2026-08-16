import { useState } from "react";

import "./BuscaLoteImagensBox.css";
import { buscarImagensEmLote } from "../../services/buscaLoteImagensService";

function BuscaLoteImagensBox({ produtos, atualizarProduto, mostrarToast }) {

    const [rodando, setRodando] = useState(false);
    const [progresso, setProgresso] = useState(null);
    const [resultado, setResultado] = useState(null);

    const semImagem = produtos.filter(
        (produto) => produto.ean && produto.statusImagem !== "salva"
    ).length;

    async function iniciar() {

        setRodando(true);
        setResultado(null);
        setProgresso({ total: 0, concluidos: 0, sucesso: 0, semResultado: 0, falha: 0 });

        try {

            const relatorio = await buscarImagensEmLote(produtos, {

                onProgresso: setProgresso,

                onProdutoResolvido: ({ ean, imagem }) => {
                    atualizarProduto({ ean, imagem, statusImagem: "salva" });
                }

            });

            setResultado(relatorio);

            mostrarToast?.(

                relatorio.total
                    ? `Busca em lote concluída: ${relatorio.sucesso} de ${relatorio.total} imagens encontradas e salvas.`
                    : "Nenhum produto sem imagem nesta lista filtrada.",

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

                <h2>🔎 Buscar imagens em lote</h2>

                <span className="busca-lote-ajuda">
                    Busca automaticamente (Cosmos + Serper) e salva a primeira
                    imagem encontrada pra cada produto sem imagem <strong>na
                    lista filtrada abaixo</strong> ({semImagem.toLocaleString("pt-BR")} produtos).
                    Sem revisão manual - confira depois os que parecerem
                    estranhos. Use os filtros de categoria/classe da barra
                    acima pra restringir antes de rodar.
                </span>

            </div>

            <button
                className="btn btn-outline"
                onClick={iniciar}
                disabled={rodando || !semImagem}
            >
                {rodando ? "Buscando..." : `Buscar imagens em lote (${semImagem})`}
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
                        {resultado.sucesso.toLocaleString("pt-BR")} imagens salvas
                        {" · "}{resultado.semResultado.toLocaleString("pt-BR")} sem resultado nas buscas
                        {resultado.falha ? ` · ${resultado.falha.toLocaleString("pt-BR")} falharam` : ""}
                    </p>

                )

            }

        </div>

    );

}

export default BuscaLoteImagensBox;
