// Listas de referência (CMED, distribuidora) espelhadas no servidor -
// ver imagens-proxy/worker.js (rotas /referencias/:chave). Até aqui só
// viviam no IndexedDB de quem usava o padronizador; um site em outro
// domínio (ex.: o painel da loja) não enxerga esse IndexedDB
// (armazenamento de navegador é isolado por origem), então precisa
// buscar daqui pra rodar a mesma padronização sozinho.
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");

// Ler é direto (público). Gravar passa pelo PORTEIRO — ver
// credencialPainel.js para o porquê de a chave ter saído do navegador.
import { PORTEIRO_URL, cabecalhoPainel } from "./credencialPainel";

/** Sobe o índice (já processado, serializável) pro servidor. Falha em silêncio - é um espelho, o IndexedDB local continua sendo a fonte usada na hora. */
export async function salvarReferencia(chave, indice) {

    if (!PORTEIRO_URL) return false;

    /* pedir: false — guardar a lista de referência acontece de passagem,
       logo depois de importar a planilha da CMED. Interromper com um
       pedido de senha aqui atrapalharia o trabalho; sem senha, a lista
       só não é compartilhada com os outros aparelhos. */
    const credencial = cabecalhoPainel({ pedir: false });

    if (!credencial) return false;

    try {

        const resposta = await fetch(`${PORTEIRO_URL}/catalogo/referencia/${chave}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...credencial
            },
            body: JSON.stringify(indice)
        });

        return resposta.ok;

    } catch (erro) {

        console.warn(`Não consegui espelhar a referência "${chave}" no servidor.`, erro);

        return false;

    }

}

/** null se ainda não tiver sido enviada. */
export async function buscarReferencia(chave) {

    if (!PROXY_URL) return null;

    const resposta = await fetch(`${PROXY_URL}/referencias/${chave}`);

    if (!resposta.ok) return null;

    return resposta.json().catch(() => null);

}

/* A lista de referência (CMED, distribuidora) vinda do SERVIDOR, quando
   este navegador ainda não tem a dele.

   O padronizador já SUBIA as duas para o servidor desde que o painel
   passou a padronizar sozinho — mas nunca as buscava de volta. Quem
   abrisse o padronizador em outro computador, em outro navegador, ou
   numa farmácia recém-instalada via as caixas vazias e precisava achar
   a planilha e subir de novo. A lista estava lá o tempo todo.

   É o que faz a listagem da DPCNET ser do SISTEMA e não daquela
   máquina: sobe uma vez, vale para todo mundo.

   Guarda no IndexedDB ao receber: na próxima abertura abre instantâneo,
   sem ida à rede. E falha em silêncio — sem servidor, sem internet ou
   sem lista subida ainda, a tela continua como sempre foi, com a caixa
   pedindo a planilha. */
export async function referenciaDoServidor(chave, guardarLocalmente) {

    try {

        const indice = await buscarReferencia(chave);
        if (!indice) return null;

        /* A gravação local tem try/catch PRÓPRIO, e isso não é zelo
           exagerado: num catch só, o erro de guardar derrubava junto a
           lista que já tinha chegado — e o padronizador, em aba privada
           ou com armazenamento bloqueado, ficava sem a lista que o
           servidor acabara de entregar. Quem pegou foi o teste.

           Guardar é conveniência da PRÓXIMA abertura. Falhar nisso não
           pode custar a desta. Sem await pelo mesmo motivo: esperar a
           gravação atrasaria a tela. */
        try {
            Promise.resolve(guardarLocalmente(indice)).catch((erro) => {
                console.warn(`A lista "${chave}" veio do servidor, mas não coube no navegador.`, erro);
            });
        } catch (erro) {
            console.warn(`A lista "${chave}" veio do servidor, mas não coube no navegador.`, erro);
        }

        return indice;

    } catch (erro) {
        console.warn(`Não consegui buscar a lista "${chave}" do servidor.`, erro);
        return null;
    }

}
