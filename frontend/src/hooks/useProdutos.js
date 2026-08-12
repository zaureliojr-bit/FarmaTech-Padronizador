import { useEffect, useMemo, useState } from "react";
import { analisarProduto } from "../intelligence/core";

export function useProdutos() {

    const [resultadoImportacao, setResultadoImportacao] = useState(null);

    const [pesquisa, setPesquisa] = useState("");
    const [laboratorio, setLaboratorio] = useState("");
    const [categoria, setCategoria] = useState("");
    const [aba, setAba] = useState("");

    const [paginaAtual, setPaginaAtual] = useState(1);

    const itensPorPagina = 50;

    useEffect(() => {

        setPaginaAtual(1);

    }, [pesquisa, laboratorio, categoria, aba]);

    // =====================================================
    // Produtos Inteligentes
    // =====================================================

    const produtos = useMemo(() => {

        if (!resultadoImportacao) return [];

        return resultadoImportacao.produtos.map(analisarProduto);

    }, [resultadoImportacao]);
    console.log(produtos[0]);

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

            const filtroAba =

                !aba ||

                produto.aba === aba;

            return (

                busca &&

                filtroLaboratorio &&

                filtroCategoria &&

                filtroAba

            );

        });

    }, [

        produtos,

        pesquisa,

        laboratorio,

        categoria,

        aba

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

        setAba("");

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

        aba,

        setAba,

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

        atualizarProduto

    };

}