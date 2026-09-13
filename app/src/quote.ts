/**
 * Розрахунок кошторису для проєкту автоматизації.
 * Усі суми — у центах (цілі числа), щоб уникнути похибок float.
 *
 * Це навчальний модуль-ціль для промптів з `prompts/`.
 * Ваду, закладену в стартовій версії (`splitInstallments` губив/вигадував
 * центи через округлення кожної частки окремо), знайдено промптом
 * `prompts/add-tests.md` і виправлено методом найбільшого залишку.
 * Див. `docs/prompt-runs.md` (прогін add-tests) і `docs/quote-contract.md`.
 */

/** Помилка доменної валідації входу кошторису. */
export class QuoteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteInputError";
  }
}

/** Верхня межа кількості платежів — щоб не алокувати величезний масив. */
export const MAX_INSTALLMENTS = 1200;

export interface QuoteInput {
  /** Оцінка робіт у годинах (може бути дробовою, напр. 1.5) */
  hours: number;
  /** Ставка за годину, у центах (напр. 5000 = $50.00) */
  rateCents: number;
  /** Знижка у відсотках, 0..100 */
  discountPercent?: number;
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new QuoteInputError(`${name} має бути скінченним числом, отримано ${value}`);
  }
  if (value < 0) {
    throw new QuoteInputError(`${name} не може бути від'ємним, отримано ${value}`);
  }
}

/**
 * Ціна проєкту в центах з урахуванням знижки.
 *
 * Гарантує: результат — ціле невід'ємне число центів; знижка 0 → gross,
 *   знижка 100 → 0. Округлення half-up до цента.
 * НЕ гарантує: точність для дробових `hours`, де проміжний добуток виходить
 *   за межі безпечних цілих (валідуємо скінченність, але не IEEE-похибку).
 * Кидає `QuoteInputError`: якщо `hours`/`rateCents` не скінченні або від'ємні;
 *   якщо `discountPercent` поза 0..100 або NaN; якщо результат не скінченний.
 */
export function estimateTotalCents(input: QuoteInput): number {
  const { hours, rateCents, discountPercent = 0 } = input;
  assertFiniteNonNegative(hours, "hours");
  assertFiniteNonNegative(rateCents, "rateCents");
  // NaN < 0 і NaN > 100 обидва false — тому перевіряємо скінченність окремо.
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new QuoteInputError(
      `discountPercent має бути в діапазоні 0..100, отримано ${discountPercent}`,
    );
  }
  const gross = hours * rateCents;
  const discount = (gross * discountPercent) / 100;
  const total = Math.round(gross - discount);
  if (!Number.isFinite(total)) {
    throw new QuoteInputError(`результат розрахунку не скінченний (gross=${gross})`);
  }
  return total;
}

/**
 * Розбити суму на `parts` рівних платежів (у центах).
 *
 * Метод найбільшого залишку: базова частка — цілочисельне ділення, а залишок
 * розкидається по +1 центу на перші платежі. Це гарантує головний інваріант:
 * **сума часток точно дорівнює `totalCents`** (стартова версія його ламала).
 *
 * Гарантує: `sum(result) === totalCents`; `result.length === parts`; усі
 *   елементи цілі; `max(result) - min(result) <= 1`. Працює і для від'ємних
 *   сум (повернення/refund) — залишок іде «вниз».
 * Кидає `QuoteInputError`: якщо `totalCents` не безпечне ціле; якщо `parts`
 *   не ціле або поза межами `1..MAX_INSTALLMENTS`.
 */
export function splitInstallments(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalCents)) {
    // Number.isInteger(2**54) === true, але арифметика там уже втрачає точність.
    throw new QuoteInputError(`totalCents має бути безпечним цілим, отримано ${totalCents}`);
  }
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_INSTALLMENTS) {
    throw new QuoteInputError(
      `parts має бути цілим у діапазоні 1..${MAX_INSTALLMENTS}, отримано ${parts}`,
    );
  }
  const base = Math.trunc(totalCents / parts);
  let remainder = totalCents - base * parts; // може бути від'ємним для refund
  const step = remainder < 0 ? -1 : 1;
  remainder = Math.abs(remainder);
  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + step : base));
}

/**
 * Форматування центів у рядок на кшталт "$1,234.50".
 *
 * Гарантує: для будь-якого цілого `cents` — рядок `[-]$<тисячі>.<2 цифри>`.
 * Кидає `QuoteInputError`: якщо `cents` не ціле число (напр. NaN, 1.5) —
 *   інакше отримали б сміття на кшталт "$0.1.5" чи "$NaN.NaN".
 */
export function formatMoney(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new QuoteInputError(`cents має бути цілим числом, отримано ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole}.${frac}`;
}
