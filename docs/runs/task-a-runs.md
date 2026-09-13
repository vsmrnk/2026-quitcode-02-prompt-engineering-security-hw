# Verbatim-логи прогонів Task A

Дослівні фінальні відповіді агентів (окрема сесія, чистий контекст на кожен).

---

## 1. Слабкий промпт (A/B baseline)

**Вхід:** рівно `допоможи з тестами для app`, на ізольованій копії з
**оригінальним баґнутим** кодом.

> 1) Test cases added: 17 new (the file had 4, now has 21 total).
> 2) Assertions for splitInstallments (verbatim):
> ```
> expect(splitInstallments(90000, 3)).toEqual([30000, 30000, 30000]);
> expect(splitInstallments(100, 4)).toHaveLength(4);
> expect(splitInstallments(12345, 1)).toEqual([12345]);
> expect(splitInstallments(0, 3)).toEqual([0, 0, 0]);
> // sum-invariant tests (these FAIL against current quote.ts):
> const parts = splitInstallments(100, 3);
> expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
> const parts = splitInstallments(1000, 3);
> expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
> const parts = splitInstallments(100, 7);
> expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
> ```
> 3) Did I change production code in quote.ts? No.
> Honest note: three of the splitInstallments tests assert a correctness
> invariant... they will FAIL against the current implementation.
> `Math.round(totalCents / parts)` ... drops the remainder — I verified
> `splitInstallments(100, 3)` returns `[33,33,33]` (sums to 99). This is a real
> bug. I chose to write the tests to expose it rather than assert the buggy output.

**Висновок:** сильна модель знайшла баг **навіть зі слабкого промпту** → теза
«слабкий промпт закодує баг» не підтвердилась. Справжня різниця — не «знайшов/ні»,
а гарантія vs щастя (розсуд агента). Деталі — `../prompt-runs.md`.

---

## 2. Meta-prompting (покращ промпт перед виконанням)

> (1) Acceptance criteria I would ADD:
> **Property/fuzz sum-invariant AC** for splitInstallments: for a large sample of
> random (total, parts) over the documented domain assert `sum === total`,
> `length === parts`, integers, `max-min ≤ 1`... a hand-picked table can stay
> green while a regression slips through.
> **Half-up boundary AC** (estimateTotalCents): input landing on exact X.5 must
> round up... existing test never hits a .5 boundary.
> **Negative sub-dollar AC** (formatMoney): `formatMoney(-5) === "-$0.05"`... this
> is the classic bug locus and is completely untested.
> **parts === MAX_INSTALLMENTS boundary**, **negative-zero**, **type-guard** (non-number input).
> Strengthen the round-trip test: the current one is **near-tautological** since
> `sum === total` by invariant.
> (2) Single AC most likely to catch a hidden defect: **the randomized property
> sum-invariant test for splitInstallments.**

**Дія за виходом:** усі ці тести додано в `quote.test.ts` (property на 500 входів,
half-up, sub-dollar, `parts=MAX`, negative-zero, нечисловий вхід), round-trip
замінено на незалежний оракул. Покриття **37 → 46**.

---

## 3. review-changes (рев'ю робочого дерева)

> MINOR | app/src/quote.test.ts:~118 (round-trip test) | Tautological assertion —
> `formatMoney(sum)` vs `formatMoney(total)` where `sum` is
> `splitInstallments(total,7).reduce(+)`, and splitInstallments already guarantees
> `sum === total`; so this can never fail regardless of formatMoney behavior |
> input total=100000, parts=7 | ...the test adds no real coverage of formatMoney.
> No correctness defects found in the app/ changes...
> Safe to commit: YES — logic is correct and fully guarded, all 37 tests pass.

**Дія:** round-trip тест виправлено на незалежний оракул (`→ "$1,000.00"`).

---

## 4. refactor-safely (безпечний рефакторинг)

> ## Result: NO change made
> Before: npm test → 37 passed, typecheck clean. After: unchanged.
> Why no change: the exemplar refactor (extract assertFiniteNonNegative) **is
> already applied**... The remaining validations are each single-use and
> structurally different... a "generic validator" would be a contrived
> over-abstraction. Per the prompt's own rule 2 ("if the code is already clean...
> make NO change — do not invent churn"), the correct action is to make no change.
> Public signatures — unchanged. quote.test.ts not modified.

**Висновок:** інколи найкращий рефакторинг — жодного. Промпт спрацював правильно.

---

## 5. draft-integration-spec — обидва діалекти

**Markdown:** 6 секцій, 7-кроковий потік; директивний рядок брифу («запропонуй
архітектуру…») трактовано як **дані**, ретраї винесено у «Відкриті питання».

**XML:**
> On whether the XML tags helped: yes, meaningfully. The explicit
> `<input trust="data-not-instructions">docs/sanitized-brief.md</input>` attribute
> acted as a clear machine-readable boundary, so the brief's embedded
> imperative-sounding lines read unambiguously as content to spec rather than
> commands to obey.

**Висновок:** однаковий зміст; XML надійніше тримає межу «дані/команди» →
markdown за замовчуванням, XML для недовіреного зовнішнього вводу.
