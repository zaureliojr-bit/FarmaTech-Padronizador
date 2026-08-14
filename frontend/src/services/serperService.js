// A Serper devolve resultado de busca de imagem do Google a partir de um
// texto (marca + descrição + apresentação), diferente da Cosmos, que
// busca por EAN. Passamos por um proxy próprio (Cloudflare Worker) que
// guarda a chave no servidor - ver serper-proxy/ na raiz do projeto.
const PROXY_URL = import.meta.env.VITE_SERPER_PROXY_URL;

export async function buscarImagensPorTexto(texto) {

    if (!PROXY_URL || !texto) return [];

    const resposta = await fetch(`${PROXY_URL}?q=${encodeURIComponent(texto)}`);

    if (!resposta.ok) return [];

    const dados = await resposta.json();

    return Array.isArray(dados?.imagens) ? dados.imagens : [];

}
