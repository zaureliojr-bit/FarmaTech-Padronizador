import "./Toast.css";

function Toast({ mensagem, tipo, visivel }) {

    if (!visivel) return null;

    return (

        <div className={`toast ${tipo}`}>

            <span className="toast-icon">

                {
                    tipo === "sucesso"
                        ? "✅"
                        : "❌"
                }

            </span>

            <span className="toast-mensagem">

                {mensagem}

            </span>

        </div>

    );

}

export default Toast;