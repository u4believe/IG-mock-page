# TradingView Advanced Chart Widget — Integration Guide

As of 2026-11-14

## Scope

The Advanced Real-Time Chart widget gives us the TradingView chart engine on popular markets today, free and with no application, while the Advanced Charts datafeed is built.

What it is for: market-data views. A markets tab, a symbol page, a chart beside a watchlist, a public landing page.

What it must not carry: order tickets, position overlays, fill markers, or any buy/sell control wired to it. Widgets are TradingView-hosted and show TradingView's data, not our book. Execution attached to that chart is both technically impossible (sealed iframe) and outside what the free widget is meant for.

Treat every widget placement as temporary. The migration section covers the swap to Advanced Charts.

## The embed

A script tag that injects an iframe. The configuration JSON goes inside the script tag as its text content, not as an attribute — this is the step most integrations get wrong.

```html
<div class="tradingview-widget-container" style="height:600px">
  <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px)"></div>
  <div class="tradingview-widget-copyright">
    <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
      Track all markets on TradingView
    </a>
  </div>
  <script
    type="text/javascript"
    src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
    async>
  {
    "autosize": true,
    "symbol": "BINANCE:BTCUSDT",
    "interval": "60",
    "timezone": "Africa/Lagos",
    "theme": "dark",
    "style": "1",
    "locale": "en",
    "allow_symbol_change": true,
    "hide_side_toolbar": false,
    "support_host": "https://www.tradingview.com"
  }
  </script>
</div>
```

Three parts, all required:

1. The outer container with an explicit height. The widget sizes to its parent when `autosize` is true; a parent with no height renders nothing.
2. The inner `__widget` div, which is where the iframe is mounted.
3. The copyright link. It is part of the widget terms and stays.

The script loads from TradingView's CDN, so the chart needs network access to `s3.tradingview.com` and `*.tradingview.com`. Add both to the `script-src` and `frame-src` directives if we run a Content Security Policy.

## React integration

`dangerouslySetInnerHTML` will not run the script tag, so the node has to be built in an effect. Wrap it once as `MarketChart` and let nothing widget-specific leak past this file.

```jsx
import { useEffect, useRef } from "react";

export default function MarketChart({
  symbol = "BINANCE:BTCUSDT",
  interval = "60",
  theme = "dark",
  height = 600,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = `
      <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px)"></div>
      <div class="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
          Track all markets on TradingView
        </a>
      </div>`;

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Africa/Lagos",
      theme,
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);
    return () => { container.innerHTML = ""; };
  }, [symbol, interval, theme]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ height }}
    />
  );
}
```

Notes that matter in practice:

- There is no API to change the symbol in place. The effect tears the container down and rebuilds it whenever `symbol`, `interval` or `theme` changes. Expect a visible reload on symbol switch; that is the widget, not our code.
- The cleanup clearing `innerHTML` is what stops orphaned iframes accumulating on route changes.
- In Next.js the component is client-only. Mark the file `"use client"`, or import it with `dynamic(() => import("./MarketChart"), { ssr: false })`. The script touches `document` and will break a server render.
- Under React 18 Strict Mode the effect runs twice in development. The cleanup makes this harmless, but it is the reason a doubled chart appears if cleanup is omitted.

## Configuration

| Option | Values | Notes |
| --- | --- | --- |
| `symbol` | `EXCHANGE:TICKER` | Exchange-prefixed. `BINANCE:BTCUSDT`, `COINBASE:ETHUSD`, `FX:EURUSD`, `NASDAQ:AAPL`, `SP:SPX` |
| `interval` | `1`, `5`, `15`, `30`, `60`, `240`, `D`, `W`, `M` | Minutes as numbers; letters for day, week, month |
| `theme` | `light`, `dark` | Drive from our own theme state |
| `style` | `1` candles, `2` bars, `3` line, `8` heikin ashi | Strings, not numbers |
| `locale` | `en`, `fr`, `es`, … | UI language of the chart |
| `timezone` | IANA name | `Africa/Lagos` for us; `Etc/UTC` if we prefer exchange-neutral |
| `autosize` | `true` | Fills the parent; the parent must have a height |
| `allow_symbol_change` | `true` / `false` | Set `false` when the symbol is driven by our own selector |
| `hide_side_toolbar` | `true` / `false` | `true` drops drawing tools for a compact card |
| `hide_top_toolbar` | `true` / `false` | `true` gives a near-bare chart |
| `withdateranges` | `true` | Adds the 1D / 1M / 1Y range row |
| `details`, `hotlist`, `calendar` | `true` / `false` | Side panels; usually off inside an app |
| `studies` | array of ids | e.g. `["RSI@tv-basicstudies"]` |

