/**
 * Guarda o índice de grupo farmacológico no navegador, pra não precisar
 * reimportar a planilha toda vez que o padronizador abre. Mesmo padrão
 * de cmedStorage.js/distribuidorStorage.js (IndexedDB, não localStorage).
 */

import { abrirBanco, STORE_GRUPO_FARMACOLOGICO as ARMAZEM } from "./db";

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
export async function salvarIndiceGrupoFarmacologico(indice) {

    let db;

    try {

        db = await abrirBanco();

        await transacao(db, "readwrite", (armazem) => armazem.put(indice, CHAVE));

        return true;

    } catch (erro) {

        console.warn("Não consegui guardar a classificação farmacológica no navegador.", erro);

        return false;

    } finally {

        if (db) db.close();

    }

}

/** Lê o índice guardado, ou null se não houver nenhum. */
export async function carregarIndiceGrupoFarmacologico() {

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

        console.warn("Não consegui ler a classificação farmacológica guardada.", erro);

        return null;

    } finally {

        if (db) db.close();

    }

}
