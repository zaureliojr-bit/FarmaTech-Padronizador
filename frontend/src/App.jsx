/* O cabeçalho e as abas passam a morar aqui, acima das telas.

   Antes o Header era renderizado de dentro da Home. Com duas telas isso
   faria o cabeçalho sumir e reaparecer a cada troca — e, pior, cada
   tela teria o seu, que é o jeito de os dois ficarem diferentes com o
   tempo sem ninguém perceber.

   POR QUE ESCONDER, E NÃO DESMONTAR

   Minha primeira versão desmontava a tela inativa, que é o que parece
   certo: menos coisa viva, menos memória. Só que o catálogo importado
   mora em useState, sem nada que o guarde — desmontar a Home joga fora
   os 6.700 produtos que a pessoa acabou de importar. Ela espiaria a
   outra aba e voltaria para uma tela vazia, tendo de importar de novo.

   Então a Home fica montada e só sai da vista. A de reativação nasce na
   primeira vez que alguém a abre, e daí em diante também fica: ela
   guarda a lista de clientes em memória, e desmontá-la teria o mesmo
   problema ao contrário. */

import { useState } from "react";

import Header from "./components/Header/Header";
import Abas from "./components/Abas/Abas";

import Home from "./pages/Home";
import Reativacao from "./pages/Reativacao";

const ABAS = [
    { chave: "catalogo", rotulo: "Catálogo" },
    { chave: "reativacao", rotulo: "Reativação de clientes" }
];

function App() {

    const [vista, setVista] = useState("catalogo");
    const [reativacaoAberta, setReativacaoAberta] = useState(false);

    function trocarVista(nova) {
        if (nova === "reativacao") setReativacaoAberta(true);
        setVista(nova);
    }

    return (

        <>

            <Header />

            <Abas vista={vista} setVista={trocarVista} abas={ABAS} />

            {/* hidden, e não display:none numa classe: o atributo também
                tira o conteúdo do leitor de tela e da busca da página,
                que é o que "escondido" quer dizer de verdade. */}
            <div hidden={vista !== "catalogo"}>
                <Home />
            </div>

            {
                reativacaoAberta && (
                    <div hidden={vista !== "reativacao"}>
                        <Reativacao />
                    </div>
                )
            }

        </>

    );

}

export default App;
