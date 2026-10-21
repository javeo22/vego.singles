"use client";
import { whatsappUrl } from "@/lib/fulfillment";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Brand } from "./site-header";

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <footer className="site-footer">
      <div className="wide footer-main">
        <div>
          <Brand />
          <p>Por amor al juego.</p>
        </div>
        <div className="footer-info">
          <h3>Envíos y retiro</h3>
          <p>
            Coordinamos opciones de entrega y retiro por WhatsApp.
            <br />
            Envío express con costo adicional por cotizar.
          </p>
        </div>
        <div className="footer-info">
          <h3>Contacto</h3>
          <a href={whatsappUrl()} target="_blank" rel="noreferrer">
            WhatsApp <ArrowUpRight size={15} />
          </a>
          <a href="/login">Administración</a>
        </div>
      </div>
      <div className="wide footer-bottom">
        <span>© {new Date().getFullYear()} Vego Singles</span>
        <span>
          Agregar una carta al carrito no la reserva; la disponibilidad final se
          confirma por WhatsApp.
        </span>
      </div>
    </footer>
  );
}
