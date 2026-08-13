import { useState } from "react";

import "./ProductTable.css";

import ImageModal from "../ImageModal/ImageModal";
import { useImagem } from "../../hooks/useImagem";

function classeQualidade(score) {

    if (score >= 90) return "qualidade-boa";
    if (score >= 50) return "qualidade-media";

    return "qualidade-baixa";

}

function CelulaDescricao({ produto, atualizarProduto }) {

    const [editando, setEditando] = useState(false);
    const [valor, setValor] = useState(produto.descricaoSite);

    const editadaManualmente = !!produto.descricaoManual;

    function iniciarEdicao() {

        setValor(produto.descricaoSite);
        setEditando(true);

    }

    function salvar() {

        const novoValor = valor.trim();

        // Vazio ou igual à versão automática = não é mais uma
        // sobrescrita manual, volta a acompanhar o pipeline.
        atualizarProduto({
            ean: produto.ean,
            descricaoManual: novoValor && novoValor !== produto.descricaoSiteAuto
                ? novoValor
                : ""
        });

        setEditando(false);

    }

    function cancelar() {

        setEditando(false);

    }

    function reverterParaAutomatica() {

        atualizarProduto({ ean: produto.ean, descricaoManual: "" });
        setEditando(false);

    }

    if (editando) {

        return (

            <div className="celula-descricao-edicao">

                <textarea
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            salvar();
                        } else if (e.key === "Escape") {
                            cancelar();
                        }
                    }}
                    autoFocus
                    rows={3}
                />

                <div className="celula-descricao-acoes">

                    <button className="btn-mini btn-mini-salvar" onClick={salvar}>
                        Salvar
                    </button>

                    <button className="btn-mini" onClick={cancelar}>
                        Cancelar
                    </button>

                </div>

            </div>

        );

    }

    return (

        <div className="celula-descricao">

            <span>{produto.descricaoSite}</span>

            <div className="celula-descricao-toolbar">

                {

                    produto.bloqueioPresencial && (

                        <span
                            className="badge-bloqueio"
                            title={`Retenção de receita obrigatória - ${produto.controleEspecial} (${produto.tipoReceita}). Não entra no carrinho do site.`}
                        >
                            🔴 Retém receita
                        </span>

                    )

                }

                {

                    produto.receitaRemota && (

                        <span
                            className="badge-remoto"
                            title={`Controle especial - ${produto.controleEspecial} (${produto.tipoReceita}). Entra no carrinho; site cobra confirmação da receita antes do envio.`}
                        >
                            📋 Controle especial
                        </span>

                    )

                }

                {

                    produto.acimaDoPmc && (

                        <span
                            className="badge-pmc"
                            title="Preço acima do máximo legal (PMC) - viola a Lei 10.742/2003"
                        >
                            💰 Acima do PMC
                        </span>

                    )

                }

                {

                    editadaManualmente && (

                        <span className="badge-manual" title="Descrição editada manualmente">
                            ✏️ Manual
                        </span>

                    )

                }

                <button
                    className="btn-editar-descricao"
                    onClick={iniciarEdicao}
                    title="Editar descrição"
                >
                    ✏️
                </button>

                {

                    editadaManualmente && (

                        <button
                            className="btn-editar-descricao"
                            onClick={reverterParaAutomatica}
                            title="Reverter para a descrição automática"
                        >
                            ↺
                        </button>

                    )

                }

            </div>

        </div>

    );

}

// Editor de campo livre de uma linha (venda, promoção, estoque) -
// clica, digita, Enter ou clique fora salva, Esc cancela.
function CelulaTexto({ valor, onSalvar, formatarExibicao }) {

    const valorTexto = valor == null ? "" : String(valor);

    const [editando, setEditando] = useState(false);
    const [valorEditado, setValorEditado] = useState(valorTexto);

    function iniciarEdicao() {

        setValorEditado(valorTexto);
        setEditando(true);

    }

    function salvar() {

        setEditando(false);

        const novoValor = valorEditado.trim();

        if (novoValor === valorTexto) return;

        onSalvar(novoValor);

    }

    if (editando) {

        return (

            <input
                className="celula-texto-input"
                type="text"
                value={valorEditado}
                onChange={(e) => setValorEditado(e.target.value)}
                onBlur={salvar}
                onKeyDown={(e) => {
                    if (e.key === "Enter") salvar();
                    else if (e.key === "Escape") setEditando(false);
                }}
                autoFocus
            />

        );

    }

    return (

        <button
            className="celula-texto"
            onClick={iniciarEdicao}
            title="Clique para editar"
        >

            <span>{formatarExibicao ? formatarExibicao(valorTexto) : (valorTexto || "—")}</span>

            <span className="icone-editar">✏️</span>

        </button>

    );

}

