import { useEffect, useMemo, useState } from "react";

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

    const laboratorios = useMemo(() => {

        if (!resultadoImportacao) return [];

        return [...new Set(
            resultadoImportacao.produtos
                .map(p => p.laboratorio)
                .filter(Boolean)
        )].sort();

    }, [resultadoImportacao]);

    const categorias = useMemo(() => {

        if (!resultadoImportacao) return [];

        return [...new Set(
            resultadoImportacao.produtos
                .map(p => p.categoria)
                .filter(Boolean)
        )].sort();

    }, [resultadoImportacao]);

    const abas = useMemo(() => {

        if (!resultadoImportacao) return [];

        return [...new Set(
            resultadoImportacao.produtos
                .map(p => p.__aba)
                .filter(Boolean)
        )].sort();

    }, [resultadoImportacao]);

    const produtosFiltrados = useMemo(() => {

        if (!resultadoImportacao) return [];

        const texto = pesquisa.toLowerCase().trim();

        return resultadoImportacao.produtos.filter(produto => {

            const busca =

                !texto ||

                produto.ean?.toLowerCase().includes(texto) ||

                produto.descricao?.toLowerCase().includes(texto) ||

                produto.marca?.toLowerCase().includes(texto) ||

                produto.laboratorio?.toLowerCase().includes(texto) ||

                produto.categoria?.toLowerCase().includes(texto);

            const filtroLaboratorio =
                !laboratorio || produto.laboratorio === laboratorio;

            const filtroCategoria =
                !categoria || produto.categoria === categoria;

            const filtroAba =
                !aba || produto.__aba === aba;

            return (
                busca &&
                filtroLaboratorio &&
                filtroCategoria &&
                filtroAba
            );

        });

    }, [
        resultadoImportacao,
        pesquisa,
        laboratorio,
        categoria,
        aba
    ]);

    const totalPaginas = Math.ceil(
        produtosFiltrados.length / itensPorPagina
    );

    const produtosPagina = useMemo(() => {

        const inicio = (paginaAtual - 1) * itensPorPagina;

        return produtosFiltrados.slice(
            inicio,
            inicio + itensPorPagina
        );

    }, [
        produtosFiltrados,
        paginaAtual
    ]);

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
        abas,

        produtosPagina,
        produtosFiltrados,

        paginaAtual,
        setPaginaAtual,

        totalPaginas,

        limparFiltros,
        atualizarProduto,

    };

}