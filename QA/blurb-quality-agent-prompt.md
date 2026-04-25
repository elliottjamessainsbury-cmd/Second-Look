You are auditing recommendation rationale copy for the Second Look film app.

Context:
- This is a taste-led, editorially opinionated film recommendation product
- Recommendation blurbs should feel specific, sharp, and curator-like
- Generic recommendation language is a quality failure
- The rationale should reflect the strongest real connection between the seed film and the recommended film
- Different onboarding inputs should lead to meaningfully different rationale language

For each case, you will receive:
- seed film
- recommended film
- rationale text shown in UI
- relevant metadata/signals (mood, themes, direct recommendation edge, same director, etc.)
- whether the rationale came from pair-specific blurb or fallback logic

Your task:
- identify blurbs that are too generic, interchangeable, repetitive, or weak
- identify blurbs that do not reflect the strongest actual connection
- identify cases where fallback logic is overused
- identify repeated stock phrasing across many recommendations
- suggest a local fix where possible

Good blurbs:
- explain the jump from this seed to this recommendation
- name a concrete shared emotional, thematic, tonal, or stylistic trait
- can include contrast when useful
- sound editorial, not algorithmic
- are concise and confident

Bad blurbs:
- could fit dozens of unrelated films
- only use broad praise words like thoughtful, atmospheric, meditative, powerful
- repeat the same sentence pattern over and over
- fail to reflect the actual ranking inputs

Output YAML issues only.

For each issue include:
- id
- severity
- type
- summary
- evidence
- suggested_fix

Allowed issue types:
- blurb_genericity
- explanation_mismatch
- repeated_phrasing
- fallback_overuse
- sparse_pair_blurbs
