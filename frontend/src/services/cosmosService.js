// A Cosmos bloqueia chamada direta do navegador (CORS), então passamos
// por um proxy próprio (Cloudflare Worker) que guarda o token no
// servidor. Ver cosmos-proxy/ na raiz do projeto.
const PROXY_URL = import.meta.env.VITE_COSMOS_PROXY_URL;

export async function buscarProdutoPorEan(ean) {

    if (!PROXY_URL || !ean) return null;

    const resposta = await fetch(`${PROXY_URL}?ean=${encodeURIComponent(ean)}`);

    if (!resposta.ok) return null;

    const dados = await resposta.json();

    if (!dados?.thumbnail) return null;

    return {

        imagem: dados.thumbnail,
        descricao: dados.description || "",
        marca: dados.brand?.name || ""

    };

}
