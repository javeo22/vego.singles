import "@fontsource-variable/inter";
import "./globals.css";
import ShopProvider from "@/components/shop-provider";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import CartPanel from "@/components/cart-panel";
export const metadata = {
  title: "Vego Singles — For the love of the game",
  description:
    "Trading card singles in Costa Rica. Discover your next great card and confirm availability through WhatsApp.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ShopProvider>
          <a href="#main-content" className="skip-link">
            Skip to content
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
