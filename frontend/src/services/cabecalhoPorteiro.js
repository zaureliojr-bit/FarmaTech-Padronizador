/* Os cabeçalhos que o padronizador manda ao porteiro.

   Separado do credencialPainel.js por um motivo prático: aquele arquivo
   lê import.meta.env e mexe em sessionStorage, então só roda dentro do
   Vite e de um navegador. Esta parte é a decisão — quem é a senha, quem
   é a loja —, e é justamente a que estava errada:

   o padronizador mandava só a senha, e o porteiro, sem o cabeçalho de
   loja, cai na farmácia ORIGINAL. Com o painel aberto numa filial,
   importar a extração e publicar o catálogo escreviam na loja errada,
   em silêncio. Para a chave de dono não dava nem 401, porque ela abre
   qualquer farmácia.

   Aqui dá para testar sem navegador — e é por isso que está aqui. */

export const CABECALHO_SENHA = "X-Painel-Key";
export const CABECALHO_LOJA = "X-Painel-Loja";

/* O mesmo saneamento do painel e do worker: minúscula, número e hífen.

   Repetir a regra em três lugares é chato; tê-la diferente em três
   lugares é uma filial que entra no painel e não entra aqui. */
export function limparSlug(valor) {

    return String(valor || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

}

/* Sem senha não há cabeçalho nenhum: quem chama decide se pede, se
   avisa ou se desiste — e devolver um objeto meio preenchido faria uma
   requisição sair para tomar 401 à toa.

   Loja vazia é a farmácia original, e aí o cabeçalho NÃO vai. É o que o
   porteiro entende por ausência, e é o caso de quem tem uma loja só. */
export function montarCabecalho(senha, loja) {

    const chave = String(senha || "").trim();

    if (!chave) return null;

    const slug = limparSlug(loja);

    return {
        [CABECALHO_SENHA]: chave,
        ...(slug ? { [CABECALHO_LOJA]: slug } : {})
    };

}
