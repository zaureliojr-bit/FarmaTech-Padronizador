/**
 * =====================================================
 * FarmaTech Intelligence
 * Gerador de Descrição para Pesquisa
 * =====================================================
 *
 * Responsabilidade:
 * Criar uma cópia padronizada da descrição original
 * para ser utilizada nas próximas etapas da inteligência.
 *
 * Entrada:
 * Produto Inteligente.
 *
 * Saída:
 * Produto Inteligente com descricaoPesquisa.
 *
 * Pipeline:
 * ETAPA 03 - Normalização
 *
 * Sprint:
 * 7.3
 */

export function gerarDescricaoPesquisa(produto) {

    if (!produto.descricaoOriginal) {

        return produto;

    }

    let descricao = produto.descricaoOriginal;

    descricao = descricao.trim();

    descricao = descricao.replace(/\s+/g, " ");

    produto.descricaoPesquisa = descricao;

    produto.pipelineAtual = "Normalização";

    produto.historico.push({

        etapa: "Normalização",

        mensagem: "Descrição para pesquisa preparada."

    });

    produto.atualizadoEm = new Date();

    return produto;

}