/**
 * Guarda o índice da distribuidora no navegador, pra não precisar
 * reimportar a planilha toda vez que o padronizador abre. Mesmo padrão
 * de cmedStorage.js (IndexedDB, não localStorage - índice pode passar
 * de alguns MB).
 */

import { abrirBanco, STORE_DISTRIBUIDOR as ARMAZEM } from "./db";

const CHAVE = "indice";

function transacao(db, modo, executar) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(ARMAZEM, modo);
        const pedido = executar(tx.objectStore(ARMAZEM));

        tx.oncomplete = () => resolve(pedido ? pedido.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);

    });

}

/** Grava o índice. Devolve false se não deu (e o app segue funcionando). */
export async function salvarIndiceDistribuidor(indice) {

    let db;

    try {

        db = await abrirBanco();

        await transacao(db, "readwrite", (armazem) => armazem.put(indice, CHAVE));

        return true;

    } catch (erro) {

        console.warn("Não consegui guardar a lista da distribuidora no navegador.", erro);

        return false;

    } finally {

        if (db) db.close();

    }

}

/** Lê o índice guardado, ou null se não houver nenhum. */
export async function carregarIndiceDistribuidor() {

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

        console.warn("Não consegui ler a lista da distribuidora guardada.", erro);

        return null;

    } finally {

        if (db) db.close();

    }

}
