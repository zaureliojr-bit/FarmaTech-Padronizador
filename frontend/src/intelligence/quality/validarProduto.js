/**
 * =====================================================
 * FarmaTech Intelligence
 * Validador de Produto
 * =====================================================
 */

export function validarProduto(produto) {

    produto.erros = [];
    produto.avisos = [];

    if (!produto.descricaoSite) {

        produto.erros.push("Descrição do site não gerada.");

    }

    if (!produto.marca) {

        produto.erros.push("Marca não identificada.");

    }

    if (!produto.categoria) {

        produto.erros.push("Categoria não identificada.");

    } else if (produto.familia === "outros") {

        // Não é um erro - "Outros" existe no site - mas vale avisar,
        // porque às vezes é só um erro de digitação na planilha
        // (ex: "GENÉRICO" com acento não bate com "GENERICO").
        produto.avisos.push(`Categoria "${produto.categoria}" não reconhecida pelo site - vai cair em "Outros".`);

    }

    if (!produto.imagem) {

        produto.erros.push("Imagem não encontrada.");

    }

    return produto;

}