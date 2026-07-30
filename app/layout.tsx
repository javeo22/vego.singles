import "./globals.css";
export const metadata={title:"Vego Singles",description:"Pokémon and Magic singles in Costa Rica"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body><header className="shell nav"><a className="brand" href="/">VEGO SINGLES</a><nav className="navlinks"><a href="/#catalogo">Catálogo</a><a href="/admin">Admin</a><a className="button" href="https://wa.me/50671141906">WhatsApp</a></nav></header>{children}</body></html>}
