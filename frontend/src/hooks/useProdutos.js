import { useEffect, useMemo, useState } from "react";
import { analisarProduto } from "../intelligence/core";
import { importarListaCmed } from "../services/cmedService";
import { carregarIndiceCmed, salvarIndiceCmed } from "../services/cmedStorage";
import { padronizarComCmed } from "../services/padronizarCmed";
import { salvarCorrecao } from "../services/correcoesService";

// Só estes três campos são "correção" compartilhável entre lojas -
// preço, promoção e estoque são do catálogo de cada loja e nunca podem
// ir pro banco de correções.
const CAMPOS_DE_CORRECAO = ["descricaoManual", "classe", "categoria"];

export function useProdutos() {

    const [resultadoImportacao, setResultadoImportacao] = useState(null);

    const [pesquisa, setPesquisa] = useState("");
    const [laboratorio, setLaboratorio] = useState("");
    const [categoria, setCategoria] = useState("");
    const [classe, setClasse] = useState("");
    const [aba, setAba] = useState("");
    const [apenasSemImagem, setApenasSemImagem] = useState(false);

    const [paginaAtual, setPaginaAtual] = useState(1);

    const itensPorPagina = 50;

    useEffect(() => {

        setPaginaAtual(1);

    }, [pesquisa, laboratorio, categoria, classe, aba, apenasSemImagem]);

    // =====================================================
    // CMED (tarja, exigência de receita, preço máximo legal)
    // =====================================================
    // A lista da CMED fica guardada no navegador (sai uma por mês, não
    // faz sentido reimportar toda vez que o padronizador abre) e, uma
    // vez carregada, é aplicada automaticamente em toda planilha
    // importada dali em diante - sem precisar de um botão extra.

    const [indiceCmed, setIndiceCmed] = useState(null);
    const [carregandoCmed, setCarregandoCmed] = useState(false);
    const [erroCmed, setErroCmed] = useState("");

    const [corrigirClasseCmed, setCorrigirClasseCmed] = useState(false);
    const [corrigirLaboratorioCmed, setCorrigirLaboratorioCmed] = useState(false);

    useEffect(() => {

        let ativo = true;

        carregarIndiceCmed().then((indice) => {
            if (ativo && indice) setIndiceCmed(indice);
        });

        return () => { ativo = false; };

    }, []);

    async function carregarListaCmed(arquivo) {

        setErroCmed("");
        setCarregandoCmed(true);

        try {

            const indice = await importarListaCmed(arquivo);

            setIndiceCmed(indice);

            const guardou = await salvarIndiceCmed(indice);

            return { sucesso: true, guardou, totalLinhas: indice.totalLinhas };

        } catch (erro) {

            setErroCmed(erro.message || "Não consegui ler esta planilha da CMED.");

            return { sucesso: false };

        } finally {

            setCarregandoCmed(false);

        }

    }

    // =====================================================
    // Produtos Inteligentes
    // =====================================================

    // Cruza com a CMED (se a lista já estiver carregada) antes de rodar o
    // pipeline - assim tarja/exigeReceita/pmc chegam no produto final do
    // mesmo jeito que qualquer outro campo, sem passo manual.
    const resultadoCmed = useMemo(() => {

        if (!resultadoImportacao) return null;

        if (!indiceCmed) {
            return { produtos: resultadoImportacao.produtos, relatorio: null };
        }

        return padronizarComCmed(resultadoImportacao.produtos, indiceCmed, {
            corrigirClasse: corrigirClasseCmed,
            corrigirLaboratorio: corrigirLaboratorioCmed
        });

    }, [resultadoImportacao, indiceCmed, corrigirClasseCmed, corrigirLaboratorioCmed]);

    const relatorioCmed = resultadoCmed?.relatorio || null;

    const produtos = useMemo(() => {

        if (!resultadoCmed) return [];

        return resultadoCmed.produtos.map(analisarProduto);

    }, [resultadoCmed]);

    // =====================================================
    // Filtros
    // =====================================================

    const laboratorios = useMemo(() => {

        return [...new Set(

            produtos
                .map(produto => produto.laboratorio)
                .filter(Boolean)

        )].sort();

    }, [produtos]);

    const categorias = useMemo(() => {

        return [...new Set(

            produtos
                .map(produto => produto.categoria)
                .filter(Boolean)

        )].sort();

    }, [produtos]);

    const classes = useMemo(() => {

        return [...new Set(

            produtos
                .map(produto => produto.classe)
                .filter(Boolean)

        )].sort();

    }, [produtos]);

    const abas = useMemo(() => {

        return [...new Set(

            produtos
                .map(produto => produto.aba)
                .filter(Boolean)

        )].sort();

    }, [produtos]);

    // =====================================================
    // Produtos Filtrados
    // =====================================================

    const produtosFiltrados = useMemo(() => {

        if (!produtos.length) return [];

        const texto = pesquisa.toLowerCase().trim();

        return produtos.filter(produto => {

            const busca =

                !texto ||

                produto.ean?.toLowerCase().includes(texto) ||

                produto.descricaoOriginal?.toLowerCase().includes(texto) ||

                produto.marca?.toLowerCase().includes(texto) ||

                produto.laboratorio?.toLowerCase().includes(texto) ||

                produto.categoria?.toLowerCase().includes(texto);

            const filtroLaboratorio =

                !laboratorio ||

                produto.laboratorio === laboratorio;

            const filtroCategoria =

                !categoria ||

                produto.categoria === categoria;

            const filtroClasse =

                !classe ||

                produto.classe === classe;

            const filtroAba =

                !aba ||

                produto.aba === aba;

            const filtroSemImagem =

                !apenasSemImagem ||

                produto.statusImagem !== "salva";

            return (

                busca &&

                filtroLaboratorio &&

                filtroCategoria &&

                filtroClasse &&

                filtroAba &&

                filtroSemImagem

            );

        });

    }, [

        produtos,

        pesquisa,

        laboratorio,

        categoria,

        classe,

        aba,

        apenasSemImagem

    ]);

    // =====================================================
    // Paginação
    // =====================================================

    const totalPaginas = Math.ceil(

        produtosFiltrados.length / itensPorPagina

    );

    const produtosPagina = useMemo(() => {

        const inicio =

            (paginaAtual - 1) * itensPorPagina;

        return produtosFiltrados.slice(

            inicio,

            inicio + itensPorPagina

        );

    }, [

        produtosFiltrados,

        paginaAtual

    ]);

    // =====================================================
    // Ações
    // =====================================================

    function limparFiltros() {

        setPesquisa("");

        setLaboratorio("");

        setCategoria("");

        setClasse("");

        setAba("");

        setApenasSemImagem(false);

    }

    function atualizarProduto(produtoAtualizado) {

        setResultadoImportacao((anterior) => ({

            ...anterior,

            produtos: anterior.produtos.map((produto) =>

                produto.ean === produtoAtualizado.ean

                    ? {

                        ...produto,

                        ...produtoAtualizado

                    }

                    : produto

            )

        }));

        // Espelha descrição/classe/categoria corrigidas manualmente no
        // banco compartilhado (por EAN) - preço/estoque nunca entram
        // aqui, ficam só localmente. Não bloqueia a edição na tela: se
        // a chamada falhar, a correção continua valendo nesta sessão,
        // só não fica salva pra reimportações futuras.
        const correcao = {};

        CAMPOS_DE_CORRECAO.forEach((campo) => {
            if (campo in produtoAtualizado) correcao[campo] = produtoAtualizado[campo];
        });

        if (Object.keys(correcao).length) {
            salvarCorrecao(produtoAtualizado.ean, correcao);
        }

    }

    return {

        resultadoImportacao,

        setResultadoImportacao,

        pesquisa,

        setPesquisa,

        laboratorio,

        setLaboratorio,

        categoria,

        setCategoria,

        classe,

        setClasse,

        aba,

        setAba,

        apenasSemImagem,

        setApenasSemImagem,

        laboratorios,

        categorias,

        classes,

        abas,

        produtos,

        produtosFiltrados,

        produtosPagina,

        paginaAtual,

        setPaginaAtual,

        totalPaginas,

        limparFiltros,

        atualizarProduto,

        indiceCmed,

        relatorioCmed,

        carregandoCmed,

        erroCmed,

        carregarListaCmed,

        corrigirClasseCmed,

        setCorrigirClasseCmed,

        corrigirLaboratorioCmed,

        setCorrigirLaboratorioCmed

    };

}