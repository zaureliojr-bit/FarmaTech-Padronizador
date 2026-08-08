import "./ProductTable.css";

import ImageModal from "../ImageModal/ImageModal";
import { useImagem } from "../../hooks/useImagem";

function classeQualidade(score) {

    if (score >= 90) return "qualidade-boa";
    if (score >= 50) return "qualidade-media";

    return "qualidade-baixa";

}

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

        loading,

        modoManual,
        linkBusca,
        adicionarImagemManual

    } = useImagem();

    return (

        <>

            <div className="table-container">

                <table>

                    <thead>

                        <tr>

                            <th>Código</th>

                            <th>EAN</th>

                            <th>Produto</th>

                            <th>Classe</th>

                            <th>Categoria</th>

                            <th>Laboratório</th>

                            <th>Venda</th>

                            <th>Promo</th>

                            <th>Custo</th>

                            <th>Estoque</th>

                            <th>Aba</th>

                            <th>Qualidade</th>

                            <th>Imagem</th>

                            <th>Ações</th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            produtos.map((produto, index) => (

                                <tr key={`${produto.codigo}-${produto.__aba}-${index}`}>
                                

                                    <td>{produto.codigo}</td>

                                    <td>{produto.ean}</td>

                                    <td>{produto.descricaoSite}</td>

                                    <td>{produto.classe}</td>

                                    <td>{produto.categoria}</td>

                                    <td>{produto.laboratorio}</td>

                                    <td>

                                        R$ {produto.precoVenda}

                                    </td>

                                    <td>

                                        {

                                            produto.precoPromocao &&
                                            produto.precoPromocao !== "0,00"

                                                ? `🔥 R$ ${produto.precoPromocao}`

                                                : "-"

                                        }

                                    </td>

                                    <td>

                                        R$ {produto.precoCusto}

                                    </td>

                                    <td>

                                        {produto.estoque}

                                    </td>

                                    <td>

                                        {produto.__aba}

                                    </td>

                                    <td>

                                        <div className={`badge-qualidade ${classeQualidade(produto.score)}`}>

                                            <strong>{produto.score}%</strong>

                                            <span>{produto.diagnostico}</span>

                                        </div>

                                    </td>

                                    <td>

                                        {

                                            produto.statusImagem === "salva"

                                                ?

                                                <div className="status-imagem">

                                                    <img

                                                        src={produto.imagem}

                                                        alt={produto.descricaoSite}

                                                        className="miniatura"

                                                    />

                                                    <span className="status-ok">

                                                        Imagem salva

                                                    </span>

                                                </div>

                                                :

                                                <div className="status-imagem">

                                                    <div className="miniatura-placeholder">

                                                        🖼️

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

                modoManual={modoManual}

                linkBusca={linkBusca}

                adicionarImagemManual={adicionarImagemManual}

            />

        </>

    );

}

export default ProductTable;