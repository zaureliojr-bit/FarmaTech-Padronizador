// Busca automática em lote: para cada produto sem imagem na lista
// recebida, busca na Cosmos/Serper (mesma cascata de sempre) e salva a
// primeira imagem encontrada, hospedada no R2 - sem revisão humana por
// item. Pensado pra rodar sobre uma lista já filtrada (por classe,
// categoria etc.), não o catálogo inteiro de uma vez.
import { buscarImagens } from "./imagemService";
import { salvarImagem } from "./downloadService";

// Cada item já dispara até 3 chamadas de rede (Cosmos + 2x Serper) mais
// o salvamento - concorrência menor que a migração (que só salva) pra
// não sobrecarregar as APIs de origem.
const CONCORRENCIA = 3;

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
 * @param {Array} produtos - lista já filtrada (ex: só uma classe/categoria)
 * @param {{ onProgresso?: Function, onProdutoResolvido?: Function }} callbacks
 */
export async function buscarImagensEmLote(produtos, { onProgresso, onProdutoResolvido } = {}) {

    const pendentes = produtos.filter(
        (produto) => produto.ean && produto.statusImagem !== "salva"
    );

    const total = pendentes.length;
    let concluidos = 0;
    let sucesso = 0;
    let semResultado = 0;
    let falha = 0;
    const erros = [];

    onProgresso?.({ total, concluidos, sucesso, semResultado, falha });

    await executarComConcorrenciaLimitada(pendentes, async (produto) => {

        try {

            const resultado = await buscarImagens(produto);
            const primeira = resultado.imagens?.[0];

            if (!primeira) {

                semResultado++;

            } else {

                const salvo = await salvarImagem(produto, primeira, resultado.origem);

                if (!salvo.sucesso) throw new Error(salvo.mensagem);

                onProdutoResolvido?.({ ean: produto.ean, imagem: salvo.caminho });
                sucesso++;

            }

        } catch (erro) {

            falha++;
            erros.push({
                ean: produto.ean,
                descricao: produto.descricaoSite || produto.descricaoOriginal,
                erro: erro.message
            });

        } finally {

            concluidos++;
            onProgresso?.({ total, concluidos, sucesso, semResultado, falha });

        }

    }, CONCORRENCIA);

    return { total, sucesso, semResultado, falha, erros: erros.slice(0, 30) };

}
