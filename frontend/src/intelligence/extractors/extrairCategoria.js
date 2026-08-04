/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Categoria
 * =====================================================
 */

export function extrairCategoria(produto) {

    if (produto.categoriaOriginal) {

        produto.categoria =
            produto.categoriaOriginal;

    }

    return produto;

}