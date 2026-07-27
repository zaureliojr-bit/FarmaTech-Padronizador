import { useState } from "react";

const imagensFake = [
    "https://picsum.photos/300?random=1",
    "https://picsum.photos/300?random=2",
    "https://picsum.photos/300?random=3",
    "https://picsum.photos/300?random=4",
    "https://picsum.photos/300?random=5",
    "https://picsum.photos/300?random=6"
];

export function useImagem() {

    const [modalAberto, setModalAberto] = useState(false);

    const [produtoSelecionado, setProdutoSelecionado] = useState(null);

    const [imagens, setImagens] = useState([]);

    const [imagemSelecionada, setImagemSelecionada] = useState(null);

    const [loading, setLoading] = useState(false);

    const [erro, setErro] = useState(null);

    function abrirModal(produto) {

        setLoading(true);

        setProdutoSelecionado(produto);
        setImagemSelecionada(null);
        setErro(null);

        // Simula uma busca de imagens
        setTimeout(() => {

            setImagens(imagensFake);

            setLoading(false);

            setModalAberto(true);

        }, 500);

    }

    function fecharModal() {

        setModalAberto(false);

        setProdutoSelecionado(null);
        setImagemSelecionada(null);
        setImagens([]);
        setErro(null);
        setLoading(false);

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
        setErro

    };

}