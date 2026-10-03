import { ImageSquare } from "@phosphor-icons/react/dist/ssr";
import type { Listing } from "@/lib/catalog";

const crops = {
  charizard: { x: 38, y: 665, w: 122, h: 177 },
  "sol-ring": { x: 343, y: 667, w: 122, h: 172 },
  stitch: { x: 647, y: 666, w: 121, h: 177 },
  "star-wars": { x: 957, y: 675, w: 140, h: 168 },
};

export default function ProductArt({ item }: { item: Listing }) {
  const printing = item.card_printings;
  if (printing?.stock_image_url)
    return (
      <img
        className="product-image"
        src={printing.stock_image_url}
        alt={printing.canonical_name}
        loading="lazy"
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
