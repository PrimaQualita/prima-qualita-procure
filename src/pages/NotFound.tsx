import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Detectar URLs mal formadas onde ? foi encodado como %3F
    const pathname = location.pathname;
    
    if (pathname.includes('%3F') || pathname.includes('%3f')) {
      // Decodificar a URL e redirecionar para a versão correta
      const decodedPath = decodeURIComponent(pathname);
      const [basePath, queryString] = decodedPath.split('?');
      
      if (queryString) {
        console.log("Detectada URL mal formada, redirecionando...", { original: pathname, corrected: `${basePath}?${queryString}` });
        navigate(`${basePath}?${queryString}`, { replace: true });
        return;
      }
    }

    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname, navigate]);

  // Se detectamos URL mal formada, não mostrar a página 404
  if (location.pathname.includes('%3F') || location.pathname.includes('%3f')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecionando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Página não encontrada</p>
        <a href="/" className="text-primary underline hover:text-primary/80">
          Voltar para o início
        </a>
      </div>
    </div>
  );
};

export default NotFound;
