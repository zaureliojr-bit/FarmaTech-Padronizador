const DB_NAME = "farmatech";
const DB_VERSION = 1;
const STORE = "imagens";

function abrirDB() {

    return new Promise((resolve, reject) => {

        const requisicao = indexedDB.open(DB_NAME, DB_VERSION);

        requisicao.onupgradeneeded = () => {

            const db = requisicao.result;

            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: "ean" });
            }

        };

        requisicao.onsuccess = () => resolve(requisicao.result);
        requisicao.onerror = () => reject(requisicao.error);

    });

}

// Baixa a imagem como blob. Retorna null se o site de origem não
// liberar CORS para leitura dos bytes (nesse caso só dá pra exibir
// via <img src>, não pra guardar o arquivo em si).
export async function baixarBlob(url) {

    try {

        const resposta = await fetch(url);

        if (!resposta.ok) return null;

        return await resposta.blob();

    } catch {

        return null;

    }

}

export async function salvarImagemLocal(ean, blob, urlOriginal) {

    if (!ean) return;

    const db = await abrirDB();

    return new Promise((resolve, reject) => {

        const tx = db.transaction(STORE, "readwrite");

        tx.objectStore(STORE).put({
            ean,
            blob,
            urlOriginal,
            salvoEm: Date.now()
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

    });

}

export async function obterImagemLocal(ean) {

    if (!ean) return null;

    const db = await abrirDB();

    return new Promise((resolve, reject) => {

        const tx = db.transaction(STORE, "readonly");
        const requisicao = tx.objectStore(STORE).get(ean);

        requisicao.onsuccess = () => resolve(requisicao.result || null);
        requisicao.onerror = () => reject(requisicao.error);

    });

}

// Lê em lote, numa transação só, as imagens já baixadas para uma
// lista de EANs. Usado para reaproveitar imagens após reimportar
// a mesma planilha (ou uma atualizada) em outra sessão.
export async function obterImagensLocais(eans) {

    const db = await abrirDB();

    return new Promise((resolve, reject) => {

        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);

        const resultado = new Map();

        eans.forEach((ean) => {

            if (!ean) return;

            const requisicao = store.get(ean);

            requisicao.onsuccess = () => {

                if (requisicao.result) {
                    resultado.set(ean, requisicao.result);
                }

            };

        });

        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(tx.error);

    });

}
