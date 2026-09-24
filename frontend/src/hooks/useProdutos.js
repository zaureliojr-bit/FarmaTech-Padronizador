import { useEffect, useMemo, useState } from "react";
import { analisarProduto } from "../intelligence/core";
import { definirOverridesCategoria } from "../intelligence/dictionary/familias";
import { importarListaCmed } from "../services/cmedService";
import { carregarIndiceCmed, salvarIndiceCmed } from "../services/cmedStorage";
import { padronizarComCmed } from "../services/padronizarCmed";
import { importarListaDistribuidor, consultarEanDistribuidor } from "../services/distribuidorService";
import { carregarIndiceDistribuidor, salvarIndiceDistribuidor } from "../services/distribuidorStorage";
import { salvarCorrecao } from "../services/correcoesService";
import { buscarFamiliasOverride, salvarFamiliaOverride } from "../services/familiasOverrideService";

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

    // "" = todos, "sem" = só sem imagem, "com" = só com imagem.
    const [filtroImagem, setFiltroImagem] = useState("");

    const [paginaAtual, setPaginaAtual] = useState(1);

    const itensPorPagina = 50;

    useEffect(() => {

        setPaginaAtual(1);

    }, [pesquisa, laboratorio, categoria, classe, aba, filtroImagem]);

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
    // Distribuidora (fonte extra de descrição/laboratório/categoria)
    // =====================================================
    // Mesmo padrão da CMED: fica guardada no navegador, aplicada
    // automaticamente em toda planilha importada dali pra frente. Não
    // mexe em preço/estoque nem em regra de negócio nenhuma - só
    // acrescenta descricaoDistribuidor, usada como primeira fonte na
    // cascata de busca de descrição (ver descricaoService.js).

    const [indiceDistribuidor, setIndiceDistribuidor] = useState(null);
    const [carregandoDistribuidor, setCarregandoDistribuidor] = useState(false);
    const [erroDistribuidor, setErroDistribuidor] = useState("");

    useEffect(() => {

        let ativo = true;

        carregarIndiceDistribuidor().then((indice) => {
            if (ativo && indice) setIndiceDistribuidor(indice);
        });

        return () => { ativo = false; };

    }, []);

    async function carregarListaDistribuidor(arquivo) {

        setErroDistribuidor("");
        setCarregandoDistribuidor(true);

        try {

            const indice = await importarListaDistribuidor(arquivo);

            setIndiceDistribuidor(indice);

            const guardou = await salvarIndiceDistribuidor(indice);

            return { sucesso: true, guardou, totalLinhas: indice.totalLinhas };

        } catch (erro) {

            setErroDistribuidor(erro.message || "Não consegui ler esta planilha da distribuidora.");

            return { sucesso: false };

        } finally {

            setCarregandoDistribuidor(false);

        }

    }

    // =====================================================
    // Correções de categoria -> família (banco compartilhado)
    // =====================================================
    // Carregadas uma vez ao abrir o padronizador - definirOverridesCategoria
    // guarda num Map do próprio módulo familias.js, e "overridesVersao"
    // força o useMemo dos produtos a recalcular a família de cada um
    // depois que a busca termina (ela é assíncrona, então na primeira
    // renderização o Map ainda está vazio).

    const [overridesVersao, setOverridesVersao] = useState(0);

    useEffect(() => {

        let ativo = true;

        buscarFamiliasOverride().then((mapa) => {

            if (!ativo) return;

            definirOverridesCategoria(mapa);
            setOverridesVersao((v) => v + 1);

        });

        return () => { ativo = false; };

    }, []);

    // Usado pela caixa de categorias não reconhecidas - salva a escolha
    // no banco compartilhado e já reaplica na tela na hora, sem precisar
    // reimportar a planilha pra ver o produto mudar de família.
    async function corrigirFamiliaCategoria(categoria, familiaId) {

        await salvarFamiliaOverride(categoria, familiaId);

        const atual = await buscarFamiliasOverride();

        definirOverridesCategoria(atual);
        setOverridesVersao((v) => v + 1);

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

    // Cruza com a distribuidora (se a lista já estiver carregada) -
    // só acrescenta descricaoDistribuidor, sem regra de negócio.
    const produtosComDistribuidor = useMemo(() => {

        if (!resultadoCmed) return [];

        if (!indiceDistribuidor) return resultadoCmed.produtos;

        return resultadoCmed.produtos.map((produto) => {

            const info = consultarEanDistribuidor(indiceDistribuidor, produto.ean);

            if (!info?.descricao) return produto;

            return { ...produto, descricaoDistribuidor: info.descricao };

        });

    }, [resultadoCmed, indiceDistribuidor]);

    const produtos = useMemo(() => {

        if (!produtosComDistribuidor.length) return [];

        return produtosComDistribuidor.map(analisarProduto);

        // overridesVersao não é usado no corpo, mas precisa recalcular
        // a família de cada produto assim que os overrides carregam (ou
        // mudam) - análise já rodou com o Map de overrides ainda vazio.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [produtosComDistribuidor, overridesVersao]);

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

            const filtroImagemAtivo =

                !filtroImagem ||

                (filtroImagem === "sem" && produto.statusImagem !== "salva") ||

                (filtroImagem === "com" && produto.statusImagem === "salva");

            return (

                busca &&

                filtroLaboratorio &&

                filtroCategoria &&

                filtroClasse &&

                filtroAba &&

                filtroImagemAtivo

            );

        });

    }, [

        produtos,

        pesquisa,

        laboratorio,

        categoria,

        classe,

        aba,

        filtroImagem

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

        setFiltroImagem("");

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

    // Usado pelas caixas de busca em lote (imagem/descrição): aplicar
    // uma atualização por item resolvido dispara uma re-análise de TODO
    // o catálogo a cada chamada (analisarProduto roda de novo pra todo
    // mundo) - com vários itens resolvendo rápido (ex: descrição achada
    // na distribuidora, sem rede nenhuma), isso enfileira re-análises
    // demais e trava a aba. Aplicando o lote inteiro de uma vez só, a
    // re-análise roda uma vez só pro grupo inteiro.
    function atualizarProdutosEmLote(atualizacoes) {

        if (!atualizacoes?.length) return;

        const porEan = new Map(atualizacoes.map((item) => [item.ean, item]));

        setResultadoImportacao((anterior) => ({

            ...anterior,

            produtos: anterior.produtos.map((produto) => {

                const atualizacao = porEan.get(produto.ean);

                return atualizacao ? { ...produto, ...atualizacao } : produto;

            })

        }));

        atualizacoes.forEach((produtoAtualizado) => {

            const correcao = {};

            CAMPOS_DE_CORRECAO.forEach((campo) => {
                if (campo in produtoAtualizado) correcao[campo] = produtoAtualizado[campo];
            });

            if (Object.keys(correcao).length) {
                salvarCorrecao(produtoAtualizado.ean, correcao);
            }

        });

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

        filtroImagem,

        setFiltroImagem,

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

        atualizarProdutosEmLote,

        corrigirFamiliaCategoria,

        indiceCmed,

        relatorioCmed,

        carregandoCmed,

        erroCmed,

        carregarListaCmed,

        corrigirClasseCmed,

        setCorrigirClasseCmed,

        corrigirLaboratorioCmed,

        setCorrigirLaboratorioCmed,

        indiceDistribuidor,

        carregandoDistribuidor,

        erroDistribuidor,

        carregarListaDistribuidor

    };

}