// Aplica UMA URL de imagem escolhida manualmente em vários produtos de
// uma vez - útil pra medicamento/genérico sem foto de embalagem
// própria, onde faz sentido usar uma imagem padrão em vez de buscar
// uma por produto. Diferente das outras caixas em lote (que buscam uma
// imagem diferente por produto), aqui é sempre a mesma URL pra todos.
import { salvarImagem } from "./downloadService";

// Só o upload/salvamento por item (sem busca em fonte externa antes),
// então aguenta mais concorrência que as buscas em lote.
const CONCORRENCIA = 5;

async function executarComConcorrenciaLimitada(itens, tarefa, limite) {

    const fila = [...itens];

    async function trabalhador() {
        while (fila.length) {
            const item = fila.shift();
            await tarefa(item);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limite, itens.length) }, trabalhador)
    );

}

/**
 * @param {Array} produtos - lista já filtrada (ex: só Classe = GENERICO)
 * @param {string} urlImagem - a mesma URL aplicada em todos
 * @param {{ onProgresso?: Function, onProdutoResolvido?: Function }} callbacks
 */
export async function aplicarImagemEmLote(produtos, urlImagem, { onProgresso, onProdutoResolvido } = {}) {

    const pendentes = produtos.filter((produto) => produto.ean);

    const total = pendentes.length;
    let concluidos = 0;
    let sucesso = 0;
    let falha = 0;
    const erros = [];

    onProgresso?.({ total, concluidos, sucesso, falha });

    await executarComConcorrenciaLimitada(pendentes, async (produto) => {

        try {

            const salvo = await salvarImagem(produto, urlImagem, "manual-lote");

            if (!salvo.sucesso) throw new Error(salvo.mensagem);

            onProdutoResolvido?.({ ean: produto.ean, imagem: salvo.caminho });
            sucesso++;

        } catch (erro) {

            falha++;
            erros.push({
                ean: produto.ean,
                descricao: produto.descricaoSite || produto.descricaoOriginal,
                erro: erro.message
            });

        } finally {

            concluidos++;
            onProgresso?.({ total, concluidos, sucesso, falha });

        }

    }, CONCORRENCIA);

    return { total, sucesso, falha, erros: erros.slice(0, 30) };

}
