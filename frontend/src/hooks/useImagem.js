import { useState } from "react";

import { buscarImagens } from "../services/imagemService";
import { salvarCache, limparCache } from "../services/imagemCache";

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

    // Repete a busca automática (Cosmos/Serper) por cima de um produto
    // que já tinha imagem salva - abrirModal() pula essa busca de
    // propósito pra não gastar consulta à toa, então trocar a imagem
    // precisa de um jeito explícito de pedir uma busca nova.
    async function buscarNovamente() {

        if (!produtoSelecionado) return;

        setLoading(true);
        setModoManual(false);
        setLinkBusca("");

        // Limpa o cache local dessa busca - senão um resultado antigo
        // (de antes de já ter uma imagem salva) volta igualzinho, e
        // "buscar novamente" não muda nada na prática.
        limparCache(produtoSelecionado.ean);

        const resultado = await buscarImagens({ ...produtoSelecionado, statusImagem: "" });

        // A imagem atual continua como opção na galeria, só não fica
        // mais sozinha - assim dá pra manter ela se nada melhor aparecer.
        const imagemAtual = produtoSelecionado.imagem;

        const novasImagens = imagemAtual
            ? [...new Set([imagemAtual, ...resultado.imagens])]
            : resultado.imagens;

        setImagens(novasImagens);
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
        buscarNovamente,

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
