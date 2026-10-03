"use client";
import { useEffect, useRef } from "react";
import {
  ArrowRight,
  CheckCircle,
  Minus,
  Plus,
  ShoppingCart,
  Trash,
  X,
} from "@phosphor-icons/react";
import { formatPrice, variantLabel } from "@/lib/catalog";
import ProductArt from "./product-art";
import { useShop } from "./shop-provider";

export default function CartPanel() {
  const { cart, cartOpen, setCartOpen, changeCount, toast, dismissToast } =
    useShop();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (cartOpen && !dialog.current?.open) dialog.current?.showModal();
    else if (!cartOpen && dialog.current?.open) dialog.current?.close();
    if (cartOpen) {
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = overflow;
      };
    }
  }, [cartOpen]);
  const subtotal = cart.reduce(
    (n, line) => n + line.item.approved_price_crc * line.count,
    0,
  );
  const samples = cart.some((line) => line.item.sample);
  const checkout = () => {
    const lines = cart.map(
      ({ item, count }) =>
        `${count}x ${item.card_printings?.canonical_name} ${item.card_printings?.collector_number || ""} — ${formatPrice(item.approved_price_crc * count)}${item.sample ? " (referencia; confirmar precio y disponibilidad)" : ""}`,
    );
    const text = `Hola, quiero consultar disponibilidad:\n\n${lines.join("\n")}\n\n${samples ? "Precios de referencia" : "Subtotal"}: ${formatPrice(subtotal)}\nEntrega Duelist Kingdom: ₡500\n\nEntiendo que agregar al carrito no reserva las cartas. Por favor, confirmar disponibilidad y precio final.`;
    window.open(
      `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "50671141906"}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  return (
    <>
      <dialog
        ref={dialog}
        className="cart-dialog"
        aria-labelledby="cart-title"
        onCancel={() => setCartOpen(false)}
        onClose={() => setCartOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setCartOpen(false);
        }}
      >
        <div className="cart-panel">
          <div className="cart-heading">
            <div>
              <span className="eyebrow">Tu selección</span>
              <h2 id="cart-title">
                Tu carrito<span>.</span>
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar carrito"
              onClick={() => setCartOpen(false)}
            >
              <X size={24} />
            </button>
          </div>
          {!cart.length ? (
            <div className="cart-empty">
              <ShoppingCart size={48} weight="light" />
              <h3>Tu carrito está vacío.</h3>
              <p>Agrega una carta para empezar.</p>
              <button className="button" onClick={() => setCartOpen(false)}>
                Ver catálogo <ArrowRight size={20} />
              </button>
            </div>
          ) : (
            <>
              <div className="cart-lines">
                {cart.map(({ item, count }) => (
                  <article className="cart-line" key={item.id}>
                    <div className="cart-art">
                      <ProductArt item={item} />
                    </div>
                    <div className="cart-line-content">
                      <h3>{item.card_printings?.canonical_name}</h3>
                      <p>{item.card_printings?.set_name}</p>
                      <p>
                        {variantLabel(item.condition)} ·{" "}
                        {variantLabel(item.card_printings?.language)}{" "}
                        {item.finish && `· ${variantLabel(item.finish)}`}
                      </p>
                      <button
                        className="remove-button"
                        onClick={() => changeCount(item.id, 0)}
                      >
                        <Trash size={14} /> Quitar
                      </button>
                      <div className="cart-line-bottom">
                        <strong>
                          {formatPrice(item.approved_price_crc * count)}
                        </strong>
                        <div className="quantity-control">
                          <button
                            aria-label={`Reducir cantidad de ${item.card_printings?.canonical_name}`}
                            disabled={count <= 1}
                            onClick={() => changeCount(item.id, count - 1)}
                          >
                            <Minus size={15} />
                          </button>
                          <span aria-label="Cantidad">{count}</span>
                          <button
                            aria-label={`Aumentar cantidad de ${item.card_printings?.canonical_name}`}
                            disabled={count >= item.quantity}
                            onClick={() => changeCount(item.id, count + 1)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <section className="order-summary">
                <h3>Resumen del pedido</h3>
                <div className="summary-row">
                  <span>Subtotal</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>Entrega</span>
                  <span>Por confirmar en WhatsApp</span>
                </div>
                <div className="summary-total">
                  <span>Subtotal</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>
                <button className="button checkout-button" onClick={checkout}>
                  {samples
                    ? "Consultar disponibilidad"
                    : "Comprar por WhatsApp"}
                  <ArrowRight size={22} />
                </button>
                <p className="checkout-caption">No necesitas una cuenta.</p>
                <p className="checkout-note">
                  {samples
                    ? "Precios de referencia. Confirma disponibilidad por WhatsApp."
                    : "Confirma disponibilidad y entrega por WhatsApp."}
                </p>
              </section>
            </>
          )}
          <div className="cart-footer">
            <a href="/" className="brand">
              vego<span>.</span>singles
            </a>
            <p>Por amor al juego.</p>
          </div>
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={22} />
          <span>{toast}</span>
          <button aria-label="Cerrar notificación" onClick={dismissToast}>
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
