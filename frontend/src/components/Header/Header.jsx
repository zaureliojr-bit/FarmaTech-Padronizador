import "./Header.css";

function Header(){

    return(

        <header className="header">

            <div className="header-inner">

                <div className="header-brand">

                    <span className="header-logo">🏥</span>

                    <div>

                        <h1>FarmaTech</h1>

                        <span className="header-subtitle">Padronizador de Catálogo</span>

                    </div>

                </div>

            </div>

        </header>

    );

}

export default Header;
