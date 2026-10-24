/* As abreviações da descrição do PDV, e a capitalização.

   Todos os casos daqui saíram do catálogo PUBLICADO da primeira
   farmácia — não são hipóteses. Quando este arquivo nasceu, o site da
   Mais Barato mostrava, para clientes de verdade:

       Frasco Inf Pom Pom Xxg Com/18        (11 produtos)
       Vitamina Com Com Zinco 30 Comprimidos (8 produtos)
       Bismu-Jet SoluçãO Gts 20ml           (437 produtos)

   Os três vêm da mesma ideia errada: trocar uma sigla por uma palavra
   sem olhar o resto da frase, e capitalizar com uma regra que não
   conhece acento.

   Nome errado em produto de farmácia não é detalhe de acabamento. O
   cliente que pede uma fralda e lê "Frasco" no pedido acha que vai
   receber outra coisa — e quem desiste da compra não reclama, só não
   volta.

   Uso: node teste-abreviacoes.mjs
*/

import { expandirAbreviacoes } from "./src/intelligence/dictionary/abreviacoes.js";
import { primeiraLetraMaiuscula } from "./src/utils/texto.js";

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

/* O caminho de verdade: expandir e depois capitalizar, que é o que o
   refinarDescricaoPesquisa faz. */
const refinar = (bruto) => primeiraLetraMaiuscula(expandirAbreviacoes(bruto));

const vira = (bruto, esperado) => {
    const saiu = refinar(bruto);
    conferir(`${bruto}  →  ${esperado}`, saiu === esperado, saiu);
};

/* ---- 1. FR: fralda ou frasco ---------------------------------------- */
console.log("\n1. a mesma sigla, dois produtos diferentes");
{
    /* Os códigos reais: 050030, 052616, 052617, 022006, 031355. */
    vira("FR INF PERSONAL PROTECT & SEC HIPER M COM/70UN",
         "Fralda Inf Personal Protect & Sec Hiper M Com/70un");

    vira("FR INF POM POM XXG COM/18 DERMA PROTEK",
         "Fralda Inf Pom Pom Xxg Com/18 Derma Protek");

    vira("FR INF TOQUINHO CONF HIPER M COM/90",
         "Fralda Inf Toquinho Confort Hiper M Com/90");

    /* E o frasco continua frasco: a correção não pode trocar um erro
       por outro do lado oposto. */
    vira("DIPIRONA GTS FR 20ML", "Dipirona Gts Frasco 20ml");

    vira("FR XAROPE MELAGRIAO 150ML", "Frasco Xarope Melagriao 150ml");
}

/* ---- 2. na dúvida, não inventa -------------------------------------- */
console.log("\n2. sem sinal nenhum, a sigla fica quieta");
{
    /* "Fr" no nome é feio. "Frasco" numa fralda é errado, e errado no
       nome de um produto de farmácia é o que faz o cliente desistir
       achando que recebeu outra coisa. Entre feio e errado, feio. */
    vira("FR GENERICO QUALQUER", "Fr Generico Qualquer");
}

/* ---- 3. C: quantidade ou nome do produto ---------------------------- */
console.log("\n3. o C que é quantidade e o C que é o produto");
{
    /* Os oito produtos reais. "Vitamina Com Com Zinco" estava no ar. */
    vira("VITAMINA C C/ 30", "Vitamina C Com/ 30");

    vira("VITAMINA C COM ZINCO 30 COMP",
         "Vitamina C Com Zinco 30 Comprimidos");

    vira("GEOVIT VITAMINA C EFERVESCENTE 31G C/ 10CPS",
         "Geovit Vitamina C Efervescente 31g Com/ 10cps");

    vira("ASPIRINA C EFERVESCENTE LIMAO C/20",
         "Aspirina C Efervescente Limao Com/20");

    /* "C" grudado na barra continua virando "Com": ali ele é mesmo
       quantidade, e é a leitura que o nome precisa. */
    vira("ENV CHA DE CAMOMILA C/15", "Envelope Cha De Camomila Com/15");
}

/* ---- 4. SOL: solução ou sol ----------------------------------------- */
console.log("\n4. a solução do frasco e o sol do céu");
{
    /* Não havia protetor solar abreviado no catálogo quando isto foi
       escrito — era uma mina esperando o primeiro. "Protetor Solução"
       é a frase que faz o cliente duvidar do site inteiro. */
    vira("PROTETOR SOL NIVEA FPS 50 120ML",
         "Protetor Sol Nivea Fps 50 120ml");

    vira("OLEO BRONZEADOR SOL 200ML", "Oleo Bronzeador Sol 200ml");

    vira("SOL ORAL AMOXICILINA 250MG", "Solução Oral Amoxicilina 250mg");

    vira("BISMU-JET SOL GTS 20ML", "Bismu-Jet Solução Gts 20ml");
}

/* ---- 5. a capitalização com acento ---------------------------------- */
console.log("\n5. 437 produtos escritos como 'SoluçãO'");
{
    /* A borda de palavra do JavaScript não conhece acento: para ela
       "ç" e "ã" não são letras, então o "o" de "solução" parecia
       começo de palavra. */
    conferir("solução não vira SoluçãO",
        primeiraLetraMaiuscula("SOLUCAO".replace("SOLUCAO", "solução")) === "Solução",
        primeiraLetraMaiuscula("solução"));

    conferir("e as outras acentuadas também",
        primeiraLetraMaiuscula("CÁPSULAS DE ÓLEO SACHÊ") === "Cápsulas De Óleo Sachê",
        primeiraLetraMaiuscula("CÁPSULAS DE ÓLEO SACHÊ"));

    /* O que já estava certo não pode mudar: depois de barra e de
       hífen continua capitalizando, e depois de número não. */
    conferir("depois de número continua minúsculo",
        primeiraLetraMaiuscula("CAIXA COM/70UN") === "Caixa Com/70un",
        primeiraLetraMaiuscula("CAIXA COM/70UN"));

    conferir("depois de hífen, maiúscula",
        primeiraLetraMaiuscula("BISMU-JET") === "Bismu-Jet",
        primeiraLetraMaiuscula("BISMU-JET"));
}

/* ---- 6. as que nunca foram ambíguas --------------------------------- */
console.log("\n6. o resto do dicionário continua valendo");
{
    vira("SAB LIQUIDO PROTEX 250ML", "Sabonete Liquido Protex 250ml");
    vira("SH ANTICASPA CLEAR 200ML", "Shampoo Anticaspa Clear 200ml");
    vira("CX 30 COMP", "Caixa 30 Comprimidos");
    vira("SPR NASAL 50ML", "Spray Nasal 50ml");
}

/* ---- 7. o sinal não pode ser inventado por nós ---------------------- */
console.log("\n7. a decisão olha o texto original");
{
    /* Armadilha de ordem: "SOL" é um dos sinais que fazem FR virar
       frasco. Se a decisão do FR olhasse o texto JÁ EXPANDIDO, um
       "SOL" que nós mesmos acabáramos de transformar em "Solução"
       mudaria a resposta — e o resultado dependeria da ordem das
       chaves do dicionário, que ninguém controla. */
    vira("FR INF PERSONAL SOL ORAL",
         "Fralda Inf Personal Solução Oral");
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
