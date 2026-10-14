import { useState } from "react";

import "./CategoriasNaoReconhecidasBox.css";
import { FAMILIAS } from "../../intelligence/dictionary/familias";

// Duas listas sobre o mesmo problema: categorias da planilha que não
// batem com nenhuma família do site.
//
// A de cima é o que o roteamento por nome resolveu sozinho (PERFUMARIA
// virou SHAMPOO, ESMALTES, LINHA INFANTIL...) - está aqui pra ser
// conferida antes de publicar, não pra ser consertada.
//
// A de baixo é o que continua caindo em "Outros" no site. Para essas, a
// correção é feita aqui mesmo: escolher a família vale na hora e fica
// guardada pras próximas importações, sem precisar de deploy.
function CategoriasNaoReconhecidasBox({ produtos, corrigirFamilia, mostrarToast }) {

    const [selecoes, setSelecoes] = useState({});
    const [salvando, setSalvando] = useState(new Set());

    const roteados = new Map();
    const semFamilia = new Map();

    produtos.forEach((produto) => {

        if (produto.categoriaRoteada) {

            const chave = (produto.categoriaOriginal || "?") + " → " + produto.categoria;

            roteados.set(chave, (roteados.get(chave) || 0) + 1);

            return;

        }

        if (produto.familia !== "outros" || !produto.categoria) return;

        semFamilia.set(produto.categoria, (semFamilia.get(produto.categoria) || 0) + 1);

    });

    const listaRoteada = [...roteados.entries()].sort((a, b) => b[1] - a[1]);
    const lista = [...semFamilia.entries()].sort((a, b) => b[1] - a[1]);

    if (!lista.length && !listaRoteada.length) return null;

    const totalProdutos = lista.reduce((soma, [, qtd]) => soma + qtd, 0);
    const totalRoteado = listaRoteada.reduce((soma, [, qtd]) => soma + qtd, 0);

    async function salvar(categoria) {

        const familiaId = selecoes[categoria];

        if (!familiaId) {
            mostrarToast?.("Escolha uma família antes de salvar.", "erro");
            return;
        }

        setSalvando((atual) => new Set(atual).add(categoria));

        try {

            await corrigirFamilia(categoria, familiaId);

            mostrarToast?.(`"${categoria}" associada à família escolhida.`, "sucesso");

        } catch (erro) {

            mostrarToast?.(erro.message || "Erro ao salvar a correção de família.", "erro");

        } finally {

            setSalvando((atual) => {
                const novo = new Set(atual);
                novo.delete(categoria);
                return novo;
            });

        }

    }

    return (

        <div className={
            lista.length
                ? "categorias-outros-box"
                : "categorias-outros-box categorias-outros-box-sem-alerta"
        }>

            {

                listaRoteada.length > 0 && (

                    <div className="categorias-roteadas">

                        <div className="categorias-outros-cabecalho">

                            <h2>↪ Categorias deduzidas pelo nome</h2>

                            <span className="categorias-outros-contagem">
                                {totalRoteado.toLocaleString("pt-BR")} produto(s)
                            </span>

                        </div>

                        <p className="categorias-outros-ajuda">
                            A categoria da planilha não batia com nenhuma família do
                            site, então o nome do produto decidiu. Vale conferir por
                            amostragem - na tabela, essas categorias têm um ↪ ao lado,
                            e trocar à mão sempre vence a dedução.
                        </p>

                        <ul className="categorias-outros-lista">

                            {listaRoteada.map(([chave, qtd]) => (

                                <li key={chave}>
                                    <div className="categorias-outros-item-info">
                                        <strong>{chave}</strong>
                                        <span>{qtd.toLocaleString("pt-BR")} produto(s)</span>
                                    </div>
                                </li>

                            ))}

                        </ul>

                    </div>

                )

            }

            {

                lista.length > 0 && (

                    <>

                        <div className="categorias-outros-cabecalho">

                            <h2>⚠️ Categorias caindo em "Outros"</h2>

                            <span className="categorias-outros-contagem">
                                {lista.length} categoria(s) · {totalProdutos.toLocaleString("pt-BR")} produto(s)
                            </span>

                        </div>

                        <p className="categorias-outros-ajuda">
                            Essas categorias da planilha não batem com nenhuma família
                            conhecida do site e o nome do produto também não resolveu -
                            os produtos aparecem em "Outros" em vez da seção certa.
                            Escolha a família certa pra cada uma; fica valendo na hora
                            e também pras próximas importações.
                        </p>

                        <ul className="categorias-outros-lista">

                            {lista.map(([categoria, qtd]) => (

                                <li key={categoria}>

                                    <div className="categorias-outros-item-info">
                                        <strong>{categoria}</strong>
                                        <span>{qtd.toLocaleString("pt-BR")} produto(s)</span>
                                    </div>

                                    {

                                        corrigirFamilia && (

                                            <div className="categorias-outros-item-acao">

                                                <select
                                                    value={selecoes[categoria] || ""}
                                                    onChange={(e) => setSelecoes((atual) => ({ ...atual, [categoria]: e.target.value }))}
                                                >
                                                    <option value="">Escolher família...</option>

                                                    {FAMILIAS.map((familia) => (
                                                        <option key={familia.id} value={familia.id}>
                                                            {familia.nome}
                                                        </option>
                                                    ))}

                                                </select>

                                                <button
                                                    className="btn-mini btn-mini-salvar"
                                                    onClick={() => salvar(categoria)}
                                                    disabled={salvando.has(categoria)}
                                                >
                                                    {salvando.has(categoria) ? "Salvando..." : "Salvar"}
                                                </button>

                                            </div>

                                        )

                                    }

                                </li>

                            ))}

                        </ul>

                    </>

                )

            }

        </div>

    );

}

export default CategoriasNaoReconhecidasBox;
