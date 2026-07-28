import { useState } from "react";

import ImportBox from "../components/ImportBox/ImportBox";
import ImportSummary from "../components/ImportSummary/ImportSummary";
import Toolbar from "../components/Toolbar/Toolbar";
import ProductTable from "../components/ProductTable/ProductTable";
import Pagination from "../components/Pagination/Pagination";
import Toast from "../components/Toast/Toast";

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
        atualizarProduto

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

            <ImportBox
                onImportar={setResultadoImportacao}
            />

            <ImportSummary
                resumo={resultadoImportacao}
            />

            {

                resultadoImportacao && (

                    <Toolbar

                        pesquisa={pesquisa}
                        setPesquisa={setPesquisa}

                        laboratorios={laboratorios}
                        categorias={categorias}
                        abas={abas}

                        laboratorio={laboratorio}
                        setLaboratorio={setLaboratorio}

                        categoria={categoria}
                        setCategoria={setCategoria}

                        aba={aba}
                        setAba={setAba}

                        total={produtosFiltrados.length}

                        limparFiltros={limparFiltros}
                        produtos={produtosFiltrados}

                    />

                )

            }

            <ProductTable
                produtos={produtosPagina}
                atualizarProduto={atualizarProduto}
                mostrarToast={mostrarToast}
            />

            <Pagination
                paginaAtual={paginaAtual}
                totalPaginas={totalPaginas}
                setPaginaAtual={setPaginaAtual}
            />

            <Toast
                visivel={toastVisivel}
                mensagem={toastMensagem}
                tipo={toastTipo}
            />

        </>

    );

}

export default Home;