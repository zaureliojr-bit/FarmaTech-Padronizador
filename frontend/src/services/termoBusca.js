// Usa a pesquisa já construída pelo Search Builder da Inteligência
// (frontend/src/intelligence/search/montarPesquisaImagem.js) quando
// disponível; cai para marca + descrição como último recurso.
export function termoDeBusca(produto) {

    if (produto.pesquisaImagem?.principal) {
        return produto.pesquisaImagem.principal;
    }

    return [produto.marca, produto.descricaoPesquisa || produto.descricaoOriginal]
        .filter(Boolean)
        .join(" ");

}
