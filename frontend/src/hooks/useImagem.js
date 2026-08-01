import { useState } from "react";

import { buscarImagens } from "../services/imagemService";

export function useImagem() {

    const [modalAberto, setModalAberto] = useState(false);

    const [produtoSelecionado, setProdutoSelecionado] = useState(null);

    const [imagens, setImagens] = useState([]);

    const [imagemSelecionada, setImagemSelecionada] = useState(null);

    const [loading, setLoading] = useState(false);

    const [erro, setErro] = useState(null);

    const [modoManual, setModoManual] = useState(false);

    const [linkBusca, setLinkBusca] = useState("");

    async function abrirModal(produto) {

        setLoading(true);

        setProdutoSelecionado(produto);
        setImagemSelecionada(null);
        setErro(null);
        setModoManual(false);
        setLinkBusca("");
        setImagens([]);

        setModalAberto(true);

        const resultado = await buscarImagens(produto);

        setImagens(resultado.imagens);
        setModoManual(resultado.origem === "manual");
        setLinkBusca(resultado.linkBusca || "");

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

    }

    function adicionarImagemManual(url) {

        if (!url) return;

        setImagens((atual) => [url, ...atual]);
        setImagemSelecionada(url);

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

        adicionarImagemManual

    };

}
