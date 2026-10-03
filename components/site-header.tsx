"use client";
import {
  MagnifyingGlass,
  ShoppingCart,
  User,
  ArrowLeft,
} from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { gameNames } from "@/lib/catalog";
import { useShop } from "./shop-provider";

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Vego Singles home">
      vego<span>.</span>singles
    </a>
  );
}
export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { query, setQuery, game, setGame, kind, setKind, cart, setCartOpen } =
    useShop();
  if (pathname.startsWith("/admin")) return null;
  const navigateFilter = (value: string, type: "game" | "kind") => {
    if (type === "game") setGame(value);
    else setKind(value);
    if (pathname !== "/") router.push("/#catalogo");
    else
      document
        .getElementById("catalogo")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <>
      <div className="announcement">
        <div className="wide">
          <span>Collect here. Play anywhere.</span>
          <span>
            Costa Rica · <b>CRC</b>
          </span>
        </div>
      </div>
      <header className="site-header">
        <div className="header-main wide">
          <Brand />
          <form
            className="searchbox"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (pathname !== "/") router.push("/#catalogo");
              else
                document
                  .getElementById("catalogo")
                  ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <MagnifyingGlass size={23} weight="light" aria-hidden="true" />
            <input
              aria-label="Search cards, sets, and sealed products"
              placeholder="Search cards, sets, and sealed products"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            )}
          </form>
          <div className="header-actions">
            <a href="/login" className="account-link">
              <User size={26} weight="light" />
              <span>Account</span>
            </a>
            <span className="header-divider" />
            <button className="cart-trigger" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={27} weight="light" />
              <span>Cart ({cart.reduce((n, line) => n + line.count, 0)})</span>
            </button>
          </div>
        </div>
        <nav className="category-nav wide" aria-label="Shop categories">
          <div className="game-links">
            {Object.entries(gameNames).map(([key, name]) => (
              <button
                key={key}
                aria-pressed={game === key}
                className={game === key ? "active" : ""}
                onClick={() =>
                  navigateFilter(game === key ? "all" : key, "game")
                }
              >
                {name}
              </button>
            ))}
          </div>
          <div className="format-links">
            <button
              aria-pressed={kind === "single"}
              onClick={() =>
                navigateFilter(kind === "single" ? "all" : "single", "kind")
              }
            >
              Singles
            </button>
            <button
              aria-pressed={kind === "sealed"}
              onClick={() =>
                navigateFilter(kind === "sealed" ? "all" : "sealed", "kind")
              }
            >
              Sealed
            </button>
          </div>
        </nav>
      </header>
      {pathname === "/login" && (
        <div className="wide login-breadcrumb">
          <a href="/">
            <ArrowLeft size={16} /> Back to the shop
          </a>
        </div>
      )}
    </>
  );
}
