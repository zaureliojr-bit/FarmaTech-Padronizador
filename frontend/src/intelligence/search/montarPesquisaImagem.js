/**
 * =====================================================
 * FarmaTech Intelligence
 * Search Builder
 * =====================================================
 *
 * Responsabilidade:
 * Construir uma pesquisa inteligente para localizar
 * imagens de produtos.
 *
 * Sprint:
 * 8.1
 */

export function montarPesquisaImagem(produto) {

    const palavras = [];

    // =============================
    // Identificação
    // =============================

    if (produto.marca)
        palavras.push(produto.marca);

    if (produto.linha)
        palavras.push(produto.linha);

    if (produto.descricaoPesquisa)
        palavras.push(produto.descricaoPesquisa);

    // =============================
    // Características
    // =============================

    if (produto.apresentacao)
        palavras.push(produto.apresentacao);

    if (produto.quantidade)
        palavras.push(`${produto.quantidade} unidades`);

    if (produto.peso)
        palavras.push(produto.peso);

    if (produto.volume)
        palavras.push(produto.volume);

    // =============================
    // Complementos
    // =============================

    if (produto.laboratorio)
        palavras.push(produto.laboratorio);

    palavras.push("embalagem");

    return {

        principal: palavras.join(" "),

        palavras,

        tipo: "imagem"

    };

}