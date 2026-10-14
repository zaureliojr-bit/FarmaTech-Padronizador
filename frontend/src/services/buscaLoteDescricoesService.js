// Busca automática em lote: pra cada produto sem descrição corrigida
// manualmente na lista recebida, busca na cascata de sempre (Cosmos ->
// Open Beauty/Food Facts -> CMED) e usa o resultado como sobrescrita
// manual - sem revisão humana por item. Pensado pra rodar sobre uma
// lista já filtrada (por classe, categoria etc.), não o catálogo
// inteiro de uma vez. Nunca mexe em produto que já tem descricaoManual
// - o que já foi revisado (por essa busca ou à mão) fica intocado.
import { buscarDescricaoProduto } from "./descricaoService";

// Mesmo motivo da busca de imagem em lote: cada item dispara até 3
// chamadas de rede (Cosmos + 2x Open Facts) - concorrência baixa pra
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
export async function buscarDescricoesEmLote(produtos, { onProgresso, onProdutoResolvido } = {}) {

    const pendentes = produtos.filter(
        (produto) => produto.ean && !produto.descricaoManual
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

            const sugestao = await buscarDescricaoProduto(produto);

            const igualAtual = sugestao &&
                sugestao.toLowerCase() === produto.descricaoSite.trim().toLowerCase();

            if (!sugestao || igualAtual) {

                semResultado++;

            } else {

                onProdutoResolvido?.({ ean: produto.ean, descricaoManual: sugestao });
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
