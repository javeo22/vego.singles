"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { stockQuantity, cartLimit, type Listing } from "@/lib/catalog";
import {
  cartStorageKey,
  defaultFilters,
  readFilters,
  writeFilters,
  restoreCart,
  type CatalogFilters,
} from "@/lib/shop-state";
import { fulfillmentMethods, type FulfillmentMethod } from "@/lib/fulfillment";

export type CartLine = { item: Listing; count: number };
type ShopState = {
  filters: CatalogFilters;
  updateFilters: (value: Partial<CatalogFilters>) => void;
  registerInventory: (items: Listing[], unavailable: boolean) => void;
  fulfillment: FulfillmentMethod;
  setFulfillment: (value: FulfillmentMethod) => void;
  query: string;
  setQuery: (value: string) => void;
  game: string;
  setGame: (value: string) => void;
  kind: string;
  setKind: (value: string) => void;
  cart: CartLine[];
  cartLoading: boolean;
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
  const [filters, setFilters] = useState({ ...defaultFilters });
  const [urlReady, setUrlReady] = useState(false);
  const updateFilters = (value: Partial<CatalogFilters>) =>
    setFilters((current) => ({ ...current, ...value }));
  const [fulfillment, setFulfillmentState] =
    useState<FulfillmentMethod>("delivery");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [cartLoading, setCartLoading] = useState(true);
  const restored = useRef(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const read = () => setFilters(readFilters(new URL(window.location.href)));
    read();
    setUrlReady(true);
    window.addEventListener("popstate", read);
    try {
      const saved = window.localStorage.getItem("vego.fulfillment.v1");
      if (fulfillmentMethods.includes(saved as FulfillmentMethod))
        setFulfillmentState(saved as FulfillmentMethod);
    } catch {
      /* Storage can be disabled by the browser. */
    }
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!urlReady || window.location.pathname !== "/") return;
    const url = writeFilters(new URL(window.location.href), filters);
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, "", url);
  }, [filters, urlReady]);
  const setFulfillment = (value: FulfillmentMethod) => {
    setFulfillmentState(value);
    try {
      window.localStorage.setItem("vego.fulfillment.v1", value);
    } catch {
      /* Optional persistence. */
    }
  };
  const registerInventory = useCallback(
    (items: Listing[], unavailable: boolean) => {
      if (unavailable) return;
      setCartLoading(false);
      if (!restored.current) {
        restored.current = true;
        try {
          const result = restoreCart(
            window.localStorage.getItem(cartStorageKey),
            items,
          );
          setCart(result.lines);
          if (result.adjusted)
            setToast(
              "Actualizamos tu carrito: algunas cartas cambiaron de disponibilidad.",
            );
        } catch {
          /* Optional persistence. */
        }
        setCartReady(true);
      } else {
        setCart((current) =>
          current.flatMap((line) => {
            const item = line.item.sample
              ? line.item
              : items.find((item) => item.id === line.item.id);
            return item && cartLimit(item) > 0
              ? [{ item, count: Math.min(line.count, cartLimit(item)) }]
              : [];
          }),
        );
      }
    },
    [],
  );
  useEffect(() => {
    if (restored.current) return;
    const controller = new AbortController();
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(cartStorageKey) || "null",
      );
      const ids =
        saved?.version === 1 && Array.isArray(saved.items)
          ? saved.items
              .map((line: { id?: unknown }) => line?.id)
              .filter(
                (id: unknown) =>
                  typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
              )
              .slice(0, 30)
          : [];
      if (!ids.length) {
        registerInventory([], false);
        return;
      }
      fetch(`/api/cart-items?ids=${encodeURIComponent(ids.join(","))}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const result = await response.json();
          if (!Array.isArray(result.listings)) throw new Error();
          if (!controller.signal.aborted && !restored.current)
            registerInventory(result.listings, false);
        })
        .catch(() => {
          if (!controller.signal.aborted && !restored.current) {
            setCartLoading(false);
            setToast(
              "Tu selección sigue guardada. Vuelve al catálogo para actualizar el carrito.",
            );
          }
        });
    } catch {
      setCartLoading(false);
    }
    return () => controller.abort();
  }, [registerInventory]);
  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem(
        cartStorageKey,
        JSON.stringify({
          version: 1,
          items: cart
            .filter((line) => !line.item.sample)
            .map((line) => ({ id: line.item.id, count: line.count })),
        }),
      );
    } catch {
      /* Optional persistence. */
    }
  }, [cart, cartReady]);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  const add = (item: Listing) => {
    if (stockQuantity(item) === 0) return;
    const current = cart.find((line) => line.item.id === item.id);
    if (!current && cart.length >= 30) {
      setToast("Puedes consultar hasta 30 cartas distintas por pedido.");
    } else if (current && current.count >= cartLimit(item)) {
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
        filters,
        updateFilters,
        registerInventory,
        fulfillment,
        setFulfillment,
        query: filters.query,
        setQuery: (value) => updateFilters({ query: value }),
        game: filters.game,
        setGame: (value) =>
          updateFilters({ game: value, set: "", language: "", finish: "" }),
        kind: filters.kind,
        setKind: (value) => updateFilters({ kind: value }),
        cart,
        cartLoading,
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
