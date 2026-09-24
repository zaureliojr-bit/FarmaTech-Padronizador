import { useState } from "react";

import "../BuscaLoteImagensBox/BuscaLoteImagensBox.css";
import "./AplicarImagemLoteBox.css";
import { aplicarImagemEmLote } from "../../services/aplicarImagemLoteService";
import { useAcumuladorAtualizacoes } from "../../hooks/useAcumuladorAtualizacoes";

function AplicarImagemLoteBox({ produtos, atualizarProdutosEmLote, mostrarToast }) {

    const [url, setUrl] = useState("");
    const [rodando, setRodando] = useState(false);
    const [progresso, setProgresso] = useState(null);
    const [resultado, setResultado] = useState(null);

    const { adicionar, finalizar } = useAcumuladorAtualizacoes(atualizarProdutosEmLote);

    const total = produtos.filter((produto) => produto.ean).length;

    async function iniciar() {

        const urlLimpa = url.trim();

        if (!urlLimpa) {
            mostrarToast?.("Cole a URL da imagem antes de aplicar.", "erro");
            return;
        }

        // Aplica a MESMA imagem em todos, inclusive quem já tem uma -
        // vale confirmar antes, não tem revisão por item.
        const confirmou = window.confirm(
            `Isso vai aplicar essa imagem em ${total.toLocaleString("pt-BR")} produto(s) da lista filtrada, substituindo a imagem atual de quem já tiver uma. Continuar?`
        );

        if (!confirmou) return;

        setRodando(true);
        setResultado(null);
        setProgresso({ total: 0, concluidos: 0, sucesso: 0, falha: 0 });

        try {

            const relatorio = await aplicarImagemEmLote(produtos, urlLimpa, {

                onProgresso: setProgresso,

                onProdutoResolvido: ({ ean, imagem }) => {
                    adicionar({ ean, imagem, statusImagem: "salva" });
                }

            });

            setResultado(relatorio);

            mostrarToast?.(

                relatorio.total
                    ? `Imagem aplicada em ${relatorio.sucesso} de ${relatorio.total} produto(s).`
                    : "Nenhum produto com EAN nesta lista filtrada.",

                relatorio.falha ? "aviso" : "sucesso"

            );

        } catch (erro) {

            mostrarToast?.(erro.message || "Erro ao aplicar imagem em lote.", "erro");

        } finally {

            finalizar();

            setRodando(false);

        }

    }

    const percentual = progresso?.total
        ? Math.round((progresso.concluidos / progresso.total) * 100)
        : 0;

    return (

        <div className="busca-lote-box">

            <div className="busca-lote-cabecalho">

                <h2>🖼️ Aplicar imagem em lote</h2>

                <span className="busca-lote-ajuda">
                    Cola uma URL de imagem e aplica pra todos os produtos
                    <strong> na lista filtrada abaixo</strong> ({total.toLocaleString("pt-BR")} produtos)
                    de uma vez - sem buscar nada, é sempre a mesma imagem. Útil
                    pra medicamento/genérico sem foto de embalagem própria (uma
                    imagem padrão pra classe inteira). Use os filtros de
                    categoria/classe da barra acima pra restringir antes de
                    aplicar - inclusive quem já tem imagem é substituído.
                </span>

            </div>

            <div className="aplicar-imagem-lote-form">

                <input
                    type="text"
                    className="aplicar-imagem-lote-input"
                    placeholder="Cole a URL da imagem"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={rodando}
                />

                <button
                    className="btn btn-outline"
                    onClick={iniciar}
                    disabled={rodando || !total || !url.trim()}
                >
                    {rodando ? "Aplicando..." : `Aplicar em lote (${total})`}
                </button>

            </div>

            {

                url.trim() && (

                    <img
                        src={url.trim()}
                        alt="Pré-visualização"
                        className="aplicar-imagem-lote-preview"
                        onError={(e) => { e.target.style.display = "none"; }}
                        onLoad={(e) => { e.target.style.display = "block"; }}
                    />

                )

            }

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
                            {" "}({progresso.sucesso} ok, {progresso.falha} falharam)
                        </span>

                    </div>

                )

            }

            {

                !rodando && resultado && (

                    <p className="busca-lote-resultado">
                        {resultado.sucesso.toLocaleString("pt-BR")} produto(s) com a imagem aplicada
                        {resultado.falha ? ` · ${resultado.falha.toLocaleString("pt-BR")} falharam` : ""}
                    </p>

                )

            }

        </div>

    );

}

export default AplicarImagemLoteBox;
