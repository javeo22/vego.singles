import { ImageSquare } from "@phosphor-icons/react/dist/ssr";
import type { Listing } from "@/lib/catalog";

const crops = {
  charizard: { x: 38, y: 665, w: 122, h: 177 },
  "sol-ring": { x: 343, y: 667, w: 122, h: 172 },
  stitch: { x: 647, y: 666, w: 121, h: 177 },
  "star-wars": { x: 957, y: 675, w: 140, h: 168 },
};

function detailImageUrl(source: string) {
  try {
    const url = new URL(source);
    if (url.hostname === "cards.scryfall.io") {
      url.pathname = url.pathname.replace(/^\/(small|normal)\//, "/large/");
    } else if (url.hostname === "images.pokemontcg.io") {
      url.pathname = url.pathname.replace(/(?<!_hires)\.png$/, "_hires.png");
    } else if (url.hostname === "assets.tcgdex.net") {
      url.pathname = url.pathname.replace(/\/low\.(webp|png|jpg)$/, "/high.$1");
    } else if (url.hostname === "tcgplayer-cdn.tcgplayer.com") {
      url.pathname = url.pathname.replace(/_\d+w\.jpg$/, "_in_1000x1000.jpg");
    }
    return url.href;
  } catch {
    return source;
  }
}

export default function ProductArt({
  item,
  detail = false,
}: {
  item: Listing;
  detail?: boolean;
}) {
  const printing = item.card_printings;
  if (printing?.stock_image_url)
    return (
      <img
        className="product-image"
        key={`${printing.stock_image_url}-${detail}`}
        src={
          detail
            ? detailImageUrl(printing.stock_image_url)
            : printing.stock_image_url
        }
        alt={printing.canonical_name}
        loading={detail ? "eager" : "lazy"}
        onError={
          detail
            ? (event) => {
                const image = event.currentTarget;
                if (image.getAttribute("src") !== printing.stock_image_url)
                  image.src = printing.stock_image_url!;
              }
            : undefined
        }
      />
    );
  if (item.reference) {
    const crop = crops[item.reference];
    return (
      <div
        className="reference-art"
        style={{ aspectRatio: `${crop.w} / ${crop.h}` }}
      >
        <img
          src="/images/reference-display.jpg"
          alt={printing?.canonical_name || "Carta"}
          style={{
            width: `${(1280 / crop.w) * 100}%`,
            left: `${(-crop.x / crop.w) * 100}%`,
            top: `${(-crop.y / crop.h) * 100}%`,
          }}
        />
      </div>
    );
  }
  return (
    <div className="art-unavailable">
      <ImageSquare size={30} weight="light" aria-hidden="true" />
      <span>Sin imagen</span>
    </div>
  );
}
