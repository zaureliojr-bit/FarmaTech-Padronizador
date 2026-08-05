import { termoDeBusca } from "./termoBusca";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_CSE_KEY;
const GOOGLE_CX = import.meta.env.VITE_GOOGLE_CSE_CX;

const GOOGLE_URL = "https://www.googleapis.com/customsearch/v1";

export async function buscarImagensGoogle(produto) {

    if (!GOOGLE_KEY || !GOOGLE_CX) return [];

    const termo = termoDeBusca(produto);

    if (!termo) return [];

    const parametros = new URLSearchParams({
        key: GOOGLE_KEY,
        cx: GOOGLE_CX,
        q: termo,
        searchType: "image",
        num: "4",
        safe: "active"
    });

    const resposta = await fetch(`${GOOGLE_URL}?${parametros}`);

    if (!resposta.ok) return [];

    const dados = await resposta.json();

    return (dados.items || [])
        .map((item) => item.link)
        .filter(Boolean);

}
