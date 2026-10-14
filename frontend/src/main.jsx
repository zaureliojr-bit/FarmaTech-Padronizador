import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ouvirSenhaDoPainel } from "./services/credencialPainel";

import "./styles/variables.css";
import "./styles/global.css";

/* O padronizador roda dentro de um quadro na aba Catálogo do painel, e
   o painel já tem a senha digitada. Escutar antes de desenhar a tela
   evita pedir de novo o que a loja acabou de digitar. Rodando fora do
   painel, isto não faz nada e a senha é pedida quando for preciso. */
ouvirSenhaDoPainel();

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
);