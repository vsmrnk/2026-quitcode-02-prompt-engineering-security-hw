import { describe, expect, it } from "vitest";
import {
  estimateTotalCents,
  formatMoney,
  MAX_INSTALLMENTS,
  QuoteInputError,
  splitInstallments,
} from "./quote.js";

describe("estimateTotalCents", () => {
  it("рахує суму без знижки", () => {
    expect(estimateTotalCents({ hours: 10, rateCents: 5000 })).toBe(50000);
  });

  it("застосовує знижку", () => {
    expect(estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent: 10 })).toBe(45000);
  });

  it("знижка 100% дає 0", () => {
    expect(estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent: 100 })).toBe(0);
  });

  it("округлює half-up до цента", () => {
    // 3 * 3333 = 9999; знижка 33% → 9999 * 0.67 = 6699.33 → 6699
    expect(estimateTotalCents({ hours: 3, rateCents: 3333, discountPercent: 33 })).toBe(6699);
  });

  it("підтримує дробові години", () => {
    expect(estimateTotalCents({ hours: 1.5, rateCents: 5000 })).toBe(7500);
  });

  it("округлення half-up на межі .5 вгору, .49 вниз", () => {
    // gross=1, знижка 50% → 0.5 → 1 (half-up); знижка 51% → 0.49 → 0
    expect(estimateTotalCents({ hours: 1, rateCents: 1, discountPercent: 50 })).toBe(1);
    expect(estimateTotalCents({ hours: 1, rateCents: 1, discountPercent: 51 })).toBe(0);
  });

  it("знижка 0 явно дорівнює gross", () => {
    expect(estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent: 0 })).toBe(50000);
  });

  it("результат завжди ціле число", () => {
    for (const input of [
      { hours: 3, rateCents: 3333, discountPercent: 33 },
      { hours: 1.5, rateCents: 4999, discountPercent: 17 },
      { hours: 7, rateCents: 1234, discountPercent: 5 },
    ]) {
      expect(Number.isInteger(estimateTotalCents(input))).toBe(true);
    }
  });

  it("нечислові входи кидають QuoteInputError", () => {
    // проходить гілку typeof value !== "number" у assertFiniteNonNegative
    expect(() => estimateTotalCents({ hours: "10" as unknown as number, rateCents: 5000 })).toThrow(
      QuoteInputError,
    );
  });

  it.each([
    ["від'ємні години", { hours: -1, rateCents: 5000 }],
    ["від'ємна ставка", { hours: 10, rateCents: -5000 }],
    ["знижка > 100", { hours: 10, rateCents: 5000, discountPercent: 150 }],
    ["від'ємна знижка", { hours: 10, rateCents: 5000, discountPercent: -10 }],
    ["NaN у знижці", { hours: 10, rateCents: 5000, discountPercent: NaN }],
    ["Infinity у годинах", { hours: Infinity, rateCents: 5000 }],
    ["NaN у ставці", { hours: 10, rateCents: NaN }],
  ])("кидає QuoteInputError: %s", (_label, input) => {
    expect(() => estimateTotalCents(input)).toThrow(QuoteInputError);
  });
});

describe("splitInstallments", () => {
  it("ділить суму, що ділиться націло", () => {
    expect(splitInstallments(90000, 3)).toEqual([30000, 30000, 30000]);
  });

  // Головний інваріант — саме його ламала стартова версія.
  it.each([
    [100, 3],
    [10000, 3],
    [45000, 7],
    [5, 2],
    [100, 6],
    [100000, 7],
    [1, 1],
    [7, 4],
  ])("сума часток дорівнює цілому: split(%i, %i)", (total, parts) => {
    const result = splitInstallments(total, parts);
    expect(result).toHaveLength(parts);
    expect(result.reduce((a, b) => a + b, 0)).toBe(total);
    expect(result.every((x) => Number.isInteger(x))).toBe(true);
    expect(Math.max(...result) - Math.min(...result)).toBeLessThanOrEqual(1);
  });

  it("розкидає залишок на перші платежі", () => {
    expect(splitInstallments(100, 3)).toEqual([34, 33, 33]);
  });

  it("працює для від'ємних сум (повернення)", () => {
    const result = splitInstallments(-100, 3);
    expect(result).toEqual([-34, -33, -33]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(-100);
  });

  it("parts === 1 повертає всю суму", () => {
    expect(splitInstallments(12345, 1)).toEqual([12345]);
  });

  it("parts === MAX_INSTALLMENTS (верхня прийнятна межа)", () => {
    const result = splitInstallments(1200000, MAX_INSTALLMENTS);
    expect(result).toHaveLength(MAX_INSTALLMENTS);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1200000);
  });

  // Property-тест: детермінований набір (total, parts) по всьому домену,
  // включно з від'ємними — інваріант має триматись на КОЖНОМУ, а не лише на
  // підібраній таблиці (найвища гарантія проти регресії округлення).
  it("інваріант суми тримається на широкому наборі входів", () => {
    let seed = 12345;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let i = 0; i < 500; i++) {
      const total = rnd(2_000_001) - 1_000_000; // [-1e6, 1e6]
      const parts = 1 + rnd(MAX_INSTALLMENTS); // [1, 1200]
      const r = splitInstallments(total, parts);
      expect(r).toHaveLength(parts);
      expect(r.reduce((a, b) => a + b, 0)).toBe(total);
      expect(r.every((x) => Number.isInteger(x))).toBe(true);
      expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    ["parts = 0", 100, 0],
    ["parts від'ємне", 100, -1],
    ["parts дробове", 100, 2.5],
    ["parts > MAX", 100, MAX_INSTALLMENTS + 1],
    ["totalCents дробове", 100.5, 3],
    ["totalCents за межею safe integer", 2 ** 54, 7],
  ])("кидає QuoteInputError: %s", (_label, total, parts) => {
    expect(() => splitInstallments(total, parts)).toThrow(QuoteInputError);
  });
});

describe("formatMoney", () => {
  it("форматує центи", () => {
    expect(formatMoney(123450)).toBe("$1,234.50");
  });

  it("форматує нуль і дрібні суми", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(99)).toBe("$0.99");
  });

  it("форматує від'ємні суми", () => {
    expect(formatMoney(-123450)).toBe("-$1,234.50");
  });

  it("форматує від'ємні суб-долари (класичний баг-локус)", () => {
    expect(formatMoney(-5)).toBe("-$0.05");
    expect(formatMoney(-99)).toBe("-$0.99");
  });

  it("negative zero не дає зайвого мінуса", () => {
    expect(formatMoney(-0)).toBe("$0.00");
  });

  it("тримає межу $1.00 і групування мільйонів", () => {
    expect(formatMoney(100)).toBe("$1.00");
    expect(formatMoney(100000000)).toBe("$1,000,000.00");
  });

  it.each([
    ["дробове", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ])("кидає QuoteInputError: %s", (_label, cents) => {
    expect(() => formatMoney(cents)).toThrow(QuoteInputError);
  });

  it("round-trip: сума розбитого форматується у відомий рядок (незалежний оракул)", () => {
    // Незалежний оракул: total=100000 центів = "$1,000.00". Тест ловить і
    // втрату центів у splitInstallments (тоді sum≠100000), і регресію
    // formatMoney (тоді рядок≠"$1,000.00"). Порівняння з formatMoney(total)
    // було б тавтологічним, бо sum===total уже гарантовано інваріантом.
    const sum = splitInstallments(100000, 7).reduce((a, b) => a + b, 0);
    expect(formatMoney(sum)).toBe("$1,000.00");
  });
});
