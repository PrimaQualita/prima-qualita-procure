import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface UrlFixerProps {
  children: React.ReactNode;
}

/**
 * Componente que intercepta e corrige URLs mal formadas onde ? foi encodado como %3F
 */
export const UrlFixer = ({ children }: UrlFixerProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Verificação síncrona - se URL tem %3F, não renderiza children
  const pathname = location.pathname;
  const hasEncodedQuery = pathname.includes('%3F') || pathname.includes('%3f');

  useEffect(() => {
    if (hasEncodedQuery) {
      const decodedPath = decodeURIComponent(pathname);
      const [basePath, queryString] = decodedPath.split('?');
      
      if (queryString) {
        navigate(`${basePath}?${queryString}`, { replace: true });
      }
    }
  }, [hasEncodedQuery, pathname, navigate]);

  // Não renderiza nada enquanto URL está mal formada
  if (hasEncodedQuery) {
    return null;
  }

  return <>{children}</>;
};
