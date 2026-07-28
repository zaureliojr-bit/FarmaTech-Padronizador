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

            <th>Imagem</th>

            <th>Ações</th>

        </tr>

    </thead>

    <tbody>

        {

            produtos.map((produto, index) => (

                <tr key={index}>

                    <td>{produto.codigo}</td>

                    <td>{produto.ean}</td>

                    <td>{produto.descricao}</td>

                    <td>{produto.classe}</td>

                    <td>{produto.categoria}</td>

                    <td>{produto.laboratorio}</td>

                    <td>R$ {produto.precoVenda}</td>

                    <td>

                        {

                            produto.precoPromocao &&
                            produto.precoPromocao !== "0,00"

                                ? `🔥 R$ ${produto.precoPromocao}`

                                : "-"

                        }

                    </td>

                    <td>R$ {produto.precoCusto}</td>

                    <td>{produto.estoque}</td>

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