// Editor de campos com vocabulário fechado (classe, categoria) - só
// deixa escolher entre valores já cadastrados no catálogo importado,
// não digitar um novo.
function CelulaSelecao({ valor, opcoes, onSalvar, aviso }) {

    const [editando, setEditando] = useState(false);

    if (editando) {

        // Garante que o valor atual apareça na lista mesmo se, por
        // algum motivo, não estiver entre as opções coletadas.
        const listaCompleta = valor && !opcoes.includes(valor)
            ? [valor, ...opcoes]
            : opcoes;

        return (

            <select
                className="celula-selecao-input"
                autoFocus
                defaultValue={valor || ""}
                onChange={(e) => {
                    onSalvar(e.target.value);
                    setEditando(false);
                }}
                onBlur={() => setEditando(false)}
            >

                <option value="">—</option>

                {listaCompleta.map((opcao) => (
                    <option key={opcao} value={opcao}>
                        {opcao}
                    </option>
                ))}

            </select>

        );

    }

    return (

        <div className="celula-selecao-wrap">

            <button
                className="celula-selecao"
                onClick={() => setEditando(true)}
                title="Clique para escolher outro valor"
            >

                <span>{valor || "—"}</span>

                <span className="icone-editar">✏️</span>

            </button>

            {

                aviso && (

                    <span className="badge-aviso" title={aviso}>
                        ⚠️
                    </span>

                )

            }

        </div>

    );

}

function ProductTable({
    produtos,
    categorias,
    classes,
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

                            <th>Qualidade</th>

                            <th>Imagem</th>

                            <th>Ações</th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            produtos.map((produto, index) => (

                                <tr key={`${produto.codigo}-${produto.aba}-${index}`}>


                                    <td>{produto.codigo}</td>

                                    <td>{produto.ean}</td>

                                    <td className="td-descricao">

                                        <CelulaDescricao
                                            produto={produto}
                                            atualizarProduto={atualizarProduto}
                                        />

                                    </td>

                                    <td>

                                        <CelulaSelecao
                                            valor={produto.classe}
                                            opcoes={classes}
                                            onSalvar={(novoValor) => atualizarProduto({ ean: produto.ean, classe: novoValor })}
                                        />

                                    </td>

                                    <td>

                                        <CelulaSelecao
                                            valor={produto.categoria}
                                            opcoes={categorias}
                                            onSalvar={(novoValor) => atualizarProduto({ ean: produto.ean, categoria: novoValor })}
                                            aviso={
                                                produto.categoria && produto.familia === "outros"
                                                    ? `Categoria fora das famílias do site - vai cair em "Outros".`
                                                    : null
                                            }
                                        />

                                    </td>

                                    <td>{produto.laboratorio}</td>

                                    <td>

                                        <CelulaTexto
                                            valor={produto.precoVenda}
                                            formatarExibicao={(v) => `R$ ${v}`}
                                            onSalvar={(novoValor) => atualizarProduto({ ean: produto.ean, precoVenda: novoValor })}
                                        />

                                    </td>

                                    <td>

                                        <CelulaTexto
                                            valor={produto.precoPromocao}
                                            formatarExibicao={(v) => v && v !== "0,00" ? `🔥 R$ ${v}` : "-"}
                                            onSalvar={(novoValor) => atualizarProduto({ ean: produto.ean, precoPromocao: novoValor })}
                                        />

                                    </td>

                                    <td>

                                        R$ {produto.precoCusto}

                                    </td>

                                    <td>

                                        <CelulaTexto
                                            valor={produto.estoque}
                                            onSalvar={(novoValor) => atualizarProduto({ ean: produto.ean, estoque: novoValor })}
                                        />

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
