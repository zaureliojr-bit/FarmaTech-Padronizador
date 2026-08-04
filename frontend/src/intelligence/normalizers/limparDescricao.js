/**
 * =====================================================
 * FarmaTech Intelligence
 * Sanitizador de Descrição
 * =====================================================
 *
 * Responsabilidade:
 * Limpar a descrição original removendo caracteres
 * e espaços desnecessários, preservando seu conteúdo.
 *
 * Entrada:
 * Produto Inteligente.
 *
 * Saída:
 * Produto Inteligente com a descrição sanitizada.
 *
 * Pipeline:
 * ETAPA 02 - Sanitização
 *
 * Sprint:
 * 7.2 - O Despertar da Inteligência
 */

export function limparDescricao(produto) {

    if (!produto.descricaoOriginal) {

        return produto;

    }

    const descricaoOriginal = produto.descricaoOriginal;

    let descricao = descricaoOriginal;

    // Remove tabulações
    descricao = descricao.replace(/\t/g, " ");

    // Remove quebras de linha
    descricao = descricao.replace(/\r/g, " ");
    descricao = descricao.replace(/\n/g, " ");

    // Remove espaços duplicados
    descricao = descricao.replace(/\s+/g, " ");

    // Remove espaços no início e no fim
    descricao = descricao.trim();

    produto.descricaoOriginal = descricao;

    produto.pipelineAtual = "Sanitização";

    if (descricao !== descricaoOriginal) {

        produto.historico.push({

            etapa: "Sanitização",

            mensagem: "Espaços e caracteres desnecessários removidos."

        });

    } else {

        produto.historico.push({

            etapa: "Sanitização",

            mensagem: "Nenhuma alteração necessária."

        });

    }

    produto.atualizadoEm = new Date();

    return produto;

}