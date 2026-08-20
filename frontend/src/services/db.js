// Abertura centralizada do IndexedDB "farmatech".
//
// Importante: todo object store precisa ser criado dentro do MESMO
// onupgradeneeded, na MESMA função de abertura. O IndexedDB só chama
// onupgradeneeded quando o número da versão aumenta - se cada serviço
// abrisse o banco com sua própria versão "1", o segundo a rodar no
// navegador do usuário encontraria o banco já na versão 1 (criado pelo
// primeiro) e onupgradeneeded nunca disparia de novo, deixando o store
// dele inexistente pra sempre (erro silencioso só na hora de usar).

const DB_NAME = "farmatech";
const DB_VERSION = 2;

export const STORE_CMED = "cmed";

export function abrirBanco() {

    return new Promise((resolve, reject) => {

        const requisicao = indexedDB.open(DB_NAME, DB_VERSION);

        requisicao.onupgradeneeded = () => {

            const db = requisicao.result;

            // A store "imagens" não é mais criada aqui - imagem passou a
            // ser hospedada no R2 (ver imagens-proxy/ e
            // imagemHostingService.js), não mais guardada localmente no
            // navegador. Quem já tinha essa store de antes da migração
            // mantém ela sem uso; não precisa apagar, só não cresce mais.
            if (!db.objectStoreNames.contains(STORE_CMED)) {
                db.createObjectStore(STORE_CMED);
            }

        };

        requisicao.onsuccess = () => resolve(requisicao.result);
        requisicao.onerror = () => reject(requisicao.error);

    });

}
