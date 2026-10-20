/* A tela de reativação de clientes.

   Fina de propósito: só o aviso de tela e o quadro. Toda a decisão —
   telefone, duplicado, não perturbe — está em reativacao/, fora do
   React, porque é lá que estava o defeito que mandava mensagem para o
   número errado, e lógica que roda sem navegador é lógica que se testa. */

import { useState } from "react";

import ReativacaoBox from "../components/ReativacaoBox/ReativacaoBox";
import Toast from "../components/Toast/Toast";

function Reativacao() {

    const [toastVisivel, setToastVisivel] = useState(false);
    const [toastMensagem, setToastMensagem] = useState("");
    const [toastTipo, setToastTipo] = useState("sucesso");

    function mostrarToast(mensagem, tipo = "sucesso") {

        setToastMensagem(mensagem);
        setToastTipo(tipo);
        setToastVisivel(true);

        setTimeout(() => setToastVisivel(false), 3000);

    }

    return (

        <div className="page">

            <ReativacaoBox mostrarToast={mostrarToast} />

            <Toast
                visivel={toastVisivel}
                mensagem={toastMensagem}
                tipo={toastTipo}
            />

        </div>

    );

}

export default Reativacao;
