/**
 * =====================================================
 * FarmaTech Intelligence
 * Checklist do Produto
 * =====================================================
 */

export function checklistProduto(produto) {

    return {

        descricao: !!produto.descricaoSite,

        marca: !!produto.marca,

        categoria: !!produto.categoria,

        imagem: !!produto.imagem,

        quantidade: !!produto.quantidade,

        apresentacao: !!produto.apresentacao

    };

}