import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface UrlFixerProps {
  children: React.ReactNode;
}

/**
 * Componente que intercepta e corrige URLs mal formadas onde ? foi encodado como %3F
 * Isso acontece em algumas situações de navegação e causa 404s
 */
export const UrlFixer = ({ children }: UrlFixerProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    const pathname = location.pathname;
    
    // Detectar URLs mal formadas onde ? foi encodado como %3F
    if (pathname.includes('%3F') || pathname.includes('%3f')) {
      setIsFixing(true);
      
      // Decodificar a URL e redirecionar para a versão correta
      const decodedPath = decodeURIComponent(pathname);
      const [basePath, queryString] = decodedPath.split('?');
      
      if (queryString) {
        // Usar replace para não adicionar ao histórico
        navigate(`${basePath}?${queryString}`, { replace: true });
      } else {
        setIsFixing(false);
      }
    } else {
      setIsFixing(false);
    }
  }, [location.pathname, navigate]);

  // Enquanto está corrigindo a URL, não renderizar nada para evitar flash
  if (isFixing) {
    return null;
  }

  return <>{children}</>;
};
