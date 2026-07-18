const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data/v2";

const DEFAULT_ASSETS = ["bitcoin", "ethereum", "solana"];

export interface PriceData {
  id: string;
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
}

export interface Signal {
  asset: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  strength: number;
  reason: string;
}

export interface MarketSnapshot {
  prices: PriceData[];
  signals: Signal[];
  news: NewsItem[];
  timestamp: string;
}

const priceCache = new Map<string, { data: PriceData[]; fetchedAt: number }>();
const PRICE_CACHE_TTL = 60_000;

export async function fetchPrices(
  assetIds: string[] = DEFAULT_ASSETS,
): Promise<PriceData[]> {
  const cacheKey = assetIds.sort().join(",");
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
    return cached.data;
  }

  const ids = assetIds.join(",");
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }
  const data = (await res.json()) as Array<{
    id: string;
    symbol: string;
    current_price: number;
    price_change_24h: number;
    price_change_percentage_24h: number;
    high_24h: number;
    low_24h: number;
    market_cap: number;
  }>;

  const prices: PriceData[] = data.map((d) => ({
    id: d.id,
    symbol: d.symbol.toUpperCase(),
    currentPrice: d.current_price,
    priceChange24h: d.price_change_24h,
    priceChangePercentage24h: d.price_change_percentage_24h,
    high24h: d.high_24h,
    low24h: d.low_24h,
    marketCap: d.market_cap,
  }));

  priceCache.set(cacheKey, { data: prices, fetchedAt: Date.now() });
  return prices;
}

export async function fetchNews(limit = 2): Promise<NewsItem[]> {
  const url = `${CRYPTOCOMPARE_BASE}/news/?lang=EN&sortOrder=latest`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CryptoCompare API error: ${res.status}`);
  }
  const data = (await res.json()) as {
    Data?: Array<{
      title: string;
      url: string;
      source: string;
    }>;
  };

  return (data.Data ?? []).slice(0, limit).map((item) => ({
    title: item.title,
    url: item.url,
    source: item.source,
  }));
}

export function computeSignals(prices: PriceData[]): Signal[] {
  return prices.map((p) => {
    const pct = p.priceChangePercentage24h;
    const range = p.high24h - p.low24h;
    const volatility = p.low24h > 0 ? range / p.low24h : 0;

    let direction: Signal["direction"];
    let strength: number;
    let reason: string;

    if (pct > 3) {
      direction = "BULLISH";
      strength = Math.min(5, Math.round(pct / 2));
      reason = `Up ${pct.toFixed(1)}% in 24h`;
    } else if (pct < -3) {
      direction = "BEARISH";
      strength = Math.min(5, Math.round(Math.abs(pct) / 2));
      reason = `Down ${Math.abs(pct).toFixed(1)}% in 24h`;
    } else if (pct > 0.5) {
      direction = "BULLISH";
      strength = 1;
      reason = `Slight gain (${pct.toFixed(1)}%)`;
    } else if (pct < -0.5) {
      direction = "BEARISH";
      strength = 1;
      reason = `Slight loss (${pct.toFixed(1)}%)`;
    } else {
      direction = "NEUTRAL";
      strength = 0;
      reason = `Flat (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
    }

    if (volatility > 0.05) {
      reason += " — high volatility";
    }

    return { asset: p.symbol, direction, strength, reason };
  });
}

export function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

export function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(1)}M`;
  return `$${cap.toLocaleString("en-US")}`;
}

const signalEmoji: Record<string, string> = {
  BULLISH: "🟢",
  BEARISH: "🔴",
  NEUTRAL: "⚪",
};

export function formatSnapshot(snapshot: MarketSnapshot): string {
  const lines: string[] = [];
  lines.push(`📊 Market Update — ${snapshot.timestamp}`);
  lines.push("");

  for (const p of snapshot.prices) {
    const sig = snapshot.signals.find((s) => s.asset === p.symbol);
    const emoji = sig ? signalEmoji[sig.direction] : "⚪";
    const pctStr =
      p.priceChangePercentage24h >= 0
        ? `+${p.priceChangePercentage24h.toFixed(1)}%`
        : `${p.priceChangePercentage24h.toFixed(1)}%`;
    lines.push(`${emoji} ${p.symbol}: ${formatPrice(p.currentPrice)} (${pctStr})`);
  }

  if (snapshot.signals.length > 0) {
    lines.push("");
    lines.push("📈 Signals:");
    for (const sig of snapshot.signals) {
      if (sig.direction !== "NEUTRAL") {
        lines.push(`  ${sig.asset}: ${sig.reason}`);
      }
    }
  }

  if (snapshot.news.length > 0) {
    lines.push("");
    lines.push("📰 News:");
    for (const n of snapshot.news) {
      lines.push(`  • ${n.title}`);
    }
  }

  return lines.join("\n");
}
