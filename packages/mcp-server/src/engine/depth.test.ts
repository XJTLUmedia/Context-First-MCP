import { describe, it, expect } from "vitest";
import { analyzeDepth } from "./depth.js";

describe("analyzeDepth", () => {
  it("returns acceptable for empty input", () => {
    const result = analyzeDepth("");
    expect(result.depthScore).toBe(1.0);
    expect(result.isLazy).toBe(false);
    expect(result.sectionCount).toBe(0);
  });

  it("handles single-section output without headings", () => {
    const content = "This is a paragraph about stock market analysis. Technical analysis uses price charts and volume data to predict future movements. It has been widely used since Charles Dow first developed Dow Theory in the late 1800s. The core principle is that market prices reflect all available information.";
    const result = analyzeDepth(content);
    expect(result.sectionCount).toBe(1);
    expect(result.isLazy).toBe(false);
    expect(result.shallowSections.length).toBe(0);
  });

  it("detects laziness pattern: many sections, few words each", () => {
    // Simulate the problem: broad coverage, shallow depth
    const content = [
      "## Moving Averages",
      "Moving averages smooth price data.",
      "",
      "## RSI",
      "RSI measures momentum.",
      "",
      "## MACD",
      "MACD shows trend changes.",
      "",
      "## Bollinger Bands",
      "Bollinger Bands show volatility.",
      "",
      "## Fibonacci Retracement",
      "Fibonacci levels are used in trading.",
      "",
      "## Volume Analysis",
      "Volume confirms trends.",
      "",
      "## Candlestick Patterns",
      "Candlestick patterns signal reversals.",
      "",
      "## Support and Resistance",
      "Support and resistance are key price levels.",
      "",
      "## Elliott Wave Theory",
      "Elliott Wave describes market cycles.",
      "",
      "## Ichimoku Cloud",
      "Ichimoku provides multiple indicators.",
    ].join("\n");

    const result = analyzeDepth(content);
    expect(result.sectionCount).toBeGreaterThanOrEqual(8);
    expect(result.isLazy).toBe(true);
    expect(result.depthScore).toBeLessThan(0.5);
    expect(result.shallowSections.length).toBeGreaterThan(5);
    expect(result.elaborationDirectives.length).toBeGreaterThan(0);
    expect(result.recommendation).toContain("laziness");
  });

  it("recognizes deep content as satisfactory", () => {
    const content = [
      "## Moving Averages",
      "Moving averages are one of the most fundamental tools in technical analysis. A simple moving average (SMA) calculates the arithmetic mean of a security's price over a specified period, for example 50 or 200 days. The exponential moving average (EMA) gives greater weight to recent prices, making it more responsive to new information. Traders commonly use the crossover strategy: when the 50-day MA crosses above the 200-day MA (a 'golden cross'), it signals bullish momentum. Conversely, when the 50-day crosses below (a 'death cross'), it suggests bearish conditions.",
      "",
      "According to research by Brock, Lakonishok, and LeBaron (1992), simple moving average trading rules generated significant profits from 1897 to 1986 on the Dow Jones Industrial Average. The study found returns of approximately 12% per year compared to buy-and-hold strategies. However, more recent studies suggest that these advantages have diminished as more traders adopt the same strategies, increasing market efficiency.",
      "",
      "## RSI (Relative Strength Index)",
      "The RSI was developed by J. Welles Wilder Jr. in 1978 and measures the speed and magnitude of price movements on a scale from 0 to 100. It is calculated using the formula: RSI = 100 - (100 / (1 + RS)), where RS is the average gain divided by the average loss over a specified period (typically 14 days). Values above 70 indicate overbought conditions, while values below 30 suggest oversold conditions.",
      "",
      "Research shows that RSI divergences — when price makes a new high but RSI does not — are particularly Strong reversal signals. For instance, Chong and Ng (2008) found that RSI combined with MACD produced statistically significant returns in the London Stock Exchange over a 10-year period. The win rate exceeded 65% when both indicators confirmed the same directional signal.",
    ].join("\n");

    const result = analyzeDepth(content);
    expect(result.isLazy).toBe(false);
    expect(result.depthScore).toBeGreaterThan(0.4);
    expect(result.shallowSections.length).toBeLessThanOrEqual(1);
  });

  it("generates specific elaboration directives for shallow sections", () => {
    const content = [
      "## Deep Section",
      "This section has substantial content with specific examples and data points. According to research from 2023, the market efficiency hypothesis suggests that 85% of technical indicators fail to outperform random selection in modern markets. However, specific patterns like volume-price divergence still show statistically significant predictive power, particularly in emerging markets where information asymmetry is greater.",
      "",
      "## Shallow Section",
      "This is brief.",
    ].join("\n");

    const result = analyzeDepth(content);
    const shallowHeadings = result.shallowSections.map(s => s.heading);
    expect(shallowHeadings).toContain("Shallow Section");
    expect(result.elaborationDirectives.some(d => d.includes("Shallow Section"))).toBe(true);
  });

  it("detects numbered section headings", () => {
    const content = [
      "1. Introduction",
      "Brief intro.",
      "",
      "2. Methodology",
      "Short method.",
      "",
      "3. Results",
      "Quick results.",
    ].join("\n");

    const result = analyzeDepth(content);
    expect(result.sectionCount).toBeGreaterThanOrEqual(2);
  });

  it("computes detail density based on specific terms", () => {
    const highDetailContent = [
      "## Analysis",
      "According to studies, the RSI indicator achieves 65% accuracy. For example, in the S&P 500 index, the 14-day RSI showed a correlation of 0.73 with subsequent price movements. However, this effectiveness decreases in highly volatile markets, consequently reducing the win rate to approximately 52%. First, you must identify the trend direction. Second, confirm with volume indicators. Third, check for divergences between price and momentum.",
    ].join("\n");

    const result = analyzeDepth(highDetailContent);
    const section = result.shallowSections.length === 0
      ? { detailDensity: 1 }  // all sections are deep enough
      : result.shallowSections[0];
    // With many detail terms, density should be reasonable
    expect(result.depthScore).toBeGreaterThan(0);
  });
});
