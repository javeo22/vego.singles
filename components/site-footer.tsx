"use client";
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
          <p>For the love of the game.</p>
        </div>
        <div className="footer-info">
          <h3>Shipping & pickup</h3>
          <p>
            Duelist Kingdom delivery: ₡500.
            <br />
            Other delivery fees confirmed on WhatsApp.
          </p>
        </div>
        <div className="footer-info">
          <h3>Here to help</h3>
          <a href="https://wa.me/50671141906" target="_blank" rel="noreferrer">
            Contact us <ArrowUpRight size={15} />
          </a>
          <a href="/login">Account & admin</a>
        </div>
      </div>
      <div className="wide footer-bottom">
        <span>© {new Date().getFullYear()} Vego Singles</span>
        <span>
          Adding to your cart doesn't reserve a card. Availability is confirmed
          before purchase.
        </span>
      </div>
    </footer>
  );
}
