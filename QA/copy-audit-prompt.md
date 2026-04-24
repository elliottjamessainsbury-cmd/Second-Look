# Copy Audit Prompt

Use this prompt when auditing recommendation rationale copy for quality and editorial specificity.

```text
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
```

## Severity guide

| Severity | When to use |
|----------|-------------|
| high | Blurb is factually wrong, contradicts the seed-to-film connection, or is a bare fallback for a pair that has a specific blurb available |
| medium | Blurb is technically accurate but generic enough to apply to dozens of other films |
| low | Phrasing is slightly repetitive or could be sharpened but is not misleading |

## Example YAML output

```yaml
issues:
  - id: copy-001
    severity: high
    type: explanation_mismatch
    summary: Rationale cites "slow-burn tension" but the recommended film is a comedy
    evidence: |
      seed: Jeanne Dielman
      recommended: The Favourite
      rationale: "A slow-burn study of domestic tension and quiet dread."
    suggested_fix: |
      Focus on the shared theme of women operating inside systems of power rather than tone.
      E.g. "Both films place a woman at the centre of a closed world she's quietly dismantling."

  - id: copy-002
    severity: medium
    type: blurb_genericity
    summary: "Thoughtful and atmospheric" could describe half the catalogue
    evidence: |
      seed: Yi Yi
      recommended: A Brighter Summer Day
      rationale: "A thoughtful, atmospheric portrait of family life."
    suggested_fix: |
      Name the specific register: the shared use of long takes to track generational drift,
      or the way both films situate a family against a city in quiet transformation.

  - id: copy-003
    severity: low
    type: repeated_phrasing
    summary: "quietly devastating" appears in 6 of 9 rationales for this seed
    evidence: |
      Phrase "quietly devastating" found in: Film A, Film B, Film C, Film D, Film E, Film F
    suggested_fix: |
      Reserve for the single recommendation where emotional restraint is the primary connection.
      Replace with specific language in the remaining five.
```

## Notes

- Log confirmed copy issues in `QA/issues/`.
- Pair-specific blurbs live in `data/recommendation-blurbs.json`.
- Fallback rationale logic is in `lib/recommendation-engine.js`.
- Run this audit after any bulk blurb generation or engine change.