Sizing: `autosize: true` with a fixed-height parent is the reliable pattern. Avoid passing `width` and `height` in the config — they fight our layout and do not respond to resize.

Theming beyond `theme` is limited to a few colour overrides (`backgroundColor`, `gridColor`). The chart will not match a custom design system closely; that is a reason to keep it on market-data surfaces rather than the core trading screen.

## Companion widgets

Same embed pattern, different script filename and config keys. All free, all under the same terms.

| Widget | Script | Where it fits |
| --- | --- | --- |
| Ticker Tape | `embed-widget-ticker-tape.js` | Scrolling strip across the top of the app shell |
| Market Overview | `embed-widget-market-overview.js` | Tabbed multi-market panel on the dashboard |
| Mini Symbol Overview | `embed-widget-mini-symbol-overview.js` | Sparkline cards in a markets list |
| Symbol Info | `embed-widget-symbol-info.js` | Header strip above the main chart |
| Screener | `embed-widget-screener.js` | Discovery tab |
| Economic Calendar | `embed-widget-events.js` | Sidebar or a separate tab |

All of these pull TradingView's symbol universe, so the instruments shown may not match the ones we actually list. Where that mismatch would mislead, build the list from our own catalogue and use only the chart widget.

## Limitations to design around

**Sealed iframe, no API.** Communication is one-way, at construction only. We cannot read the crosshair, push ticks, overlay fills or positions, sync it to the order book, or export its state. Anything that needs to interact with the chart waits for Advanced Charts.

**Not our prices.** Candles come from TradingView's venues. If we route elsewhere or run our own book, the chart and our quotes will diverge. Label widget surfaces as market overview, never as the user's own market.

**Data freshness varies.** Crypto spot is real-time. Several equity and futures exchanges serve delayed data in the free widget unless the viewer is signed in to their own TradingView subscription. Low risk for a crypto-first product; visible to users if we list US equities.

**Branding is mandatory.** The chart watermark and the copyright link both stay. Removing either breaches the widget terms.

**No offline or degraded mode.** If TradingView's CDN is unreachable, the chart is blank. Render a fallback panel rather than an empty box.

**Open question:** confirm whether any chart surface will sit behind a paid tier. The free Advanced Charts terms require a public, non-paywalled implementation, and the same spirit applies to widgets — worth clarifying with platforms@tradingview.com before our pricing page goes live.

## Migration to Advanced Charts

The whole point of the `MarketChart` wrapper is that this swap touches one file.

Decide now, not later:

- **Our own symbol IDs are canonical.** Keep a lookup table mapping our instrument IDs to TradingView strings, and pass our IDs through the app. When Advanced Charts arrives, `resolveSymbol` speaks our symbology and only the lookup table is retired.
- **Props stay generic.** `symbol`, `interval`, `theme`, `height` — nothing named after a widget config key crosses the component boundary.
- **No consumer reaches into the DOM.** Nothing outside `MarketChart` should query `.tradingview-widget-container`.

When access is approved, the work is:

1. Pull `charting_library` from the private repo into the app's static assets.
2. Implement the Datafeed API against our price source: `onReady`, `searchSymbols`, `resolveSymbol`, `getBars`, `subscribeBars`, `unsubscribeBars`.
3. Reimplement `MarketChart` against the widget constructor, same props.
4. Keep attribution visible; it is required under the free agreement too.

Everything else in the app is unchanged.

## Sources

- [TradingView — Free financial widgets](https://in.tradingview.com/free-charting-libraries)
- [TradingView — Charting library docs, introduction](https://www.tradingview.com/charting-library-docs/latest/introduction/)
- [TradingView — Get started (Advanced Charts)](https://www.tradingview.com/charting-library-docs/latest/quick-start/)
- [TradingView — Product comparison](https://in.tradingview.com/charting-library-docs/latest/product-comparison/)
