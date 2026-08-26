// Real token logos.
//
// These are imported rather than referenced by path. A literal "/tokens/x.png"
// ignores basePath and 404s on Pages; a relative "tokens/x.png" only resolves at one
// depth, so it worked on the board and broke the moment a page lived at /wallet/.
// Importing makes webpack emit the URL, prefix included, wherever it is used.

import type { StaticImageData } from "next/image";
import strkPng from "../../../public/tokens/strk.png";
import ethPng from "../../../public/tokens/eth.png";
import btcWebp from "../../../public/tokens/btc.webp";
import usdcWebp from "../../../public/tokens/usdc.webp";
import zecPng from "../../../public/tokens/zec.png";

type IconProps = { size?: number; className?: string };

/** Token art by ticker, for anything that picks an icon at runtime. */
export const TOKEN_ART: Record<string, StaticImageData> = {
  BTC: btcWebp,
  ETH: ethPng,
  STRK: strkPng,
  USDC: usdcWebp,
  ZEC: zecPng,
};

function coin(img: StaticImageData, alt: string) {
  return function Coin({ size = 32, className }: IconProps) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={img.src}
        alt={alt}
        width={size}
        height={size}
        className={className}
        style={{ display: "block", borderRadius: "50%" }}
      />
    );
  };
}

export const StrkCoin = coin(strkPng, "STRK");
export const EthCoin = coin(ethPng, "ETH");
export const BtcCoin = coin(btcWebp, "BTC");
export const UsdcCoin = coin(usdcWebp, "USDC");
export const ZecCoin = coin(zecPng, "ZEC");
