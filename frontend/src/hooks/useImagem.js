import { useState } from "react";

import { buscarImagens } from "../services/imagemService";
import { salvarCache } from "../services/imagemCache";

export function useImagem() {

    const [modalAberto, setModalAberto] = useState(false);

    const [produtoSelecionado, setProdutoSelecionado] = useState(null);

    const [imagens, setImagens] = useState([]);

    const [imagemSelecionada, setImagemSelecionada] = useState(null);

    const [loading, setLoading] = useState(false);

    const [erro, setErro] = useState(null);

    const [modoManual, setModoManual] = useState(false);

    const [linkBusca, setLinkBusca] = useState("");

    // De onde veio a imagem atualmente selecionada (cosmos/serper/manual)
    // - vai junto quando salvar, só pra registro no banco de imagens.
    const [origemAtual, setOrigemAtual] = useState("");

    async function abrirModal(produto) {

        setProdutoSelecionado(produto);
        setImagemSelecionada(null);
        setErro(null);
        setModoManual(false);
        setLinkBusca("");
        setOrigemAtual("");
        setModalAberto(true);

        // Produto já resolvido: só exibe a imagem salva, sem gastar consulta.
        if (produto.statusImagem === "salva" && produto.imagem) {

            setImagens([produto.imagem]);
            setImagemSelecionada(produto.imagem);
            setLoading(false);

            return;

        }

        setLoading(true);
        setImagens([]);

        const resultado = await buscarImagens(produto);

        setImagens(resultado.imagens);
        setModoManual(resultado.origem === "manual");
        setLinkBusca(resultado.linkBusca || "");
        setOrigemAtual(resultado.origem);

        setLoading(false);

    }

    function fecharModal() {

        setModalAberto(false);

        setProdutoSelecionado(null);
        setImagemSelecionada(null);
        setImagens([]);
        setErro(null);
        setLoading(false);
        setModoManual(false);
        setLinkBusca("");
        setOrigemAtual("");

    }

    function adicionarImagemManual(url) {

        if (!url) return;

        setImagens((atual) => {

            const novaLista = [url, ...atual];

            salvarCache(produtoSelecionado?.ean, {
                origem: "manual-confirmado",
                imagens: novaLista
            });

            return novaLista;

        });

        setImagemSelecionada(url);
        setModoManual(false);
        setOrigemAtual("manual");

    }

    return {

        modalAberto,
        abrirModal,
        fecharModal,

        produtoSelecionado,

        imagens,
        setImagens,

        imagemSelecionada,
        setImagemSelecionada,

        loading,

        erro,
        setErro,

        modoManual,
        linkBusca,
        origemAtual,

        adicionarImagemManual

    };

}
