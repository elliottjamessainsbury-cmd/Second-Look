(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  root.SecondLookEditorial = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function formatList(values) {
    if (!values.length) {
      return "";
    }
    if (values.length === 1) {
      return values[0];
    }
    if (values.length === 2) {
      return `${values[0]} and ${values[1]}`;
    }
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
  }

  function chooseVariant(key, seed, candidate, templates) {
    const basis = `${key}:${seed && seed.title ? seed.title : ""}:${candidate && candidate.title ? candidate.title : ""}`;
    const total = basis.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return templates[total % templates.length];
  }

  function buildBlurbIndices(rawBlurbs, internalFilmByTitleKey) {
    const byTitle = {};
    const byId = {};

    Object.entries(rawBlurbs || {}).forEach(([key, value]) => {
      const [leftTitle, rightTitle] = key.split("::");
      if (!leftTitle || !rightTitle) {
        return;
      }

      byTitle[`${normalize(leftTitle)}::${normalize(rightTitle)}`] = value;

      const leftFilm = internalFilmByTitleKey[normalize(leftTitle)];
      const rightFilm = internalFilmByTitleKey[normalize(rightTitle)];
      if (leftFilm && rightFilm) {
        byId[`${leftFilm.filmId}::${rightFilm.filmId}`] = value;
      }
    });

    return { byId, byTitle };
  }

  function synthesizeReverseBlurb(entry, seed, candidate) {
    const points = (entry.supporting_points || []).slice(0, 3);
    if (points.length >= 2) {
      return {
        ...entry,
        blurb: `${candidate.title} follows ${seed.title} through ${formatList(points)}. The direction changes, but the connection still lands because both films are working the same nerve from different angles.`,
        sourceType: "reverse_pair_synthesis",
      };
    }

    if (points.length === 1) {
      return {
        ...entry,
        blurb: `${candidate.title} makes sense after ${seed.title} because both films lean hard into ${points[0]}. It is the same pull, just pushed into a different register.`,
        sourceType: "reverse_pair_synthesis",
      };
    }

    if (entry.primary_angle) {
      const angle = entry.primary_angle.replace(/\.$/, "");
      return {
        ...entry,
        blurb: `${candidate.title} still feels like a live follow-on from ${seed.title}: ${angle.charAt(0).toLowerCase()}${angle.slice(1)}.`,
        sourceType: "reverse_pair_synthesis",
      };
    }

    return {
      ...entry,
      sourceType: "reverse_pair_synthesis",
    };
  }

  function blurbForPair(seed, candidate, lookups) {
    if (!seed || !candidate || !lookups) {
      return null;
    }

    const blurbsByPairId = lookups.blurbsByPairId || {};
    const blurbsByPairTitle = lookups.blurbsByPairTitle || {};

    if (seed.filmId && candidate.filmId) {
      const directId = blurbsByPairId[`${seed.filmId}::${candidate.filmId}`];
      if (directId) {
        return {
          ...directId,
          sourceType: "pair_specific_blurb",
        };
      }

      const reverseId = blurbsByPairId[`${candidate.filmId}::${seed.filmId}`];
      if (reverseId) {
        return synthesizeReverseBlurb(reverseId, seed, candidate);
      }
    }

    const titleKey = `${normalize(seed.title)}::${normalize(candidate.title)}`;
    if (blurbsByPairTitle[titleKey]) {
      return {
        ...blurbsByPairTitle[titleKey],
        sourceType: "pair_specific_blurb",
      };
    }

    const reverseTitleKey = `${normalize(candidate.title)}::${normalize(seed.title)}`;
    if (blurbsByPairTitle[reverseTitleKey]) {
      return synthesizeReverseBlurb(blurbsByPairTitle[reverseTitleKey], seed, candidate);
    }

    return null;
  }

  function buildAffinityHit(candidateValues, affinityMap) {
    return (candidateValues || [])
      .map((value) => ({ label: value, score: Number((affinityMap || {})[normalize(value)] || 0) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)[0];
  }

  function buildFallbackExplanation({ candidate, scoreData, bestSeed, userProfile }) {
    const breakdown = scoreData && scoreData.breakdown ? scoreData.breakdown : {};
    const explanation = scoreData && scoreData.explanation ? scoreData.explanation : {};
    const seedTitle = bestSeed ? bestSeed.title : "your seed picks";

    if (bestSeed && (scoreData.directSources || []).length) {
      const angle =
        scoreData.toneOverlap.length && scoreData.themeOverlap.length
          ? chooseVariant("direct-angle", bestSeed, candidate, [
              ` It also keeps the ${formatList(scoreData.toneOverlap)} tone and ${formatList(scoreData.themeOverlap)} thread alive.`,
              ` The curated edge lands because it carries forward ${formatList(scoreData.toneOverlap)} texture and ${formatList(scoreData.themeOverlap)} concerns.`,
              ` The hand-linked jump is backed up by the same ${formatList(scoreData.toneOverlap)} tone and ${formatList(scoreData.themeOverlap)} line of thought.`,
            ])
          : scoreData.moodOverlap.length && scoreData.themeOverlap.length
          ? chooseVariant("direct-angle", bestSeed, candidate, [
              ` It also keeps the ${formatList(scoreData.moodOverlap)} mood and ${formatList(scoreData.themeOverlap)} thread alive.`,
              ` It earns that spot by carrying forward ${formatList(scoreData.moodOverlap)} feeling and ${formatList(scoreData.themeOverlap)} concerns.`,
              ` The direct edge is backed up by the same ${formatList(scoreData.moodOverlap)} mood and ${formatList(scoreData.themeOverlap)} line of thought.`,
            ])
          : "";
      return {
        text: chooseVariant("direct", bestSeed, candidate, [
          `${candidate.title} is one of our hand-linked next steps out of ${seedTitle}, so this is the clearest curated jump in the set.${angle}`,
          `${candidate.title} sits on a direct editorial edge from ${seedTitle}, which makes it one of the least accidental recommendations here.${angle}`,
          `${candidate.title} comes through as a hand-made follow-on from ${seedTitle}, so the recommendation is being driven by an explicit curated link.${angle}`,
        ]),
        sourceType: "fallback_direct_recommendation",
        activeSignals: ["direct recommendation edge"],
      };
    }

    if (bestSeed && scoreData.themeOverlap.length && scoreData.toneOverlap.length) {
      return {
        text: chooseVariant("theme-tone", bestSeed, candidate, [
          `${candidate.title} feels like a real continuation of ${seedTitle} because both films work in ${formatList(scoreData.themeOverlap)} while holding the same ${formatList(scoreData.toneOverlap)} tone.`,
          `${seedTitle} and ${candidate.title} connect less through plot than through ${formatList(scoreData.themeOverlap)} and a shared ${formatList(scoreData.toneOverlap)} texture.`,
          `${candidate.title} makes sense after ${seedTitle} because it pushes at ${formatList(scoreData.themeOverlap)} in the same ${formatList(scoreData.toneOverlap)} register.`,
        ]),
        sourceType: "fallback_shared_theme_tone",
        activeSignals: [...scoreData.themeOverlap, ...scoreData.toneOverlap],
      };
    }

    if (bestSeed && scoreData.moodOverlap.length && scoreData.themeOverlap.length) {
      return {
        text: chooseVariant("mood-theme", bestSeed, candidate, [
          `${candidate.title} takes ${seedTitle}'s ${formatList(scoreData.moodOverlap)} mood into ${formatList(scoreData.themeOverlap)} territory, which is why the pairing holds.`,
          `${seedTitle} and ${candidate.title} meet in ${formatList(scoreData.moodOverlap)} feeling and ${formatList(scoreData.themeOverlap)} concerns, even if they arrive there by different routes.`,
          `${candidate.title} feels like a live follow-on from ${seedTitle} because it keeps the ${formatList(scoreData.moodOverlap)} register while pushing deeper into ${formatList(scoreData.themeOverlap)}.`,
        ]),
        sourceType: "fallback_shared_mood_theme",
        activeSignals: [...scoreData.moodOverlap, ...scoreData.themeOverlap],
      };
    }

    if (bestSeed && scoreData.moodOverlap.length) {
      return {
        text: chooseVariant("mood", bestSeed, candidate, [
          `${candidate.title} keeps close to ${seedTitle} because both films sit in a ${formatList(scoreData.moodOverlap)} register rather than chasing the same plot beats.`,
          `The link from ${seedTitle} to ${candidate.title} is mostly emotional: both films hold onto a ${formatList(scoreData.moodOverlap)} mood.`,
          `${candidate.title} makes sense after ${seedTitle} less for story reasons than for the shared ${formatList(scoreData.moodOverlap)} atmosphere.`,
        ]),
        sourceType: "fallback_shared_mood",
        activeSignals: [...scoreData.moodOverlap],
      };
    }

    if (bestSeed && scoreData.toneOverlap.length && scoreData.paceOverlap.length) {
      return {
        text: chooseVariant("tone-pace", bestSeed, candidate, [
          `${candidate.title} follows ${seedTitle} through the same ${formatList(scoreData.toneOverlap)} tone and ${formatList(scoreData.paceOverlap)} pacing, so the recommendation feels shaped rather than approximate.`,
          `The link from ${seedTitle} to ${candidate.title} is formal as much as thematic: both films move at a ${formatList(scoreData.paceOverlap)} pace and hold a ${formatList(scoreData.toneOverlap)} tone.`,
          `${candidate.title} stays in the same lane as ${seedTitle} by matching its ${formatList(scoreData.toneOverlap)} texture and ${formatList(scoreData.paceOverlap)} rhythm.`,
        ]),
        sourceType: "fallback_shared_tone_pace",
        activeSignals: [...scoreData.toneOverlap, ...scoreData.paceOverlap],
      };
    }

    if (bestSeed && scoreData.themeOverlap.length) {
      return {
        text: chooseVariant("theme", bestSeed, candidate, [
          `${candidate.title} follows ${seedTitle} by worrying at the same things, especially ${formatList(scoreData.themeOverlap)}.`,
          `${seedTitle} opens the door to ${candidate.title} through a shared interest in ${formatList(scoreData.themeOverlap)}.`,
          `${candidate.title} belongs in this run because it pushes at the same material as ${seedTitle}: ${formatList(scoreData.themeOverlap)}.`,
        ]),
        sourceType: "fallback_shared_theme",
        activeSignals: [...scoreData.themeOverlap],
      };
    }

    if (bestSeed && scoreData.toneOverlap.length) {
      return {
        text: chooseVariant("tone", bestSeed, candidate, [
          `${candidate.title} sticks because it shares the same ${formatList(scoreData.toneOverlap)} tone as ${seedTitle}, even if the narrative route is different.`,
          `The strongest line from ${seedTitle} to ${candidate.title} is tonal: both films hold a ${formatList(scoreData.toneOverlap)} register.`,
          `${candidate.title} earns its place here through tonal continuity with ${seedTitle}, especially that ${formatList(scoreData.toneOverlap)} texture.`,
        ]),
        sourceType: "fallback_shared_tone",
        activeSignals: [...scoreData.toneOverlap],
      };
    }

    if (bestSeed && scoreData.paceOverlap.length) {
      return {
        text: chooseVariant("pace", bestSeed, candidate, [
          `${candidate.title} stays close to ${seedTitle} because both films trust a ${formatList(scoreData.paceOverlap)} pace to build their effect.`,
          `The route from ${seedTitle} to ${candidate.title} is partly rhythmic: both films move at a ${formatList(scoreData.paceOverlap)} pace and let that cadence do the work.`,
          `${candidate.title} belongs in this mix because it shares ${seedTitle}'s ${formatList(scoreData.paceOverlap)} rhythm rather than just overlapping on subject matter.`,
        ]),
        sourceType: "fallback_shared_pace",
        activeSignals: [...scoreData.paceOverlap],
      };
    }

    if (bestSeed && scoreData.sameDirector) {
      return {
        text: chooseVariant("same-director", bestSeed, candidate, [
          `${candidate.title} keeps you with ${candidate.director}, so the connection to ${seedTitle} comes from directorial voice rather than a hand-authored edge.`,
          `The jump from ${seedTitle} to ${candidate.title} is really a jump deeper into ${candidate.director}'s sensibility.`,
          `${candidate.title} stays in the same directorial orbit as ${seedTitle}, which is the strongest live connection here.`,
        ]),
        sourceType: "fallback_same_director",
        activeSignals: [candidate.director].filter(Boolean),
      };
    }

    if (bestSeed && breakdown.eraBonus > 0 && bestSeed.year && candidate.year) {
      return {
        text: chooseVariant("era", bestSeed, candidate, [
          `${candidate.title} lands in the same era lane as ${seedTitle} (${bestSeed.year} to ${candidate.year}), which helps it stay aligned with the rest of this mix.`,
          `${seedTitle} and ${candidate.title} sit close enough historically (${bestSeed.year} and ${candidate.year}) that the recommendation still makes period sense.`,
          `${candidate.title} stays near ${seedTitle} partly because they are working in the same cinematic moment: ${bestSeed.year} to ${candidate.year}.`,
        ]),
        sourceType: "fallback_era_adjacency",
        activeSignals: [`${bestSeed.year}`, `${candidate.year}`],
      };
    }

    if (explanation.sharedCountries && explanation.sharedCountries.length && scoreData.themeOverlap.length) {
      return {
        text: `${candidate.title} and ${seedTitle} are not just adjacent on paper; they share ${formatList(scoreData.themeOverlap)} and emerge from a similar ${formatList(explanation.sharedCountries)} context, which gives the recommendation more texture than a simple genre match.`,
        sourceType: "fallback_theme_country",
        activeSignals: [...scoreData.themeOverlap, ...explanation.sharedCountries],
      };
    }

    const moodHit = buildAffinityHit(candidate.mood, userProfile && userProfile.moodAffinity);
    if (moodHit) {
      return {
        text: `Your recent saves keep leaning toward ${moodHit.label} films, and ${candidate.title} stays firmly in that register.`,
        sourceType: "fallback_user_mood_affinity",
        activeSignals: [moodHit.label],
      };
    }

    const themeHit = buildAffinityHit(candidate.themes, userProfile && userProfile.themeAffinity);
    if (themeHit) {
      return {
        text: `You have been repeatedly saving films about ${themeHit.label}, and ${candidate.title} extends that thread.`,
        sourceType: "fallback_user_theme_affinity",
        activeSignals: [themeHit.label],
      };
    }

    if (
      candidate.director &&
      userProfile &&
      userProfile.directorAffinity &&
      Number(userProfile.directorAffinity[normalize(candidate.director)] || 0) > 0
    ) {
      return {
        text: `You have been responding to ${candidate.director}'s work, and ${candidate.title} keeps that preference in play.`,
        sourceType: "fallback_user_director_affinity",
        activeSignals: [candidate.director],
      };
    }

    const bestReason = (explanation.reasons || []).find((reason) => reason !== "generic genre-only match");
    if (bestReason) {
      return {
        text: `${candidate.title} is a looser recommendation than the strongest hand-linked picks, but it still holds because of ${bestReason.toLowerCase()}.`,
        sourceType: "fallback_reason_summary",
        activeSignals: [bestReason],
      };
    }

    const broadSignal =
      (candidate.themes || [])[0] ||
      (candidate.tone || [])[0] ||
      (candidate.mood || [])[0] ||
      candidate.director ||
      candidate.title;
    return {
      text: `${candidate.title} is in the mix as a broader fit for the taste signals you are giving us, but it is a weaker editorial leap than the recommendations built on explicit links, themes, or tonal overlap.`,
      sourceType: "fallback_generic",
      activeSignals: broadSignal ? [broadSignal] : [],
    };
  }

  function explanationForCandidate({ candidate, scoreData, bestSeed, lookups, userProfile }) {
    const blurb = blurbForPair(bestSeed, candidate, lookups);
    if (blurb && blurb.blurb) {
      return {
        text: blurb.blurb,
        sourceType: blurb.sourceType || "pair_specific_blurb",
        activeSignals: (blurb.supporting_points || []).slice(0, 3),
        blurb,
      };
    }

    return buildFallbackExplanation({ candidate, scoreData, bestSeed, userProfile });
  }

  return {
    normalize,
    formatList,
    buildBlurbIndices,
    blurbForPair,
    buildFallbackExplanation,
    explanationForCandidate,
  };
});
