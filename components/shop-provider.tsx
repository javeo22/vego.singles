"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { stockQuantity, cartLimit, type Listing } from "@/lib/catalog";

export type CartLine = { item: Listing; count: number };
type ShopState = {
  query: string;
  setQuery: (value: string) => void;
  game: string;
  setGame: (value: string) => void;
  kind: string;
  setKind: (value: string) => void;
  cart: CartLine[];
  add: (item: Listing) => void;
  changeCount: (id: string, count: number) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  toast: string;
  dismissToast: () => void;
};
const ShopContext = createContext<ShopState | null>(null);
export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("Shop controls must be inside ShopProvider");
  return context;
}
export default function ShopProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("all");
  const [kind, setKind] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  const add = (item: Listing) => {
    if (stockQuantity(item) === 0) return;
    const current = cart.find((line) => line.item.id === item.id);
    if (current && current.count >= cartLimit(item)) {
      setToast(
        item.sample
          ? "Esta carta de referencia ya está en tu carrito."
          : stockQuantity(item) === null
            ? "Confirma disponibilidad por WhatsApp."
            : "Ya agregaste todas las copias disponibles.",
      );
    } else {
      setCart((lines) => {
        const found = lines.find((line) => line.item.id === item.id);
        return found
          ? lines.map((line) =>
              line.item.id === item.id
                ? { ...line, count: Math.min(line.count + 1, cartLimit(item)) }
                : line,
            )
          : [...lines, { item, count: 1 }];
      });
      setToast(`${item.card_printings?.canonical_name} agregado al carrito`);
    }
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setToast(""), 4500);
  };
  const changeCount = (id: string, count: number) =>
    setCart((lines) =>
      lines.flatMap((line) =>
        line.item.id !== id
          ? [line]
          : count <= 0
            ? []
            : [{ ...line, count: Math.min(count, cartLimit(line.item)) }],
      ),
    );
  return (
    <ShopContext.Provider
      value={{
        query,
        setQuery,
        game,
        setGame,
        kind,
        setKind,
        cart,
        add,
        changeCount,
        cartOpen,
        setCartOpen,
        toast,
        dismissToast: () => setToast(""),
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}
