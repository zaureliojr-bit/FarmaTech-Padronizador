/**
 * Guarda o índice da CMED no navegador, para não ter que reimportar a
 * planilha toda vez que o padronizador abre.
 *
 * É IndexedDB e não localStorage porque o índice tem uns 2,4 MB. O
 * localStorage costuma parar em 5 MB contados em UTF-16, o que deixaria
 * quase nada de folga — e ele estoura com exceção, no meio da gravação.
 */

import { abrirBanco, STORE_CMED as ARMAZEM } from "./db";

const CHAVE = "indice";

function transacao(db, modo, executar) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(ARMAZEM, modo);
        const pedido = executar(tx.objectStore(ARMAZEM));

        // O resultado sai no pedido, mas quem garante que a escrita foi
        // ao disco é a transação: por isso os dois eventos são ouvidos.
        tx.oncomplete = () => resolve(pedido ? pedido.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);

    });

}

/** Grava o índice. Devolve false se não deu (e o app segue funcionando). */
export async function salvarIndiceCmed(indice) {

    let db;

    try {

        db = await abrirBanco();

        await transacao(db, "readwrite", (armazem) => armazem.put(indice, CHAVE));

        return true;

    } catch (erro) {

        // Navegação privada e cota cheia caem aqui. Não é motivo para
        // travar: o índice continua na memória até fechar a aba.
        console.warn("Não consegui guardar a lista da CMED no navegador.", erro);

        return false;

    } finally {

        if (db) db.close();

    }

}

/** Lê o índice guardado, ou null se não houver nenhum. */
export async function carregarIndiceCmed() {

    let db;

    try {

        db = await abrirBanco();

        const indice = await transacao(
            db,
            "readonly",
            (armazem) => armazem.get(CHAVE)
        );

        return indice || null;

    } catch (erro) {

        console.warn("Não consegui ler a lista da CMED guardada.", erro);

        return null;

    } finally {

        if (db) db.close();

    }

}

/** Apaga o índice guardado. */
export async function apagarIndiceCmed() {

    let db;

    try {

        db = await abrirBanco();

        await transacao(db, "readwrite", (armazem) => armazem.delete(CHAVE));

        return true;

    } catch (erro) {

        console.warn("Não consegui apagar a lista da CMED guardada.", erro);

        return false;

    } finally {

        if (db) db.close();

    }

}
