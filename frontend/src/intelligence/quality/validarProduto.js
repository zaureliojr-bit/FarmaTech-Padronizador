/**
 * =====================================================
 * FarmaTech Intelligence
 * Validador de Produto
 * =====================================================
 */

export function validarProduto(produto) {

    produto.erros = [];

    if (!produto.descricaoSite) {

        produto.erros.push("Descrição do site não gerada.");

    }

    if (!produto.marca) {

        produto.erros.push("Marca não identificada.");

    }

    if (!produto.categoria) {

        produto.erros.push("Categoria não identificada.");

    }

    if (!produto.imagem) {

        produto.erros.push("Imagem não encontrada.");

    }

    return produto;

}