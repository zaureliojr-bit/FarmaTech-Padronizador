import "./CategoriasNaoReconhecidasBox.css";

// Lê a categoria bruta de cada produto que caiu em "Outros" (não bateu
// com nenhuma família do dictionary/familias.js) e conta quantos
// produtos tem em cada uma - é a lista que decide o que precisa entrar
// no dictionary pra parar de cair em "Outros" no site.
function CategoriasNaoReconhecidasBox({ produtos }) {

    const contagem = new Map();

    produtos.forEach((produto) => {

        if (produto.familia !== "outros" || !produto.categoria) return;

        contagem.set(produto.categoria, (contagem.get(produto.categoria) || 0) + 1);

    });

    const lista = [...contagem.entries()].sort((a, b) => b[1] - a[1]);

    if (!lista.length) return null;

    const totalProdutos = lista.reduce((soma, [, qtd]) => soma + qtd, 0);

    return (

        <div className="categorias-outros-box">

            <div className="categorias-outros-cabecalho">

                <h2>⚠️ Categorias caindo em "Outros"</h2>

                <span className="categorias-outros-contagem">
                    {lista.length} categoria(s) · {totalProdutos.toLocaleString("pt-BR")} produto(s)
                </span>

            </div>

            <p className="categorias-outros-ajuda">
                Essas categorias da planilha não batem com nenhuma família
                conhecida do site - os produtos aparecem em "Outros" em vez
                da seção certa.
            </p>

            <ul className="categorias-outros-lista">

                {lista.map(([categoria, qtd]) => (

                    <li key={categoria}>
                        <strong>{categoria}</strong>
                        <span>{qtd.toLocaleString("pt-BR")} produto(s)</span>
                    </li>

                ))}

            </ul>

        </div>

    );

}

export default CategoriasNaoReconhecidasBox;
