import "./CategoriasNaoReconhecidasBox.css";

// Duas listas sobre o mesmo problema: categorias da planilha que não
// batem com nenhuma família do site.
//
// A de cima é o que o roteamento por nome resolveu sozinho (PERFUMARIA
// virou SHAMPOO, ESMALTES, LINHA INFANTIL...) - está aqui pra ser
// conferida antes de publicar, não pra ser consertada.
//
// A de baixo é o que continua caindo em "Outros" no site: ou a
// categoria precisa entrar no dictionary/familias.js, ou o produto está
// arquivado no lugar errado no FarmaxPDV.
function CategoriasNaoReconhecidasBox({ produtos }) {

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

                            {listaRoteada.map(([rota, qtd]) => (

                                <li key={rota}>
                                    <strong>{rota}</strong>
                                    <span>{qtd.toLocaleString("pt-BR")} produto(s)</span>
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
                        </p>

                        <ul className="categorias-outros-lista">

                            {lista.map(([categoria, qtd]) => (

                                <li key={categoria}>
                                    <strong>{categoria}</strong>
                                    <span>{qtd.toLocaleString("pt-BR")} produto(s)</span>
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
