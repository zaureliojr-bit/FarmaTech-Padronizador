import { useCallback, useRef } from "react";

/**
 * Acumula itens resolvidos por uma busca em lote (imagem ou descrição)
 * e aplica em grupos, em vez de um `atualizarProduto` por item. Cada
 * atualização re-analisa o catálogo inteiro (analisarProduto roda pra
 * todo mundo de novo) - com itens resolvendo rápido (ex: descrição
 * achada localmente, sem rede), aplicar um por um enfileira re-análises
 * demais e trava a aba. Agrupar por tempo (não só no final) mantém a
 * barra de progresso atualizando aos poucos, sem recair no mesmo problema.
 */
export function useAcumuladorAtualizacoes(atualizarProdutosEmLote, intervaloMs = 400) {

    const bufferRef = useRef([]);
    const timerRef = useRef(null);

    const esvaziar = useCallback(() => {

        if (!bufferRef.current.length) return;

        const lote = bufferRef.current;
        bufferRef.current = [];

        atualizarProdutosEmLote(lote);

    }, [atualizarProdutosEmLote]);

    const adicionar = useCallback((item) => {

        bufferRef.current.push(item);

        if (!timerRef.current) {

            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                esvaziar();
            }, intervaloMs);

        }

    }, [esvaziar, intervaloMs]);

    const finalizar = useCallback(() => {

        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        esvaziar();

    }, [esvaziar]);

    return { adicionar, finalizar };

}
