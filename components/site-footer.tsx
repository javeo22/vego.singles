"use client";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/catalog";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Brand } from "./site-header";

export default function SiteFooter() {
  const pathname = usePathname();
  const [delivery, setDelivery] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/store-settings")
      .then((r) => r.json())
      .then((d) => setDelivery(d.deliveryFeeCrc))
      .catch(() => {});
  }, []);
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
            Red Duelist Kingdom:{" "}
            {delivery === null
              ? "costo por confirmar"
              : `${formatPrice(delivery)} adicionales`}
            .
            <br />
            Envío inmediato con costo por confirmar.
          </p>
        </div>
        <div className="footer-info">
          <h3>Contacto</h3>
          <a
            href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "50671141906"}`}
            target="_blank"
            rel="noreferrer"
          >
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
