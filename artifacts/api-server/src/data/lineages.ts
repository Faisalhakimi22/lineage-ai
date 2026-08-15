import type { Lineage } from "@workspace/api-zod";
import { buildLineage, type LineageInput } from "./lineage-builder";

/**
 * The documented lineage library.
 *
 * This is the entire knowledge base for the prototype - seventeen records held
 * in memory, not a view of the internet. Two records are `externally_verified`:
 * their mutation chains correspond to real, widely documented cases. The other
 * fifteen are `illustrative` - constructed by the project team to demonstrate
 * realistic mutation patterns, grounded in real underlying subject matter but
 * not the output of an external investigation.
 *
 * That distinction is carried in the data itself (`dataset_provenance`) and
 * surfaced in the UI, because presenting a constructed example as a documented
 * investigation would be exactly the failure the product exists to oppose.
 *
 * No URL in this file is invented. Where we can name the body that holds the
 * evidence but are not citing a specific published item, the source is marked
 * `organisation_only` and the UI says so.
 */
const INPUTS: LineageInput[] = [
  // ---- VERIFIED ANCHOR 1 ------------------------------------------------
  {
    id: "spain-portugal-blackout",
    canonical_claim:
      "The April 2025 Spain–Portugal blackout was caused by European sanctions on Russia.",
    aliases: [
      "Spain's blackout happened because of sanctions on Russia",
      "The Iberian power outage was Russia's fault because of sanctions",
      "Spain destroyed its own power plants and blamed Russia",
      "Europe's blackout was retaliation for sanctioning Russian energy",
      "The blackout was caused by Europe stopping Russian energy",
      "Spain blackout Russia sanctions",
    ],
    verdict: "false",
    topic: "climate_energy",
    region: "global",
    dataset_provenance: "externally_verified",
    origin: {
      source: "ENTSO-E incident record / Expert Panel investigation",
      date: "2025-04-28",
      what_actually_happened:
        "ENTSO-E's Expert Panel concluded that the blackout resulted from interacting technical factors, including oscillations, gaps in voltage and reactive-power control, differing voltage-regulation practices, rapid output reductions, and generator disconnections. These led to fast voltage increases and cascading generation disconnections across continental Spain and Portugal; the investigation did not identify European sanctions on Russia as a cause.",
      sources: [
        {
          publisher: "ENTSO-E",
          url: "https://www.entsoe.eu/news/2025/04/28/grid-incident-in-the-power-systems-of-spain-and-portugal/",
          published_date: "2025-04-28",
          type: "official_statement",
          primary: true,
          evidence:
            "ENTSO-E's same-day incident notice establishes the date, time, and affected systems for the originating event.",
        },
        {
          publisher: "ENTSO-E",
          url: "https://www.entsoe.eu/news/2026/03/20/entso-e-publishes-expert-panel-final-report-on-28-april-2025-blackout-in-spain-and-portugal/",
          published_date: "2026-03-20",
          type: "official_statement",
          primary: true,
          evidence:
            "The official Expert Panel report attributes the blackout to interacting grid-control, voltage, output-reduction, and generator-disconnection factors that produced fast voltage increases and cascading disconnections.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "Soon after 12:30 CEST on 28 April 2025, a major power-system incident causes a blackout in both Spain and Portugal.",
        what_changed:
          "Nothing yet - this is the documented event as grid operators recorded it.",
        why_it_matters:
          "The blackout was real. Almost every durable piece of misinformation starts from something that genuinely happened, which is what makes it credible.",
        sources: [
          {
            publisher: "ENTSO-E",
            url: "https://www.entsoe.eu/news/2025/04/28/grid-incident-in-the-power-systems-of-spain-and-portugal/",
            published_date: "2025-04-28",
            type: "official_statement",
            primary: true,
            evidence:
              "ENTSO-E's same-day incident notice records that a major power-system incident caused a blackout in both Spain and Portugal shortly after 12:30 CET on 28 April 2025.",
          },
        ],
      },
      {
        type: "fabricated_cause",
        text: "Viral posts claim the blackout was 'retaliation' or a consequence of European sanctions on Russian energy.",
        what_changed:
          "A cause was attached to the event. The original reporting described an unexplained technical failure under investigation; this version supplies a specific political explanation that no investigator had offered.",
        why_it_matters:
          "An event with no announced cause leaves a vacuum, and a confident explanation fills it faster than an investigation can. Notice that the claim gained certainty as it travelled, while the evidence behind it did not.",
        sources: [
          {
            publisher: "EFE Verifica",
            url: "https://verifica.efe.com/apagon-espana-portugal-campana-prorrusa-desinformacion/",
            published_date: "2025-05-02",
            type: "fact_check",
            evidence:
              "EFE Verifica documented dozens of posts in several languages that falsely attributed the blackout to European sanctions on Russia while impersonating international news outlets.",
          },
        ],
      },
      {
        type: "recycled_old_media",
        text: "Unrelated 2022 footage of a coal-plant demolition in Spain is recirculated after the blackout as 'proof' of destructive energy policy.",
        what_changed:
          "Footage was introduced as evidence. The video is real, but it shows the planned May 2022 demolition of the La Robla coal plant, which had been closed since June 2020, and is unrelated to the 2025 outage.",
        why_it_matters:
          "This is the step that makes the claim feel proven. Real footage, honestly filmed, becomes false evidence purely by being placed next to an unrelated claim - so the video looking authentic tells you nothing about whether it belongs here.",
        sources: [
          {
            publisher: "Maldita.es",
            url: "https://maldita.es/malditobulo/20250429/central-nuclear-destruccion-apagon-izquierda/",
            published_date: "2025-04-29",
            type: "fact_check",
            evidence:
              "Maldita.es traced the recycled clip to the planned May 2022 demolition of the La Robla coal plant, which had already closed in June 2020, and documented its misleading reuse after the April 2025 blackout.",
          },
        ],
      },
    ],
    curated_relationships: [
      {
        from_node_id: "origin",
        to_node_id: "hop-1",
        relationship: "same_event",
        status: "established",
        confidence: 1,
        mutation_type: null,
        reason:
          "The origin account and hop 1 describe the same 28 April 2025 grid incident, supported by the same dated ENTSO-E incident notice. This is identity of the documented event, not source-to-source transmission.",
      },
      {
        from_node_id: "hop-1",
        to_node_id: "hop-2",
        relationship: "related_claim",
        status: "established",
        confidence: 0.96,
        mutation_type: "fabricated_cause",
        reason:
          "EFE Verifica independently documents a sanctions narrative attached to the blackout. It establishes a related misinformation strand, not that EFE derived from or transmitted the ENTSO-E notice.",
      },
      {
        from_node_id: "hop-1",
        to_node_id: "hop-3",
        relationship: "related_claim",
        status: "established",
        confidence: 0.96,
        mutation_type: "recycled_old_media",
        reason:
          "Maldita independently documents unrelated 2022 demolition footage reused after the blackout. It establishes a separate media-reuse strand, not a continuation of the EFE sanctions narrative.",
      },
    ],
    scores: {
      evidence_quality: 8,
      emotional_framing: 82,
      missing_context: 74,
      ai_generated_likelihood: 12,
      manipulation_risk: 76,
    },
    media_literacy_lesson:
      "When a dramatic event has no announced cause yet, that gap is where fabricated causes take hold. Video attached to a claim is evidence of the video, not of the claim.",
    sources: [
      {
        publisher: "ENTSO-E",
        url: "https://www.entsoe.eu/news/2026/03/20/entso-e-publishes-expert-panel-final-report-on-28-april-2025-blackout-in-spain-and-portugal/",
        published_date: "2026-03-20",
        type: "official_statement",
        primary: true,
        evidence:
          "The final technical investigation identifies the interacting grid factors that caused the blackout.",
      },
      {
        publisher: "EFE Verifica",
        url: "https://verifica.efe.com/apagon-espana-portugal-campana-prorrusa-desinformacion/",
        published_date: "2025-05-02",
        type: "fact_check",
        evidence:
          "This investigation documents the false sanctions narrative and the coordinated impersonation campaign that spread it.",
      },
      {
        publisher: "Maldita.es",
        url: "https://maldita.es/malditobulo/20250429/central-nuclear-destruccion-apagon-izquierda/",
        published_date: "2025-04-29",
        type: "fact_check",
        evidence:
          "This fact-check establishes the recycled video's 2022 provenance and its unrelated reuse after the blackout.",
      },
    ],
  },
  // ---- VERIFIED ANCHOR 2 ------------------------------------------------
  {
    id: "whale-barnacles",
    canonical_claim:
      "Divers should remove barnacles from humpback whales to help them.",
    aliases: [
      "This diver is heroically saving a whale from barnacles",
      "Whales need us to scrape the barnacles off their skin",
      "Barnacles are hurting this whale and it needs rescuing",
      "Diver rescues whale by removing barnacles, please share",
    ],
    verdict: "misleading",
    topic: "environment",
    region: "global",
    dataset_provenance: "externally_verified",
    origin: {
      source: "Marine biology / cetacean research consensus",
      date: "2023-09-01",
      what_actually_happened:
        "Barnacles form a natural commensal relationship with humpback whales — they attach to the skin but generally cause the whale no real harm, and in some cases may offer minor protective benefits. A viral photo of a diver near a whale's barnacle-covered skin was reframed as a 'rescue', but marine biologists note that removing barnacles can injure the whale's skin and is not necessary or recommended.",
      sources: [
        {
          publisher: "NOAA Fisheries",
          url: "https://www.fisheries.noaa.gov/",
          type: "reference_organisation",
          primary: true,
          evidence:
            "US agency responsible for marine mammal guidance, including advice against physical contact with whales.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "A diver is photographed swimming close to a humpback whale covered in barnacles.",
        what_changed:
          "Nothing yet - a real photograph of a real encounter, with no claim attached.",
        why_it_matters:
          "The image is authentic. Everything that follows is added by captioning, not by altering the photo.",
      },
      {
        type: "exaggeration",
        text: "The photo is captioned as a heroic 'whale rescue', implying the barnacles are harming the whale and require human intervention.",
        what_changed:
          "A neutral encounter became a rescue. The caption asserts both that the whale was in distress and that the diver relieved it, neither of which the photograph shows.",
        why_it_matters:
          "The caption is doing all the work. A picture of a person near an animal cannot show intent, distress, or outcome - those are supplied entirely by the words placed under it.",
      },
      {
        type: "stripped_context",
        text: "The post spreads without any context from marine biologists on the whale-barnacle relationship.",
        what_changed:
          "The biology was dropped. Barnacles on humpbacks are normal and largely harmless, and removing them can injure the whale - none of which travels with the image.",
        why_it_matters:
          "This is the version that causes harm. Kind-hearted advice to 'help' whales this way encourages contact that is both illegal in many waters and injurious to the animal, which is why a misleading verdict here is not a pedantic one.",
      },
    ],
    scores: {
      evidence_quality: 22,
      emotional_framing: 68,
      missing_context: 80,
      ai_generated_likelihood: 5,
      manipulation_risk: 40,
    },
    media_literacy_lesson:
      "Content that invites you to feel compassionate is not automatically accurate. Ask what the image actually shows, as distinct from what the caption says it shows.",
    sources: [
      {
        publisher: "Snopes",
        url: "https://www.snopes.com/",
        type: "fact_check",
        evidence:
          "Fact-checking organisation that has covered viral whale-rescue framing.",
      },
    ],
  },
  // ---- CIVIC / LAHORE ---------------------------------------------------
  {
    id: "lahore-smog-india-fault",
    canonical_claim:
      "Lahore's smog is entirely caused by crop-stubble burning blown in from India.",
    aliases: [
      "The smog in Lahore is India's fault, not Pakistan's pollution",
      "It's not local pollution, it's smoke from Indian farms",
      "Punjab smog caused by India burning fields",
    ],
    verdict: "misleading",
    topic: "civic_lahore",
    region: "pakistan",
    dataset_provenance: "illustrative",
    origin: {
      source: "Punjab EPA / regional air-quality monitoring reports",
      date: "2024-11-05",
      what_actually_happened:
        "Cross-border stubble-burning smoke is a real contributing factor during specific weeks in November, but air-quality studies attribute a large share of Lahore's smog to local vehicle emissions, brick kilns, and industrial combustion. Blaming a single external cause omits the local sources that persist even outside stubble-burning season.",
      sources: [
        {
          publisher: "Punjab Environmental Protection Department",
          url: "https://www.epd.punjab.gov.pk/",
          type: "reference_organisation",
          primary: true,
          evidence:
            "Provincial body that publishes Lahore air-quality monitoring data.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "Satellite imagery shows cross-border crop-burning fires during peak smog season.",
        what_changed:
          "Nothing yet - stubble burning is real, seasonal, and visible from orbit.",
        why_it_matters:
          "The contributing factor is genuine. The distortion is not that it was invented, but that it was made to account for everything.",
      },
      {
        type: "fabricated_cause",
        text: "Social media posts claim Lahore's entire smog crisis is '100% caused' by India, with no mention of local sources.",
        what_changed:
          "A contributing factor became the sole cause. 'One of several sources' turned into 'entirely responsible'.",
        why_it_matters:
          "Single-cause explanations are satisfying and usually wrong. Watch for the jump from 'contributes to' to 'causes', which is where the evidence quietly stops supporting the claim.",
      },
      {
        type: "stripped_context",
        text: "The claim strips out EPA data on local vehicle and industrial emissions to make the story simpler.",
        what_changed:
          "Local sources were removed from the picture - traffic, brick kilns, and industry disappear from the account.",
        why_it_matters:
          "This version is politically comfortable and practically useless: if the cause is entirely across a border, nothing anyone in Lahore does can help, which forecloses the actions that would actually reduce the smog.",
      },
    ],
    scores: {
      evidence_quality: 35,
      emotional_framing: 70,
      missing_context: 78,
      ai_generated_likelihood: 8,
      manipulation_risk: 62,
    },
    media_literacy_lesson:
      "Ask whether a claim assigns a single cause to something that plausibly has several. Explanations that place the blame conveniently far away deserve extra scrutiny.",
  },
  {
    id: "lahore-fake-flood-warning",
    canonical_claim:
      "An urgent flash-flood warning is circulating telling Lahore residents to evacuate immediately.",
    aliases: [
      "Emergency alert: Lahore will flood tonight, leave now",
      "WAPDA announces sudden dam release, Lahore to flood within hours",
      "Breaking: Ravi river dam about to burst, evacuate Lahore",
    ],
    verdict: "false",
    topic: "civic_lahore",
    region: "pakistan",
    dataset_provenance: "illustrative",
    origin: {
      source: "Provincial Disaster Management Authority (PDMA) Punjab",
      date: "2024-07-14",
      what_actually_happened:
        "A routine seasonal monsoon advisory about elevated river levels was screenshotted, stripped of its actual wording, and rewritten as an urgent 'evacuate now' message with a fabricated timeline. No dam-burst or immediate flood emergency was ever issued for Lahore.",
      sources: [
        {
          publisher: "PDMA Punjab",
          url: "https://www.pdma.gop.pk/",
          type: "official_statement",
          primary: true,
          evidence:
            "The authority that actually issues flood advisories for the province.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "PDMA issues a routine monsoon-season advisory about monitoring river levels.",
        what_changed:
          "Nothing yet - a genuine, routine seasonal advisory from the responsible authority.",
        why_it_matters:
          "The official origin is what later lends the forward its authority, long after the wording has been replaced.",
      },
      {
        type: "exaggeration",
        text: "A WhatsApp forward turns the advisory into an urgent claim that a dam is about to burst.",
        what_changed:
          "Monitoring became emergency. 'River levels are elevated and being watched' became 'a dam is about to burst'.",
        why_it_matters:
          "Urgency suppresses verification - the more immediate the danger sounds, the less likely anyone is to check before forwarding, which is precisely why fabricated urgency spreads.",
      },
      {
        type: "fabricated_cause",
        text: "The message is reworded again with a specific fabricated evacuation deadline to increase urgency and shares.",
        what_changed:
          "A deadline was invented. A specific hour was added that appears in no official communication.",
        why_it_matters:
          "Invented specificity reads as credibility. Precise details feel like evidence, but a number is only as good as the source that issued it - and here there is none.",
      },
    ],
    scores: {
      evidence_quality: 10,
      emotional_framing: 95,
      missing_context: 60,
      ai_generated_likelihood: 15,
      manipulation_risk: 90,
    },
    media_literacy_lesson:
      "Real emergency instructions come from a named authority you can check directly. If a warning reaches you only as a forward, go to the source before you act or pass it on.",
  },
  {
    id: "lahore-heatwave-hoax-temp",
    canonical_claim:
      "Lahore hit a record-breaking 55°C this week, the hottest ever recorded in Pakistan.",
    aliases: [
      "Lahore temperature reached 55 degrees, all-time record",
      "Pakistan Meteorological Department confirms Lahore's hottest day ever at 55C",
    ],
    verdict: "false",
    topic: "civic_lahore",
    region: "pakistan",
    dataset_provenance: "illustrative",
    origin: {
      source: "Pakistan Meteorological Department (PMD) official readings",
      date: "2024-06-10",
      what_actually_happened:
        "PMD's official reading for the day in question was in the low-to-mid 40s°C — a serious heatwave, but far below the viral 55°C figure. The inflated number appears to have originated from a mislabeled screenshot of a heat-index or 'feels like' chart rather than an actual air-temperature reading.",
      sources: [
        {
          publisher: "Pakistan Meteorological Department",
          url: "https://www.pmd.gov.pk/",
          type: "official_statement",
          primary: true,
          evidence:
            "The body that records official air temperatures for Pakistan.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "PMD records a genuine heatwave with official temperatures in the low-to-mid 40s°C.",
        what_changed:
          "Nothing yet - a real and dangerous heatwave, officially recorded.",
        why_it_matters:
          "The underlying event was already serious. Inflating it does not add urgency, it costs the real figure its credibility.",
      },
      {
        type: "stripped_context",
        text: "A heat-index ('feels like') chart is screenshotted and mislabeled as the actual air temperature.",
        what_changed:
          "The measurement changed identity. A 'feels like' figure, which combines heat and humidity, was relabelled as air temperature.",
        why_it_matters:
          "Two different quantities got the same units. Whenever a number crosses from one chart to another, check that it still means what the new caption says it means.",
      },
      {
        type: "exaggeration",
        text: "The mislabeled number is rounded up and shared as a 'record-breaking 55°C', far exceeding any official reading.",
        what_changed:
          "The figure was rounded up and promoted to a record, a claim requiring comparison against historical data nobody consulted.",
        why_it_matters:
          "'Record-breaking' is a checkable claim. Records are published, so a genuine one can always be confirmed against the official series.",
      },
    ],
    scores: {
      evidence_quality: 20,
      emotional_framing: 75,
      missing_context: 65,
      ai_generated_likelihood: 10,
      manipulation_risk: 55,
    },
    media_literacy_lesson:
      "Numbers change meaning when they change charts. Check what was actually measured before trusting a striking figure - especially one labelled a record.",
  },
  {
    id: "lahore-tap-water-poisoned",
    canonical_claim:
      "Lahore's tap water supply has been deliberately poisoned and is unsafe to drink anywhere in the city.",
    aliases: [
      "WASA has poisoned Lahore's water supply",
      "Do not drink tap water anywhere in Lahore, it's contaminated",
      "Government secretly poisoning Lahore's drinking water",
    ],
    verdict: "false",
    topic: "civic_lahore",
    region: "pakistan",
    dataset_provenance: "illustrative",
    origin: {
      source: "WASA Lahore water quality testing bulletin",
      date: "2024-03-02",
      what_actually_happened:
        "A water-quality bulletin flagged elevated bacterial contamination in a small number of specific tube wells in one locality, recommending boiling water in that area only. The report was generalized into a citywide 'poisoning' claim with no localized detail preserved.",
      sources: [
        {
          publisher: "WASA Lahore",
          url: "https://wasa.lgp.gov.pk/",
          type: "official_statement",
          primary: true,
          evidence: "The utility that issues Lahore water-quality bulletins.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "WASA flags bacterial contamination in a handful of tube wells in one neighborhood.",
        what_changed:
          "Nothing yet - a genuine, geographically specific public-health notice.",
        why_it_matters:
          "The advisory was real and worth acting on, for the people it actually applied to.",
      },
      {
        type: "stripped_context",
        text: "The localized warning is stripped of its neighborhood-specific detail and generalized to 'Lahore's water'.",
        what_changed:
          "The location was removed. A warning about specific tube wells became a warning about a city of over ten million.",
        why_it_matters:
          "Losing the 'where' is as damaging as losing the 'what'. It panics people who were never at risk and buries the notice for those who were.",
      },
      {
        type: "fabricated_cause",
        text: "The generalized warning is reframed as deliberate 'poisoning' by the government.",
        what_changed:
          "Contamination became intent. Bacterial contamination, an infrastructure failure, was recast as deliberate poisoning.",
        why_it_matters:
          "Attributing intent transforms a fixable maintenance problem into a conspiracy, and conspiracies do not get repaired - they get argued about.",
      },
    ],
    scores: {
      evidence_quality: 25,
      emotional_framing: 88,
      missing_context: 82,
      ai_generated_likelihood: 6,
      manipulation_risk: 80,
    },
    media_literacy_lesson:
      "Health warnings have a scope: a place, a time, and a population. When a warning reaches you without those, the missing detail is usually the most important part.",
  },
  {
    id: "lahore-dengue-vaccine-mandatory",
    canonical_claim:
      "The Punjab government has made a dengue vaccine mandatory and is fining people who refuse it.",
    aliases: [
      "Mandatory dengue vaccine now enforced in Lahore with fines",
      "Refuse the dengue shot and get fined by Punjab government",
    ],
    verdict: "false",
    topic: "civic_lahore",
    region: "pakistan",
    dataset_provenance: "illustrative",
    origin: {
      source: "Punjab Health Department dengue prevention campaign",
      date: "2024-09-20",
      what_actually_happened:
        "There is no approved, widely deployed dengue vaccine mandate in Punjab. The claim conflates a real larvicide-spraying and household-inspection anti-dengue campaign (which does carry fines for standing water violations) with a fabricated 'mandatory vaccine' narrative.",
      sources: [
        {
          publisher: "Punjab Health Department",
          url: "https://health.punjab.gov.pk/",
          type: "reference_organisation",
          primary: true,
          evidence:
            "The department that runs Punjab's seasonal anti-dengue campaign.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "Punjab Health Department runs a household inspection and larvicide-spraying campaign, with fines for uncovered stagnant water.",
        what_changed:
          "Nothing yet - a real campaign, with real inspections and real fines for standing water.",
        why_it_matters:
          "The fines exist. That verifiable detail is what later makes the fabricated version hard to dismiss.",
      },
      {
        type: "fabricated_cause",
        text: "The fines for stagnant water get recast as fines for refusing a 'dengue vaccine'.",
        what_changed:
          "What the fine is for was swapped. Penalties for standing water became penalties for refusing a vaccine that is not part of the campaign.",
        why_it_matters:
          "A true detail was kept and its subject replaced. This is why partial familiarity is not confirmation - the part you can verify may not be the part that changed.",
      },
      {
        type: "exaggeration",
        text: "The fabricated vaccine mandate is exaggerated further with invented enforcement details.",
        what_changed:
          "Enforcement specifics were added - amounts, procedures, penalties - none traceable to any government notification.",
        why_it_matters:
          "Detail accumulates as a claim travels. Growing specificity with no growing sourcing is a signal of invention, not investigation.",
      },
    ],
    scores: {
      evidence_quality: 18,
      emotional_framing: 80,
      missing_context: 70,
      ai_generated_likelihood: 12,
      manipulation_risk: 72,
    },
    media_literacy_lesson:
      "Claims about new laws or mandates are checkable: real ones are published as official notifications. If no notification exists, the mandate does not.",
  },
  // ---- CLIMATE / ENERGY -------------------------------------------------
  {
    id: "arctic-ice-recovering-fully",
    canonical_claim:
      "Arctic sea ice has fully recovered to 1980s levels, proving climate change reversed itself.",
    aliases: [
      "Arctic ice is back to normal, climate change is over",
      "New data shows Arctic ice fully restored",
    ],
    verdict: "misleading",
    topic: "climate_energy",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "NSIDC (National Snow and Ice Data Center) seasonal ice reports",
      date: "2024-02-15",
      what_actually_happened:
        "A single unusually high monthly ice-extent reading, driven by short-term weather variability, was compared out of context against a low year to manufacture the appearance of 'full recovery'. Long-term satellite records still show a clear multi-decade downward trend in Arctic sea ice extent.",
      sources: [
        {
          publisher: "National Snow and Ice Data Center",
          url: "https://nsidc.org/",
          type: "research",
          primary: true,
          evidence:
            "Publishes the satellite sea-ice extent record the claim selectively quotes.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "NSIDC publishes a monthly sea-ice extent reading that is higher than the previous, unusually low year.",
        what_changed:
          "Nothing yet - an accurate monthly reading, published in the context of a long record.",
        why_it_matters:
          "The number is real. Year-to-year variation is expected within a declining long-term trend.",
      },
      {
        type: "selective_evidence",
        text: "The single data point is compared to a cherry-picked historical low to claim 'full recovery'.",
        what_changed:
          "The comparison window was chosen to produce the desired result - one high month against one unusually low year, with the decades between discarded.",
        why_it_matters:
          "Any noisy declining series contains pairs of points that look like recovery. Choosing the endpoints is choosing the conclusion, which is why the trend matters more than any two readings.",
      },
      {
        type: "exaggeration",
        text: "The 'recovery' framing is exaggerated into a claim that climate change has reversed entirely.",
        what_changed:
          "A regional, single-month measurement became a verdict on the entire global climate system.",
        why_it_matters:
          "Watch the scope expand: one metric, one region, one month is asked to settle a global question it cannot address.",
      },
    ],
    scores: {
      evidence_quality: 15,
      emotional_framing: 55,
      missing_context: 85,
      ai_generated_likelihood: 8,
      manipulation_risk: 65,
    },
    media_literacy_lesson:
      "With any trend, ask what time window was chosen and why. A short window inside a long record can be made to show almost anything.",
  },
  {
    id: "solar-panels-toxic-waste-crisis",
    canonical_claim:
      "Solar panels create a bigger toxic waste crisis than nuclear power and can't be recycled at all.",
    aliases: [
      "Solar panels are unrecyclable toxic waste",
      "Solar energy is worse for the environment than nuclear because of panel waste",
    ],
    verdict: "misleading",
    topic: "climate_energy",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "IRENA / IEA lifecycle waste studies on solar panels",
      date: "2023-11-01",
      what_actually_happened:
        "Solar panels do contain materials that require proper end-of-life handling, and recycling infrastructure is still scaling up, but panels are recyclable and the volume of associated waste is far smaller in scale and toxicity than the framing suggests. The comparison to nuclear waste conflates very different categories of waste and risk.",
      sources: [
        {
          publisher: "IRENA",
          url: "https://www.irena.org/",
          type: "research",
          primary: true,
          evidence:
            "Publishes lifecycle and end-of-life analyses for solar photovoltaic equipment.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "Industry reports note that solar panel recycling infrastructure is still immature and needs investment.",
        what_changed:
          "Nothing yet - a real, acknowledged gap in end-of-life infrastructure.",
        why_it_matters:
          "The underlying concern is legitimate, which is what gives the exaggerated version its foothold.",
      },
      {
        type: "stripped_context",
        text: "The 'still scaling up' nuance is dropped, and panels are described as entirely unrecyclable.",
        what_changed:
          "'Not yet recycled at scale' became 'cannot be recycled' - a claim about current capacity turned into a claim about physical possibility.",
        why_it_matters:
          "These sound similar and mean very different things. One is a solvable logistics problem; the other implies the technology is a dead end.",
      },
      {
        type: "exaggeration",
        text: "The waste framing is exaggerated into a direct 'worse than nuclear' comparison.",
        what_changed:
          "An unlike-for-unlike comparison was introduced, measuring panel waste against nuclear waste as though volume and hazard were the same axis.",
        why_it_matters:
          "Comparisons need a shared unit. Ask what exactly is being compared before accepting that one thing is 'worse' than another.",
      },
    ],
    scores: {
      evidence_quality: 28,
      emotional_framing: 60,
      missing_context: 72,
      ai_generated_likelihood: 5,
      manipulation_risk: 58,
    },
    media_literacy_lesson:
      "'Cannot' and 'does not yet' are different claims. Watch for capacity limits being restated as physical impossibilities.",
  },
  {
    id: "wind-turbines-killing-whales",
    canonical_claim:
      "Offshore wind turbine construction is the direct cause of a spike in whale deaths.",
    aliases: [
      "Wind farms are killing whales along the coast",
      "Offshore wind turbines confirmed to be responsible for whale deaths",
    ],
    verdict: "false",
    topic: "climate_energy",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "NOAA Fisheries marine mammal stranding investigations",
      date: "2023-01-20",
      what_actually_happened:
        "NOAA and independent marine biologists reviewed necropsies of stranded whales during a period of offshore wind development and found the deaths were attributable to vessel strikes and entanglement in fishing gear, not turbine construction or sonar mapping. No investigation has established a causal link.",
      sources: [
        {
          publisher: "NOAA Fisheries",
          url: "https://www.fisheries.noaa.gov/",
          type: "official_statement",
          primary: true,
          evidence:
            "Conducts and publishes the marine mammal stranding investigations at issue.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "A cluster of whale strandings occurs along a coastline during offshore wind farm construction.",
        what_changed:
          "Nothing yet - both the strandings and the construction genuinely occurred in the same period.",
        why_it_matters:
          "Two real things happening at once is the raw material for a false cause. Co-occurrence is where the reasoning error begins, not proof that it is wrong.",
      },
      {
        type: "fabricated_cause",
        text: "The timing coincidence is reframed as offshore wind construction directly causing the deaths.",
        what_changed:
          "Coincidence became causation, with no mechanism proposed and no investigation supporting it.",
        why_it_matters:
          "This is the textbook case of treating 'at the same time' as 'because of'. The question to ask is what evidence connects them beyond the calendar.",
      },
      {
        type: "stripped_context",
        text: "NOAA's actual necropsy findings (vessel strikes, fishing gear entanglement) are omitted from the retelling.",
        what_changed:
          "The actual determined causes were dropped - necropsies had identified vessel strikes and fishing-gear entanglement.",
        why_it_matters:
          "There was an answer, and it was discarded because it was less useful to the story. When a claim ignores an existing investigation rather than disputing it, that omission is itself informative.",
      },
    ],
    scores: {
      evidence_quality: 20,
      emotional_framing: 78,
      missing_context: 80,
      ai_generated_likelihood: 7,
      manipulation_risk: 70,
    },
    media_literacy_lesson:
      "Two things happening at the same time is not evidence that one caused the other. Ask whether anyone investigated, and what they actually found.",
  },
  {
    id: "ev-battery-fires-common",
    canonical_claim:
      "Electric vehicles catch fire far more often than gasoline cars, making them dangerously unsafe.",
    aliases: [
      "EVs are much more likely to catch fire than gas cars",
      "Electric cars are a fire hazard compared to regular cars",
    ],
    verdict: "misleading",
    topic: "climate_energy",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "NTSB / insurance industry vehicle fire incident statistics",
      date: "2023-08-01",
      what_actually_happened:
        "Fire-incident-rate data collected across multiple insurance and safety agencies shows gasoline vehicles catch fire at a notably higher rate per vehicle than electric vehicles. EV battery fires, while less frequent, can be harder to extinguish once they start — a real but different concern that gets conflated with overall frequency.",
      sources: [
        {
          publisher: "NHTSA",
          url: "https://www.nhtsa.gov/",
          type: "reference_organisation",
          primary: true,
          evidence:
            "US vehicle safety regulator publishing incident statistics.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "A small number of dramatic, hard-to-extinguish EV battery fires receive heavy media coverage.",
        what_changed:
          "Nothing yet - the fires happened and the difficulty of extinguishing them is a genuine issue for fire services.",
        why_it_matters:
          "Coverage volume tracks how dramatic an event is, not how often it happens.",
      },
      {
        type: "exaggeration",
        text: "The severity and visibility of individual incidents is generalized into a claim about overall fire frequency.",
        what_changed:
          "Severity was converted into frequency - 'harder to put out' became 'happens more often', which does not follow.",
        why_it_matters:
          "Two distinct properties got merged. A rare event can be severe, and a common one mild; conflating them produces a conclusion neither supports.",
      },
      {
        type: "selective_evidence",
        text: "Statistical context showing gasoline cars catch fire more often per-vehicle is left out of the retelling.",
        what_changed:
          "The comparison baseline was removed - per-vehicle rates showing petrol cars catching fire more often.",
        why_it_matters:
          "A rate needs a denominator. Any absolute count of incidents is meaningless without knowing how many vehicles are on the road.",
      },
    ],
    scores: {
      evidence_quality: 30,
      emotional_framing: 66,
      missing_context: 68,
      ai_generated_likelihood: 6,
      manipulation_risk: 52,
    },
    media_literacy_lesson:
      "Memorable is not the same as frequent. When something feels common, check whether you are measuring incidence or coverage.",
  },
  // ---- ENVIRONMENT ------------------------------------------------------
  {
    id: "great-pacific-garbage-patch-island",
    canonical_claim:
      "The Great Pacific Garbage Patch is a solid floating island of trash you can walk on.",
    aliases: [
      "There's a giant trash island in the Pacific you can stand on",
      "The ocean garbage patch is a solid mass visible from space",
    ],
    verdict: "misleading",
    topic: "environment",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "NOAA Marine Debris Program",
      date: "2022-06-08",
      what_actually_happened:
        "The Great Pacific Garbage Patch is a real and serious concentration of marine debris, but it consists mostly of dispersed microplastics and scattered larger debris across a huge area of ocean — not a solid, walkable island, and it is not visible as a discrete shape from space.",
      sources: [
        {
          publisher: "NOAA Marine Debris Program",
          url: "https://marinedebris.noaa.gov/",
          type: "reference_organisation",
          primary: true,
          evidence:
            "The programme that surveys and characterises Pacific marine debris concentration.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "Oceanographers document a large area of the North Pacific with elevated concentrations of floating plastic debris.",
        what_changed:
          "Nothing yet - a real, measured concentration of marine debris.",
        why_it_matters:
          "The problem is genuine and serious. Overstating its form makes the real thing easier to dismiss.",
      },
      {
        type: "false_caption",
        text: "Illustrated maps depicting the debris as a solid patch are mistaken for literal photographs.",
        what_changed:
          "A data visualisation was read as a photograph. Maps shade regions by concentration; that shading was taken as a picture of a surface.",
        why_it_matters:
          "Diagrams are not images of the thing. Ask whether you are looking at a photograph or a representation of measurements.",
      },
      {
        type: "exaggeration",
        text: "The illustration is exaggerated into a claim of a walkable trash 'island'.",
        what_changed:
          "Dispersed microplastics across a vast area became a solid, walkable surface.",
        why_it_matters:
          "The exaggeration is counterproductive: when people learn there is no island, some conclude the pollution was invented too, when in fact it is worse in a way that is simply harder to photograph.",
      },
    ],
    scores: {
      evidence_quality: 32,
      emotional_framing: 58,
      missing_context: 75,
      ai_generated_likelihood: 4,
      manipulation_risk: 40,
    },
    media_literacy_lesson:
      "Exaggerating a real problem gives people a reason to dismiss it later. Check whether an image is a photograph or a diagram before you picture the thing it describes.",
  },
  {
    id: "shark-attack-spike-fake-photo",
    canonical_claim:
      "A shark attack spike this summer was captured in a viral photo of a shark near a crowded beach.",
    aliases: [
      "Viral photo shows a shark right next to swimmers at a packed beach",
      "This beach photo proves sharks are swarming closer to shore this year",
    ],
    verdict: "false",
    topic: "environment",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source:
        "Original photographer's account and reverse-image-search records",
      date: "2021-07-04",
      what_actually_happened:
        "The widely circulated 'shark near swimmers' image is a years-old photo, originally taken and captioned in a completely different context (a controlled, distant shot later cropped for drama), and re-shared each summer with a new, unrelated news hook implying a current attack spike.",
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "A photographer captures a shark at a safe distance from shore in a specific, undramatic context.",
        what_changed:
          "Nothing yet - an authentic photograph, accurately captioned by the person who took it.",
        why_it_matters:
          "The photograph was never fake. Everything misleading about it was added later by other people.",
      },
      {
        type: "edited_media",
        text: "The photo resurfaces years later, cropped tighter to look closer to swimmers.",
        what_changed:
          "The frame was cropped, compressing the apparent distance between the shark and the swimmers.",
        why_it_matters:
          "Cropping is editing. Nothing was added or faked, yet the distance - the entire point of the image - was changed by what was cut away.",
      },
      {
        type: "recycled_old_media",
        text: "The recycled photo is captioned as evidence of a new, current shark-attack spike.",
        what_changed:
          "The date changed. A years-old photograph was presented as documentation of this summer.",
        why_it_matters:
          "This image returns every year with a new caption. A reverse image search takes seconds and would show it has been circulating for years.",
      },
    ],
    scores: {
      evidence_quality: 12,
      emotional_framing: 85,
      missing_context: 70,
      ai_generated_likelihood: 10,
      manipulation_risk: 68,
    },
    media_literacy_lesson:
      "A photo can be completely authentic and still be evidence for nothing. Check when it was taken before accepting what it is said to show.",
  },
  {
    id: "bees-going-extinct-2024",
    canonical_claim:
      "All bee species will be extinct within the next two years, ending global food production.",
    aliases: [
      "Bees will be totally extinct in two years",
      "All pollinators are about to go extinct and food will run out",
    ],
    verdict: "false",
    topic: "environment",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "USDA / entomology colony-loss survey reports",
      date: "2023-05-17",
      what_actually_happened:
        "Managed honeybee colonies do face serious, well-documented annual colony-loss pressure from mites, pesticides, and habitat loss — a real concern worth acting on. But this is very different from all bee species (there are over 20,000) facing extinction within two years; no scientific body has made that prediction.",
      sources: [
        {
          publisher: "USDA",
          url: "https://www.usda.gov/",
          type: "reference_organisation",
          primary: true,
          evidence: "Publishes the annual managed-colony loss survey.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "USDA publishes an annual report showing a concerning percentage of managed honeybee colony losses.",
        what_changed:
          "Nothing yet - a real survey documenting a real and serious pressure on managed colonies.",
        why_it_matters:
          "Pollinator decline is a genuine concern. The distortion lies in the scope, not in the existence of the problem.",
      },
      {
        type: "stripped_context",
        text: "The colony-loss statistic for one species is generalized to 'all bees' and all pollinators.",
        what_changed:
          "One managed species stood in for more than twenty thousand wild bee species with very different circumstances.",
        why_it_matters:
          "Managed honeybees are livestock and are restocked annually; wild bees are not. Collapsing them into one category hides both the real risk and the real remedy.",
      },
      {
        type: "exaggeration",
        text: "The generalized decline is exaggerated into a specific 'extinct within two years' timeline with no source.",
        what_changed:
          "A deadline appeared. A two-year extinction date was attached that no scientific body has ever published.",
        why_it_matters:
          "Predictions have authors. If a specific date cannot be traced to anyone who made it, no one is standing behind it.",
      },
    ],
    scores: {
      evidence_quality: 25,
      emotional_framing: 90,
      missing_context: 76,
      ai_generated_likelihood: 9,
      manipulation_risk: 66,
    },
    media_literacy_lesson:
      "Ask who made a prediction and when. A dramatic deadline with no named source behind it is a rhetorical device, not a forecast.",
  },
  // ---- GENERAL SCIENCE --------------------------------------------------
  {
    id: "5g-towers-health-risk",
    canonical_claim:
      "5G cell towers emit radiation levels proven to cause serious long-term health problems.",
    aliases: [
      "5G towers are dangerous and causing health issues nearby",
      "Studies prove 5G radiation harms your health",
    ],
    verdict: "false",
    topic: "health",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "WHO / ICNIRP radiofrequency exposure guideline reviews",
      date: "2022-03-10",
      what_actually_happened:
        "5G networks use non-ionizing radiofrequency radiation regulated well below levels associated with tissue heating, the only established biological effect at these frequencies. Multiple independent international health bodies have reviewed the evidence and found no established causal link to the long-term health problems attributed to it online.",
      sources: [
        {
          publisher: "World Health Organization",
          url: "https://www.who.int/",
          type: "reference_organisation",
          primary: true,
          evidence:
            "Publishes reviews of radiofrequency exposure and health evidence.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "5G infrastructure rolls out in cities, prompting general public questions about radiofrequency exposure.",
        what_changed:
          "Nothing yet - a real deployment and a reasonable public question about a new technology.",
        why_it_matters:
          "Asking whether new infrastructure is safe is legitimate. The distortion is in the answer supplied, not the question asked.",
      },
      {
        type: "misattribution",
        text: "Preliminary, non-conclusive lab studies on unrelated frequency ranges are mischaracterized as proof of harm.",
        what_changed:
          "Studies were recruited that examined different frequencies and did not conclude what they were cited for.",
        why_it_matters:
          "A citation is not a confirmation. When a claim points to research, check that the study covers this subject and actually reached that conclusion.",
      },
      {
        type: "stripped_context",
        text: "The mischaracterized studies are shared without the WHO/ICNIRP safety-review context that contradicts them.",
        what_changed:
          "The broader reviews were omitted - the large international assessments that examined this evidence and found no established link.",
        why_it_matters:
          "One suggestive study is not the state of knowledge. Where systematic reviews exist, a single paper cited against them is being used selectively.",
      },
    ],
    scores: {
      evidence_quality: 10,
      emotional_framing: 72,
      missing_context: 82,
      ai_generated_likelihood: 8,
      manipulation_risk: 74,
    },
    media_literacy_lesson:
      "'Studies show' is a claim you can check. Look at what the study actually measured and whether larger reviews agree.",
  },
  {
    id: "vaccine-magnetic-arm",
    canonical_claim:
      "People who get vaccinated develop a magnetic reaction where metal objects stick to the injection site.",
    aliases: [
      "Vaccinated arms are magnetic, metal sticks to the injection spot",
      "Coins stick to your arm after getting the shot because of magnets in the vaccine",
    ],
    verdict: "false",
    topic: "health",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "CDC / independent physics and immunology reviews",
      date: "2021-05-25",
      what_actually_happened:
        "Vaccine doses are far too small in volume and contain no magnetic materials in any quantity capable of producing a magnetic effect on skin. Viral videos showing objects 'sticking' to injection sites are explained by skin oil, sweat, and light adhesion — reproducible on unvaccinated skin as well.",
      sources: [
        {
          publisher: "CDC",
          url: "https://www.cdc.gov/",
          type: "reference_organisation",
          primary: true,
          evidence: "Publishes vaccine composition and safety information.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "A viral video shows a coin appearing to stick to someone's arm near a vaccination site.",
        what_changed:
          "Nothing yet - the video is unedited and the coin really does stay put.",
        why_it_matters:
          "The footage is authentic. What is disputed is not whether it happened but why.",
      },
      {
        type: "fabricated_cause",
        text: "The sticking effect (actually skin oil/adhesion) is fabricated as evidence of 'magnetic' vaccine ingredients.",
        what_changed:
          "An explanation was supplied. Ordinary skin adhesion was attributed to magnetic vaccine ingredients.",
        why_it_matters:
          "The demonstration proves adhesion, not magnetism - and it reproduces on unvaccinated skin, which is the test that separates the two explanations.",
      },
      {
        type: "exaggeration",
        text: "The claim spreads further with exaggerated details about metal content in vaccine doses.",
        what_changed:
          "Technical specifics were added about metal content that does not exist in the doses.",
        why_it_matters:
          "Invented technical detail borrows the sound of expertise. A dose is a fraction of a millilitre; the quantities described could not fit in it.",
      },
    ],
    scores: {
      evidence_quality: 4,
      emotional_framing: 65,
      missing_context: 60,
      ai_generated_likelihood: 6,
      manipulation_risk: 78,
    },
    media_literacy_lesson:
      "A real video can demonstrate a real effect and still have the wrong explanation attached. Ask what test would tell the explanations apart.",
  },
  {
    id: "great-wall-visible-from-space",
    canonical_claim:
      "The Great Wall of China is the only man-made structure visible from space with the naked eye.",
    aliases: [
      "You can see the Great Wall of China from the moon",
      "The Great Wall is the sole man-made object visible from orbit",
    ],
    verdict: "false",
    topic: "general",
    region: "global",
    dataset_provenance: "illustrative",
    origin: {
      source: "NASA astronaut accounts and photography from low Earth orbit",
      date: "2004-01-01",
      what_actually_happened:
        "Multiple astronauts, including Chinese astronaut Yang Liwei, have confirmed the Great Wall is generally not distinguishable to the naked eye even from low Earth orbit, let alone the Moon, due to its narrow width. Many other structures (cities at night, highways, airports) are more visible than the Wall.",
      sources: [
        {
          publisher: "NASA",
          url: "https://www.nasa.gov/",
          type: "reference_organisation",
          primary: true,
          evidence:
            "Holds the astronaut photography and first-hand accounts bearing on the claim.",
        },
      ],
    },
    mutation_chain: [
      {
        type: "original_event",
        text: "An early, uncorroborated claim about the Wall's visibility from space appears in popular trivia decades ago.",
        what_changed:
          "Nothing yet - though notably this one begins with an assertion, not a documented observation. It predates spaceflight.",
        why_it_matters:
          "Some claims have no factual origin at all. This one was repeated into familiarity before anyone could test it.",
      },
      {
        type: "exaggeration",
        text: "The trivia claim is exaggerated over time into 'visible from the Moon'.",
        what_changed:
          "The distance grew, from orbit to the Moon - roughly a thousandfold increase in the claim's ambition.",
        why_it_matters:
          "Repetition tends to inflate. Each retelling has a small incentive to be slightly more impressive than the last.",
      },
      {
        type: "out_of_date_information",
        text: "Astronaut testimony correcting the myth is left out as the claim keeps circulating in trivia lists and quizzes.",
        what_changed:
          "The correction failed to travel. Astronauts, including Yang Liwei, have said plainly they could not see it, but the trivia version circulates unchanged.",
        why_it_matters:
          "Corrections spread far more slowly than the claims they correct. Familiarity is not verification - this one survives because it is charming, not because it is true.",
      },
    ],
    scores: {
      evidence_quality: 15,
      emotional_framing: 30,
      missing_context: 70,
      ai_generated_likelihood: 3,
      manipulation_risk: 20,
    },
    media_literacy_lesson:
      "Some false claims persist because they are pleasant rather than persuasive. Long familiarity with a fact is not evidence that anyone ever checked it.",
  },
];

export const lineages: Lineage[] = INPUTS.map(buildLineage);

export const lineagesById: ReadonlyMap<string, Lineage> = new Map(
  lineages.map((lineage) => [lineage.id, lineage]),
);
