import { useState } from "react";

import "../BuscaLoteImagensBox/BuscaLoteImagensBox.css";
import { trocarImagensEmLote } from "../../services/trocarImagensLoteService";

function TrocarImagensLoteBox({ produtos, atualizarProduto, mostrarToast }) {

    const [rodando, setRodando] = useState(false);
    const [progresso, setProgresso] = useState(null);
    const [resultado, setResultado] = useState(null);

    const comImagem = produtos.filter(
        (produto) => produto.ean && produto.statusImagem === "salva"
    ).length;

    async function iniciar() {

        // Diferente da busca em lote normal (só preenche vazio), isto
        // SUBSTITUI imagem já salva - inclusive uma que alguém escolheu
        // à mão. Vale confirmar antes, já que não tem revisão por item.
        const confirmou = window.confirm(
            `Isso vai buscar de novo e substituir a imagem de ${comImagem.toLocaleString("pt-BR")} produto(s) que já têm imagem salva (na lista filtrada), sem revisão individual. Continuar?`
        );

        if (!confirmou) return;

        setRodando(true);
        setResultado(null);
        setProgresso({ total: 0, concluidos: 0, sucesso: 0, semResultado: 0, falha: 0 });

        try {

            const relatorio = await trocarImagensEmLote(produtos, {

                onProgresso: setProgresso,

                onProdutoResolvido: ({ ean, imagem }) => {
                    atualizarProduto({ ean, imagem, statusImagem: "salva" });
                }

            });

            setResultado(relatorio);

            mostrarToast?.(

                relatorio.total
                    ? `Troca em lote concluída: ${relatorio.sucesso} de ${relatorio.total} imagens substituídas.`
                    : "Nenhum produto com imagem salva nesta lista filtrada.",

                relatorio.falha ? "aviso" : "sucesso"

            );

        } catch (erro) {

            mostrarToast?.(erro.message || "Erro na troca em lote.", "erro");

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

                <h2>🔄 Trocar imagens em lote</h2>

                <span className="busca-lote-ajuda">
                    Busca de novo (ignorando a imagem atual) e substitui pra
                    cada produto que já tem imagem salva <strong>na lista
                    filtrada abaixo</strong> ({comImagem.toLocaleString("pt-BR")} produtos).
                    Sem revisão manual - use os filtros de categoria/classe da
                    barra acima pra restringir antes de rodar, e confira
                    depois os que parecerem estranhos (o botão 🗑️ Excluir
                    some com a imagem se a troca sair pior que a original).
                </span>

            </div>

            <button
                className="btn btn-outline"
                onClick={iniciar}
                disabled={rodando || !comImagem}
            >
                {rodando ? "Trocando..." : `Trocar imagens em lote (${comImagem})`}
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
                        {resultado.sucesso.toLocaleString("pt-BR")} imagens substituídas
                        {" · "}{resultado.semResultado.toLocaleString("pt-BR")} sem resultado (ou igual à atual)
                        {resultado.falha ? ` · ${resultado.falha.toLocaleString("pt-BR")} falharam` : ""}
                    </p>

                )

            }

        </div>

    );

}

export default TrocarImagensLoteBox;
