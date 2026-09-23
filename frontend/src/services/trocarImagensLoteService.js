// Busca automática em lote pra SUBSTITUIR a imagem de produtos que já
// têm uma salva - diferente da busca em lote normal (buscaLoteImagensService),
// que só preenche quem está vazio e nunca mexe em quem já resolveu.
// Ignora o cache local de cada EAN antes de buscar, senão a busca
// devolveria a mesma imagem de sempre - mesmo motivo do "🔄 Buscar
// novamente" dentro do modal individual (useImagem.js).
import { buscarImagens } from "./imagemService";
import { salvarImagem } from "./downloadService";
import { limparCache } from "./imagemCache";

// Mesma concorrência da busca em lote normal - cada item dispara até 3
// chamadas de rede (Cosmos + 2x Serper) mais o salvamento.
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
export async function trocarImagensEmLote(produtos, { onProgresso, onProdutoResolvido } = {}) {

    const pendentes = produtos.filter(
        (produto) => produto.ean && produto.statusImagem === "salva"
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

            limparCache(produto.ean);

            const resultado = await buscarImagens({ ...produto, statusImagem: "" });
            const primeira = resultado.imagens?.[0];

            if (!primeira || primeira === produto.imagem) {

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
