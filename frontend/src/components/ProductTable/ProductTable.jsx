import "./ProductTable.css";

import { useImagem } from "../../hooks/useImagem";
import ImageModal from "../ImageModal/ImageModal";

function ProductTable({
    produtos,
    atualizarProduto,
    mostrarToast
}) {

    const {

        modalAberto,
        abrirModal,
        fecharModal,

        produtoSelecionado,

        imagens,

        imagemSelecionada,
        setImagemSelecionada,

        loading

    } = useImagem();

    if (!produtos || produtos.length === 0) {

        return (

            <div className="tabela-vazia">
                Nenhum produto importado.
            </div>

        );

    }

    return (

        <>

            <div className="table-container">

                <h2>

                    Produtos Importados ({produtos.length})

                </h2>

                <table>

                    <thead>

                        <tr>

                            <th>EAN</th>

                            <th>Descrição</th>

                            <th>Marca</th>

                            <th>Laboratório</th>

                            <th>Categoria</th>

                            <th>Aba</th>

                            <th>Imagem</th>

                            <th>Ações</th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            produtos.map((produto, index) => (

                                <tr key={index}>

                                    <td>{produto.ean}</td>

                                    <td>{produto.descricao}</td>

                                    <td>{produto.marca}</td>

                                    <td>{produto.laboratorio}</td>

                                    <td>{produto.categoria}</td>

                                    <td>{produto.__aba}</td>

                                    <td>

                                        {

                                            produto.statusImagem === "salva"

                                                ?

                                                <div className="status-imagem">

                                                    <img
                                                        src={produto.imagem}
                                                        alt={produto.descricao}
                                                        className="miniatura"
                                                    />

                                                    <span className="status-ok">

                                                        Imagem salva

                                                    </span>

                                                </div>

                                                :

                                                <div className="status-imagem">

                                                    <div className="miniatura-placeholder">

                                                        🚫

                                                    </div>

                                                    <span className="status-sem">

                                                        Sem imagem

                                                    </span>

                                                </div>

                                        }

                                    </td>

                                    <td>

                                        <button

                                            className="btn-imagem"

                                            onClick={() => abrirModal(produto)}

                                        >

                                            {

                                                produto.statusImagem === "salva"

                                                    ? "👁 Ver"

                                                    : "🔍 Buscar"

                                            }

                                        </button>

                                    </td>

                                </tr>

                            ))

                        }

                    </tbody>

                </table>

            </div>

            <ImageModal

                aberto={modalAberto}

                produto={produtoSelecionado}

                imagens={imagens}

                imagemSelecionada={imagemSelecionada}

                setImagemSelecionada={setImagemSelecionada}

                loading={loading}

                fechar={fecharModal}

                atualizarProduto={atualizarProduto}

                mostrarToast={mostrarToast}

            />

        </>

    );

}

export default ProductTable;