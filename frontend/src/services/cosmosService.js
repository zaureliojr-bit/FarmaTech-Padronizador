// A Cosmos bloqueia chamada direta do navegador (CORS), então passamos
// por um proxy próprio (Cloudflare Worker) que guarda o token no
// servidor. Ver cosmos-proxy/ na raiz do projeto.
const PROXY_URL = import.meta.env.VITE_COSMOS_PROXY_URL;

// fetch() não tem timeout por padrão - se a Cosmos travar a conexão
// sem responder, uma busca em lote inteira para nesse item (poucas
// buscas rodam ao mesmo tempo). 8s é tempo de sobra pra essa API.
const TIMEOUT_MS = 8000;

export async function buscarProdutoPorEan(ean) {

    if (!PROXY_URL || !ean) return null;

    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);

    let resposta;

    try {

        resposta = await fetch(`${PROXY_URL}?ean=${encodeURIComponent(ean)}`, { signal: controlador.signal });

    } finally {

        clearTimeout(timeout);

    }

    // Cota diária da Cosmos estourada - diferente de "não achou nada",
    // e sem isso a busca de descrição mostrava "não encontrei" enganoso
    // (parecia falta de dado, quando na verdade é limite do dia).
    if (resposta.status === 429) {
        throw new Error("Cosmos sem cota disponível agora (limite diário atingido) - tenta de novo amanhã.");
    }

    if (!resposta.ok) return null;

    const dados = await resposta.json();

    // Antes exigia thumbnail pra devolver qualquer coisa - certo
    // enquanto só servia busca de imagem, mas passou a descartar
    // produto com descrição cadastrada e sem foto (usado agora também
    // na busca de descrição). Devolve se tiver pelo menos um dos dois.
    if (!dados?.thumbnail && !dados?.description) return null;

    return {

        imagem: dados.thumbnail || "",
        descricao: dados.description || "",
        marca: dados.brand?.name || ""

    };

}
