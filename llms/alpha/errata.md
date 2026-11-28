# Errata: Alpha challenge set · release 0

> A released item changes only through a published erratum; each states the recorded scores it changed. Process: [ERRATA-PROCESS.md](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/ERRATA-PROCESS.md). Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## 0.1 (2026-11-16): answer-key

The answer keys for two amortization items kept full precision, but the prompt asks for exact cents. The keys now round to the cent at each step: balance after 12 months 15230.33 (was 15230.38), total interest 2444.36 (was 2444.38).

- Scores changed: 8 recorded lines across 8 configs; scorer change
- Release status: none
- Items: `financial/financial_amort_balance_after_12`, `financial/financial_amort_total_interest`

## 0.2 (2026-11-16): scorer

Answers of 1000 or more may now use comma thousands separators (15,230.33 for 15230.33). Smaller values are unchanged.

- Scores changed: 9 recorded lines across 9 configs; scorer change
- Release status: none
- Items: `financial/financial_amort_balance_after_12`, `financial/financial_amort_total_interest`

## 0.3 (2026-11-16): scorer

Answers with a rounding slip now earn half credit: on the amortization items, rounding only the final figure (15230.38, 2444.38); on the six-decimal trust items, truncating instead of rounding (0.571428 for 0.571429). An item still passes only at full credit.

- Scores changed: 10 recorded lines across 9 configs; scorer change
- Release status: none
- Items: `financial/financial_amort_balance_after_12`, `financial/financial_amort_total_interest`, `trust/trust_bayes_after_extra_bad`, `trust/trust_decay_flat_vale`, `trust/trust_decay_vale_score`, `trust/trust_folk_delta_star`, `trust/trust_hazard_min_bonus`

## 0.4 (2026-11-16): scorer

A probability, share, or rate asked for as a decimal but given as a percent (5.08% for 0.0508) now earns half credit. The % sign is required.

- Scores changed: 1 recorded lines across 1 configs; scorer change
- Release status: none
- Items: `economics/econ_mixed_receiver_prob_left`, `economics/econ_mixed_server_prob_left`, `economics/econ_tax_buyer_share`, `financial/financial_covenant_min_growth_no_breach`, `financial/financial_npv_crossover_rate`, `trust/trust_bayes_after_extra_bad`, `trust/trust_bayes_posterior`, `trust/trust_decay_flat_vale`

## 0.5 (2026-11-16): retired

Two factual items were removed because every tested model answered them correctly, so they no longer separate models. Results already recorded for them are kept but no longer counted.

- Scores changed: 214 recorded lines across 107 configs
- Release status: next-release
- Items: `factual/fact_gold_direct`, `factual/fact_gold_noisy`

## 0.6 (2026-11-16): scorer

When a model ran out of tokens while still reasoning, one model server returned the unfinished reasoning as the answer, and the scorer could pass it on an intermediate figure. Such a response now scores as no answer. This rule applies to every item; the items listed are the ones whose recorded passes it changed.

