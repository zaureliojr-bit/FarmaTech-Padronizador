import { useState } from "react";

import Header from "../components/Header/Header";
import ImportBox from "../components/ImportBox/ImportBox";
import ImportSummary from "../components/ImportSummary/ImportSummary";
import CmedBox from "../components/CmedBox/CmedBox";
import MigrarImagensBox from "../components/MigrarImagensBox/MigrarImagensBox";
import BuscaLoteImagensBox from "../components/BuscaLoteImagensBox/BuscaLoteImagensBox";
import Toolbar from "../components/Toolbar/Toolbar";
import ProductTable from "../components/ProductTable/ProductTable";
import Pagination from "../components/Pagination/Pagination";
import Toast from "../components/Toast/Toast";
import DashboardStats from "../components/DashboardStats/DashboardStats";
import CategoriasNaoReconhecidasBox from "../components/CategoriasNaoReconhecidasBox/CategoriasNaoReconhecidasBox";

import { useProdutos } from "../hooks/useProdutos";

function Home() {

    const [toastVisivel, setToastVisivel] = useState(false);
    const [toastMensagem, setToastMensagem] = useState("");
    const [toastTipo, setToastTipo] = useState("sucesso");

    const {

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
        produtosPagina,
        produtosFiltrados,

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

    } = useProdutos();

    function mostrarToast(mensagem, tipo = "sucesso") {

        setToastMensagem(mensagem);
        setToastTipo(tipo);
        setToastVisivel(true);

        setTimeout(() => {
            setToastVisivel(false);
        }, 3000);

    }

    return (

        <>

            <Header />

            <div className="page">

            <ImportBox
                onImportar={setResultadoImportacao}
            />

            <ImportSummary
                resumo={resultadoImportacao}
            />

            <CmedBox
                indice={indiceCmed}
                relatorio={relatorioCmed}
                carregando={carregandoCmed}
                erro={erroCmed}
                carregarLista={carregarListaCmed}
                corrigirClasse={corrigirClasseCmed}
                setCorrigirClasse={setCorrigirClasseCmed}
                corrigirLaboratorio={corrigirLaboratorioCmed}
                setCorrigirLaboratorio={setCorrigirLaboratorioCmed}
                mostrarToast={mostrarToast}
            />

            <MigrarImagensBox
                mostrarToast={mostrarToast}
            />
            {

    resultadoImportacao && (

        <DashboardStats

            produtos={produtosFiltrados}

        />

    )

}

            {

                resultadoImportacao && (

                    <CategoriasNaoReconhecidasBox
                        produtos={produtos}
                    />

                )

            }
            {

                resultadoImportacao && (

                    <Toolbar

                        pesquisa={pesquisa}
                        setPesquisa={setPesquisa}

                        laboratorios={laboratorios}
                        categorias={categorias}
                        classes={classes}
                        abas={abas}

                        laboratorio={laboratorio}
                        setLaboratorio={setLaboratorio}

                        categoria={categoria}
                        setCategoria={setCategoria}

                        classe={classe}
                        setClasse={setClasse}

                        aba={aba}
                        setAba={setAba}

                        apenasSemImagem={apenasSemImagem}
                        setApenasSemImagem={setApenasSemImagem}

                        total={produtosFiltrados.length}

                        limparFiltros={limparFiltros}
                        produtos={produtosFiltrados}
                        produtosCompletos={produtos}
                        mostrarToast={mostrarToast}

                    />

                )

            }

            {

                resultadoImportacao && (

                    <BuscaLoteImagensBox
                        produtos={produtosFiltrados}
                        atualizarProduto={atualizarProduto}
                        mostrarToast={mostrarToast}
                    />

                )

            }

            <ProductTable
                produtos={produtosPagina}
                categorias={categorias}
                classes={classes}
                atualizarProduto={atualizarProduto}
                mostrarToast={mostrarToast}
            />

            <Pagination
                paginaAtual={paginaAtual}
                totalPaginas={totalPaginas}
                mudarPagina={setPaginaAtual}
                totalItens={produtosFiltrados.length}
            />

            <Toast
                visivel={toastVisivel}
                mensagem={toastMensagem}
                tipo={toastTipo}
            />

            </div>

        </>

    );

}

export default Home;