/**
 * =====================================================
 * FarmaTech Intelligence
 * Score do Produto
 * =====================================================
 */

export function calcularScore(produto) {

    let score = 0;

    if (produto.descricaoSite) score += 20;

    if (produto.marca) score += 20;

    if (produto.categoria) score += 20;

    if (produto.imagem) score += 20;

    if (produto.quantidade) score += 10;

    if (produto.apresentacao) score += 10;

    produto.score = score;

    produto.pipelineAtual = "Qualidade";

    produto.historico.push({

        etapa: "Qualidade",

        mensagem: `Score atualizado para ${score}%.`

    });

    return produto;

}