import ImportBox from "../components/ImportBox/ImportBox";
import ImportSummary from "../components/ImportSummary/ImportSummary";
import Toolbar from "../components/Toolbar/Toolbar";
import ProductTable from "../components/ProductTable/ProductTable";
import Pagination from "../components/Pagination/Pagination";

import { useProdutos } from "../hooks/useProdutos";

function Home() {

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

                    />

                )

            }

            <ProductTable
                produtos={produtosPagina}
                atualizarProduto={atualizarProduto}
            />

            <Pagination

                paginaAtual={paginaAtual}

                totalPaginas={totalPaginas}

                setPaginaAtual={setPaginaAtual}

            />

        </>

    );

}

export default Home;