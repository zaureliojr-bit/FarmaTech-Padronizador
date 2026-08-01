const COSMOS_TOKEN = import.meta.env.VITE_COSMOS_TOKEN;

const COSMOS_URL = "https://api.cosmos.bluesoft.io/gtins";

export async function buscarProdutoPorEan(ean) {

    if (!COSMOS_TOKEN || !ean) return null;

    const resposta = await fetch(`${COSMOS_URL}/${ean}.json`, {

        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "X-Cosmos-Token": COSMOS_TOKEN
        }

    });

    if (!resposta.ok) return null;

    const dados = await resposta.json();

    if (!dados?.thumbnail) return null;

    return {

        imagem: dados.thumbnail,
        descricao: dados.description || "",
        marca: dados.brand?.name || ""

    };

}