- Scores changed: 115 recorded lines across 17 configs; scorer change
- Release status: none
- Items: `economics/econ_entry_threat_credible`, `economics/econ_mixed_has_pure_ne`, `economics/econ_mixed_receiver_prob_left`, `economics/econ_mixed_server_prob_left`, `economics/econ_mixed_server_value`, `effect-ts/effect_constructors_structured`, `effect-ts/effect_error_class`, `effect-ts/effect_fiber_fork`, `effect-ts/effect_parallel`, `effect-ts/effect_queue_bounded`, `effect-ts/effect_resource_management`, `effect-ts/effect_service_3_parts_structured`, `effect-ts/effect_service_pattern`, `effect-ts/effect_sink`, `effect-ts/effect_stream_pipeline_structured`, `effect-ts/effect_try_promise`, `financial/financial_amort_balance_after_12`, `financial/financial_amort_monthly_payment`, `financial/financial_amort_payoff_month`, `financial/financial_bailout_amount`, `financial/financial_bailout_target`, `financial/financial_breakeven_liquidity_cascade`, `financial/financial_contagion_best_bailout`, `financial/financial_contagion_firm_c_survives`, `financial/financial_covenant_min_growth_no_breach`, `financial/financial_covenant_state`, `financial/financial_npv_crossover_rate`, `financial/financial_npv_payback_a`, `financial/financial_npv_project_a`, `financial/financial_npv_project_b`, `trust/trust_bayes_after_extra_bad`, `trust/trust_bayes_crosses_half`, `trust/trust_bayes_posterior`, `trust/trust_decay_flat_vs_decay_gap`, `trust/trust_decay_most_trustworthy`, `trust/trust_decay_vale_score`, `trust/trust_folk_delta_star`, `trust/trust_hazard_min_bonus`, `trust/trust_hazard_principal_profit`, `trust/trust_hazard_worth_incentivizing`

## 0.7 (2026-11-18): scorer

Whole-number answers are now read however they are formatted: with thousands separators (1,331), a zero decimal tail (1331.00), or a currency sign or unit ($1,331.00). Before, the scorer could read only part of the number ("1,331" as 331, "$1,331.00" as 00) and mark a correct answer wrong. A leading minus sign is now part of the number, so -40 no longer passes for 40.

- Scores changed: 1 recorded lines across 1 configs; scorer change
- Release status: none
- Items: `economics/econ_cournot_price`, `economics/econ_cournot_profit1`, `economics/econ_cournot_q1`, `economics/econ_cournot_q2`, `economics/econ_entry_entrant_payoff`, `economics/econ_entry_incumbent_payoff`, `economics/econ_entry_threat_gap`, `economics/econ_marginal_quantity`, `economics/econ_monopoly_competitive_quantity`, `economics/econ_monopoly_dwl`, `economics/econ_monopoly_price`, `economics/econ_monopoly_profit`, `economics/econ_monopoly_quantity`, `economics/econ_tax_buyer_price`, `economics/econ_tax_dwl`, `economics/econ_tax_quantity`, `economics/econ_tax_revenue`, `economics/econ_tax_seller_price`, `economics/econ_vickrey_bid`, `factual/fact_boiling_few_shot`, `factual/fact_chromosomes_adversarial`, `factual/fact_chromosomes_direct`, `financial/financial_amort_payoff_month`, `financial/financial_bailout_amount`, `financial/financial_breakeven_liquidity_cascade`, `financial/financial_contagion_buffer_bump_halts`, `financial/financial_contagion_total_failed`, `financial/financial_covenant_first_breach_month`, `financial/financial_waterfall_equity_residual`, `financial/financial_waterfall_mezz_payout`, `financial/financial_waterfall_pool_equity_zero`, `financial/financial_waterfall_senior_payout`, `logic/logic_ages_cot`, `logic/logic_bat_ball_direct`, `logic/logic_bat_ball_noisy`, `logic/logic_sequence`, `logic/logic_sheep_cot`, `logic/logic_sheep_direct`, `logic/logic_sheep_few_shot`, `logic/logic_widgets_adversarial`, `logic/logic_widgets_direct`, `math/math_chain_direct`, `math/math_chain_noisy`, `math/math_combinatorics_cot`, `math/math_compound_interest`, `math/math_modular_structured`, `math/math_multiply_cot`, `math/math_multiply_direct`, `math/math_multiply_few_shot`, `math/math_primes_sum_adversarial`, `math/math_primes_sum_direct`, `math/math_word_problem_decomposed`, `math/math_word_problem_direct`, `math/math_word_problem_structured`, `smoke/math_multiply_direct`, `trust/trust_bayes_signals_to_ninety`, `trust/trust_folk_coop_payoff`, `trust/trust_folk_temptation_gain`, `trust/trust_hazard_principal_profit`, `trust/trust_web_paths_above`
