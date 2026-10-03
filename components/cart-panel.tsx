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
import { formatPrice } from "@/lib/catalog";
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
              <span className="eyebrow">A few good finds</span>
              <h2 id="cart-title">
                Your cart<span>.</span>
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close cart"
              onClick={() => setCartOpen(false)}
            >
              <X size={24} />
            </button>
          </div>
          {!cart.length ? (
            <div className="cart-empty">
              <ShoppingCart size={48} weight="light" />
              <h3>Your next great find is waiting.</h3>
              <p>Add a card to get started.</p>
              <button className="button" onClick={() => setCartOpen(false)}>
                Browse the shop <ArrowRight size={20} />
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
                        {item.condition} · {item.card_printings?.language}{" "}
                        {item.finish && `· ${item.finish}`}
                      </p>
                      <button
                        className="remove-button"
                        onClick={() => changeCount(item.id, 0)}
                      >
                        <Trash size={14} /> Remove
                      </button>
                      <div className="cart-line-bottom">
                        <strong>
                          {formatPrice(item.approved_price_crc * count)}
                        </strong>
                        <div className="quantity-control">
                          <button
                            aria-label={`Decrease ${item.card_printings?.canonical_name} quantity`}
                            disabled={count <= 1}
                            onClick={() => changeCount(item.id, count - 1)}
                          >
                            <Minus size={15} />
                          </button>
                          <span aria-label="Quantity">{count}</span>
                          <button
                            aria-label={`Increase ${item.card_printings?.canonical_name} quantity`}
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
                <h3>Order summary</h3>
                <div className="summary-row">
                  <span>Subtotal</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>Delivery</span>
                  <span>Confirmed on WhatsApp</span>
                </div>
                <div className="summary-total">
                  <span>Subtotal</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>
                <button className="button checkout-button" onClick={checkout}>
                  {samples ? "Ask about these cards" : "Continue on WhatsApp"}
                  <ArrowRight size={22} />
                </button>
                <p className="checkout-caption">No account needed.</p>
                <p className="checkout-note">
                  {samples
                    ? "Display examples and reference prices. Availability and final prices must be confirmed."
                    : "Your cart doesn't reserve cards. Confirm availability and delivery before purchase."}
                </p>
              </section>
            </>
          )}
          <div className="cart-footer">
            <a href="/" className="brand">
              vego<span>.</span>singles
            </a>
            <p>For the love of the game.</p>
          </div>
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={22} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={dismissToast}>
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
