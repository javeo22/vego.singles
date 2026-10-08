import "@fontsource-variable/inter";
import "./globals.css";
import "./pricing.css";
import ShopProvider from "@/components/shop-provider";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import CartPanel from "@/components/cart-panel";
export const metadata = {
  title: "Vego Singles",
  description: "Singles de Pokémon y Magic en Costa Rica.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <ShopProvider>
          <a href="#main-content" className="skip-link">
            Ir al contenido
          </a>
          <SiteHeader />
          {children}
          <SiteFooter />
          <CartPanel />
        </ShopProvider>
      </body>
    </html>
  );
}
